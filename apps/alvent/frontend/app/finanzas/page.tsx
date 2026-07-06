"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Menu from "@/components/Menu";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import Toolbar from "@/components/ui/Toolbar";
import StatusBadge from "@/components/ui/StatusBadge";
import { negocioService, type Negocio } from "@/services/negocioService";
import { finanzasService, type CierreMensual, type GastoOperativo, type IngresoPlan } from "@/services/finanzasService";
import { getApiErrorMessage } from "@/utils/apiError";
import { appPath } from "@/utils/appPath";
import styles from "./page.module.css";

const DEFAULT_PLAN_AMOUNTS = {
  gratuito: 0,
  prueba: 15,
  basico: 20,
  lite: 35,
  pro: 45,
  premium: 65,
};

type PlanAmountKey = keyof typeof DEFAULT_PLAN_AMOUNTS;

const PLAN_AMOUNT_BY_CODE: Record<string, PlanAmountKey> = {
  GRATUITO: "gratuito",
  PRUEBA: "prueba",
  BASICO: "basico",
  LITE: "lite",
  PRO: "pro",
  PREMIUM: "premium",
};

const PLAN_ORDER = ["GRATUITO", "PRUEBA", "BASICO", "LITE", "PRO", "PREMIUM", "SIN_PLAN"];

const normalizarcodigoPlan = (plan: string) =>
  String(plan || "SIN_PLAN")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

