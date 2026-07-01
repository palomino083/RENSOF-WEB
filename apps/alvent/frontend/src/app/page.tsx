"use client";

import { useEffect } from "react";

export default function Home() {

  useEffect(() => {

    const usuario =
      localStorage.getItem(
        "usuario"
      );

    if (usuario) {

      window.location.href =
        "/dashboard";

    } else {

      window.location.href =
        "/login";

    }

  }, []);

  return (
    <main
      style={{
        padding: "40px",
        textAlign: "center",
      }}
    >
      <h2>
        Cargando ALVENT ERP PRO...
      </h2>
    </main>
  );
}