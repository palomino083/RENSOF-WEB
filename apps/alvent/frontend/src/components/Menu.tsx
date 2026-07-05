"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { appPath } from "@/utils/appPath";

/* =========================
   🔐 TIPOS ERP
========================= */
type Usuario = {
  nombres?: string;
  rol?: string;
  roles?: string[];
};

type MenuItem = {
  label: string;
  href: string;
  icon: string;
  key: string;
};

type MenuSection = {
  section: string;
  items: MenuItem[];
};

type MenuBlock = MenuItem | MenuSection;

const APP_PREFIX = "/alven/app";

function cleanRoute(value: string) {
  const raw = String(value || "").trim();
  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const [pathOnly] = noOrigin.split(/[?#]/);
  let path = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  path = path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  // Evita prefijos duplicados como /alven/app/alven/app/... en builds desfasados.
  while (path.startsWith(APP_PREFIX)) {
    path = path.slice(APP_PREFIX.length) || "/";
  }
  path = path.replace(new RegExp(`^(?:${APP_PREFIX})+`), "") || path;
  return path || "/";
}

function normalizePath(value: string) {
  return cleanRoute(value);
}

/* =========================
   🔐 PERMISOS POR ROL
========================= */
const PERMISOS: Record<string, string[]> = {
  ADMINISTRADOR: [
    "dashboard",
    "pos",
    "ventas",
    "productos",
    "inventario",
    "clientes",
    "cajas",
    "reportes",
    "exportacion",
    "usuarios",
    "configuracion",
    "empresa",
    "soporte",
  ],

  ADMIN: [
    "dashboard",
    "pos",
    "ventas",
    "productos",
    "inventario",
    "clientes",
    "cajas",
    "reportes",
    "exportacion",
    "usuarios",
    "configuracion",
    "empresa",
    "soporte",
  ],

  SUPERADMIN: [
    "dashboard",
    "pos",
    "ventas",
    "productos",
    "inventario",
    "clientes",
    "cajas",
    "reportes",
    "exportacion",
    "usuarios",
    "configuracion",
    "empresa",
    "finanzas",
    "soporte",
  ],

  CAJERO: ["pos", "ventas", "clientes"],
  VENDEDOR: ["pos", "ventas", "clientes"],
  ALMACEN: ["dashboard", "productos", "inventario"],

  CONTADOR: ["reportes", "exportacion", "cajas", "dashboard"],
};

function permisosPorRoles(rol: string, roles: string[] = []) {
  const efectivos = [...roles];
  if (!efectivos.length && rol) efectivos.push(rol);

  const normalizarRol = (valor: string) => {
    const upper = String(valor || "").toUpperCase().trim();
    const compact = upper.replace(/[^A-Z0-9]/g, "");
    if (compact === "ADMIN" || compact === "ADMINISTRADOR") return "ADMINISTRADOR";
    if (compact === "SUPERADMIN" || compact === "SUPERADMINISTRADOR") return "SUPERADMIN";
    return upper;
  };

  const permisos = new Set<string>();
  efectivos.forEach((r) => {
    const key = normalizarRol(r);
    (PERMISOS[key] || []).forEach((p) => permisos.add(p));
  });

  return Array.from(permisos);
}

/* =========================
   📦 MENÚ ERP ESTRUCTURADO
========================= */
const MENU: MenuBlock[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "📊",
    key: "dashboard",
  },

  {
    section: "OPERACIÓN",
    items: [
      { label: "POS", href: "/pos", icon: "🛒", key: "pos" },
      { label: "Ventas", href: "/ventas", icon: "💵", key: "ventas" },
      { label: "Productos", href: "/productos", icon: "📦", key: "productos" },
      { label: "Inventario", href: "/inventario", icon: "📋", key: "inventario" },
      { label: "Clientes", href: "/clientes", icon: "👥", key: "clientes" },
    ],
  },

  {
    section: "GESTIÓN",
    items: [
      { label: "Cajas", href: "/cajas", icon: "💰", key: "cajas" },
      { label: "Reportes", href: "/reportes", icon: "📈", key: "reportes" },
      { label: "Exportación", href: "/exportacion", icon: "📤", key: "exportacion" },
    ],
  },

  {
    section: "SISTEMA",
    items: [
      { label: "Usuarios", href: "/usuarios", icon: "👤", key: "usuarios" },
      { label: "Empresa", href: "/configuracion", icon: "🏢", key: "empresa" },
      { label: "Soporte", href: "/configuracion", icon: "🤖", key: "soporte" },
      { label: "Configuración", href: "/configuracion", icon: "⚙️", key: "configuracion" },
      { label: "Finanzas", href: "/finanzas", icon: "🧾", key: "finanzas" },
    ],
  },
];

export default function Menu() {
  const [usuario, setUsuario] = useState<Usuario>({});
  const [configMenuFocus, setConfigMenuFocus] = useState<"soporte" | "configuracion" | "empresa">("configuracion");
  const pathname = usePathname();

  const toAppHref = (href: string) => {
    const route = cleanRoute(href);
    return route.startsWith("/") ? route : `/${route}`;
  };

  useEffect(() => {
    const cargarUsuario = () => {
      const data = localStorage.getItem("usuario");
      if (!data) {
        setUsuario({});
        return;
      }
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === "object") {
          setUsuario(parsed);
          return;
        }
      } catch {
        setUsuario({ nombres: data });
        return;
      }
      setUsuario({});
    };

    cargarUsuario();

    window.addEventListener("storage", cargarUsuario);
    window.addEventListener("focus", cargarUsuario);
    window.addEventListener("alvent-user-updated", cargarUsuario as EventListener);

    return () => {
      window.removeEventListener("storage", cargarUsuario);
      window.removeEventListener("focus", cargarUsuario);
      window.removeEventListener("alvent-user-updated", cargarUsuario as EventListener);
    };
  }, [pathname]);

  const rol = (usuario?.rol || "CAJERO").toUpperCase();
  const roles = Array.isArray(usuario?.roles)
    ? usuario.roles.map((r) => String(r || "").toUpperCase())
    : [];
  const esSuperadmin = rol === "SUPERADMIN" || roles.includes("SUPERADMIN");
  const rolEtiqueta = esSuperadmin ? "RENSOF" : rol;
  const nombreVisible = esSuperadmin ? "RENSOF" : (usuario.nombres || "Usuario");

  const isItemActive = (item: MenuItem) => {
    const currentPath = normalizePath(pathname);
    const isConfigRoute = currentPath === "/configuracion";

    if (item.key === "soporte") {
      return isConfigRoute && configMenuFocus === "soporte";
    }

    if (item.key === "empresa") {
      return isConfigRoute && configMenuFocus === "empresa";
    }

    if (item.key === "configuracion") {
      return isConfigRoute && configMenuFocus === "configuracion";
    }

    return currentPath === normalizePath(item.href);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (normalizePath(pathname) !== "/configuracion") {
      return;
    }

    const querySupport = new URLSearchParams(window.location.search).get("support") === "1";
    const stored = window.localStorage.getItem("alvent_menu_focus_config");

    if (querySupport) {
      setConfigMenuFocus("soporte");
      window.localStorage.setItem("alvent_menu_focus_config", "soporte");
      return;
    }

    if (stored === "soporte" || stored === "configuracion" || stored === "empresa") {
      setConfigMenuFocus(stored);
      return;
    }

    setConfigMenuFocus("configuracion");
    window.localStorage.setItem("alvent_menu_focus_config", "configuracion");
  }, [pathname]);

  /* =========================
     🔐 FILTRO POR PERMISOS
  ========================= */

