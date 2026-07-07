from datetime import datetime
from pathlib import Path
import os
import re
import sqlite3
import shutil
import tempfile
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
import httpx
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database.database import DATABASE_URL, SessionLocal, get_db, engine
from app.models.venta import Venta
from app.models.venta_detalle import VentaDetalle
from app.models.producto import Producto
from app.models.caja import Caja
from app.models.cliente import Cliente
from app.models.negocio import Negocio
from app.models.usuario import Usuario
from app.models.soporte_ticket import SoporteTicket
from app.services.auditoria import registrar_auditoria
from app.services.runtime_guardian import runtime_guardian
from app.utils.dependencies import get_current_user_with_negocio
from app.utils.planes import normalizar_plan, resolver_config_plan_negocio

router = APIRouter()


class ResetRequest(BaseModel):
    modo: str  # "parcial" | "completo"
    confirmacion: str


class RestoreResponse(BaseModel):
    ok: bool
    mensaje: str
    archivo: str


class RestorePointCreate(BaseModel):
    etiqueta: Optional[str] = None


class RestorePointRestoreRequest(BaseModel):
    confirmacion: str


class SoporteTicketCreate(BaseModel):
    asunto: str
    consulta: str
    prioridad: str = "MEDIA"
    negocio_id: Optional[int] = None


class SoporteTicketResponder(BaseModel):
    estado: str = "EN_PROCESO"
    respuesta_superadmin: str


class SoporteAiRequest(BaseModel):
    consulta: str
    asunto: Optional[str] = None


class GuardianAckRequest(BaseModel):
    note: Optional[str] = None


class GuardianSafeModeRequest(BaseModel):
    enabled: bool
    reason: Optional[str] = None


SOFIA_OPENAI_MODEL = os.getenv("SOFIA_OPENAI_MODEL", "gpt-5.5")
SOFIA_OPENAI_TIMEOUT = float(os.getenv("SOFIA_OPENAI_TIMEOUT", "12"))
SOFIA_MAX_INPUT_CHARS = int(os.getenv("SOFIA_MAX_INPUT_CHARS", "3500"))
SOFIA_MAX_OUTPUT_TOKENS = int(os.getenv("SOFIA_MAX_OUTPUT_TOKENS", "260"))
SOFIA_ENABLE_OPENAI = str(os.getenv("SOFIA_ENABLE_OPENAI", "true")).strip().lower() in {"1", "true", "yes", "on"}


def _restore_points_dir() -> Path:
    path = Path(__file__).resolve().parent.parent / "uploads" / "restore_points"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _sanitize_restore_label(value: str | None) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip())[:40].strip("_")
    return cleaned or "manual"


def _is_business_admin(db: Session, current_user: dict) -> bool:
    actor_id = int(current_user.get("usuario_id") or 0)
    actor = db.query(Usuario).filter(Usuario.id == actor_id).first()
    actor_rol = str(getattr(actor, "rol", "") or current_user.get("rol") or "").upper().strip()
    return actor_rol in {"ADMIN", "ADMINISTRADOR"}


def _require_restore_point_create_access(db: Session, current_user: dict) -> None:
    if current_user.get("is_superadmin"):
        return
    if _is_business_admin(db, current_user) and int(current_user.get("negocio_id") or 0) > 0:
        return
    raise HTTPException(status_code=403, detail="Solo administrador puede crear puntos de recuperacion")


def _validar_plan_puntos_recuperacion(db: Session, current_user: dict) -> None:
    if current_user.get("is_superadmin"):
        return
    negocio_id = int(current_user.get("negocio_id") or 0)
    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    try:
        plan = normalizar_plan(getattr(negocio, "plan", "BASICO"))
    except ValueError:
        plan = "BASICO"
    config = resolver_config_plan_negocio(negocio, plan)
    if not getattr(config, "puntos_recuperacion_habilitado", False):
        raise HTTPException(status_code=402, detail=f"Puntos de recuperacion no disponible en plan {plan}")


def _require_superadmin_restore_points(current_user: dict) -> None:
    if not current_user.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadministrador puede restaurar puntos de recuperacion")


def _restore_point_scope(current_user: dict) -> str:
    if current_user.get("is_superadmin"):
        return "global"
    return f"negocio_{int(current_user.get('negocio_id') or 0)}"


def _sqlite_db_path(operation: str) -> Path:
    if not DATABASE_URL.startswith("sqlite:///"):
        raise HTTPException(status_code=400, detail=f"{operation} soportado solo para SQLite")
    return Path(DATABASE_URL.replace("sqlite:///", ""))


def _validate_sqlite_file(path: Path) -> None:
    try:
        with sqlite3.connect(str(path)) as conexion:
            result = conexion.execute("PRAGMA integrity_check;").fetchone()
    except sqlite3.DatabaseError as exc:
        raise HTTPException(status_code=400, detail=f"El archivo no es una base SQLite valida: {exc}")

    if not result or str(result[0]).lower() != "ok":
        raise HTTPException(status_code=400, detail="El archivo SQLite no paso la validacion de integridad")


def _quote_identifier(value: str) -> str:
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", value):
        raise HTTPException(status_code=400, detail=f"Identificador invalido: {value}")
    return f'"{value}"'


