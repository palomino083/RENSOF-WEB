"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Menu from "@/components/Menu";
import { usuariosService } from "@/services/usuariosService";
import { getApiErrorMessage } from "@/utils/apiError";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import Toolbar from "@/components/ui/Toolbar";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import ModalCard from "@/components/ui/ModalCard";
import styles from "./page.module.css";

/* =========================
   TIPO
========================= */
type Usuario = {
  id: number;
  nombres: string;
  usuario: string;
  dni?: string;
  email: string;
  rol: string;
  roles?: string[];
  activo: boolean;
};

const ROLES_TAREA = ["CAJERO", "VENDEDOR", "ALMACEN"];
const ROLES_DISPONIBLES = ["ADMINISTRADOR", ...ROLES_TAREA];

const PERMISOS_POR_ROL: Record<string, string[]> = {
  ADMINISTRADOR: [
    "Dashboard",
    "POS",
    "Ventas",
    "Productos",
    "Inventario",
    "Clientes",
    "Cajas",
    "Reportes",
    "Exportacion",
    "Usuarios",
    "Empresa",
    "configuracion",
    "Finanzas",
  ],
  CAJERO: ["Dashboard", "POS", "Ventas", "Clientes", "Empresa", "configuracion"],
  VENDEDOR: ["Dashboard", "POS", "Ventas", "Clientes", "Empresa", "configuracion"],
  ALMACEN: ["Dashboard", "Productos", "Inventario", "Empresa", "configuracion"],
};

const MODULOS_PERMISOS = [
  "Dashboard",
  "POS",
  "Ventas",
  "Productos",
  "Inventario",
  "Clientes",
  "Cajas",
  "Reportes",
  "Exportacion",
  "Usuarios",
  "Empresa",
  "configuracion",
  "Finanzas",
];

const sanitizarDni = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").slice(0, 8);