const permisos = permisosPorRoles(rol, roles);

const menuFiltrado = useMemo(() => {
  return MENU.map((block) => {
    // ITEM SIMPLE
    if ("href" in block) {
      return permisos.includes(block.key) ? block : null;
    }

    // SECCIÓN
    const items = block.items.filter((i) =>
      permisos.includes(i.key)
    );

    return items.length > 0 ? { ...block, items } : null;
  }).filter(Boolean);
}, [permisos]);

  return (
    <aside
      style={{
        width: "260px",
        background: "#0F172A",
        color: "white",
        minHeight: "100vh",
        padding: "20px",
      }}
    >
      {/* HEADER */}
      <h2>ALVENT ERP PRO</h2>

      <p style={{ fontSize: "12px", color: "#94A3B8" }}>
        
      </p>

      <hr />

      {/* =========================
          RENDER MENÚ
      ========================= */}
      {menuFiltrado.map((block: any, idx: number) => (
        <div key={idx} style={{ marginBottom: "10px" }}>
          {"section" in block ? (
            <>
              <p
                style={{
                  fontSize: "11px",
                  color: "#64748B",
                  marginTop: "10px",
                }}
              >
                {block.section}
              </p>

              {block.items.map((item: MenuItem) => (
                <Link
                  key={`${item.key}-${item.href}`}
                  href={toAppHref(item.href)}
                  onClick={() => {
                    if (typeof window === "undefined") return;

                    if (item.key === "soporte") {
                      window.localStorage.setItem("alvent_open_support_modal", "1");
                      window.localStorage.setItem("alvent_menu_focus_config", "soporte");
                      setConfigMenuFocus("soporte");
                      window.dispatchEvent(new CustomEvent("alvent-config-menu-focus", { detail: { mode: "soporte" } }));
                      if (normalizePath(pathname) === "/configuracion") {
                        window.dispatchEvent(new Event("alvent-open-support-modal"));
                      }
                    }

                    if (item.key === "empresa") {
                      window.localStorage.setItem("alvent_menu_focus_config", "empresa");
                      setConfigMenuFocus("empresa");
                      window.dispatchEvent(new CustomEvent("alvent-config-menu-focus", { detail: { mode: "configuracion" } }));
                    }

                    if (item.key === "configuracion") {
                      window.localStorage.setItem("alvent_menu_focus_config", "configuracion");
                      setConfigMenuFocus("configuracion");
                      window.dispatchEvent(new CustomEvent("alvent-config-menu-focus", { detail: { mode: "configuracion" } }));
                    }
                  }}
                  style={{
                    display: "flex",
                    padding: "10px",
                    marginBottom: "5px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    background: isItemActive(item)
                      ? "#FACC15"
                      : "transparent",
                    color: isItemActive(item)
                      ? "#111827"
                      : "white",
                    fontWeight: isItemActive(item)
                      ? "bold"
                      : "normal",
                  }}
                >
                  <span style={{ marginRight: "10px" }}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
            </>
          ) : (
            <Link
              href={toAppHref(block.href)}
              style={{
                display: "flex",
                padding: "10px",
                borderRadius: "8px",
                textDecoration: "none",
                background: isItemActive(block)
                  ? "#FACC15"
                  : "transparent",
                color: isItemActive(block)
                  ? "#111827"
                  : "white",
                fontWeight: isItemActive(block)
                  ? "bold"
                  : "normal",
              }}
            >
              <span style={{ marginRight: "10px" }}>
                {block.icon}
              </span>
              {block.label}
            </Link>
          )}
        </div>
      ))}

      <hr />

      {/* USUARIO */}
      <div style={{ marginTop: "20px" }}>
        <strong>{nombreVisible}</strong>

        <p style={{ color: "#94A3B8", marginBottom: esSuperadmin ? "2px" : "10px" }}>{rolEtiqueta}</p>
        {esSuperadmin ? (
          <p style={{ color: "#fbbf24", fontSize: "12px", marginTop: 0, marginBottom: "10px" }}>
            Sin negocio fijo
          </p>
        ) : null}

        <button
          onClick={() => {
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("usuario_id");
            localStorage.removeItem("negocio_id");
            localStorage.removeItem("usuario");
            window.location.href = appPath("login");
          }}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
          }}
        >
          🚪 Cerrar sesión
        </button>
      </div>
    </aside>
  );
}