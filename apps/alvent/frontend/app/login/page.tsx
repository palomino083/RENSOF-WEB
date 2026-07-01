"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/services/api";
import { forgotPassword } from "@/services/authService";
import { getApiErrorMessage } from "@/utils/apiError";
import { appPath } from "@/utils/appPath";
import ModalCard from "@/components/ui/ModalCard";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./page.module.css";

function normalizarRol(rol: string) {
  const raw = String(rol || "").toUpperCase().trim();
  const compacto = raw.replace(/[^A-Z0-9]/g, "");
  if (compacto === "SUPERADMIN" || compacto === "SUPERADMINISTRADOR") return "SUPERADMIN";
  if (compacto === "ADMIN" || compacto === "ADMINISTRADOR") return "ADMINISTRADOR";
  return raw;
}

export default function LoginPage() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [openRecovery, setOpenRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");

  /* =========================
     🔐 LOGIN ERP
  ========================= */
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!usuario.trim() || !password.trim()) {
      setError("Por favor completa todos los campos");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/login", {
        usuario,
        password,
      });

      const rolServidor = normalizarRol(res.data.rol || "");
      const rolesServidor = Array.isArray(res.data.roles)
        ? res.data.roles.map((r: string) => normalizarRol(r || ""))
        : [];

      const esSuperAdmin =
        Number(res.data.usuario_id) === 1 ||
        rolServidor === "SUPERADMIN" ||
        rolesServidor.includes("SUPERADMIN");

      const rolSesion = esSuperAdmin ? "SUPERADMIN" : res.data.rol;

      // Guardar token JWT y refresh token
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("refreshToken", res.data.refresh_token);
      localStorage.setItem("usuario_id", String(res.data.usuario_id));
      localStorage.setItem("negocio_id", String(res.data.negocio_id));
      localStorage.setItem(
        "usuario",
        JSON.stringify({
          id: res.data.usuario_id,
          usuario,
          nombres: res.data.nombres,
          rol: rolSesion,
          roles: rolesServidor.length > 0 ? rolesServidor : [rolSesion],
          negocio_id: res.data.negocio_id,
        })
      );

      // Redirección
      const tieneNegocio = !!res.data.negocio_id;

      if (tieneNegocio || esSuperAdmin) {
        window.location.href = appPath("dashboard");
      } else {
        window.location.href = appPath("registro");
      }
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);
      if (!err?.response) {
        setError("No hay conexion con la API de ALVENT. Verifica el proxy interno e intenta de nuevo.");
      } else {
        setError(getApiErrorMessage(err, "Usuario o contraseña incorrectos"));
      }
    } finally {
      setLoading(false);
    }
  };

  const solicitarRecuperacion = async () => {
    if (!recoveryEmail.trim()) {
      setRecoveryError("Ingresa un correo valido");
      return;
    }

    try {
      setRecoveryLoading(true);
      setRecoveryError("");
      const res = await forgotPassword({ email: recoveryEmail.trim() });
      setRecoveryMessage(res.mensaje || "Revisa tu correo para continuar");
    } catch (err: any) {
      setRecoveryError(getApiErrorMessage(err, "No se pudo enviar el enlace"));
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <main className={styles.shell}>
      <div className={styles.orbOne} />
      <div className={styles.orbTwo} />

      <section className={`${styles.panel} stagger`}>
        <aside className={styles.brand}>
          <div className={styles.logo}>A</div>
          <span className={styles.badge}>Premium POS Suite</span>
          <h1>ALVENT ERP</h1>
          <p className={styles.subtitle}>
            Opera ventas, inventario, caja y reportes desde una misma plataforma con velocidad y control.
          </p>

          <div className={styles.featureGrid}>
            <div className={styles.feature}>Cierre de caja auditado</div>
            <div className={styles.feature}>Alertas de inventario en tiempo real</div>
            <div className={styles.feature}>Reportes ejecutivos listos para accion</div>
            <div className={styles.feature}>Control multiusuario por roles</div>
          </div>
        </aside>

        <article className={styles.formCard}>
          <header className={styles.formHead}>
            <h2>Iniciar sesion</h2>
            <p>Accede con tus credenciales para continuar.</p>
            <StatusBadge text="Acceso seguro" variant="info" />
          </header>

          {error ? <div className={styles.errorBox}>{error}</div> : null}

          <form onSubmit={login} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Usuario</label>
              <input
                type="text"
                placeholder="Ingresa tu usuario"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                disabled={loading}
                className={`${styles.input} focus-ring`}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Contrasena</label>
              <div className={styles.inputWrap}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Ingresa tu contrasena"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className={`${styles.input} ${styles.inputPassword} focus-ring`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className={styles.toggleBtn}
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? "Iniciando sesion..." : "Iniciar sesion"}
            </button>

            <button
              type="button"
              className={styles.secondaryLink}
              onClick={() => {
                setOpenRecovery(true);
                setRecoveryMessage("");
                setRecoveryError("");
                setRecoveryEmail("");
              }}
            >
              Olvide mi usuario o contrasena
            </button>
          </form>

          <p className={styles.footer}>
            Eres nuevo?{" "}
            <Link href="/registro" className={styles.link}>
              Crear cuenta y negocio
            </Link>
          </p>

          <p className={styles.copy}>ALVENT ERP POS © 2026</p>
        </article>
      </section>

      <ModalCard
        open={openRecovery}
        title="Recuperar acceso"
        subtitle="Te enviaremos un enlace para recuperar usuario y contrasena"
        actions={(
          <>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={solicitarRecuperacion}
              disabled={recoveryLoading}
            >
              {recoveryLoading ? "Enviando..." : "Enviar enlace"}
            </button>
            <button
              type="button"
              className={styles.cancelRecoveryBtn}
              onClick={() => setOpenRecovery(false)}
              disabled={recoveryLoading}
            >
              Cerrar
            </button>
          </>
        )}
      >
        <input
          type="email"
          placeholder="Correo de tu cuenta"
          value={recoveryEmail}
          onChange={(e) => setRecoveryEmail(e.target.value)}
          className="focus-ring"
        />
        {recoveryError ? <p className={styles.errorText}>{recoveryError}</p> : null}
        {recoveryMessage ? <p className={styles.successText}>{recoveryMessage}</p> : null}
      </ModalCard>
    </main>
  );
}