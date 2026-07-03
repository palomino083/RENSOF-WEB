from datetime import datetime
from pathlib import Path
import sqlite3
import shutil
import tempfile

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
from app.services.auditoria import registrar_auditoria
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