"use client";

import { useState } from "react";
import { api } from "@/services/api";
import { getApiErrorMessage } from "@/utils/apiError";
import { appPath } from "@/utils/appPath";

export default function RegisterPage() {
  // Estado Usuario
  const [nombres, setNombres] = useState("");
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const validarStep1 = () => {
    if (!nombres.trim()) {
      setError("Ingresa nombres y apellidos");
      return false;
    }
    if (!usuario.trim()) {
      setError("Ingresa un usuario");
      return false;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Email inválido");
      return false;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return false;
    }
    return true;
  };

  const handleRegister = async () => {
    setError("");

    if (!validarStep1()) return;

    setLoading(true);
    try {
      // 1. Crear usuario (sin autenticación aún)
      const resUsuario = await api.post("/auth/register", {
        nombres,
        usuario,
        email,
        password,
        rol: "ADMINISTRADOR",
      });

      // Guardar token inicial
      localStorage.setItem("token", resUsuario.data.token);
      localStorage.setItem("usuario_id", String(resUsuario.data.id));
      localStorage.setItem(
        "usuario",
        JSON.stringify({
          id: resUsuario.data.id,
          usuario,
          nombres,
          rol: "ADMINISTRADOR",
          negocio_id: null,
        })
      );

      // 2. Crear negocio (ahora con token)
      const negocioBase = nombres.trim() ? `Negocio de ${nombres.trim()}` : "Mi Negocio";
      const resNegocio = await api.post("/negocios/", {
        nombre: negocioBase,
        tipo: "tienda",
        plan: "GRATUITO",
        descripcion: "Negocio creado automaticamente en registro",
      });

      // 3. Asociar usuario con negocio
      const resAsociar = await api.post("/auth/asociar-negocio", {
        negocio_id: resNegocio.data.id,
      });

      // 4. Guardar datos finales
      localStorage.setItem("token", resAsociar.data.access_token);
      localStorage.setItem("refreshToken", resAsociar.data.refresh_token);
      localStorage.setItem("negocio_id", String(resNegocio.data.id));
      localStorage.setItem(
        "usuario",
        JSON.stringify({
          id: resUsuario.data.id,
          usuario,
          nombres,
          rol: "ADMINISTRADOR",
          negocio_id: resNegocio.data.id,
        })
      );

      setSuccess(true);
      setTimeout(() => {
        window.location.href = appPath("onboarding/configuracion");
      }, 1500);
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error("REGISTRO ERROR:", err);
      }
      setError(getApiErrorMessage(err, "Error en el registro"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "20px",
      }}
    >
      {/* Decoración */}
      <div
        style={{
          position: "absolute",
          top: "-50%",
          right: "-10%",
          width: "500px",
          height: "500px",
          background: "rgba(255,255,255,.05)",
          borderRadius: "50%",
          filter: "blur(40px)",
        }}
      />

      {/* CARD */}
      <div
        style={{
          width: "100%",
          maxWidth: "500px",
          background: "rgba(255, 255, 255, 0.95)",
          padding: "50px 40px",
          borderRadius: "20px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* HEADER */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: "#1a202c",
              margin: 0,
            }}
          >
            Crear Cuenta
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#718096",
              margin: "8px 0 0 0",
            }}
          >
            Paso 1 de 1
          </p>
        </div>

        {/* PROGRESS BAR */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "30px",
          }}
        >
          {[1].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: "4px",
                background: "#667eea",
                borderRadius: "2px",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* ERROR */}
        {error && (
          <div
            style={{
              background: "#fed7d7",
              border: "1px solid #fc8181",
              color: "#c53030",
              padding: "12px 16px",
              borderRadius: "10px",
              marginBottom: "20px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {/* SUCCESS */}
        {success && (
          <div
            style={{
              background: "#c6f6d5",
              border: "1px solid #9ae6b4",
              color: "#22543d",
              padding: "12px 16px",
              borderRadius: "10px",
              marginBottom: "20px",
              fontSize: "14px",
            }}
          >
            ✅ ¡Registro exitoso! Redirigiendo...
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                Nombres y Apellidos
              </label>
              <input
                placeholder="Ej: Martin Palomino"
                value={nombres}
                onChange={(e) => setNombres(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e2e8f0",
                  borderRadius: "10px",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                Usuario
              </label>
              <input
                placeholder="Ej: juan_perez"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e2e8f0",
                  borderRadius: "10px",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                Email
              </label>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e2e8f0",
                  borderRadius: "10px",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e2e8f0",
                  borderRadius: "10px",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                Confirmar Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e2e8f0",
                  borderRadius: "10px",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              onClick={handleRegister}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 20px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                fontWeight: "700",
                fontSize: "15px",
                marginTop: "10px",
              }}
            >
              {loading ? "Registrando..." : "Crear Cuenta"}
            </button>
          </div>

        {/* FOOTER */}
        <p style={{ textAlign: "center", fontSize: "14px", color: "#718096", marginTop: "30px", marginBottom: 0 }}>
          ¿Ya tienes cuenta? <a href={appPath("login")} style={{ color: "#667eea", textDecoration: "none" }}>Inicia sesión</a>
        </p>
      </div>
    </main>
  );
}
