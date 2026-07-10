"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { appPath } from "@/utils/appPath";
import styles from "./Menu.module.css";

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

const APP_PREFIXES = [
  `/${["app", "alvent"].join("/")}`,
  `/${["alvent", "app"].join("/")}`,
  `/${["alven", "app"].join("/")}`,
];

function cleanRoute(value: string) {
  const raw = String(value || "").trim();
  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const [pathOnly] = noOrigin.split(/[?#]/);
  let path = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  path = path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  // Limpia prefijos heredados de builds desfasados.
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of APP_PREFIXES) {
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        path = path.slice(prefix.length) || "/";
        changed = true;
        break;
      }
    }
  }
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

  CAJERO: ["pos", "ventas", "clientes", "empresa", "soporte", "configuracion"],
  VENDEDOR: ["pos", "ventas", "clientes", "empresa", "soporte", "configuracion"],
  ALMACEN: ["dashboard", "productos", "inventario", "empresa", "soporte", "configuracion"],

  CONTADOR: ["reportes", "exportacion", "cajas", "dashboard", "empresa", "soporte", "configuracion"],
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
      { label: "Empresa", href: "/empresa", icon: "🏢", key: "empresa" },
      { label: "Soporte", href: "/soporte", icon: "🤖", key: "soporte" },
      { label: "configuracion", href: "/configuracion", icon: "⚙️", key: "configuracion" },
      { label: "Finanzas", href: "/finanzas", icon: "🧾", key: "finanzas" },
    ],
  },
];

export default function Menu() {
  const [usuario, setUsuario] = useState<Usuario>({});
  const [configMenuFocus, setConfigMenuFocus] = useState<"soporte" | "configuracion" | "empresa">("configuracion");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("alvent_menu_desktop_collapsed");
    setDesktopCollapsed(stored === "1");
  }, []);

  const toggleDesktopSidebar = () => {
    setDesktopCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("alvent_menu_desktop_collapsed", next ? "1" : "0");
      }
      return next;
    });
  };

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
    <>
      <button
        type="button"
        className={`${styles.menuToggle} ${mobileOpen ? styles.menuToggleActive : ""}`}
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label={mobileOpen ? "Ocultar menú" : "Mostrar menú"}
      >
        ☰
      </button>

      {mobileOpen ? <button type="button" className={styles.mobileBackdrop} aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} /> : null}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""} ${desktopCollapsed ? styles.sidebarCollapsed : ""}`}>
        <header className={styles.brand}>
          <div className={styles.brandRow}>
            <div className={styles.brandText}>
              <h2 className={`${styles.brandTitle} ${desktopCollapsed ? styles.brandTitleHidden : ""}`}>ALVENT ERP PRO</h2>
              <p className={`${styles.brandTag} ${desktopCollapsed ? styles.brandTagHidden : ""}`}>Control operacional premium</p>
            </div>
            <button
              type="button"
              className={styles.desktopToggle}
              onClick={toggleDesktopSidebar}
              aria-label={desktopCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
              title={desktopCollapsed ? "Expandir" : "Contraer"}
            >
              {desktopCollapsed ? "»" : "«"}
            </button>
          </div>
        </header>

        <nav className={styles.menuScroll}>
          {menuFiltrado.map((block: any, idx: number) => (
            <div key={idx} className={styles.block}>
          {"section" in block ? (
            <>
              <p className={`${styles.section} ${desktopCollapsed ? styles.sectionHidden : ""}`}>{block.section}</p>


              {block.items.map((item: MenuItem) => (
                <Link
                  key={`${item.key}-${item.href}`}
                  href={toAppHref(item.href)}
                  title={desktopCollapsed ? item.label : undefined}
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

                    setMobileOpen(false);
                  }}
                  className={`${styles.item} ${isItemActive(item) ? styles.itemActive : ""}`}
                >
                  <span className={styles.icon}>{item.icon}</span>
                  <span className={`${styles.itemLabel} ${desktopCollapsed ? styles.itemLabelHidden : ""}`}>{item.label}</span>
                </Link>
              ))}
            </>
          ) : (
            <Link
              href={toAppHref(block.href)}
              title={desktopCollapsed ? block.label : undefined}
              onClick={() => setMobileOpen(false)}
              className={`${styles.item} ${isItemActive(block) ? styles.itemActive : ""}`}
            >
              <span className={styles.icon}>{block.icon}</span>
              <span className={`${styles.itemLabel} ${desktopCollapsed ? styles.itemLabelHidden : ""}`}>{block.label}</span>
            </Link>
          )}
            </div>
          ))}
        </nav>

        <div className={`${styles.userCard} ${desktopCollapsed ? styles.userCardCollapsed : ""}`}>
          <strong className={`${styles.userName} ${desktopCollapsed ? styles.userTextHidden : ""}`}>{nombreVisible}</strong>

          <p className={`${styles.userRole} ${desktopCollapsed ? styles.userTextHidden : ""}`}>{rolEtiqueta}</p>
          {esSuperadmin ? (
            <p className={`${styles.superBadge} ${desktopCollapsed ? styles.userTextHidden : ""}`}>Sin negocio fijo</p>
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
            className={styles.logoutBtn}
            title={desktopCollapsed ? "Cerrar sesión" : undefined}
          >
            {desktopCollapsed ? "↩" : "Cerrar sesión"}
          </button>
        </div>
      </aside>
    </>
  );
}
