import random
import string
import sys
import unittest
from pathlib import Path

# Permite importar `app.*` desde backend/
REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from app.main import app
from app.database.database import SessionLocal
from app.models.plan_pago import PlanPago
from app.models.usuario import Usuario
from app.routers.auth import limiter as auth_limiter
from app.utils.jwt_utils import hash_password


def rnd(prefix: str) -> str:
    token = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}{token}"


class TestPlanFlows(unittest.TestCase):
    def setUp(self) -> None:
        storage = getattr(auth_limiter, "_storage", None)
        if storage is not None:
            reset_fn = getattr(storage, "reset", None)
            if callable(reset_fn):
                reset_fn()

        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)

    def _crear_admin_y_negocio(self, plan: str) -> tuple[str, str, str, int]:
        usuario = rnd("adm")
        email = f"{usuario}@mail.com"
        password = "Clave1234"

        r = self.client.post(
            "/auth/register",
            json={
                "nombres": f"Admin {plan}",
                "usuario": usuario,
                "email": email,
                "password": password,
                "rol": "ADMINISTRADOR",
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        register_token = r.json().get("token")
        self.assertTrue(register_token)

        r = self.client.post(
            "/negocios/",
            headers={"Authorization": f"Bearer {register_token}"},
            json={
                "nombre": f"Negocio {usuario}",
                "tipo": "tienda",
                "plan": plan,
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        negocio_id = r.json().get("id")
        self.assertIsInstance(negocio_id, int)

        r = self.client.post(
            "/auth/asociar-negocio",
            headers={"Authorization": f"Bearer {register_token}"},
            json={"negocio_id": negocio_id},
        )
        self.assertEqual(r.status_code, 200, r.text)

        r = self.client.post(
            "/auth/login",
            json={"usuario": usuario, "password": password},
        )
        self.assertEqual(r.status_code, 200, r.text)
        access_token = r.json().get("access_token")
        self.assertTrue(access_token)

        return usuario, password, access_token, negocio_id

    def test_premium_admin_permite_multitarea_reportes_y_backup(self):
        _, _, token, _ = self._crear_admin_y_negocio("PREMIUM")

        r = self.client.post(
            "/usuarios/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nombres": "Usuario Multi",
                "usuario": rnd("multi"),
                "dni": "99887766",
                "email": f"{rnd('multi')}@mail.com",
                "password": "Clave1234",
                "rol": "CAJERO",
                "roles": ["CAJERO", "ALMACEN"],
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        payload = r.json()
        self.assertEqual(payload.get("rol"), "CAJERO")
        self.assertEqual(set(payload.get("roles", [])), {"CAJERO", "ALMACEN"})

        r = self.client.get(
            "/reportes/ventas-hoy",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 200, r.text)

        r = self.client.get(
            "/system/backup",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("application/octet-stream", r.headers.get("content-type", ""))

    def test_plan_basico_bloquea_reportes_backup_y_limita_usuarios(self):
        _, _, token, _ = self._crear_admin_y_negocio("BASICO")

        # En basico: admin + 1 usuario extra = 2 (permitido)
        r = self.client.post(
            "/usuarios/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nombres": "Usuario Uno",
                "usuario": rnd("u1"),
                "dni": "11112222",
                "email": f"{rnd('u1')}@mail.com",
                "password": "Clave1234",
                "rol": "CAJERO",
                "roles": ["CAJERO"],
            },
        )
        self.assertEqual(r.status_code, 200, r.text)

        # Segundo usuario extra ya excede el limite del plan basico
        r = self.client.post(
            "/usuarios/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nombres": "Usuario Dos",
                "usuario": rnd("u2"),
                "dni": "33334444",
                "email": f"{rnd('u2')}@mail.com",
                "password": "Clave1234",
                "rol": "CAJERO",
                "roles": ["CAJERO"],
            },
        )
        self.assertEqual(r.status_code, 402, r.text)

        r = self.client.get(
            "/reportes/ventas-hoy",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 402, r.text)

        r = self.client.get(
            "/system/backup",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 402, r.text)

    def test_plan_lite_permite_reportes_bloquea_backup_y_limita_usuarios(self):
        _, _, token, _ = self._crear_admin_y_negocio("LITE")

        for idx in range(1, 4):
            r = self.client.post(
                "/usuarios/",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "nombres": f"Usuario {idx}",
                    "usuario": rnd(f"ul{idx}"),
                    "dni": f"77{idx}3456{idx}",
                    "email": f"{rnd(f'ul{idx}')}@mail.com",
                    "password": "Clave1234",
                    "rol": "CAJERO",
                    "roles": ["CAJERO"],
                },
            )
            self.assertEqual(r.status_code, 200, r.text)

        r = self.client.post(
            "/usuarios/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nombres": "Usuario Excedido",
                "usuario": rnd("ule"),
                "dni": "88990011",
                "email": f"{rnd('ule')}@mail.com",
                "password": "Clave1234",
                "rol": "CAJERO",
                "roles": ["CAJERO"],
            },
        )
        self.assertEqual(r.status_code, 402, r.text)

        r = self.client.get(
            "/reportes/ventas-hoy",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 200, r.text)

        r = self.client.get(
            "/system/backup",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 402, r.text)

    def test_admin_no_superadmin_no_puede_cambiar_plan(self):
        usuario, _, token, negocio_id = self._crear_admin_y_negocio("BASICO")

        r = self.client.put(
            f"/negocios/{negocio_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nombre": f"Negocio {usuario} actualizado",
                "plan": "PREMIUM",
            },
        )
        self.assertEqual(r.status_code, 403, r.text)

    def test_admin_puede_solicitar_cambio_plan_y_se_activa_automatico(self):
        _, _, token, negocio_id = self._crear_admin_y_negocio("BASICO")

        r = self.client.post(
            f"/negocios/{negocio_id}/solicitar-plan",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "plan_objetivo": "PRO",
                "referencia_pago": f"OP-{rnd('REF').upper()}",
                "canal_pago": "transferencia",
                "observaciones": "pago realizado",
                "comprobante_url": "/uploads/planes/comprobante-test.pdf",
                "declaracion_anti_fraude": True,
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        payload = r.json()
        self.assertEqual(payload.get("plan_actual"), "GRATUITO")
        self.assertEqual(payload.get("plan_solicitado"), "PRO")

        r = self.client.get(
            f"/negocios/{negocio_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json().get("plan"), "PRO")

    def test_historial_planes_usuario_solo_muestra_sus_pagos(self):
        admin_usuario, _, admin_token, negocio_id = self._crear_admin_y_negocio("PREMIUM")

        usuario = rnd("caj")
        password = "Clave1234"
        db = SessionLocal()
        try:
            admin = db.query(Usuario).filter(Usuario.usuario == admin_usuario).first()
            self.assertIsNotNone(admin)
            cajero = Usuario(
                nombres="Cajero Historial",
                usuario=usuario,
                dni="".join(random.choices(string.digits, k=8)),
                email=f"{usuario}@mail.com",
                password=hash_password(password),
                rol="CAJERO",
                roles="CAJERO",
                negocio_id=negocio_id,
                activo=True,
                email_verificado=True,
            )
            db.add(cajero)
            db.flush()
            user_id = cajero.id

            db.add_all([
                PlanPago(
                    negocio_id=negocio_id,
                    usuario_id=admin.id,
                    plan_actual="GRATUITO",
                    plan_solicitado="PRO",
                    canal_pago="transferencia",
                    referencia_pago=f"ADM-{rnd('REF').upper()}",
                    comprobante_url="/uploads/planes/comprobante-admin.pdf",
                    estado="APLICADO",
                ),
                PlanPago(
                    negocio_id=negocio_id,
                    usuario_id=user_id,
                    plan_actual="PRO",
                    plan_solicitado="BASICO",
                    canal_pago="transferencia",
                    referencia_pago=f"USR-{rnd('REF').upper()}",
                    comprobante_url="/uploads/planes/comprobante-usuario.pdf",
                    estado="APLICADO",
                ),
            ])
            db.commit()
        finally:
            db.close()

        r = self.client.get(
            f"/negocios/{negocio_id}/planes/historial",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertGreaterEqual(len(r.json()), 1)

        r = self.client.post(
            "/auth/login",
            json={"usuario": usuario, "password": password},
        )
        self.assertEqual(r.status_code, 200, r.text)
        user_token = r.json().get("access_token")
        self.assertTrue(user_token)

        r = self.client.get(
            f"/negocios/{negocio_id}/planes/historial",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        historial = r.json()
        self.assertEqual(len(historial), 1)
        self.assertEqual(historial[0].get("usuario_id"), user_id)


if __name__ == "__main__":
    unittest.main(verbosity=2)
