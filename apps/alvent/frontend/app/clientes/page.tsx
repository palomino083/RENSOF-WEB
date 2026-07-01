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
      const data = await clientesService.getAll();
      setClientes(data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error cargando clientes"));
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
    setDni(c.dni);
    setTelefono(c.telefono || "");
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
              <p className={styles.eyebrow}>Relacion con clientes</p>
              <h1>Clientes premium</h1>
              <p>Gestiona altas, edicion y busqueda de clientes con un flujo mas rapido.</p>
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
                  onChange={(e) => setDni(e.target.value)}
                  placeholder="DNI"
                />
                <input
                  className="focus-ring"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Telefono"
                />
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