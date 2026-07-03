"use client";

import { useEffect, useMemo, useState } from "react";
import Menu from "@/components/Menu";
import ProtectedRoute from "@/components/ProtectedRoute";
import Toolbar from "@/components/ui/Toolbar";
import StatusBadge from "@/components/ui/StatusBadge";
import { finanzasService, type CierreMensual, type GastoOperativo, type IngresoPlan } from "@/services/finanzasService";
import { getApiErrorMessage } from "@/utils/apiError";
import styles from "./page.module.css";

const periodoActual = () => {
  const hoy = new Date();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  return `${hoy.getFullYear()}-${mm}`;
};

export default function FinanzasPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [periodo, setPeriodo] = useState(periodoActual());
  const [ingresos, setIngresos] = useState<IngresoPlan[]>([]);
  const [gastos, setGastos] = useState<GastoOperativo[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [cierres, setCierres] = useState<CierreMensual[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    categoria: "Operaciones",
    descripcion: "",
    monto: "",
    proveedor: "",
    fecha_gasto: "",
  });

  const cargarTodo = async (periodoObjetivo: string) => {
    try {
      setLoading(true);
      setError("");
      const [cats, resumen, listaCierres] = await Promise.all([
        finanzasService.getCategorias(),
        finanzasService.getResumen(periodoObjetivo),
        finanzasService.listCierres(),
      ]);

      setCategorias(cats.categorias || []);
      setIngresos(Array.isArray(resumen.ingresos) ? resumen.ingresos : []);
      setGastos(Array.isArray(resumen.gastos) ? resumen.gastos : []);
      setCierres(Array.isArray(listaCierres) ? listaCierres : []);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar la contabilidad de planes"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargarTodo(periodo);
  }, [periodo]);

  const limpiarFormulario = () => {
    setForm({
      categoria: categorias[0] || "Operaciones",
      descripcion: "",
      monto: "",
      proveedor: "",
      fecha_gasto: "",
    });
    setEditingId(null);
  };

  const guardarGasto = async () => {
    const descripcion = form.descripcion.trim();
    const monto = Number(form.monto || 0);

    if (!descripcion || !Number.isFinite(monto) || monto <= 0) {
      setError("Completa descripcion y monto valido para registrar el gasto");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        categoria: form.categoria,
        descripcion,
        monto,
        proveedor: form.proveedor.trim() || undefined,
        fecha_gasto: form.fecha_gasto ? new Date(form.fecha_gasto).toISOString() : undefined,
      };

      if (editingId) {
        await finanzasService.updateGasto(editingId, payload);
        setSuccess("Gasto actualizado correctamente");
      } else {
        await finanzasService.createGasto(payload);
        setSuccess("Gasto registrado correctamente");
      }

      limpiarFormulario();
      await cargarTodo(periodo);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo guardar el gasto"));
    } finally {
      setSaving(false);
    }
  };

  const iniciarEdicion = (gasto: GastoOperativo) => {
    setEditingId(gasto.id);
    setForm({
      categoria: gasto.categoria,
      descripcion: gasto.descripcion,
      monto: String(gasto.monto),
      proveedor: gasto.proveedor || "",
      fecha_gasto: String(gasto.fecha_gasto || "").slice(0, 10),
    });
  };

  const eliminarGasto = async (gastoId: number) => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await finanzasService.deleteGasto(gastoId);
      setSuccess("Gasto eliminado");
      if (editingId === gastoId) limpiarFormulario();
      await cargarTodo(periodo);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo eliminar el gasto"));
    } finally {
      setSaving(false);
    }
  };

  const cargarComprobante = async (gastoId: number, file: File | null) => {
    if (!file) return;
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await finanzasService.uploadComprobante(gastoId, file);
      setSuccess("Comprobante cargado correctamente");
      await cargarTodo(periodo);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar el comprobante"));
    } finally {
      setSaving(false);
    }
  };

  const cerrarMes = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await finanzasService.cerrarMes(periodo, "Cierre mensual generado desde panel superadmin");
      setSuccess(`Cierre mensual ${periodo} registrado`);
      await cargarTodo(periodo);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cerrar el periodo"));
    } finally {
      setSaving(false);
    }
  };

  const totalIngresos = useMemo(() => ingresos.reduce((acc, row) => acc + Number(row.monto || 0), 0), [ingresos]);
  const totalGastos = useMemo(() => gastos.reduce((acc, row) => acc + Number(row.monto || 0), 0), [gastos]);
  const utilidad = totalIngresos - totalGastos;

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Menu />

        <main className={`app-content ${styles.shell}`}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>Superadministrador</p>
              <h1>Finanzas de planes</h1>
              <p>Panel contable completo con ingresos, gastos, comprobantes y cierre mensual.</p>
            </div>
            <StatusBadge text="Sin negocio fijo" variant="info" />
          </section>

          {error ? <p className={styles.errorBox}>{error}</p> : null}
          {success ? <p className={styles.successBox}>{success}</p> : null}

          <section className={styles.card}>
            <Toolbar title="Periodo de analisis" right={<StatusBadge text={loading ? "Cargando" : periodo} variant="neutral" />} />
            <div className={styles.periodRow}>
              <input
                type="month"
                value={periodo}
                className="focus-ring"
                onChange={(e) => setPeriodo(e.target.value || periodoActual())}
              />
              <button type="button" className={`${styles.actionBtn} focus-ring`} onClick={() => void cargarTodo(periodo)} disabled={loading || saving}>
                Refrescar
              </button>
              <button type="button" className={`${styles.actionPrimaryBtn} focus-ring`} onClick={cerrarMes} disabled={loading || saving}>
                Cerrar mes
              </button>
            </div>
          </section>

          <section className={styles.kpiGrid}>
            <article className={styles.kpiCard}>
              <span>Ingresos acumulados</span>
              <strong>S/{totalIngresos.toFixed(2)}</strong>
            </article>
            <article className={styles.kpiCard}>
              <span>Gastos acumulados</span>
              <strong>S/{totalGastos.toFixed(2)}</strong>
            </article>
            <article className={styles.kpiCard}>
              <span>Resultado</span>
              <strong>S/{utilidad.toFixed(2)}</strong>
            </article>
          </section>

          <section className={styles.card}>
            <Toolbar title="Movimientos por plan" right={<StatusBadge text={loading ? "Cargando" : `${ingresos.length} registros`} variant="neutral" />} />
            <p>
              Se muestran solo activaciones con estado aplicado. Los ingresos se calculan con el tarifario vigente del
              negocio al momento de la consulta.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Negocio</th>
                    <th>Plan</th>
                    <th>Canal</th>
                    <th>Referencia</th>
                    <th>Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {ingresos.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={6}>No hay movimientos aplicados para mostrar.</td>
                    </tr>
                  ) : (
                    ingresos.map((row, idx) => (
                      <tr key={`${row.negocio_id}-${row.fecha}-${idx}`}>
                        <td>{new Date(row.fecha).toLocaleDateString("es-PE")}</td>
                        <td>{row.negocio_id} - {row.negocio_nombre}</td>
                        <td>{row.plan_solicitado}</td>
                        <td>{row.canal_pago}</td>
                        <td>{row.referencia_pago}</td>
                        <td>S/{Number(row.monto || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.card}>
            <Toolbar title="Gastos operativos" right={<StatusBadge text={loading ? "Cargando" : `${gastos.length} gastos`} variant="warning" />} />
            <div className={styles.formGrid}>
              <label>
                Categoría
                <select value={form.categoria} onChange={(e) => setForm((prev) => ({ ...prev, categoria: e.target.value }))} className="focus-ring">
                  {categorias.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Fecha gasto
                <input type="date" value={form.fecha_gasto} onChange={(e) => setForm((prev) => ({ ...prev, fecha_gasto: e.target.value }))} className="focus-ring" />
              </label>
              <label className={styles.fullRow}>
                Descripción
                <input type="text" value={form.descripcion} onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))} className="focus-ring" placeholder="Ej. Servicio de hosting" />
              </label>
              <label>
                Monto
                <input type="number" min={0} step="0.01" value={form.monto} onChange={(e) => setForm((prev) => ({ ...prev, monto: e.target.value }))} className="focus-ring" />
              </label>
              <label>
                Proveedor
                <input type="text" value={form.proveedor} onChange={(e) => setForm((prev) => ({ ...prev, proveedor: e.target.value }))} className="focus-ring" placeholder="Opcional" />
              </label>
            </div>

            <div className={styles.inlineActions}>
              <button type="button" className={`${styles.actionPrimaryBtn} focus-ring`} onClick={guardarGasto} disabled={saving || loading}>
                {editingId ? "Actualizar gasto" : "Registrar gasto"}
              </button>
              {editingId ? (
                <button type="button" className={`${styles.actionBtn} focus-ring`} onClick={limpiarFormulario} disabled={saving || loading}>
                  Cancelar edición
                </button>
              ) : null}
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th>Proveedor</th>
                    <th>Monto</th>
                    <th>Comprobante</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={7}>No hay gastos registrados en este periodo.</td>
                    </tr>
                  ) : (
                    gastos.map((g) => (
                      <tr key={g.id}>
                        <td>{new Date(g.fecha_gasto).toLocaleDateString("es-PE")}</td>
                        <td>{g.categoria}</td>
                        <td>{g.descripcion}</td>
                        <td>{g.proveedor || "-"}</td>
                        <td>S/{Number(g.monto || 0).toFixed(2)}</td>
                        <td>
                          <div className={styles.fileCell}>
                            {g.comprobante_url ? (
                              <a href={g.comprobante_url} target="_blank" rel="noreferrer">Ver</a>
                            ) : (
                              <span>-</span>
                            )}
                            <input
                              type="file"
                              accept=".png,.jpg,.jpeg,.webp,.pdf"
                              onChange={(e) => void cargarComprobante(g.id, e.target.files?.[0] || null)}
                            />
                          </div>
                        </td>
                        <td>
                          <div className={styles.inlineActions}>
                            <button type="button" className={`${styles.actionBtn} focus-ring`} onClick={() => iniciarEdicion(g)} disabled={saving || loading}>Editar</button>
                            <button type="button" className={`${styles.actionDangerBtn} focus-ring`} onClick={() => void eliminarGasto(g.id)} disabled={saving || loading}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.card}>
            <Toolbar title="Cierres mensuales" right={<StatusBadge text={`${cierres.length} cierres`} variant="neutral" />} />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th>Ingresos</th>
                    <th>Gastos</th>
                    <th>Utilidad</th>
                    <th>Fecha cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {cierres.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Aun no hay cierres mensuales registrados.</td>
                    </tr>
                  ) : (
                    cierres.map((cierre) => (
                      <tr key={cierre.id}>
                        <td>{cierre.periodo}</td>
                        <td>S/{Number(cierre.ingresos_total || 0).toFixed(2)}</td>
                        <td>S/{Number(cierre.gastos_total || 0).toFixed(2)}</td>
                        <td>S/{Number(cierre.utilidad_total || 0).toFixed(2)}</td>
                        <td>{new Date(cierre.fecha_cierre).toLocaleDateString("es-PE")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