def _table_exists_sqlite(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    schema_q = _quote_identifier(schema)
    row = conn.execute(
        f"SELECT name FROM {schema_q}.sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return bool(row)


def _table_columns_sqlite(conn: sqlite3.Connection, schema: str, table: str) -> list[str]:
    schema_q = _quote_identifier(schema)
    table_q = _quote_identifier(table)
    return [str(row[1]) for row in conn.execute(f"PRAGMA {schema_q}.table_info({table_q})").fetchall()]


def _scoped_clause_sqlite(conn: sqlite3.Connection, schema: str, table: str, alias: str) -> str | None:
    schema_q = _quote_identifier(schema)
    columns = set(_table_columns_sqlite(conn, schema, table))
    if "negocio_id" in columns:
        return f"{alias}.negocio_id = ?"
    if table in {"ventas", "cajas"} and "usuario_id" in columns and _table_exists_sqlite(conn, schema, "usuarios"):
        return f"{alias}.usuario_id IN (SELECT id FROM {schema_q}.usuarios WHERE negocio_id = ?)"
    if table == "venta_detalles" and "venta_id" in columns and _table_exists_sqlite(conn, schema, "ventas"):
        ventas_columns = set(_table_columns_sqlite(conn, schema, "ventas"))
        if "negocio_id" in ventas_columns:
            return f"{alias}.venta_id IN (SELECT id FROM {schema_q}.ventas WHERE negocio_id = ?)"
        if "usuario_id" in ventas_columns and _table_exists_sqlite(conn, schema, "usuarios"):
            return f"{alias}.venta_id IN (SELECT id FROM {schema_q}.ventas WHERE usuario_id IN (SELECT id FROM {schema_q}.usuarios WHERE negocio_id = ?))"
    if table == "movimientos_caja":
        clauses = []
        if "caja_id" in columns and _table_exists_sqlite(conn, schema, "cajas"):
            cajas_columns = set(_table_columns_sqlite(conn, schema, "cajas"))
            if "negocio_id" in cajas_columns:
                clauses.append(f"{alias}.caja_id IN (SELECT id FROM {schema_q}.cajas WHERE negocio_id = ?)")
            elif "usuario_id" in cajas_columns and _table_exists_sqlite(conn, schema, "usuarios"):
                clauses.append(f"{alias}.caja_id IN (SELECT id FROM {schema_q}.cajas WHERE usuario_id IN (SELECT id FROM {schema_q}.usuarios WHERE negocio_id = ?))")
        if "venta_id" in columns and _table_exists_sqlite(conn, schema, "ventas"):
            ventas_columns = set(_table_columns_sqlite(conn, schema, "ventas"))
            if "negocio_id" in ventas_columns:
                clauses.append(f"{alias}.venta_id IN (SELECT id FROM {schema_q}.ventas WHERE negocio_id = ?)")
            elif "usuario_id" in ventas_columns and _table_exists_sqlite(conn, schema, "usuarios"):
                clauses.append(f"{alias}.venta_id IN (SELECT id FROM {schema_q}.ventas WHERE usuario_id IN (SELECT id FROM {schema_q}.usuarios WHERE negocio_id = ?))")
        if clauses:
            return "(" + " OR ".join(clauses) + ")"
    if table == "inventario_movimientos" and "producto_id" in columns and _table_exists_sqlite(conn, schema, "productos"):
        return f"{alias}.producto_id IN (SELECT id FROM {schema_q}.productos WHERE negocio_id = ?)"
    if table in {"email_verifications", "password_resets", "refresh_tokens", "token_blacklist"} and "usuario_id" in columns and _table_exists_sqlite(conn, schema, "usuarios"):
        return f"{alias}.usuario_id IN (SELECT id FROM {schema_q}.usuarios WHERE negocio_id = ?)"
    return None


def _count_params(sql: str) -> int:
    return sql.count("?")


def _delete_scoped_table_sqlite(conn: sqlite3.Connection, table: str, negocio_id: int) -> int:
    if not _table_exists_sqlite(conn, "main", table):
        return 0
    clause = _scoped_clause_sqlite(conn, "main", table, "t")
    if not clause:
        return 0
    table_q = _quote_identifier(table)
    columns = set(_table_columns_sqlite(conn, "main", table))
    id_col = "id" if "id" in columns else "rowid"
    params = tuple([negocio_id] * _count_params(clause))
    cursor = conn.execute(
        f"DELETE FROM {table_q} WHERE {id_col} IN (SELECT t.{id_col} FROM {table_q} AS t WHERE {clause})",
        params,
    )
    return int(cursor.rowcount or 0)


def _insert_scoped_table_sqlite(conn: sqlite3.Connection, table: str, negocio_id: int) -> int:
    if not _table_exists_sqlite(conn, "main", table) or not _table_exists_sqlite(conn, "restore_src", table):
        return 0
    clause = _scoped_clause_sqlite(conn, "restore_src", table, "t")
    if not clause:
        return 0
    main_columns = _table_columns_sqlite(conn, "main", table)
    source_columns = set(_table_columns_sqlite(conn, "restore_src", table))
    columns = [col for col in main_columns if col in source_columns]
    if not columns:
        return 0
    table_q = _quote_identifier(table)
    columns_q = ", ".join(_quote_identifier(col) for col in columns)
    source_columns_q = ", ".join(f"t.{_quote_identifier(col)}" for col in columns)
    params = tuple([negocio_id] * _count_params(clause))
    cursor = conn.execute(
        f"INSERT INTO {table_q} ({columns_q}) SELECT {source_columns_q} FROM restore_src.{table_q} AS t WHERE {clause}",
        params,
    )
    return int(cursor.rowcount or 0)


def _restore_business_scope_from_point(point_path: Path, negocio_id: int, current_user: dict, db: Session) -> dict:
    if negocio_id <= 0:
        raise HTTPException(status_code=400, detail="Negocio invalido para restauracion aislada")

    db_path = _sqlite_db_path("Restauracion aislada de negocio")
    backup_path = db_path.with_suffix(f"{db_path.suffix}.pre_restore_negocio_{negocio_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}")

    delete_order = [
        "venta_detalles",
        "movimientos_caja",
        "inventario_movimientos",
        "email_verifications",
        "password_resets",
        "refresh_tokens",
        "token_blacklist",
        "ventas",
        "cajas",
        "soporte_tickets",
        "clientes",
        "productos",
        "configuracion_negocio",
        "sucursales",
        "usuarios",
    ]
    insert_order = [
        "usuarios",
        "clientes",
        "productos",
        "configuracion_negocio",
        "sucursales",
        "soporte_tickets",
        "cajas",
        "ventas",
        "venta_detalles",
        "movimientos_caja",
        "inventario_movimientos",
    ]

    if db_path.exists():
        shutil.copy2(db_path, backup_path)

    db.close()
    engine.dispose()

    deleted: dict[str, int] = {}
    inserted: dict[str, int] = {}
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("ATTACH DATABASE ? AS restore_src", (str(point_path),))
        conn.execute("BEGIN IMMEDIATE")

        for table in delete_order:
            deleted_count = _delete_scoped_table_sqlite(conn, table, negocio_id)
            if deleted_count:
                deleted[table] = deleted_count

        for table in insert_order:
            inserted_count = _insert_scoped_table_sqlite(conn, table, negocio_id)
            if inserted_count:
                inserted[table] = inserted_count

        conn.commit()
        conn.execute("DETACH DATABASE restore_src")
    except sqlite3.IntegrityError as exc:
        conn.rollback()
        raise HTTPException(status_code=409, detail=f"No se pudo restaurar por conflicto de datos unicos: {exc}")
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()

    try:
        with SessionLocal() as audit_db:
            registrar_auditoria(
                db=audit_db,
                modulo="Backups",
                accion="Restaurar punto de negocio",
                descripcion=f"Negocio={negocio_id}; punto={point_path.name}; backup_previo={backup_path.name}",
                usuario=str(current_user.get("usuario_id") or "Sistema"),
            )
    except Exception:
        pass

    return {
        "backup": backup_path.name,
        "deleted": deleted,
        "inserted": inserted,
    }


def _clip_text(value: str, limit: int = SOFIA_MAX_INPUT_CHARS) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n\n[Texto recortado por limite de seguridad]"


def _redact_sensitive_text(value: str) -> str:
    text = str(value or "")
    text = re.sub(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "[correo]", text, flags=re.I)
    text = re.sub(r"\b(?:\+?51)?\s?9\d{2}[\s-]?\d{3}[\s-]?\d{3}\b", "[telefono]", text)
    text = re.sub(r"\b\d{8,11}\b", "[documento]", text)
    return text


def _guardian_snapshot_for_sofia() -> str:
    try:
        status = runtime_guardian.get_status()
    except Exception:
        return "Guardian no disponible."

    metrics = status.get("metrics", {})
    safe_mode = status.get("safe_mode", {})
    return (
        "Guardian ALVENT: "
        f"safe_mode={'ON' if safe_mode.get('enabled') else 'OFF'}, "
        f"5xx={metrics.get('requests_5xx', 0)}, "
        f"excepciones={metrics.get('exceptions_total', 0)}, "
        f"5xx_consecutivos={metrics.get('consecutive_5xx', 0)}, "
        f"incidentes_abiertos={status.get('open_incidents', 0)}."
    )


def _sofia_developer_instructions(nivel: str, categoria_local: str) -> str:
    return "\n".join([
        "Eres SofIA, asistente tecnico y humano de soporte para ALVENT ERP PRO y RENSOF.",
        "Usa razonamiento avanzado, pero responde en espanol claro, amable, preciso y con tono humano profesional.",
        "Conoces ALVENT: Dashboard, POS, Ventas, Productos, Inventario, Clientes, Cajas, Reportes, Exportacion, Usuarios, Empresa, Configuracion, Finanzas, Soporte, SUNAT/Nubefact, planes y validacion de pagos.",
        "Ayuda a detectar configuraciones faltantes: caja cerrada para cobrar, SUNAT sin conectar para boletas/facturas, RUC/series/token faltantes, stock insuficiente, plan sin modulo habilitado, pagos pendientes de validacion.",
        "Si recibes patrones locales del usuario, usalos como contexto de habitos frecuentes; no afirmes que el usuario hizo algo si solo es un patron.",
        "No inventes datos, credenciales, estados de pago, diagnósticos definitivos ni acciones ya ejecutadas.",
        "Si falta evidencia, pide exactamente los datos minimos: modulo, accion, hora, mensaje de error, usuario/rol y resultado esperado.",
        "No solicites contrase?as, tokens, claves API, datos completos de tarjetas ni documentos completos.",
        "Si hay riesgo fiscal, perdida de ventas, caida de servicio, errores 5xx repetidos o safe mode activo, recomienda escalar a RENSOF.",
        "El saludo inicial ya lo muestra la interfaz. No saludes.",
        "Entrega maximo 3 lineas: Diagnostico, Accion, Verificacion. Agrega Escalar a RENSOF solo si el riesgo lo amerita.",
        f"Nivel de respuesta: {nivel}.",
        f"Categoria local preliminar: {categoria_local}.",
    ])


def _build_sofia_input(asunto: str | None, consulta: str, current_user: Optional[dict], categoria_local: str) -> str:
    rol = str((current_user or {}).get("rol") or "usuario").upper().strip()
    is_superadmin = bool((current_user or {}).get("is_superadmin"))
    negocio_id = str((current_user or {}).get("negocio_id") or "sin_negocio")
    payload = "\n".join([
        f"Asunto: {_redact_sensitive_text(asunto or 'Consulta de soporte')}",
        f"Consulta: {_redact_sensitive_text(consulta)}",
        f"Rol usuario: {rol}",
        f"Superadmin: {'si' if is_superadmin else 'no'}",
        f"Negocio: {negocio_id}",
        f"Categoria local: {categoria_local}",
        _guardian_snapshot_for_sofia(),
    ])
    return _clip_text(payload)


def _generar_respuesta_sofia_openai(
    asunto: str | None,
    consulta: str,
    current_user: Optional[dict],
    local_result: dict,
) -> dict | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not SOFIA_ENABLE_OPENAI or not api_key:
        return None

    categoria = str(local_result.get("categoria") or "general")
    nivel = str(local_result.get("nivel") or _resolver_nivel_sofia(current_user, consulta))
    payload = {
        "model": SOFIA_OPENAI_MODEL,
        "instructions": _sofia_developer_instructions(nivel, categoria),
        "input": _build_sofia_input(asunto, consulta, current_user, categoria),
        "max_output_tokens": SOFIA_MAX_OUTPUT_TOKENS,
    }

    try:
        with httpx.Client(timeout=SOFIA_OPENAI_TIMEOUT) as client:
            response = client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except Exception:
        fallback = dict(local_result)
        fallback["origen"] = "SOFIA_LOCAL_FALLBACK"
        return fallback

    output_text = str(data.get("output_text") or "").strip()
    if not output_text:
        fallback = dict(local_result)
        fallback["origen"] = "SOFIA_LOCAL_FALLBACK"
        return fallback

    return {
        "categoria": categoria,
        "recomendación": output_text,
        "origen": "SOFIA_OPENAI",
        "nivel": nivel,
    }


def _normalizar_prioridad(value: str | None) -> str:
    prioridad = str(value or "MEDIA").strip().upper()
    if prioridad not in {"ALTA", "MEDIA", "BAJA"}:
        return "MEDIA"
    return prioridad


def _normalizar_estado_ticket(value: str | None) -> str:
    estado = str(value or "ABIERTO").strip().upper()
    if estado not in {"ABIERTO", "EN_PROCESO", "RESUELTO"}:
        return "ABIERTO"
    return estado


def _normalizar_estado_filtro(value: str | None) -> Optional[str]:
    if value is None:
        return None
    estado = str(value).strip().upper()
    if not estado or estado == "TODOS":
        return None
    if estado in {"ABIERTO", "EN_PROCESO", "RESUELTO"}:
        return estado
    return None


def _normalizar_prioridad_filtro(value: str | None) -> Optional[str]:
    if value is None:
        return None
    prioridad = str(value).strip().upper()
    if not prioridad or prioridad == "TODAS":
        return None
    if prioridad in {"ALTA", "MEDIA", "BAJA"}:
        return prioridad
    return None


def _resolver_nivel_sofia(current_user: dict | None, texto_contexto: str) -> str:
    text = str(texto_contexto or "").lower()

    if "nivel de respuesta: ejecutivo" in text or "nivel ejecutivo" in text:
        return "EJECUTIVO"
    if "nivel de respuesta: tecnico" in text or "nivel tecnico" in text:
        return "TÉCNICO"
    if "nivel de respuesta: usuario_final" in text or "usuario final" in text:
        return "USUARIO_FINAL"

    if current_user:
        if bool(current_user.get("is_superadmin")):
            return "EJECUTIVO"

        rol = str(current_user.get("rol") or "").upper().strip()
        if rol in {"ADMIN", "ADMINISTRADOR", "SUPERADMIN"}:
            return "TÉCNICO"

    return "USUARIO_FINAL"


def _envolver_respuesta_sofia(categoria: str, recomendación_base: str, nivel: str = "USUARIO_FINAL") -> dict:
    nivel_normalizado = str(nivel or "USUARIO_FINAL").upper().strip()
    if nivel_normalizado == "EJECUTIVO":
        recomendacion_nivel = f"impacto/riesgo operativo identificado. Accion inmediata: {recomendación_base}"
    elif nivel_normalizado == "TÉCNICO":
        recomendacion_nivel = f"causa probable por modulo/flujo. Accion tecnica: {recomendación_base}"
    else:
        recomendacion_nivel = f"requiere validacion simple del flujo. Siguiente accion: {recomendación_base}"

    return {
        "categoria": categoria,
        "recomendación": "\n".join([
            f"Diagnostico: {categoria.upper()} probable; {recomendacion_nivel}",
            "Accion: valida configuracion, permisos y ultimo evento relacionado.",
            "Verificacion: confirma resultado, hora exacta y mensaje mostrado.",
        ]),
        "origen": "SOFIA_LOCAL",
        "nivel": nivel_normalizado,
    }

def _sugerir_respuesta_ia(asunto: str | None, consulta: str, current_user: Optional[dict] = None) -> dict:
    texto = f"{asunto or ''} {consulta or ''}".lower()
    nivel = _resolver_nivel_sofia(current_user, f"{asunto or ''} {consulta or ''}")

    if any(word in texto for word in ["sunat", "nubefact", "boleta", "factura", "comprobante"]):
        local_result = _envolver_respuesta_sofia(
            "fiscal",
            (
                "Verifica en configuracion/Fiscal: integracion SUNAT activa, RUC emisor valido, token API vigente y series B/F configuradas. "
                "Luego prueba una boleta en POS y revisa el estado SUNAT devuelto por la venta."
            ),
            nivel,
        )
        return _generar_respuesta_sofia_openai(asunto, consulta, current_user, local_result) or local_result

    if any(word in texto for word in ["abrir caja", "caja cerrada", "habilitar caja", "apertura de caja"]):
        local_result = _envolver_respuesta_sofia(
            "operacion",
            (
                "Ve a Cajas, verifica que no exista una caja abierta para el usuario y registra monto inicial. "
                "Luego vuelve a POS y confirma que el boton Cobrar quede habilitado."
            ),
            nivel,
        )
        return _generar_respuesta_sofia_openai(asunto, consulta, current_user, local_result) or local_result

    if any(word in texto for word in ["no carga", "error 500", "distors", "estilo", "css", "hydration"]):
        local_result = _envolver_respuesta_sofia(
            "frontend",
            (
                "Reinicia frontend local, limpia cache .next y recarga la pagina. "
                "Si persiste, valida consola del navegador y ejecuta lint/build para detectar inconsistencias."
            ),
            nivel,
        )
        return _generar_respuesta_sofia_openai(asunto, consulta, current_user, local_result) or local_result

    if any(word in texto for word in ["stock", "inventario", "producto", "venta", "caja"]):
        local_result = _envolver_respuesta_sofia(
            "operacion",
            (
                "Confirma que la caja este abierta y que el producto tenga stock suficiente. "
                "Revisa en POS si el usuario pertenece al negocio correcto y que no tenga restricciones de rol."
            ),
            nivel,
        )
        return _generar_respuesta_sofia_openai(asunto, consulta, current_user, local_result) or local_result

    local_result = _envolver_respuesta_sofia(
        "general",
        (
            "Recopila contexto minimo: modulo, accion, resultado esperado, mensaje de error y hora del incidente. "
            "Con eso el superadministrador puede diagnosticar y responder mas rapido."
        ),
        nivel,
    )
    return _generar_respuesta_sofia_openai(asunto, consulta, current_user, local_result) or local_result


def _resolver_negocio_soporte(current_user: dict, negocio_id_payload: Optional[int]) -> Optional[int]:
    if current_user.get("is_superadmin"):
        return int(negocio_id_payload) if negocio_id_payload else None
    return int(current_user.get("negocio_id") or 0) or None


def _validar_plan_soporte(db: Session, current_user: dict, negocio_id: Optional[int] = None) -> None:
    if bool(current_user.get("is_superadmin")):
        return

    negocio_objetivo = int(negocio_id or current_user.get("negocio_id") or 0)
    if not negocio_objetivo:
        return

    negocio = db.query(Negocio).filter(Negocio.id == negocio_objetivo).first()
    if not negocio:
        return

    try:
        plan = normalizar_plan(getattr(negocio, "plan", "BASICO"))
    except ValueError:
        plan = "BASICO"

    config = resolver_config_plan_negocio(negocio, plan)
    if not config.soporte_habilitado:
        raise HTTPException(
            status_code=402,
            detail=f"Soporte no disponible en plan {plan}. Mejora tu plan para continuar.",
        )


def _validar_plan_reinicio(db: Session, current_user: dict) -> None:
    if bool(current_user.get("is_superadmin")):
        return

    negocio_objetivo = int(current_user.get("negocio_id") or 0)
    if not negocio_objetivo:
        return

    negocio = db.query(Negocio).filter(Negocio.id == negocio_objetivo).first()
    if not negocio:
        return

    try:
        plan = normalizar_plan(getattr(negocio, "plan", "BASICO"))
    except ValueError:
        plan = "BASICO"

    config = resolver_config_plan_negocio(negocio, plan)
    if not getattr(config, "reinicio_habilitado", True):
        raise HTTPException(
            status_code=402,
            detail=f"Reinicio no disponible en plan {plan}. Mejora tu plan para continuar.",
        )


def _ticket_to_dict(ticket: SoporteTicket, autor: Usuario | None, atendido_por: Usuario | None) -> dict:
    return {
        "id": ticket.id,
        "negocio_id": ticket.negocio_id,
        "usuario_id": ticket.usuario_id,
        "usuario_nombre": getattr(autor, "nombres", None) or getattr(autor, "usuario", "Usuario"),
        "asunto": ticket.asunto,
        "consulta": ticket.consulta,
        "prioridad": ticket.prioridad,
        "estado": ticket.estado,
        "recomendación_ia": ticket.recomendación_ia,
        "respuesta_superadmin": ticket.respuesta_superadmin,
        "atendido_por_usuario_id": ticket.atendido_por_usuario_id,
        "atendido_por_nombre": (getattr(atendido_por, "nombres", None) or getattr(atendido_por, "usuario", None)) if atendido_por else None,
        "fecha_creacion": ticket.fecha_creacion,
        "fecha_actualizacion": ticket.fecha_actualizacion,
    }


@router.delete("/system/reset")
def reset_system(
    data: ResetRequest,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):

    actor_id = int(current_user.get("usuario_id") or 0)
    actor = db.query(Usuario).filter(Usuario.id == actor_id).first()
    actor_rol = str(getattr(actor, "rol", "") or "").upper()
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and actor_rol != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administrador puede reiniciar")

    _validar_plan_reinicio(db, current_user)

    # 🔐 SEGURIDAD
    modo = str(data.modo or "").strip().lower()
    if modo not in {"parcial", "completo"}:
        raise HTTPException(status_code=400, detail="Modo invalido")

    if modo == "completo" and not is_superadmin:
        raise HTTPException(status_code=403, detail="El reinicio completo solo esta disponible para superadministrador")

    confirmacion_esperada = "REINICIAR COMPLETO" if modo == "completo" else "REINICIAR PARCIAL"
    if str(data.confirmacion or "").strip().upper() != confirmacion_esperada:
        raise HTTPException(status_code=400, detail=f"Escribe {confirmacion_esperada} para confirmar")

    if not DATABASE_URL.startswith("sqlite:///"):
        raise HTTPException(status_code=400, detail="Reinicio requiere backup automatico SQLite antes de continuar")

    db_path = Path(DATABASE_URL.replace("sqlite:///", ""))
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="No se encontro base de datos para respaldar")

    negocio_id = int(current_user.get("negocio_id") or 0)
    backup_dir = Path(__file__).resolve().parent.parent / "uploads" / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    scope = "global" if is_superadmin else f"negocio_{negocio_id}"
    backup_name = f"pre_reset_{scope}_{modo}_{timestamp}.db"
    shutil.copy2(db_path, backup_dir / backup_name)

    try:

        # =========================
        # 🟡 RESET PARCIAL
        # =========================
        if modo == "parcial":
            if is_superadmin:
                db.query(VentaDetalle).delete(synchronize_session=False)
                db.query(Venta).delete(synchronize_session=False)
                db.query(Caja).delete(synchronize_session=False)
            else:
                ventas_ids = db.query(Venta.id).filter(Venta.negocio_id == negocio_id).subquery()
                db.query(VentaDetalle).filter(VentaDetalle.venta_id.in_(ventas_ids)).delete(synchronize_session=False)
                db.query(Venta).filter(Venta.negocio_id == negocio_id).delete(synchronize_session=False)
                db.query(Caja).filter(Caja.negocio_id == negocio_id).delete(synchronize_session=False)

        # =========================
        # 🔴 RESET COMPLETO
        # =========================
        elif modo == "completo":

            db.query(VentaDetalle).delete(synchronize_session=False)
            db.query(Venta).delete(synchronize_session=False)
            db.query(Caja).delete(synchronize_session=False)
            db.query(Cliente).delete(synchronize_session=False)
            db.query(Producto).delete(synchronize_session=False)

        db.commit()
        try:
            registrar_auditoria(
                db=db,
                modulo="Sistema",
                accion="Reinicio de sistema",
                descripcion=f"Modo={modo}; backup={backup_name}; alcance={'global' if is_superadmin else f'negocio_{negocio_id}'}",
                usuario=str(current_user.get("usuario_id") or "Sistema"),
            )
        except Exception:
            pass

        return {
            "ok": True,
            "modo": modo,
            "backup": backup_name,
            "mensaje": "Sistema reiniciado correctamente. Backup automatico generado antes del reinicio."
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@router.get("/system/restore-points")
def listar_puntos_recuperacion(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    _require_restore_point_create_access(db, current_user)
    _validar_plan_puntos_recuperacion(db, current_user)

    items = []
    scope = _restore_point_scope(current_user)
    pattern = "restore_point_*.db" if current_user.get("is_superadmin") else f"restore_point_{scope}_*.db"
    for path in sorted(_restore_points_dir().glob(pattern), key=lambda item: item.stat().st_mtime, reverse=True):
        stat = path.stat()
        items.append({
            "id": path.name,
            "archivo": path.name,
            "fecha": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
            "size_bytes": stat.st_size,
        })

    return {
        "ok": True,
        "items": items[:30],
    }


@router.post("/system/restore-points")
def crear_punto_recuperacion(
    data: RestorePointCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    _require_restore_point_create_access(db, current_user)
    _validar_plan_puntos_recuperacion(db, current_user)

    db_path = _sqlite_db_path("Punto de recuperacion")
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="No se encontro base de datos para crear el punto")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    scope = _restore_point_scope(current_user)
    label = _sanitize_restore_label(data.etiqueta)
    filename = f"restore_point_{scope}_{timestamp}_{label}.db"
    destination = _restore_points_dir() / filename

    shutil.copy2(db_path, destination)

    try:
        registrar_auditoria(
            db=db,
            modulo="Backups",
            accion="Crear punto de recuperacion",
            descripcion=f"Punto {filename}",
            usuario=str(current_user.get("usuario_id") or "Sistema"),
        )
    except Exception:
        pass

    return {
        "ok": True,
        "mensaje": "Punto de recuperacion creado correctamente",
        "item": {
            "id": filename,
            "archivo": filename,
            "fecha": datetime.utcfromtimestamp(destination.stat().st_mtime).isoformat() + "Z",
            "size_bytes": destination.stat().st_size,
        },
    }


@router.post("/system/restore-points/{filename}/restore", response_model=RestoreResponse)
def restaurar_punto_recuperacion(
    filename: str,
    data: RestorePointRestoreRequest,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    if str(data.confirmacion or "").strip().upper() != "RESTAURAR PUNTO":
        raise HTTPException(status_code=400, detail="Escribe RESTAURAR PUNTO para confirmar")

    restore_dir = _restore_points_dir().resolve()
    safe_name = Path(filename).name
    point_path = (restore_dir / safe_name).resolve()
    if restore_dir not in point_path.parents or not safe_name.startswith("restore_point_") or point_path.suffix != ".db":
        raise HTTPException(status_code=400, detail="Punto de recuperacion invalido")
    if not point_path.exists():
        raise HTTPException(status_code=404, detail="Punto de recuperacion no encontrado")

    _validate_sqlite_file(point_path)

    if not current_user.get("is_superadmin"):
        _require_restore_point_create_access(db, current_user)
        _validar_plan_puntos_recuperacion(db, current_user)
        negocio_id = int(current_user.get("negocio_id") or 0)
        expected_prefix = f"restore_point_negocio_{negocio_id}_"
        if not safe_name.startswith(expected_prefix):
            raise HTTPException(status_code=403, detail="Solo puedes restaurar puntos de recuperacion de tu negocio")

        result = _restore_business_scope_from_point(point_path, negocio_id, current_user, db)
        return RestoreResponse(
            ok=True,
            mensaje=f"Punto de negocio restaurado correctamente. Backup previo: {result['backup']}",
            archivo=safe_name,
        )

    _require_superadmin_restore_points(current_user)

    db_path = _sqlite_db_path("Restauracion de punto de recuperacion")
    backup_path = db_path.with_suffix(f"{db_path.suffix}.pre_restore_point_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}")

    try:
        if db_path.exists():
            shutil.copy2(db_path, backup_path)

        db.close()
        engine.dispose()
        shutil.copy2(point_path, db_path)

        try:
            with SessionLocal() as audit_db:
                registrar_auditoria(
                    db=audit_db,
                    modulo="Backups",
                    accion="Restaurar punto de recuperacion",
                    descripcion=f"Punto {safe_name}; backup_previo={backup_path.name}",
                    usuario=str(current_user.get("usuario_id") or "Sistema"),
                )
        except Exception:
            pass

        return RestoreResponse(
            ok=True,
            mensaje="Punto de recuperacion restaurado correctamente",
            archivo=safe_name,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/system/restore", response_model=RestoreResponse)
def restore_system(
    archivo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    if not DATABASE_URL.startswith("sqlite:///"):
        raise HTTPException(status_code=400, detail="Restauración automática soportada solo para SQLite")

    if not current_user.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Solo superadministrador puede restaurar backups")

    if not archivo.filename:
        raise HTTPException(status_code=400, detail="Archivo inválido")

    extension = Path(archivo.filename).suffix.lower()
    if extension not in {".db", ".sqlite", ".sqlite3"}:
        raise HTTPException(status_code=400, detail="Solo se permiten backups SQLite (.db, .sqlite, .sqlite3)")

    db_path = Path(DATABASE_URL.replace("sqlite:///", ""))
    if not db_path.parent.exists():
        db_path.parent.mkdir(parents=True, exist_ok=True)

    contenido = archivo.file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    backup_path = db_path.with_suffix(f"{db_path.suffix}.pre_restore_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}")
    temp_path: Path | None = None

    try:
        with Path(backup_path).open("wb") as destino_backup:
            if db_path.exists():
                with db_path.open("rb") as origen_actual:
                    shutil.copyfileobj(origen_actual, destino_backup)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".db", dir=str(db_path.parent)) as temporal:
            temporal.write(contenido)
            temp_path = Path(temporal.name)

        try:
            with sqlite3.connect(str(temp_path)) as conexion:
                conexion.execute("PRAGMA integrity_check;")
        except sqlite3.DatabaseError as exc:
            raise HTTPException(status_code=400, detail=f"El archivo no es una base SQLite válida: {exc}")

        db.close()
        engine.dispose()
        shutil.copy2(str(temp_path), db_path)

        try:
            with SessionLocal() as audit_db:
                registrar_auditoria(
                    db=audit_db,
                    modulo="Backups",
                    accion="Restaurar backup",
                    descripcion=f"Restore {archivo.filename}",
                    usuario=str(current_user.get("usuario_id") or "Sistema"),
                )
        except Exception:
            pass

        return RestoreResponse(
            ok=True,
            mensaje="Base de datos restaurada correctamente",
            archivo=archivo.filename,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


@router.get("/system/backup")
def descargar_backup(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    if not DATABASE_URL.startswith("sqlite:///"):
        raise HTTPException(status_code=400, detail="Backup automático soportado solo para SQLite")

    actor_id = int(current_user.get("usuario_id") or 0)
    actor = db.query(Usuario).filter(Usuario.id == actor_id).first()
    actor_rol = str(getattr(actor, "rol", "") or "").upper()
    if not current_user.get("is_superadmin") and actor_rol != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administrador puede generar backup")

    negocio_id = int(current_user.get("negocio_id") or 0)
    backup_dir = Path(__file__).resolve().parent.parent / "uploads" / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    if not current_user.get("is_superadmin"):
        negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
        try:
            plan = normalizar_plan(getattr(negocio, "plan", "BASICO"))
        except ValueError:
            plan = "BASICO"
        config = resolver_config_plan_negocio(negocio, plan)
        if not config.backups_habilitado:
            raise HTTPException(
                status_code=402,
                detail=f"Backup no disponible en plan {plan}",
            )

        if config.backups_limite is not None:
            backups_consumidos = len(list(backup_dir.glob(f"backup_negocio_{negocio_id}_*.db")))
            if backups_consumidos >= config.backups_limite:
                raise HTTPException(
                    status_code=402,
                    detail=f"Plan {plan} permite hasta {config.backups_limite} backups. Elimina backups antiguos para continuar.",
                )

    db_path = Path(DATABASE_URL.replace("sqlite:///", ""))
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="No se encontró base de datos")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    scope = f"negocio_{negocio_id}" if negocio_id else "global"
    backup_name = f"backup_{scope}_{timestamp}.db"
    backup_path = backup_dir / backup_name

    shutil.copy2(db_path, backup_path)

    registrar_auditoria(
        db=db,
        modulo="Backups",
        accion="Generar backup",
        descripcion=f"Backup {backup_name}",
        usuario=str(current_user.get("usuario_id") or "Sistema"),
    )

    return FileResponse(
        path=str(backup_path),
        filename=backup_name,
        media_type="application/octet-stream",
    )


@router.post("/system/soporte/ia/sugerencia")
def sugerir_soporte_ia(
    data: SoporteAiRequest,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    _validar_plan_soporte(db, current_user)

    consulta = str(data.consulta or "").strip()
    if len(consulta) < 8:
        raise HTTPException(status_code=400, detail="Describe mejor la consulta para sugerir una solución")

    result = _sugerir_respuesta_ia(data.asunto, consulta, current_user)
    return {
        "ok": True,
        "categoria": result["categoria"],
        "recomendación": result["recomendación"],
        "origen": result.get("origen", "SOFIA_LOCAL"),
        "nivel": result.get("nivel", "USUARIO_FINAL"),
    }


@router.get("/system/soporte/tickets")
def listar_tickets_soporte(
    negocio_id: Optional[int] = None,
    estado: Optional[str] = None,
    prioridad: Optional[str] = None,
    page: int = 1,
    page_size: int = 8,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    page = max(1, int(page or 1))
    page_size = min(50, max(1, int(page_size or 8)))

    query = db.query(SoporteTicket)
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_objetivo = int(negocio_id or 0) if negocio_id else None
    estado_filtro = _normalizar_estado_filtro(estado)
    prioridad_filtro = _normalizar_prioridad_filtro(prioridad)

    if is_superadmin:
        if negocio_objetivo:
            query = query.filter(SoporteTicket.negocio_id == negocio_objetivo)
    else:
        negocio_usuario = int(current_user.get("negocio_id") or 0)
        query = query.filter(SoporteTicket.negocio_id == negocio_usuario)

    if estado_filtro:
        query = query.filter(SoporteTicket.estado == estado_filtro)
    if prioridad_filtro:
        query = query.filter(SoporteTicket.prioridad == prioridad_filtro)

    total = query.count()
    total_pages = max(1, (total + page_size - 1) // page_size)
    if page > total_pages:
        page = total_pages

    tickets = (
        query
        .order_by(SoporteTicket.fecha_creacion.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    usuario_ids = {int(t.usuario_id) for t in tickets if t.usuario_id}
    atendidos_ids = {int(t.atendido_por_usuario_id) for t in tickets if t.atendido_por_usuario_id}
    ids_total = list(usuario_ids.union(atendidos_ids))

    usuarios_map = {}
    if ids_total:
        usuarios = db.query(Usuario).filter(Usuario.id.in_(ids_total)).all()
        usuarios_map = {u.id: u for u in usuarios}

    return {
        "tickets": [
            _ticket_to_dict(
                t,
                usuarios_map.get(t.usuario_id),
                usuarios_map.get(t.atendido_por_usuario_id) if t.atendido_por_usuario_id else None,
            )
            for t in tickets
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
        "filtros": {
            "estado": estado_filtro,
            "prioridad": prioridad_filtro,
        },
    }


@router.post("/system/soporte/tickets")
def crear_ticket_soporte(
    data: SoporteTicketCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    asunto = str(data.asunto or "").strip()
    consulta = str(data.consulta or "").strip()
    if len(asunto) < 4:
        raise HTTPException(status_code=400, detail="El asunto debe tener al menos 4 caracteres")
    if len(consulta) < 8:
        raise HTTPException(status_code=400, detail="La consulta debe tener al menos 8 caracteres")

    negocio_ticket = _resolver_negocio_soporte(current_user, data.negocio_id)
    _validar_plan_soporte(db, current_user, negocio_ticket)
    sugerencia = _sugerir_respuesta_ia(asunto, consulta, current_user)

    ticket = SoporteTicket(
        negocio_id=negocio_ticket,
        usuario_id=int(current_user.get("usuario_id") or 0),
        asunto=asunto,
        consulta=consulta,
        prioridad=_normalizar_prioridad(data.prioridad),
        estado="ABIERTO",
        recomendación_ia=sugerencia["recomendación"],
    )

    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    try:
        registrar_auditoria(
            db=db,
            modulo="Soporte",
            accion="Crear ticket",
            descripcion=f"Ticket #{ticket.id} | asunto={ticket.asunto} | prioridad={ticket.prioridad}",
            usuario=str(current_user.get("usuario_id") or "Sistema"),
        )
    except Exception:
        pass

    autor = db.query(Usuario).filter(Usuario.id == ticket.usuario_id).first()

    return {
        "ok": True,
        "mensaje": "Consulta registrada y derivada a superadministrador",
        "ticket": _ticket_to_dict(ticket, autor, None),
        "sugerencia_ia": {
            "categoria": sugerencia["categoria"],
            "recomendación": sugerencia["recomendación"],
            "origen": sugerencia.get("origen", "SOFIA_LOCAL"),
            "nivel": sugerencia.get("nivel", "USUARIO_FINAL"),
        },
    }


@router.patch("/system/soporte/tickets/{ticket_id}/atender")
def atender_ticket_soporte(
    ticket_id: int,
    data: SoporteTicketResponder,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    if not bool(current_user.get("is_superadmin")):
        raise HTTPException(status_code=403, detail="Solo RENSOF puede atender tickets")

    ticket = db.query(SoporteTicket).filter(SoporteTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    respuesta = str(data.respuesta_superadmin or "").strip()
    if len(respuesta) < 4:
        raise HTTPException(status_code=400, detail="La respuesta debe tener al menos 4 caracteres")

    ticket.respuesta_superadmin = respuesta
    ticket.estado = _normalizar_estado_ticket(data.estado)
    ticket.atendido_por_usuario_id = int(current_user.get("usuario_id") or 0)
    ticket.fecha_actualizacion = datetime.utcnow()

    db.commit()
    db.refresh(ticket)

    try:
        registrar_auditoria(
            db=db,
            modulo="Soporte",
            accion="Atender ticket",
            descripcion=f"Ticket #{ticket.id} actualizado a {ticket.estado}",
            usuario=str(current_user.get("usuario_id") or "Sistema"),
        )
    except Exception:
        pass

    autor = db.query(Usuario).filter(Usuario.id == ticket.usuario_id).first()
    atendido_por = db.query(Usuario).filter(Usuario.id == ticket.atendido_por_usuario_id).first()

    return {
        "ok": True,
        "mensaje": "Ticket atendido correctamente",
        "ticket": _ticket_to_dict(ticket, autor, atendido_por),
    }


@router.get("/system/guardian/status")
def guardian_status(
    current_user: dict = Depends(get_current_user_with_negocio),
):
    return {
        "ok": True,
        "guardian": runtime_guardian.get_status(),
        "viewer": {
            "usuario_id": current_user.get("usuario_id"),
            "is_superadmin": bool(current_user.get("is_superadmin")),
        },
    }


@router.get("/system/guardian/incidentes")
def guardian_incidentes(
    limit: int = 50,
    include_acked: bool = True,
    current_user: dict = Depends(get_current_user_with_negocio),
):
    if not bool(current_user.get("is_superadmin")):
        raise HTTPException(status_code=403, detail="Solo RENSOF puede listar incidentes del guardian")

    items = runtime_guardian.list_incidents(limit=limit, include_acked=include_acked)
    return {
        "ok": True,
        "items": items,
        "count": len(items),
    }


@router.post("/system/guardian/incidentes/{incident_id}/ack")
def guardian_ack_incidente(
    incident_id: str,
    data: GuardianAckRequest,
    current_user: dict = Depends(get_current_user_with_negocio),
):
    if not bool(current_user.get("is_superadmin")):
        raise HTTPException(status_code=403, detail="Solo RENSOF puede confirmar incidentes")

    actor = f"user:{current_user.get('usuario_id') or 'unknown'}"
    item = runtime_guardian.ack_incident(
        incident_id=incident_id,
        actor=actor,
        note=data.note,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Incidente no encontrado")

    return {
        "ok": True,
        "item": item,
    }


@router.post("/system/guardian/safe-mode")
def guardian_safe_mode(
    data: GuardianSafeModeRequest,
    current_user: dict = Depends(get_current_user_with_negocio),
):
    if not bool(current_user.get("is_superadmin")):
        raise HTTPException(status_code=403, detail="Solo RENSOF puede gestionar safe mode")

    actor = f"user:{current_user.get('usuario_id') or 'unknown'}"
    incident = runtime_guardian.set_safe_mode(
        enabled=bool(data.enabled),
        reason=str(data.reason or "manual").strip() or "manual",
        actor=actor,
    )

    return {
        "ok": True,
        "safe_mode": runtime_guardian.get_status().get("safe_mode", {}),
        "incident": incident,
    }
