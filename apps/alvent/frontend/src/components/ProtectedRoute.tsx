"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { tieneAcceso } from "@/utils/permisos";
import { APP_BASE_PATH, appPath } from "@/utils/appPath";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {

  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const APP_PREFIXES = useMemo(
    () =>
      Array.from(
        new Set([
          APP_BASE_PATH,
          `/${["app", "alvent"].join("/")}`,
          `/${["alvent", "app"].join("/")}`,
          `/${["alven", "app"].join("/")}`,
        ])
      ).map((prefix) => prefix.replace(/\/$/, "")),
    []
  );

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
    setChecking(true);
    const rawUsuario = localStorage.getItem("usuario");
    const token = localStorage.getItem("token");
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

    if (!token || !usuario.rol) {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("usuario_id");
      localStorage.removeItem("negocio_id");
      localStorage.removeItem("usuario");

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
      return;
    }

    setChecking(false);

  }, [normalizeRoute, pathname]);

  if (checking) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <p style={{ color: "#334155", fontWeight: 700 }}>Validando sesion...</p>
      </main>
    );
  }

  return <>{children}</>;
}
