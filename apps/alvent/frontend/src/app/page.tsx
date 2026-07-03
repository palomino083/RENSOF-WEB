"use client";

import { useEffect } from "react";
import { appPath } from "@/utils/appPath";

export default function Home() {

  useEffect(() => {

    const usuario =
      localStorage.getItem(
        "usuario"
      );

    if (usuario) {

      window.location.href =
        appPath("dashboard");

    } else {

      window.location.href =
        appPath("login");

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