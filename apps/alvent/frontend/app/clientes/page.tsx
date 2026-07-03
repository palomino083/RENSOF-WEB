"use client";

import { useEffect, useState } from "react";
import { clientesService, Cliente } from "@/services/clientesService";
import { getApiErrorMessage } from "@/utils/apiError";
import Menu from "@/components/Menu";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import Toolbar from "@/components/ui/Toolbar";
import DataTable from "@/components/ui/DataTable";
import styles from "./page.module.css";

const sanitizarDni = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").slice(0, 8);

const sanitizarCelular = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").slice(0, 9);

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
  const [telefono, setTelefono] = useState("");
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
    setTelefono("");
    setEmail("");
    setEditId(null);
  };

  // ======================
  // EDITAR
  // ======================
  const handleEdit = (c: Cliente) => {
    setEditId(c.id ?? null);
    setNombre(c.nombre);
    setDni(sanitizarDni(c.dni));
    setTelefono(sanitizarCelular(c.telefono || ""));
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

      if (editId) {
        setClientes((prev) =>
          prev.map((c) =>
            c.id === editId ? { ...c, ...result } : c
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
    if (!id) return;

    const ok = confirm("¿Eliminar cliente?");
    if (!ok) return;

    try {
      await clientesService.delete(id);

      setClientes((prev) => prev.filter((c) => c.id !== id));

      if (editId === id) limpiar();
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
                  onChange={(e) => setTelefono(sanitizarCelular(e.target.value))}
                  placeholder="Telefono"
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

              <DataTable headers={["Nombre", "DNI", "Telefono", "Email", "Acciones"]} minWidth={760}>
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