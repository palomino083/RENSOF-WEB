export const permisosPorRol = {
  ADMINISTRADOR: [
    "/dashboard",
    "/pos",
    "/ventas",
    "/productos",
    "/inventario",
    "/clientes",
    "/usuarios",
    "/configuracion",
    "/cajas",
    "/reportes",
    "/exportacion",
    "/empresa",
  ],
  SUPERADMIN: [
    "/dashboard",
    "/pos",
    "/ventas",
    "/productos",
    "/inventario",
    "/clientes",
    "/usuarios",
    "/configuracion",
    "/cajas",
    "/reportes",
    "/exportacion",
    "/empresa",
    "/soporte",
    "/finanzas",
  ],
  CONTADOR: ["/dashboard", "/cajas", "/reportes", "/exportacion", "/empresa", "/configuracion"],
  CAJERO: ["/dashboard", "/pos", "/ventas", "/clientes", "/empresa", "/configuracion"],
  VENDEDOR: ["/dashboard", "/pos", "/ventas", "/clientes", "/empresa", "/configuracion"],
  ALMACEN: ["/dashboard", "/productos", "/inventario", "/empresa", "/configuracion"],
};

function normalizarRol(rol: string) {
  const upper = (rol || "").toUpperCase().trim();
  const compact = upper.replace(/[^A-Z0-9]/g, "");
  if (compact === "ADMIN" || compact === "ADMINISTRADOR") return "ADMINISTRADOR";
  if (compact === "SUPERADMIN" || compact === "SUPERADMINISTRADOR") return "SUPERADMIN";
  return upper;
}

export function obtenerRutasPermitidas(roles: string[] = [], rolFallback = "") {
  const rolesNormalizados = roles
    .map((r) => normalizarRol(r))
    .filter(Boolean);

  if (!rolesNormalizados.length && rolFallback) {
    rolesNormalizados.push(normalizarRol(rolFallback));
  }

  const rutas = new Set<string>();
  rolesNormalizados.forEach((rol) => {
    const permisos = permisosPorRol[rol as keyof typeof permisosPorRol] || [];
    permisos.forEach((ruta) => rutas.add(ruta));
  });

  return Array.from(rutas);
}

export function tieneAcceso(rol: string, ruta: string, roles: string[] = []) {
  const permisos = obtenerRutasPermitidas(roles, rol);
  return permisos.includes(ruta);
}