function normalizarRol(rol: string) {
  const upper = String(rol || "").toUpperCase().trim();
  const compact = upper.replace(/[^A-Z0-9]/g, "");
  if (compact === "ADMIN" || compact === "ADMINISTRADOR") return "ADMINISTRADOR";
  if (compact === "SUPERADMIN" || compact === "SUPERADMINISTRADOR") return "SUPERADMIN";
  return upper;
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState("TODOS");
  const [filtroEstado, setFiltroEstado] = useState<"TODOS" | "ACTIVO" | "INACTIVO">("TODOS");
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [rowAction, setRowAction] = useState<{ id: number; type: "toggle" | "delete" } | null>(null);
  const [permisosPorRol, setPermisosPorRol] = useState<Record<string, string[]>>(PERMISOS_POR_ROL);

  /* =========================
     🔥 EDITAR STATE
  ========================= */
  const [modoEditar, setModoEditar] = useState(false);
  const [usuarioEdit, setUsuarioEdit] = useState<Usuario | null>(null);

  const [form, setForm] = useState({
    nombres: "",
    usuario: "",
    dni: "",
    email: "",
    password: "",
    roles: ["CAJERO"],
  });

  const rolPrincipal = (roles: string[]) => {
    if (roles.includes("ADMINISTRADOR")) return "ADMINISTRADOR";
    if (roles.includes("VENDEDOR")) return "VENDEDOR";
    if (roles.includes("CAJERO")) return "CAJERO";
    if (roles.includes("ALMACEN")) return "ALMACEN";
    return "CAJERO";
  };

  const normalizarRolesUsuario = (u: Usuario) => {
    if (Array.isArray(u.roles) && u.roles.length > 0) {
      return u.roles.map((r) => normalizarRol(String(r || "")));
    }
    return [normalizarRol(String(u.rol || "CAJERO"))];
  };

  const conteoPorRol = useMemo(() => {
    const acc: Record<string, number> = {};
    usuarios.forEach((u) => {
      const roles = normalizarRolesUsuario(u);
      roles.forEach((rol) => {
        acc[rol] = (acc[rol] || 0) + 1;
      });
    });
    return acc;
  }, [usuarios]);

  const resumen = useMemo(() => {
    const total = usuarios.length;
    const activos = usuarios.filter((u) => u.activo).length;
    const inactivos = total - activos;
    const administradores = usuarios.filter((u) => normalizarRolesUsuario(u).includes("ADMINISTRADOR")).length;
    return { total, activos, inactivos, administradores };
  }, [usuarios]);

  const opcionesRol = useMemo(() => {
    const base = ["TODOS", "ADMINISTRADOR", "CAJERO", "VENDEDOR", "ALMACEN"];
    const dinamicos = Object.keys(conteoPorRol);
    return Array.from(new Set([...base, ...dinamicos]));
  }, [conteoPorRol]);

  /* =========================
     📦 CARGAR
  ========================= */
  const cargarUsuarios = async () => {
    try {
      setError("");
      const data = await usuariosService.getAll();
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error cargando usuarios"));
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  };

  const cargarMatrizPermisos = useCallback(async () => {
    try {
      const data = await usuariosService.getPermissionsMatrix();
      if (data?.matriz && typeof data.matriz === "object") {
        setPermisosPorRol(data.matriz);
      }
    } catch {
      setPermisosPorRol(PERMISOS_POR_ROL);
    }
  }, []);

  useEffect(() => {
    cargarUsuarios();

    const rawUsuario = localStorage.getItem("usuario");
    if (!rawUsuario) return;

    try {
      const parsed = JSON.parse(rawUsuario);
      const rol = normalizarRol(parsed?.rol || "");
      const roles = Array.isArray(parsed?.roles)
        ? parsed.roles.map((r: string) => normalizarRol(r || ""))
        : [];
      setIsAdmin(rol === "ADMINISTRADOR" || rol === "SUPERADMIN" || roles.includes("SUPERADMIN"));
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void cargarMatrizPermisos();
  }, [isAdmin, cargarMatrizPermisos]);

  /* =========================
     🔍 BUSCADOR
  ========================= */
  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) =>
      {
        const texto = `${u.nombres} ${u.usuario} ${u.email} ${u.dni || ""}`
          .toLowerCase()
          .includes(busqueda.toLowerCase());

        const roles = normalizarRolesUsuario(u);
        const rolOk = filtroRol === "TODOS" || roles.includes(filtroRol);

        const estado = u.activo ? "ACTIVO" : "INACTIVO";
        const estadoOk = filtroEstado === "TODOS" || estado === filtroEstado;

        return texto && rolOk && estadoOk;
      }
    );
  }, [usuarios, busqueda, filtroRol, filtroEstado]);

  /* =========================
     ➕ CREAR
  ========================= */
  const crearUsuario = async () => {
    if (!isAdmin) {
      setError("Solo un administrador puede crear usuarios de caja, vendedor o almacen");
      return;
    }

    if (!form.nombres.trim() || !form.usuario.trim() || !form.email.trim()) {
      setError("Completa nombres, usuario y email");
      return;
    }

    if (!form.password.trim()) {
      setError("La contraseña es obligatoria para crear usuario");
      return;
    }

    if (form.dni && sanitizarDni(form.dni).length !== 8) {
      setError("El DNI debe tener exactamente 8 dígitos numéricos");
      return;
    }

    try {
      setSavingForm(true);
      setError("");
      setSuccess("");
      if (!form.roles.length) {
        setError("Selecciona al menos una tarea para el usuario");
        return;
      }
      await usuariosService.create({
        ...form,
        dni: sanitizarDni(form.dni) || undefined,
        rol: rolPrincipal(form.roles),
      });

      setModal(false);
      resetForm();
      cargarUsuarios();
      setSuccess("Usuario creado correctamente");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al crear usuario"));
    } finally {
      setSavingForm(false);
    }
  };

  /* =========================
     ✏️ EDITAR
  ========================= */
  const abrirEditar = (u: Usuario) => {
    if (!isAdmin) {
      setError("Solo un administrador puede editar roles de usuarios");
      return;
    }

    setUsuarioEdit(u);
    setModoEditar(true);
    setModal(true);

    setForm({
      nombres: u.nombres,
      usuario: u.usuario,
      dni: u.dni || "",
      email: u.email,
      password: "",
      roles: normalizarRolesUsuario(u),
    });
  };

  const actualizarUsuario = async () => {
    if (!usuarioEdit) return;

    if (!form.nombres.trim() || !form.usuario.trim() || !form.email.trim()) {
      setError("Completa nombres, usuario y email");
      return;
    }

    if (form.dni && sanitizarDni(form.dni).length !== 8) {
      setError("El DNI debe tener exactamente 8 dígitos numéricos");
      return;
    }

    try {
      setSavingForm(true);
      setError("");
      setSuccess("");
      if (!form.roles.length) {
        setError("Selecciona al menos una tarea para el usuario");
        return;
      }

      await usuariosService.update(usuarioEdit.id, {
        ...form,
        dni: sanitizarDni(form.dni) || undefined,
        rol: rolPrincipal(form.roles),
      });

      setModal(false);
      setModoEditar(false);
      setUsuarioEdit(null);

      resetForm();
      cargarUsuarios();
      setSuccess("Usuario actualizado correctamente");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al actualizar usuario"));
    } finally {
      setSavingForm(false);
    }
  };

  const resetForm = () => {
    setForm({
      nombres: "",
      usuario: "",
      dni: "",
      email: "",
      password: "",
      roles: ["CAJERO"],
    });
  };

  const toggleRol = (rol: string) => {
    setForm((prev) => {
      const upper = rol.toUpperCase();
      const actuales = [...prev.roles];

      if (upper === "ADMINISTRADOR") {
        return {
          ...prev,
          roles: actuales.includes("ADMINISTRADOR") ? ["CAJERO"] : ["ADMINISTRADOR"],
        };
      }

      const sinAdmin = actuales.filter((r) => r !== "ADMINISTRADOR");
      if (sinAdmin.includes(upper)) {
        const next = sinAdmin.filter((r) => r !== upper);
        return { ...prev, roles: next.length ? next : ["CAJERO"] };
      }

      return { ...prev, roles: [...sinAdmin, upper] };
    });
  };

  const togglePermisoMatriz = (rol: string, modulo: string) => {
    if (!isAdmin) return;

    setPermisosPorRol((prev) => {
      const actuales = Array.isArray(prev[rol]) ? [...prev[rol]] : [];
      const existe = actuales.includes(modulo);
      const next = existe
        ? actuales.filter((m) => m !== modulo)
        : [...actuales, modulo];
      return {
        ...prev,
        [rol]: next,
      };
    });
  };

  const guardarMatrizPermisos = async () => {
    if (!isAdmin) return;
    try {
      setSavingMatrix(true);
      setError("");
      setSuccess("");
      const resp = await usuariosService.updatePermissionsMatrix(permisosPorRol);
      setPermisosPorRol(resp.matriz || permisosPorRol);
      setSuccess(resp.mensaje || "Matriz de permisos actualizada");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo actualizar la matriz de permisos"));
    } finally {
      setSavingMatrix(false);
    }
  };

  /* =========================
     🗑️ ELIMINAR
  ========================= */
  const eliminarUsuario = async (id: number) => {
    if (!confirm("¿Eliminar usuario? Esta acción no se puede deshacer.")) return;

    try {
      setRowAction({ id, type: "delete" });
      setError("");
      setSuccess("");
      await usuariosService.delete(id);
      setUsuarios((prev) => prev.filter((u) => u.id !== id));
      setSuccess("Usuario eliminado correctamente");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo eliminar el usuario"));
    } finally {
      setRowAction(null);
    }
  };

  /* =========================
     🔄 ESTADO
  ========================= */
  const cambiarEstado = async (id: number) => {
    try {
      setRowAction({ id, type: "toggle" });
      setError("");
      setSuccess("");
      await usuariosService.toggleEstado(id);

      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, activo: !u.activo } : u
        )
      );
      setSuccess("Estado de usuario actualizado");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cambiar el estado del usuario"));
    } finally {
      setRowAction(null);
    }
  };

  /* =========================
     🎨 ROL
  ========================= */
  const rolBadge = (rol: string) => {
    const mapa: any = {
      ADMINISTRADOR: { bg: "#EDE9FE", color: "#5B21B6", icon: "👑" },
      CAJERO: { bg: "#DCFCE7", color: "#166534", icon: "💰" },
      VENDEDOR: { bg: "#FCE7F3", color: "#9D174D", icon: "🧾" },
      ALMACEN: { bg: "#DBEAFE", color: "#1E40AF", icon: "📦" },
    };

    const r = mapa[rol?.toUpperCase()] || {
      bg: "#F3F4F6",
      color: "#374151",
      icon: "👤",
    };

    return <StatusBadge text={`${r.icon} ${rol}`} variant="neutral" />;
  };

  const rolesBadge = (u: Usuario) => {
    const roles = normalizarRolesUsuario(u);
    return (
      <div className={styles.rolesWrap}>
        {roles.map((rol) => (
          <span key={`${u.id}-${rol}`}>{rolBadge(rol)}</span>
        ))}
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Menu />

        <main className={`app-content ${styles.shell}`}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>Seguridad y permisos</p>
              <h1>Usuarios y roles</h1>
              <p>Administra cuentas, asigna funciones y controla accesos desde un panel centralizado.</p>
            </div>
            <div className={styles.heroActions}>
              <ExecutiveThemeSwitch />
              {isAdmin ? (
                <button
                  type="button"
                  className={`${styles.newButton} focus-ring`}
                  onClick={() => {
                    setModal(true);
                    setModoEditar(false);
                    resetForm();
                  }}
                >
                  Nuevo usuario
                </button>
              ) : null}
            </div>
          </section>

          <ExecutivePulseBar
            modulo="Usuarios"
            estado={isAdmin ? "Control administrativo" : "Consulta"}
            foco="Gobierno de accesos y trazabilidad de perfiles para toda la operación."
            accion={{ label: "Ir a configuración", href: "configuracion" }}
            metricas={[
              { label: "Total", value: String(resumen.total) },
              { label: "Activos", value: String(resumen.activos), tone: "good" },
              { label: "Admins", value: String(resumen.administradores) },
            ]}
          />

          {error ? <p className={styles.errorBox}>{error}</p> : null}
          {success ? <p className={styles.successBox}>{success}</p> : null}

          <section className={styles.kpiGrid}>
            <article className={styles.kpiCard}>
              <span>Total usuarios</span>
              <strong>{resumen.total}</strong>
            </article>
            <article className={styles.kpiCard}>
              <span>Activos</span>
              <strong>{resumen.activos}</strong>
            </article>
            <article className={styles.kpiCard}>
              <span>Inactivos</span>
              <strong>{resumen.inactivos}</strong>
            </article>
            <article className={styles.kpiCard}>
              <span>Administradores</span>
              <strong>{resumen.administradores}</strong>
            </article>
          </section>

          <section className={`${styles.roleBoard} uiEnter`} data-stagger="2">
            <div className={styles.roleBoardHeader}>
              <h2>Resumen por rol</h2>
              <p>Selecciona un rol para filtrar la tabla.</p>
            </div>
            <div className={styles.roleChips}>
              {opcionesRol.map((rol) => {
                const count = rol === "TODOS" ? usuarios.length : (conteoPorRol[rol] || 0);
                const activo = filtroRol === rol;
                return (
                  <button
                    key={rol}
                    type="button"
                    onClick={() => setFiltroRol(rol)}
                    className={`${styles.roleChip} ${activo ? styles.roleChipActive : ""}`}
                  >
                    <span>{rol}</span>
                    <strong>{count}</strong>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${styles.tableCard} uiEnter`} data-stagger="3">
            <Toolbar
              title="Listado"
              right={
                <div className={styles.filters}>
                  <input
                    placeholder="Buscar por nombre, usuario, email o DNI"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className={`focus-ring ${styles.search}`}
                  />
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value as "TODOS" | "ACTIVO" | "INACTIVO")}
                    className={`focus-ring ${styles.selectFilter}`}
                  >
                    <option value="TODOS">Todos los estados</option>
                    <option value="ACTIVO">Activos</option>
                    <option value="INACTIVO">Inactivos</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda("");
                      setFiltroRol("TODOS");
                      setFiltroEstado("TODOS");
                    }}
                    className={styles.clearBtn}
                  >
                    Limpiar
                  </button>
                </div>
              }
            />

            <div className={styles.tableSpacer} />

            <p className={styles.tableMeta}>
              Mostrando <strong>{usuariosFiltrados.length}</strong> de <strong>{usuarios.length}</strong> usuarios
            </p>

            {loading ? <p className={styles.msg}>Cargando...</p> : null}

            <DataTable
              headers={["Nombres", "Usuario", "DNI", "Email", "Rol", "Estado", "Acciones"]}
              minWidth={880}
            >
              {usuariosFiltrados.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className={styles.emptyRow}>
                    No hay usuarios para los filtros seleccionados.
                  </td>
                </tr>
              ) : null}

              {usuariosFiltrados.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombres}</td>
                  <td>{u.usuario}</td>
                  <td>{u.dni || "-"}</td>
                  <td>{u.email}</td>
                  <td>{rolesBadge(u)}</td>
                  <td>
                    <StatusBadge
                      text={u.activo ? "ACTIVO" : "INACTIVO"}
                      variant={u.activo ? "success" : "danger"}
                    />
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button type="button" onClick={() => abrirEditar(u)} className={styles.rowBtn}>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => cambiarEstado(u.id)}
                        className={styles.rowBtn}
                        disabled={rowAction?.id === u.id && rowAction.type === "toggle"}
                      >
                        {rowAction?.id === u.id && rowAction.type === "toggle"
                          ? "Procesando..."
                          : u.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminarUsuario(u.id)}
                        className={`${styles.rowBtn} ${styles.deleteBtn}`}
                        disabled={rowAction?.id === u.id && rowAction.type === "delete"}
                      >
                        {rowAction?.id === u.id && rowAction.type === "delete"
                          ? "Eliminando..."
                          : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>

          <ModalCard
            open={modal}
            title={modoEditar ? "Editar usuario" : "Nuevo usuario"}
            subtitle="Gestiona credenciales y rol de acceso"
            actions={(
              <>
                <button
                  type="button"
                  onClick={modoEditar ? actualizarUsuario : crearUsuario}
                  className={styles.confirmBtn}
                  disabled={savingForm}
                >
                  {savingForm ? "Guardando..." : modoEditar ? "Actualizar" : "Guardar"}
                </button>
                <button type="button" onClick={() => setModal(false)} className={styles.closeBtn} disabled={savingForm}>
                  Cerrar
                </button>
              </>
            )}
          >
            <div className={styles.modalGrid}>
              <div className={styles.modalFormColumn}>
                <div className={styles.modalSectionTitle}>Datos de usuario</div>

                <input
                  className="focus-ring"
                  placeholder="Nombres"
                  value={form.nombres}
                  onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                />
                <input
                  className="focus-ring"
                  placeholder="Usuario"
                  disabled={modoEditar}
                  value={form.usuario}
                  onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                />
                <input
                  className="focus-ring"
                  placeholder="DNI"
                  value={form.dni}
                  onChange={(e) => setForm({ ...form, dni: sanitizarDni(e.target.value) })}
                  inputMode="numeric"
                  maxLength={8}
                />
                {Boolean(form.dni) && sanitizarDni(form.dni).length !== 8 ? (
                  <small className={styles.validationHint}>DNI incompleto: deben ser 8 dígitos.</small>
                ) : null}
                <input
                  className="focus-ring"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <input
                  className="focus-ring"
                  placeholder={modoEditar ? "Password (opcional)" : "Password"}
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              <div className={styles.modalRolesColumn}>
                <div className={styles.modalSectionTitle}>Roles y permisos</div>

                {isAdmin ? (
                  <div className={styles.rolesEditor}>
                    <p>Seleccion de roles (puedes marcar varios)</p>
                    <div className={styles.roleToggleGrid}>
                      {ROLES_DISPONIBLES.map((rol) => {
                        const activo = form.roles.includes(rol);
                        const isDisabled =
                          rol !== "ADMINISTRADOR" && form.roles.includes("ADMINISTRADOR");
                        return (
                          <button
                            key={rol}
                            type="button"
                            onClick={() => toggleRol(rol)}
                            disabled={isDisabled}
                            className={`${styles.roleToggleBtn} ${activo ? styles.roleToggleBtnActive : ""}`}
                          >
                            {rol}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className={styles.permissionsMatrix}>
                  <div className={styles.matrixHeader}>Matriz visual de permisos por rol</div>
                  {isAdmin ? (
                    <div className={styles.matrixActions}>
                      <button
                        type="button"
                        className={styles.rowBtn}
                        onClick={() => void guardarMatrizPermisos()}
                        disabled={savingMatrix}
                      >
                        {savingMatrix ? "Guardando..." : "Guardar matriz"}
                      </button>
                    </div>
                  ) : null}
                  <div className={styles.matrixGrid}>
                    <div className={styles.matrixCorner}>Modulo</div>
                    {ROLES_DISPONIBLES.map((rol) => (
                      <div key={`head-${rol}`} className={styles.matrixColHead}>{rol}</div>
                    ))}

                    {MODULOS_PERMISOS.map((modulo) => (
                      <Fragment key={modulo}>
                        <div className={styles.matrixRowHead}>{modulo}</div>
                        {ROLES_DISPONIBLES.map((rol) => {
                          const permitido = (permisosPorRol[rol] || []).includes(modulo);
                          return (
                            <div key={`${modulo}-${rol}`} className={styles.matrixCell}>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className={`${styles.matrixToggleBtn} ${permitido ? styles.permitido : styles.noPermitido}`}
                                  onClick={() => togglePermisoMatriz(rol, modulo)}
                                >
                                  {permitido ? "Si" : "No"}
                                </button>
                              ) : (
                                <span className={permitido ? styles.permitido : styles.noPermitido}>
                                  {permitido ? "Si" : "No"}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </ModalCard>
        </main>
      </div>
    </ProtectedRoute>
  );
}
