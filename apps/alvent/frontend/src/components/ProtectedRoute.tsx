"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { tieneAcceso } from "@/utils/permisos";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {

  const pathname = usePathname();

  useEffect(() => {
    const rawUsuario = localStorage.getItem("usuario");
    let usuario: Record<string, any> = {};

    if (rawUsuario) {
      try {
        const parsed = JSON.parse(rawUsuario);
        if (parsed && typeof parsed === "object") {
          usuario = parsed;
        }
      } catch {
        usuario = { usuario: rawUsuario };
      }
    }

    if (!usuario.rol) {

      window.location.href =
        "/login";

      return;
    }

    const rolNormalizado = String(usuario.rol || "").toUpperCase();
    const rolesNormalizados = Array.isArray(usuario.roles)
      ? usuario.roles.map((r: string) => String(r || "").toUpperCase())
      : [];

    const autorizado =
      tieneAcceso(
        rolNormalizado,
        pathname,
        rolesNormalizados
      );

    if (!autorizado) {

      alert(
        "No tienes permisos para ingresar"
      );

      window.location.href =
        "/dashboard";
    }

  }, [pathname]);

  return <>{children}</>;
}