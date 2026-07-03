"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { tieneAcceso } from "@/utils/permisos";
import { appPath } from "@/utils/appPath";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {

  const pathname = usePathname();

  const normalizeRoute = (value: string) => {
    let route = String(value || "").replace(/\/+$/, "") || "/";
    while (route.startsWith("/alven/app")) {
      route = route.replace("/alven/app", "") || "/";
    }
    return route || "/";
  };

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
        appPath("login");

      return;
    }

    const rolNormalizado = String(usuario.rol || "").toUpperCase();
    const rolesNormalizados = Array.isArray(usuario.roles)
      ? usuario.roles.map((r: string) => String(r || "").toUpperCase())
      : [];

    const autorizado =
      tieneAcceso(
        rolNormalizado,
        normalizeRoute(pathname),
        rolesNormalizados
      );

    if (!autorizado) {

      alert(
        "No tienes permisos para ingresar"
      );

      window.location.href =
        appPath("dashboard");
    }

  }, [pathname]);

  return <>{children}</>;
}