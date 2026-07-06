"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";

import Menu from "../../src/components/Menu";
import ProtectedRoute from "../../src/components/ProtectedRoute";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Toolbar from "@/components/ui/Toolbar";
import { appPath } from "@/utils/appPath";
import styles from "./page.module.css";

import { dashboardService } from "../../src/services/dashboardService";
import { systemService } from "../../src/services/systemService";

/* =====================================================
   TIPOS
===================================================== */

type Usuario = {
  id: number;
  nombres: string;
  usuario: string;
  rol: string;
};

type DashboardData = {
  contexto?: {
    modo_global: boolean;
    negocio_id: number | null;
  };

  kpis: {
    productos: number;
    clientes: number;
    usuarios: number;
    ventas: number;
    monto_vendido: number;
    caja_abierta: boolean;
  };

  ventas: {
    fecha: string;
    ventas: number;
  }[];

  caja: {
    estado: string;
    saldo_inicial: number;
    ingresos: number;
    egresos: number;
    saldo_actual: number;
  };

  inventario: {
    total_productos: number;
    stock_critico: number;
    valor_inventario: number;
  };

  top_productos: {
    id: number;
    codigo: string;
    nombre: string;
    cantidad: number;
  }[];

  alertas: Array<
    | string
    | {
        tipo?: string;
        mensaje?: string;
      }
  >;
};

/* =====================================================
   COMPONENTE
===================================================== */

