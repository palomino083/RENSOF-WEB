"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

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
    "usuarios",
    "configuracion",
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
    "usuarios",
    "configuracion",
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
    "usuarios",
    "configuracion",
    "finanzas",
  ],

  CAJERO: ["pos", "ventas", "clientes"],
  VENDEDOR: ["pos", "ventas", "clientes"],
  ALMACEN: ["dashboard", "productos", "inventario"],

  CONTADOR: ["reportes", "cajas", "dashboard"],
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
    ],
  },

  {
    section: "SISTEMA",
    items: [
      { label: "Usuarios", href: "/usuarios", icon: "👤", key: "usuarios" },
      { label: "Configuración", href: "/configuracion", icon: "⚙️", key: "configuracion" },
      { label: "Finanzas", href: "/finanzas", icon: "🧾", key: "finanzas" },
    ],
  },
];

export default function Menu() {
  const [usuario, setUsuario] = useState<Usuario>({});
  const pathname = usePathname();

  const APP_PREFIX = "/alven/app";

  const cleanRoute = (value: string) => {
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
  };

  const normalizePath = (value: string) => cleanRoute(value);

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
  const rolEtiqueta = esSuperadmin ? "SUPERADMINISTRADOR" : rol;

  const isActive = (href: string) => normalizePath(pathname) === normalizePath(href);

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
                  key={item.href}
                  href={toAppHref(item.href)}
                  style={{
                    display: "flex",
                    padding: "10px",
                    marginBottom: "5px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    background: isActive(item.href)
                      ? "#FACC15"
                      : "transparent",
                    color: isActive(item.href)
                      ? "#111827"
                      : "white",
                    fontWeight: isActive(item.href)
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
                background: isActive(block.href)
                  ? "#FACC15"
                  : "transparent",
                color: isActive(block.href)
                  ? "#111827"
                  : "white",
                fontWeight: isActive(block.href)
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
        <strong>{usuario.nombres || "Usuario"}</strong>

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