"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { resetPassword } from "@/services/authService";
import { getApiErrorMessage } from "@/utils/apiError";
import styles from "./page.module.css";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!password.trim() || !confirmPassword.trim()) {
      setError("Completa ambos campos");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (!token) {
      setError("Token de recuperación inválido");
      return;
    }

    try {
      setLoading(true);
      const res = await resetPassword(token, { password, confirmPassword });
      setSuccess(res.mensaje || "Contraseña actualizada correctamente");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err: any) {
      setError(getApiErrorMessage(err, "No se pudo actualizar la contraseña"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <h1>Actualizar contraseña</h1>
        <p>Ingresa una nueva contraseña para recuperar tu acceso.</p>

        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? <p className={styles.success}>{success}</p> : null}

        <form onSubmit={submit} className={styles.form}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contraseña"
            className="focus-ring"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar contraseña"
            className="focus-ring"
          />

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? "Actualizando..." : "Actualizar contraseña"}
          </button>
        </form>

        <Link href="/login" className={styles.backLink}>
          Volver al login
        </Link>
      </section>
    </main>
  );
}