const formatPlanLabel = (plan: string) => {
  const code = normalizarcodigoPlan(plan);
  if (code === "SIN_PLAN") return "Sin plan";
  return code
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

const formatCurrency = (value: number) => `S/${Number(value || 0).toFixed(2)}`;

const getIngresoMonthKey = (fecha: string) => {
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
};

const formatMonthLabel = (key: string) => {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
  });
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
  const [pagosPendientes, setPagosPendientes] = useState(0);
  const [loadingPlanFinanciero, setLoadingPlanFinanciero] = useState(false);
  const [planAmounts, setPlanAmounts] = useState({ ...DEFAULT_PLAN_AMOUNTS });

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

  const cargarLecturaFinancieraPlanes = useCallback(async (negocioId: number, listaNegocios: Negocio[] = negocios) => {
    try {
      setLoadingPlanFinanciero(true);

      if (negocioId) {
        const montos = await negocioService.getPlanAmounts(negocioId);
        if (montos?.montos) {
          setPlanAmounts(montos.montos);
        }
      }

      if (listaNegocios.length === 0) {
        setPagosPendientes(0);
        return;
      }

      const historiales = await Promise.allSettled(
        listaNegocios.map((negocio) => negocioService.getPlanHistory(Number(negocio.id)))
      );

      const pendientes = historiales.reduce((acc, item) => {
        if (item.status !== "fulfilled") return acc;
        return acc + item.value.filter((row) => String(row.estado || "").toUpperCase() === "PENDIENTE_VALIDACION").length;
      }, 0);

      setPagosPendientes(pendientes);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar el resumen financiero de planes"));
    } finally {
      setLoadingPlanFinanciero(false);
    }
  }, [negocios]);

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
    void cargarLecturaFinancieraPlanes(negocioObjetivoId, negocios);
  }, [negocioObjetivoId, negocios, cargarLecturaFinancieraPlanes]);

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

  const ingresosAgrupados = useMemo(() => {
    const months = new Map<string, Map<string, { rows: IngresoPlan[]; total: number }>>();

    ingresos.forEach((row) => {
      const monthKey = getIngresoMonthKey(row.fecha);
      const planKey = String(row.plan_solicitado || "SIN_PLAN").toUpperCase();
      if (!months.has(monthKey)) months.set(monthKey, new Map());
      const planMap = months.get(monthKey)!;
      const current = planMap.get(planKey) || { rows: [], total: 0 };
      current.rows.push(row);
      current.total += Number(row.monto || 0);
      planMap.set(planKey, current);
    });

    return Array.from(months.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, planMap]) => {
        const plans = Array.from(planMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([plan, data]) => ({ plan, ...data }));
        return {
          monthKey,
          monthLabel: formatMonthLabel(monthKey),
          plans,
          total: plans.reduce((acc, plan) => acc + plan.total, 0),
          count: plans.reduce((acc, plan) => acc + plan.rows.length, 0),
        };
      });
  }, [ingresos]);

  const resumenPorPlan = useMemo(() => {
    const map = new Map<string, { total: number; count: number; negocios: Set<number> }>();
    ingresos.forEach((row) => {
      const plan = String(row.plan_solicitado || "SIN_PLAN").toUpperCase();
      const current = map.get(plan) || { total: 0, count: 0, negocios: new Set<number>() };
      current.total += Number(row.monto || 0);
      current.count += 1;
      current.negocios.add(Number(row.negocio_id || 0));
      map.set(plan, current);
    });

    return Array.from(map.entries())
      .map(([plan, data]) => ({ plan, ...data, negociosCount: data.negocios.size }))
      .sort((a, b) => b.total - a.total);
  }, [ingresos]);

  const getPlanAmount = useCallback((plan: string) => {
    const amountKey = PLAN_AMOUNT_BY_CODE[normalizarcodigoPlan(plan)];
    return amountKey ? Number(planAmounts[amountKey] || 0) : 0;
  }, [planAmounts]);

  const clientesPorPlan = useMemo(() => {
    const map = new Map<string, { plan: string; clientes: number }>();

    negocios.forEach((negocio) => {
      const plan = normalizarcodigoPlan(negocio.plan || "SIN_PLAN");
      const current = map.get(plan) || { plan, clientes: 0 };
      current.clientes += 1;
      map.set(plan, current);
    });

    return Array.from(map.values()).sort((a, b) => {
      const orderA = PLAN_ORDER.indexOf(a.plan);
      const orderB = PLAN_ORDER.indexOf(b.plan);
      return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
    });
  }, [negocios]);

  const ingresosPorPlanFinanciero = useMemo(() => {
    const map = new Map<string, { plan: string; ingresos: number; movimientos: number }>();

    ingresos.forEach((row) => {
      const plan = normalizarcodigoPlan(row.plan_solicitado || "SIN_PLAN");
      const current = map.get(plan) || { plan, ingresos: 0, movimientos: 0 };
      current.ingresos += Number(row.monto || 0);
      current.movimientos += 1;
      map.set(plan, current);
    });

    return map;
  }, [ingresos]);

  const resumenFinancieroPlanes = useMemo(() => {
    const planes = new Set<string>();
    clientesPorPlan.forEach((item) => planes.add(item.plan));
    ingresosPorPlanFinanciero.forEach((_, plan) => planes.add(plan));

    return Array.from(planes)
      .map((plan) => {
        const clientes = clientesPorPlan.find((item) => item.plan === plan)?.clientes || 0;
        const ingresosInfo = ingresosPorPlanFinanciero.get(plan);
        return {
          plan,
          clientes,
          mrr: clientes * getPlanAmount(plan),
          ingresosPeriodo: ingresosInfo?.ingresos || 0,
          movimientosPeriodo: ingresosInfo?.movimientos || 0,
        };
      })
      .sort((a, b) => {
        const orderA = PLAN_ORDER.indexOf(a.plan);
        const orderB = PLAN_ORDER.indexOf(b.plan);
        return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
      });
  }, [clientesPorPlan, ingresosPorPlanFinanciero, getPlanAmount]);

  const totalClientesConPlan = useMemo(
    () => clientesPorPlan.reduce((acc, item) => acc + item.clientes, 0),
    [clientesPorPlan]
  );

  const mrrMensualEstimado = useMemo(
    () => resumenFinancieroPlanes.reduce((acc, item) => acc + item.mrr, 0),
    [resumenFinancieroPlanes]
  );

  const planMasContratado = useMemo(() => {
    if (clientesPorPlan.length === 0) return "Sin datos";
    const top = [...clientesPorPlan].sort((a, b) => b.clientes - a.clientes)[0];
    return `${formatPlanLabel(top.plan)} (${top.clientes})`;
  }, [clientesPorPlan]);

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
            accion={{ label: "Ir a configuración", href: "configuracion" }}
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
            <Toolbar title="Periodo de análisis" right={<StatusBadge text={loading ? "Cargando" : periodo} variant="neutral" />} />
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
            <Toolbar
              title="Resumen financiero de planes"
              right={<StatusBadge text={loadingPlanFinanciero ? "Actualizando" : "Vista financiera"} variant="info" />}
            />
            <p className={styles.mutedText}>
              La administración completa de planes permanece en configuración. Finanzas muestra lectura económica:
              ingresos del periodo, clientes por plan, MRR estimado y pagos pendientes.
            </p>

            <div className={styles.periodRow}>
              <label className={styles.selectorInline}>
                Empresa base para montos
                <select
                  value={negocioObjetivoId || ""}
                  onChange={(e) => setNegocioObjetivoId(parseNegocioId(e.target.value))}
                  className="focus-ring"
                >
                  <option value="">Usar montos base</option>
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
                Administrar planes en configuración
              </button>
            </div>

            <div className={styles.financialPlanGrid}>
              <article className={styles.financialPlanCard}>
                <span>MRR mensual estimado</span>
                <strong>{formatCurrency(mrrMensualEstimado)}</strong>
                <small>Clientes actuales por monto del plan</small>
              </article>
              <article className={styles.financialPlanCard}>
                <span>Clientes por plan</span>
                <strong>{totalClientesConPlan}</strong>
                <small>{resumenFinancieroPlanes.length} planes con lectura</small>
              </article>
              <article className={styles.financialPlanCard}>
                <span>Ingresos del periodo</span>
                <strong>{formatCurrency(totalIngresos)}</strong>
                <small>{ingresos.length} movimientos aplicados</small>
              </article>
              <article className={styles.financialPlanCard}>
                <span>Pagos pendientes</span>
                <strong>{pagosPendientes}</strong>
                <small>Solicitudes en validación</small>
              </article>
              <article className={styles.financialPlanCard}>
                <span>Plan más contratado</span>
                <strong>{planMasContratado}</strong>
                <small>Según empresas actuales</small>
              </article>
            </div>

            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.financialPlanTable}`}>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Clientes actuales</th>
                    <th>MRR estimado</th>
                    <th>Ingresos del periodo</th>
                    <th>Movimientos</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenFinancieroPlanes.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No hay datos financieros de planes para mostrar.</td>
                    </tr>
                  ) : (
                    resumenFinancieroPlanes.map((item) => (
                      <tr key={item.plan}>
                        <td>{formatPlanLabel(item.plan)}</td>
                        <td>{item.clientes}</td>
                        <td>{formatCurrency(item.mrr)}</td>
                        <td>{formatCurrency(item.ingresosPeriodo)}</td>
                        <td>{item.movimientosPeriodo}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.card}>
            <Toolbar title="Movimientos por plan y mes" right={<StatusBadge text={loading ? "Cargando" : `${ingresos.length} registros`} variant="neutral" />} />
            <p>
              Se muestran solo activaciones con estado aplicado, agrupadas por mes y plan para leer rápido ingreso,
              cantidad de movimientos y negocios impactados.
            </p>

            {resumenPorPlan.length > 0 ? (
              <div className={styles.planSummaryGrid}>
                {resumenPorPlan.map((item) => (
                  <article key={item.plan} className={styles.planSummaryCard}>
                    <span>{item.plan}</span>
                    <strong>{formatCurrency(item.total)}</strong>
                    <small>{item.count} movimientos | {item.negociosCount} negocios</small>
                  </article>
                ))}
              </div>
            ) : null}

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
                    ingresosAgrupados.flatMap((month) => [
                      <tr key={`month-${month.monthKey}`} className={styles.groupMonthRow}>
                        <td colSpan={5}>{month.monthLabel} | {month.count} movimientos</td>
                        <td>{formatCurrency(month.total)}</td>
                      </tr>,
                      ...month.plans.flatMap((plan) => [
                        <tr key={`plan-${month.monthKey}-${plan.plan}`} className={styles.groupPlanRow}>
                          <td colSpan={5}>Plan {plan.plan} | {plan.rows.length} movimientos</td>
                          <td>{formatCurrency(plan.total)}</td>
                        </tr>,
                        ...plan.rows.map((row, idx) => (
                          <tr key={`${month.monthKey}-${plan.plan}-${row.negocio_id}-${row.fecha}-${idx}`}>
                            <td>{new Date(row.fecha).toLocaleDateString("es-PE")}</td>
                            <td>{row.negocio_id} - {row.negocio_nombre}</td>
                            <td>{row.plan_solicitado}</td>
                            <td>{row.canal_pago}</td>
                            <td>{row.referencia_pago}</td>
                            <td>{formatCurrency(Number(row.monto || 0))}</td>
                          </tr>
                        )),
                      ]),
                    ])
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
                descripcion
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
                    <th>descripcion</th>
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
                      <td colSpan={5}>Aún no hay cierres mensuales registrados.</td>
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
