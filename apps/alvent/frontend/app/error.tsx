"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  }, [error]);

  return (
    <main className="app-content">
      <section className="card" role="alert" style={{ margin: 24, padding: 24 }}>
        <h2>No se pudo mostrar esta pantalla</h2>
        <p>La sesión sigue activa. Puedes intentar cargar la vista nuevamente.</p>
        <button type="button" className="btn btn-primary" onClick={reset}>
          Reintentar
        </button>
      </section>
    </main>
  );
}
