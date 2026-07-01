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
from app.routers.auth import limiter as auth_limiter


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
                "referencia_pago": "OP-778899",
                "canal_pago": "transferencia",
                "observaciones": "pago realizado",
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        payload = r.json()
        self.assertEqual(payload.get("plan_actual"), "BASICO")
        self.assertEqual(payload.get("plan_solicitado"), "PRO")

        r = self.client.get(
            f"/negocios/{negocio_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json().get("plan"), "PRO")


if __name__ == "__main__":
    unittest.main(verbosity=2)
