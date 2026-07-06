"use client";

import { useEffect, useMemo, useState } from "react";
import Menu from "@/components/Menu";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import Toolbar from "@/components/ui/Toolbar";
import StatusBadge from "@/components/ui/StatusBadge";
import PlanVisualCards from "@/features/planes/components/PlanVisualCards";
import {
  formatLimite,
  PLANES_VISIBLES_EN_SECCION,
  PLAN_PRICE_MAP,
  PLAN_VISUAL_META,
  normalizarPlan,
} from "@/features/planes/visualNarrative";
import { negocioService, type Negocio } from "@/services/negocioService";
import { finanzasService, type CierreMensual, type GastoOperativo, type IngresoPlan } from "@/services/finanzasService";
import { getApiErrorMessage } from "@/utils/apiError";
import { appPath } from "@/utils/appPath";
import styles from "./page.module.css";

type PlanCatalogItem = {
  codigo: string;
  nombre: string;
  usuarios_limite: number | null;
  reportes_habilitado: boolean;
  reportes_limite: number | null;
  backups_habilitado: boolean;
  backups_limite: number | null;
};

const periodoActual = () => {
  const hoy = new Date();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  return `${hoy.getFullYear()}-${mm}`;
};

const parseNegocioId = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return 0;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
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
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [negocioObjetivoId, setNegocioObjetivoId] = useState<number>(0);
  const [planCatalogo, setPlanCatalogo] = useState<PlanCatalogItem[]>([]);
  const [planAmounts, setPlanAmounts] = useState({
    gratuito: 0,
    prueba: 15,
    basico: 20,
    lite: 35,
    pro: 45,
    premium: 65,
  });

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

  const cargarPlanes = async (negocioId: number) => {
    if (!negocioId) {
      setPlanCatalogo([]);
      return;
    }

    try {
      const [catalogo, montos] = await Promise.all([
        negocioService.getEditablePlanCatalog(negocioId),
        negocioService.getPlanAmounts(negocioId),
      ]);

      setPlanCatalogo(Array.isArray(catalogo.planes) ? catalogo.planes : []);
      if (montos?.montos) {
        setPlanAmounts(montos.montos);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar narrativa de planes"));
    }
  };

  useEffect(() => {
    void cargarTodo(periodo);
  }, [periodo]);

  useEffect(() => {
    const initPlanes = async () => {
      try {
        const lista = await negocioService.list();
        setNegocios(Array.isArray(lista) ? lista : []);
        const fallback = parseNegocioId(lista?.[0]?.id || 0);
        setNegocioObjetivoId((prev) => prev || fallback);
      } catch {
        setNegocios([]);
      }
    };
    void initPlanes();
  }, []);

  useEffect(() => {
    void cargarPlanes(negocioObjetivoId);
  }, [negocioObjetivoId]);

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

  const planVisualCards = useMemo(() => {
    return planCatalogo
      .filter((plan) => PLANES_VISIBLES_EN_SECCION.includes(normalizarPlan(plan.codigo) as (typeof PLANES_VISIBLES_EN_SECCION)[number]))
      .map((plan) => {
        const codigo = normalizarPlan(plan.codigo);
        const meta = PLAN_VISUAL_META[codigo] || {
          subtitulo: "Alternativa configurable",
          lema: "Plan editable desde el panel propietario",
          accentClass: "pro" as const,
        };
        const amountKey = PLAN_PRICE_MAP[codigo] as keyof typeof planAmounts;
        const precio = amountKey ? Number(planAmounts[amountKey] || 0) : 0;

        return {
          key: codigo,
          titulo: `Plan ${plan.nombre}`,
          subtitulo: meta.subtitulo,
          accentClass: meta.accentClass,
          lema: meta.lema,
          precio: `S/${precio.toFixed(0)}`,
          beneficios: [
            { icon: "user" as const, text: `Usuarios: ${formatLimite(plan.usuarios_limite)}` },
            {
              icon: "chart" as const,
              text: plan.reportes_habilitado ? `Reportes: ${formatLimite(plan.reportes_limite)}` : "Reportes: no incluidos",
            },
            {
              icon: "shield" as const,
              text: plan.backups_habilitado ? `Backups: ${formatLimite(plan.backups_limite)}` : "Backups: no incluidos",
            },
            { icon: "briefcase" as const, text: "Escalable por negocio" },
          ],
        };
      });
  }, [planCatalogo, planAmounts]);

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Menu />

        <main className={`app-content ${styles.shell}`}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>RENSOF</p>
              <h1>Finanzas de planes</h1>
              <p>Panel contable completo con ingresos, gastos, comprobantes y cierre mensual.</p>
            </div>
            <StatusBadge text="Sin negocio fijo" variant="info" />
          </section>

          <ExecutivePulseBar
            modulo="Finanzas"
            estado={loading ? "Sincronizando" : "Operativo"}
            foco="Control contable mensual con lectura de utilidad y cierre de periodo."
            accion={{ label: "Ir a Configuracion", href: "configuracion" }}
            metricas={[
              { label: "Ingresos", value: `S/${totalIngresos.toFixed(2)}`, tone: "good" },
              { label: "Gastos", value: `S/${totalGastos.toFixed(2)}`, tone: "warn" },
              {
                label: "Resultado",
                value: `S/${utilidad.toFixed(2)}`,
                tone: utilidad >= 0 ? "good" : "critical",
              },
            ]}
          />

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
            <Toolbar title="Narrativa dinámica de planes" right={<StatusBadge text="Unificado con Configuración" variant="info" />} />
            <p>
              Alternativas comerciales conectadas al catálogo real y montos editables. El propietario del sistema ajusta capacidad y precio desde Configuración.
            </p>

            <div className={styles.periodRow}>
              <label className={styles.selectorInline}>
                Empresa objetivo para lectura de montos
                <select
                  value={negocioObjetivoId || ""}
                  onChange={(e) => setNegocioObjetivoId(parseNegocioId(e.target.value))}
                  className="focus-ring"
                >
                  <option value="">Seleccionar empresa</option>
                  {negocios.map((n) => (
                    <option key={n.id} value={n.id}>{n.id} - {n.nombre}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`${styles.actionBtn} focus-ring`}
                onClick={() => {
                  window.location.href = appPath("configuracion");
                }}
              >
                Ir a Configuración de planes
              </button>
            </div>

            <PlanVisualCards cards={planVisualCards} />
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
