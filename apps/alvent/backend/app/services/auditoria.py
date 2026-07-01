from app.models.auditoria import Auditoria


def registrar_auditoria(
    db,
    modulo,
    accion,
    descripcion,
    usuario="Sistema"
):

    registro = Auditoria(
        modulo=modulo,
        accion=accion,
        descripcion=descripcion,
        usuario=usuario
    )

    db.add(registro)
    db.commit()