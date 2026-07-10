"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { tieneAcceso } from "@/utils/permisos";
import { APP_BASE_PATH, appPath } from "@/utils/appPath";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {

  const pathname = usePathname();
  const APP_PREFIXES = Array.from(
    new Set([
      APP_BASE_PATH,
      `/${["app", "alvent"].join("/")}`,
      `/${["alvent", "app"].join("/")}`,
      `/${["alven", "app"].join("/")}`,
    ])
  ).map((prefix) => prefix.replace(/\/$/, ""));

  const normalizeRoute = useCallback((value: string) => {
    const raw = String(value || "").trim();
    const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
    const [pathOnly] = noOrigin.split(/[?#]/);
    let route = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
    route = route.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

    let changed = true;
    while (changed) {
      changed = false;
      for (const prefix of APP_PREFIXES) {
        if (!prefix) continue;
        if (route === prefix || route.startsWith(`${prefix}/`)) {
          route = route.slice(prefix.length) || "/";
          changed = true;
          break;
        }
      }
    }

    return route || "/";
  }, [APP_PREFIXES]);

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

  }, [normalizeRoute, pathname]);

  return <>{children}</>;
}
