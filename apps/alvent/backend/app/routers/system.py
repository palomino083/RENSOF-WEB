from datetime import datetime
from pathlib import Path
import sqlite3
import shutil
import tempfile
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
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
    password: str


class RestoreResponse(BaseModel):
    ok: bool
    mensaje: str
    archivo: str


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


def _sugerir_respuesta_ia(asunto: str | None, consulta: str) -> dict:
    texto = f"{asunto or ''} {consulta or ''}".lower()

    if any(word in texto for word in ["sunat", "nubefact", "boleta", "factura", "comprobante"]):
        return {
            "categoria": "fiscal",
            "recomendacion": (
                "Verifica en Configuración/Fiscal: integración SUNAT activa, RUC emisor válido, token API vigente y series B/F configuradas. "
                "Luego prueba una boleta en POS y revisa el estado SUNAT devuelto por la venta."
            ),
        }

    if any(word in texto for word in ["no carga", "error 500", "distors", "estilo", "css", "hydration"]):
        return {
            "categoria": "frontend",
            "recomendacion": (
                "Reinicia frontend local, limpia caché .next y recarga la página. Si persiste, valida consola del navegador y ejecuta lint/build para detectar inconsistencias."
            ),
        }

    if any(word in texto for word in ["stock", "inventario", "producto", "venta", "caja"]):
        return {
            "categoria": "operacion",
            "recomendacion": (
                "Confirma que la caja esté abierta y que el producto tenga stock suficiente. Revisa en POS si el usuario pertenece al negocio correcto y que no tenga restricciones de rol."
            ),
        }

    return {
        "categoria": "general",
        "recomendacion": (
            "Recopila contexto mínimo: módulo, acción, resultado esperado, mensaje de error y hora del incidente. "
            "Con eso el superadministrador puede diagnosticar y responder más rápido."
        ),
    }


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
        "recomendacion_ia": ticket.recomendacion_ia,
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
    if not current_user.get("is_superadmin") and actor_rol != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administrador puede reiniciar")

    # 🔐 SEGURIDAD
    if data.password != "ADMIN123":
        raise HTTPException(status_code=403, detail="No autorizado")

    try:

        # =========================
        # 🟡 RESET PARCIAL
        # =========================
        if data.modo == "parcial":

            db.query(VentaDetalle).delete(synchronize_session=False)
            db.query(Venta).delete(synchronize_session=False)
            db.query(Caja).delete(synchronize_session=False)

        # =========================
        # 🔴 RESET COMPLETO
        # =========================
        elif data.modo == "completo":

            db.query(VentaDetalle).delete(synchronize_session=False)
            db.query(Venta).delete(synchronize_session=False)
            db.query(Caja).delete(synchronize_session=False)
            db.query(Cliente).delete(synchronize_session=False)
            db.query(Producto).delete(synchronize_session=False)

        else:
            raise HTTPException(
                status_code=400,
                detail="Modo inválido"
            )

        db.commit()

        return {
            "ok": True,
            "modo": data.modo,
            "mensaje": "Sistema reiniciado correctamente"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@router.post("/system/restore", response_model=RestoreResponse)
def restore_system(
    archivo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    if not DATABASE_URL.startswith("sqlite:///"):
        raise HTTPException(status_code=400, detail="Restauración automática soportada solo para SQLite")

    actor_id = int(current_user.get("usuario_id") or 0)
    actor = db.query(Usuario).filter(Usuario.id == actor_id).first()
    actor_rol = str(getattr(actor, "rol", "") or "").upper()
    if not current_user.get("is_superadmin") and actor_rol != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administrador puede restaurar")

    if not archivo.filename:
        raise HTTPException(status_code=400, detail="Archivo inválido")

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

    result = _sugerir_respuesta_ia(data.asunto, consulta)
    return {
        "ok": True,
        "categoria": result["categoria"],
        "recomendacion": result["recomendacion"],
        "origen": "IA_LOCAL",
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
    sugerencia = _sugerir_respuesta_ia(asunto, consulta)

    ticket = SoporteTicket(
        negocio_id=negocio_ticket,
        usuario_id=int(current_user.get("usuario_id") or 0),
        asunto=asunto,
        consulta=consulta,
        prioridad=_normalizar_prioridad(data.prioridad),
        estado="ABIERTO",
        recomendacion_ia=sugerencia["recomendacion"],
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
            "recomendacion": sugerencia["recomendacion"],
            "origen": "IA_LOCAL",
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