export default function Dashboard() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const REQUEST_TIMEOUT_MS = 15000;

  const withTimeout = async <T,>(promise: Promise<T>, fallbackMessage: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(fallbackMessage));
          }, REQUEST_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const [showResetModal, setShowResetModal] = useState(false);
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<"parcial" | "completo">("parcial");
  const [loadingReset, setLoadingReset] = useState(false);

  const esSuperadminTecnico = Number(usuario?.id || 0) === 1;
  const mostrarBannerGlobal = Boolean(data?.contexto?.modo_global || esSuperadminTecnico);
  const nombreVisible = esSuperadminTecnico ? "RENSOF" : (usuario?.nombres ?? "Administrador");

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  const normalizarAlerta = (
    alerta: string | { tipo?: string; mensaje?: string }
  ) => {
    if (typeof alerta === "string") {
      return {
        tipo: "INFO",
        mensaje: alerta,
      };
    }

    return {
      tipo: (alerta?.tipo || "INFO").toUpperCase(),
      mensaje: alerta?.mensaje || "Alerta sin detalle",
    };
  };

  const varianteAlerta = (tipo: string) => {
    if (tipo === "CRITICO" || tipo === "ERROR") return "danger" as const;
    if (tipo === "WARNING" || tipo === "ADVERTENCIA") return "warning" as const;
    return "info" as const;
  };

  /* =====================================================
     CARGAR DASHBOARD
  ===================================================== */

  const cargarDashboard = async () => {
    try {
      setLoading(true);
      setError("");
      const overview = await withTimeout(
        dashboardService.getOverview(),
        "Tiempo de espera agotado al cargar dashboard"
      );
      setData(overview);
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error(err);
      }
      setError("No fue posible cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  };

  /* =====================================================
     INIT
  ===================================================== */

  useEffect(() => {
    cargarDashboard();

    const u = localStorage.getItem("usuario");

    if (u) {
      try {
        const parsed = JSON.parse(u);
        if (parsed && typeof parsed === "object") {
          setUsuario(parsed);
        }
      } catch {
        setUsuario({
          id: Number(localStorage.getItem("usuario_id") || 0),
          nombres: u,
          usuario: u,
          rol: "CAJERO",
        });
      }
    }

    const timer = setInterval(() => {
      cargarDashboard();
    }, 60000);

    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* =====================================================
     RESET
  ===================================================== */

  const resetSistema = async () => {
    try {
      setLoadingReset(true);
      await systemService.reset(modo, password);
      alert("Sistema reiniciado correctamente");
      setPassword("");
      setShowResetModal(false);
      cargarDashboard();
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error(err);
      }
      alert(err?.response?.data?.detail || "Error al reiniciar");
    } finally {
      setLoadingReset(false);
    }
  };

  /* =====================================================
     LOADING
  ===================================================== */

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="app-layout">
          <Menu />
          <main className={`app-content ${styles.shell}`}>
            <section className={styles.loaderCard}>
              <div className={styles.loaderDot} />
              <span>Cargando dashboard premium...</span>
            </section>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  /* =====================================================
     ERROR
  ===================================================== */

  if (error) {
    return (
      <ProtectedRoute>
        <div className="app-layout">
          <Menu />
          <main className={`app-content ${styles.shell}`}>
            <div className={styles.errorCard}>
              <h2>Error</h2>
              <p>{error}</p>
              <button className="btn btn-primary" onClick={cargarDashboard}>
                Reintentar
              </button>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  const ventasChartData = (data?.ventas || []).map((item) => ({
    fecha: item.fecha,
    ventas: item.ventas,
  }));

  const topProductosData = (data?.top_productos || []).slice(0, 6).map((item, index) => ({
    rowKey: `${item.id || item.codigo || "prod"}-${index}`,
    nombre: item.nombre,
    cantidad: item.cantidad,
  }));

  /* =====================================================
     UI
  ===================================================== */

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Menu />
        <main className={`app-content ${styles.shell}`}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>Centro de mando</p>
              <h1>Dashboard premium</h1>
              <p>
                Bienvenido {nombreVisible}. Aqui tienes una vision
                ejecutiva de ventas, caja e inventario en tiempo real.
              </p>
            </div>
            <div className={styles.heroActions}>
              <ExecutiveThemeSwitch />
              <p className={styles.refreshMeta}>
                {lastUpdatedAt
                  ? `Actualizado: ${lastUpdatedAt.toLocaleTimeString("es-PE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}`
                  : "Actualizado: pendiente"}
              </p>
              <button
                type="button"
                onClick={cargarDashboard}
                className={`${styles.refreshBtn} focus-ring`}
              >
                Refrescar dashboard
              </button>
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className={`${styles.resetButton} focus-ring`}
              >
                Reiniciar sistema
              </button>
            </div>
          </section>

          <ExecutivePulseBar
            modulo="Dashboard"
            estado={data?.kpis.caja_abierta ? "Caja abierta" : "Caja cerrada"}
            foco="Operacion consolidada de ventas, caja e inventario en tiempo real."
            accion={{ label: "Abrir reportes", href: "reportes" }}
            metricas={[
              { label: "Ventas", value: String(data?.kpis.ventas ?? 0) },
              {
                label: "Monto",
                value: formatMoney(Number(data?.kpis.monto_vendido ?? 0)),
                tone: "good",
              },
              {
                label: "Stock critico",
                value: String(data?.inventario?.stock_critico ?? 0),
                tone: Number(data?.inventario?.stock_critico ?? 0) > 0 ? "warn" : "good",
              },
            ]}
          />

          {mostrarBannerGlobal ? (
            <section className={styles.globalBanner}>
              <div>
                <strong>Modo RENSOF Global</strong>
                <p>Estás viendo información consolidada de todas las empresas.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.location.href = appPath("registro");
                }}
                className={`${styles.onboardingBtn} focus-ring`}
              >
                Ir a Onboarding de negocio
              </button>
            </section>
          ) : null}

          <section className={`${styles.kpiGrid} stagger`}>
            <article className={styles.kpiCard}>
              <p>Productos</p>
              <h3>{data?.kpis.productos ?? 0}</h3>
            </article>
            <article className={styles.kpiCard}>
              <p>Clientes</p>
              <h3>{data?.kpis.clientes ?? 0}</h3>
            </article>
            <article className={styles.kpiCard}>
              <p>Ventas</p>
              <h3>{data?.kpis.ventas ?? 0}</h3>
            </article>
            <article className={`${styles.kpiCard} ${styles.highlight}`}>
              <p>Monto vendido</p>
              <h3>{formatMoney(Number(data?.kpis.monto_vendido ?? 0))}</h3>
            </article>
          </section>

          <section className={styles.mainGrid}>
            <article className={styles.chartCard}>
              <header>
                <h2>Ritmo de ventas</h2>
                <span>Ultimo periodo</span>
              </header>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={ventasChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ventasGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" />
                    <XAxis dataKey="fecha" stroke="#475569" />
                    <YAxis stroke="#475569" />
                    <Tooltip
                      formatter={(value) => [Number(value ?? 0), "Ventas"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #cbd5e1" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="ventas"
                      stroke="#0284c7"
                      strokeWidth={3}
                      fill="url(#ventasGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className={styles.sideCard}>
              <Toolbar
                title="Estado de caja"
                right={(
                  <StatusBadge
                    text={data?.kpis.caja_abierta ? "Caja abierta" : "Caja cerrada"}
                    variant={data?.kpis.caja_abierta ? "success" : "danger"}
                  />
                )}
              />

              <DataTable headers={["Indicador", "Valor"]} density="executive" minWidth={420}>
                <tr>
                  <td>Saldo inicial</td>
                  <td>{formatMoney(Number(data?.caja.saldo_inicial ?? 0))}</td>
                </tr>
                <tr>
                  <td>Ingresos</td>
                  <td>{formatMoney(Number(data?.caja.ingresos ?? 0))}</td>
                </tr>
                <tr>
                  <td>Egresos</td>
                  <td>{formatMoney(Number(data?.caja.egresos ?? 0))}</td>
                </tr>
                <tr>
                  <td>Saldo actual</td>
                  <td>{formatMoney(Number(data?.caja.saldo_actual ?? 0))}</td>
                </tr>
              </DataTable>
            </article>
          </section>

          <section className={styles.secondaryGrid}>
            <article className={styles.chartCard}>
              <header>
                <h2>Top productos</h2>
                <span>Mas vendidos</span>
              </header>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topProductosData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" />
                    <XAxis dataKey="nombre" stroke="#475569" />
                    <YAxis stroke="#475569" />
                    <Tooltip
                      formatter={(value) => [Number(value ?? 0), "Cantidad"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #cbd5e1" }}
                    />
                    <Legend />
                    <Bar dataKey="cantidad" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className={styles.alertCard}>
              <Toolbar title="Alertas" />
              {(data?.alertas || []).length === 0 ? (
                <p className={styles.empty}>Sin alertas por ahora.</p>
              ) : (
                <DataTable headers={["Tipo", "Mensaje"]} density="executive" minWidth={460}>
                  {(data?.alertas || []).map((alerta, index) => (
                    (() => {
                      const a = normalizarAlerta(alerta);
                      return (
                        <tr key={`${a.tipo}-${a.mensaje}-${index}`}>
                          <td>
                            <StatusBadge text={a.tipo} variant={varianteAlerta(a.tipo)} />
                          </td>
                          <td>{a.mensaje}</td>
                        </tr>
                      );
                    })()
                  ))}
                </DataTable>
              )}

              <div className={styles.inventoryBox}>
                <h3>Inventario</h3>
                <p>Total productos: {data?.inventario.total_productos ?? 0}</p>
                <p>Stock critico: {data?.inventario.stock_critico ?? 0}</p>
                <p>
                  Valor inventario: {formatMoney(Number(data?.inventario.valor_inventario ?? 0))}
                </p>
              </div>
            </article>
          </section>

          <section className={`${styles.sideCard} uiEnter`} data-stagger="3">
            <Toolbar title="Top productos (tabla ejecutiva)" />
            <DataTable headers={["Producto", "Cantidad"]} density="executive" minWidth={560}>
              {topProductosData.map((item) => (
                <tr key={item.rowKey}>
                  <td>{item.nombre}</td>
                  <td>{item.cantidad}</td>
                </tr>
              ))}
            </DataTable>
          </section>

            {mostrarBannerGlobal && (
            <p className={styles.helperText}>
              Estatus global activo para RENSOF.
            </p>
          )}

          {showResetModal && (
            <div className={styles.modalOverlay}>
              <div className={styles.modalBox}>
                <h3>Reinicio del sistema</h3>

                <select
                  className={`focus-ring ${styles.field}`}
                  value={modo}
                  onChange={(e) =>
                    setModo(e.target.value as "parcial" | "completo")
                  }
                >
                  <option value="parcial">Parcial</option>
                  <option value="completo">Completo</option>
                </select>

                <input
                  className={`focus-ring ${styles.field}`}
                  type="password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <div className={styles.modalActions}>
                  <button
                    className={styles.confirmBtn}
                    disabled={loadingReset}
                    onClick={resetSistema}
                  >
                    {loadingReset ? "Reiniciando..." : "Confirmar"}
                  </button>

                  <button className={styles.cancelBtn} onClick={() => setShowResetModal(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}