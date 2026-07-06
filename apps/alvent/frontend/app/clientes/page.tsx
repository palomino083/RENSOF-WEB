"use client";

import { useEffect, useState } from "react";
import { clientesService, Cliente } from "@/services/clientesService";
import { getApiErrorMessage } from "@/utils/apiError";
import Menu from "@/components/Menu";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import Toolbar from "@/components/ui/Toolbar";
import DataTable from "@/components/ui/DataTable";
import styles from "./page.module.css";

const sanitizarDni = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").slice(0, 8);

const sanitizarCelular = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").slice(0, 9);

const normalizarId = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const withTimeout = <T,>(promise: Promise<T>, ms = 10000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Tiempo de espera agotado al cargar clientes")), ms);
    }),
  ]);

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelÃ©fono] = useState("");
  const [email, setEmail] = useState("");

  const [loadingSave, setLoadingSave] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState("");

  // ======================
  // CARGAR CLIENTES
  // ======================
  const cargarClientes = async () => {
    try {
      setLoadingList(true);
      setError("");
      const data = await withTimeout(clientesService.getAll(), 10000);
      setClientes(data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error cargando clientes"));
      setClientes([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    cargarClientes();
  }, []);

  // ======================
  // LIMPIAR FORM
  // ======================
  const limpiar = () => {
    setNombre("");
    setDni("");
    setTelÃ©fono("");
    setEmail("");
    setEditId(null);
  };

  // ======================
  // EDITAR
  // ======================
  const handleEdit = (c: Cliente) => {
    setEditId(normalizarId(c.id));
    setNombre(c.nombre);
    setDni(sanitizarDni(c.dni));
    setTelÃ©fono(sanitizarCelular(c.telefono || ""));
    setEmail(c.email || "");
  };

  // ======================
  // GUARDAR
  // ======================
  const handleSave = async () => {
    try {
      if (!nombre || !dni) {
        alert("Nombre y DNI obligatorios");
        return;
      }

      if (dni.length !== 8) {
        alert("El DNI debe tener exactamente 8 digitos numericos");
        return;
      }

      if (telefono && telefono.length !== 9) {
        alert("El celular debe tener exactamente 9 digitos numericos");
        return;
      }

      setLoadingSave(true);
      setError("");

      const payload: Cliente = {
        id: editId ?? undefined,
        nombre,
        dni,
        telefono,
        email,
      };

      const result = await clientesService.guardar(payload);
      const isEditing = editId !== null;

      if (isEditing) {
        const targetId = normalizarId(editId);
        setClientes((prev) =>
          prev.map((c) =>
            normalizarId(c.id) === targetId ? { ...c, ...result } : c
          )
        );
      } else {
        setClientes((prev) => [...prev, result]);
      }

      limpiar();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al guardar cliente"));
    } finally {
      setLoadingSave(false);
    }
  };

  // ======================
  // ELIMINAR
  // ======================
  const handleDelete = async (id?: number) => {
    const targetId = normalizarId(id);
    if (targetId === null) return;

    const ok = confirm("¿Eliminar cliente?");
    if (!ok) return;

    try {
      await clientesService.delete(targetId);

      setClientes((prev) => prev.filter((c) => normalizarId(c.id) !== targetId));

      if (editId === targetId) limpiar();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error eliminando cliente"));
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    const texto = `${c.nombre} ${c.dni} ${c.email || ""}`.toLowerCase();
    return texto.includes(busqueda.toLowerCase());
  });

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Menu />

        <main className={`app-content ${styles.shell}`}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>Relación con clientes</p>
              <h1>Clientes premium</h1>
              <p>Gestiona altas, edición y búsqueda de clientes con un flujo más rápido.</p>
            </div>
            <ExecutiveThemeSwitch />
          </section>

          <ExecutivePulseBar
            modulo="Clientes"
            estado={loadingList ? "Sincronizando" : "Operativo"}
            foco="Relacion comercial con busqueda rapida y mantenimiento de datos maestros."
            accion={{ label: "Ir a ventas", href: "ventas" }}
            metricas={[
              { label: "Registrados", value: String(clientes.length) },
              { label: "Filtrados", value: String(clientesFiltrados.length) },
              {
                label: "Edicion",
                value: editId ? "En curso" : "Sin cambios",
                tone: editId ? "warn" : "neutral",
              },
            ]}
          />

          {error ? <p className={styles.errorBox}>{error}</p> : null}

          <section className={`${styles.layoutGrid} uiEnter`} data-stagger="2">
            <article className={`${styles.formCard} uiEnter`} data-stagger="3">
              <h2>{editId ? "Editar cliente" : "Nuevo cliente"}</h2>

              <div className={styles.formGrid}>
                <input
                  className="focus-ring"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre"
                />
                <input
                  className="focus-ring"
                  value={dni}
                  onChange={(e) => setDni(sanitizarDni(e.target.value))}
                  placeholder="DNI"
                  inputMode="numeric"
                  maxLength={8}
                />
                {Boolean(dni) && dni.length !== 8 ? <small className={styles.errorHint}>DNI incompleto: deben ser 8 digitos.</small> : null}
                <input
                  className="focus-ring"
                  value={telefono}
                  onChange={(e) => setTelÃ©fono(sanitizarCelular(e.target.value))}
                  placeholder="TelÃ©fono"
                  inputMode="numeric"
                  maxLength={9}
                />
                {Boolean(telefono) && telefono.length !== 9 ? <small className={styles.errorHint}>Celular incompleto: deben ser 9 digitos.</small> : null}
                <input
                  className="focus-ring"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                />
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={loadingSave}
                  className={`${styles.saveBtn} focus-ring`}
                >
                  {loadingSave
                    ? "Guardando..."
                    : editId
                    ? "Actualizar cliente"
                    : "Guardar cliente"}
                </button>

                {editId ? (
                  <button type="button" onClick={limpiar} className={`${styles.cancelBtn} focus-ring`}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </article>

            <article className={`${styles.tableCard} uiEnter`} data-stagger="4">
              <Toolbar
                title="Listado de clientes"
                right={
                  <input
                    className={`focus-ring ${styles.search}`}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre, dni o email"
                  />
                }
              />

              <div className={styles.tableSpacer} />

              {loadingList ? <p className={styles.msg}>Cargando clientes...</p> : null}

              <DataTable headers={["Nombre", "DNI", "TelÃ©fono", "Email", "Acciones"]} minWidth={760}>
                {clientesFiltrados.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.dni}</td>
                    <td>{c.telefono || "-"}</td>
                    <td>{c.email || "-"}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" onClick={() => handleEdit(c)} className={styles.rowBtn}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          className={`${styles.rowBtn} ${styles.deleteBtn}`}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </article>
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}