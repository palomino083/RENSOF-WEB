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
  const APP_PREFIX = "/alven/app";

  const normalizeRoute = (value: string) => {
    const raw = String(value || "").trim();
    const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
    const [pathOnly] = noOrigin.split(/[?#]/);
    let route = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
    route = route.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    while (route.startsWith(APP_PREFIX)) {
      route = route.slice(APP_PREFIX.length) || "/";
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