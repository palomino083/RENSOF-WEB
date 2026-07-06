"use client";

import { useEffect, useState } from "react";
import { cajaService } from "@/services/cajaService";
import { getApiErrorMessage } from "@/utils/apiError";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import DataTable from "@/components/ui/DataTable";
import Toolbar from "@/components/ui/Toolbar";
import StatusBadge from "@/components/ui/StatusBadge";
import Menu from "@/components/Menu";
import styles from "./page.module.css";

/* =========================
   💰 MÓDULO CAJAS - ALVENT ERP
========================= */

export default function CajasPage() {
  type MovimientoCaja = {
    id: number;
    tipo: string;
    concepto?: string;
    monto: number;
    fecha?: string;
  };

  const [estadoCaja, setEstadoCaja] = useState<"ABIERTA" | "CERRADA">("CERRADA");
  const [cajaId, setCajaId] = useState<number | null>(null);
  const [montoInicial, setMontoInicial] = useState<number>(0);
  const [montoActual, setMontoActual] = useState<number>(0);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string>("");
  const [mensajeError, setMensajeError] = useState<string>("");
  const [enProceso, setEnProceso] = useState<"abrir" | "cerrar" | null>(null);
  const [loading, setLoading] = useState(true);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);

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

  const cajaAbierta = estadoCaja === "ABIERTA";

  const formatoMoneda = (valor: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(Number.isFinite(valor) ? valor : 0);

  const cargarCaja = async () => {
    try {
      setMensajeError("");
      const [caja, movimientosData] = await withTimeout(
        Promise.all([
          cajaService.actual(),
          cajaService.movimientos().catch(() => []),
        ]),
        "Tiempo de espera agotado al consultar caja"
      );

      setMovimientos(Array.isArray(movimientosData) ? movimientosData.slice(0, 20) : []);

      if (!caja) {
        setCajaId(null);
        setEstadoCaja("CERRADA");
        setMontoActual(0);
        setUltimaActualizacion(new Date().toLocaleTimeString("es-PE"));
        return;
      }

      setCajaId(caja.id);
      setEstadoCaja(caja.estado === "abierta" ? "ABIERTA" : "CERRADA");
      setMontoInicial(Number(caja.monto_inicial || 0));

      const totalVentas = Number(caja.total_ventas || 0);
      const totalIngresos = Number(caja.total_ingresos || 0);
      const totalEgresos = Number(caja.total_egresos || 0);

      setMontoActual(caja.monto_inicial + totalVentas + totalIngresos - totalEgresos);
      setUltimaActualizacion(new Date().toLocaleTimeString("es-PE"));
    } catch (err: any) {
      setMensajeError(getApiErrorMessage(err, "Error cargando caja"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCaja();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirCaja = async () => {
    try {
      setEnProceso("abrir");
      const usuarioId = Number(localStorage.getItem("usuario_id") || 0);

      if (!usuarioId) {
        setMensajeError("SesiÃ³n invÃ¡lida. Vuelve a iniciar sesiÃ³n.");
        return;
      }

      await cajaService.abrir(usuarioId, montoInicial);
      await cargarCaja();
    } catch (err: any) {
      setMensajeError(getApiErrorMessage(err, "No se pudo abrir caja"));
    } finally {
      setEnProceso(null);
    }
  };

  const cerrarCaja = async () => {
    if (!cajaId) return;

    try {
      setEnProceso("cerrar");
      await cajaService.cerrar(cajaId, {
        monto_final: montoActual,
        observacion: "Cierre desde modulo de cajas",
      });

      await cargarCaja();
    } catch (err: any) {
      setMensajeError(getApiErrorMessage(err, "No se pudo cerrar caja"));
    } finally {
      setEnProceso(null);
    }
  };

  if (loading) {
    return (
      <div className="app-layout">
        <Menu />
        <main className={`${styles.shell} app-content`}>
          <section className={styles.hero}>
            <p className={styles.eyebrow}>GestiÃ³n de efectivo</p>
            <h1>Caja inteligente</h1>
            <p>Sincronizando estado operativo...</p>
          </section>

          <section className={styles.loaderCard}>
            <div className={styles.loaderDot} />
            <span>Cargando estado de caja...</span>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Menu />
      <main className={`${styles.shell} app-content`}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>GestiÃ³n de efectivo</p>
        <h1>Caja inteligente</h1>
        <p>
          Visualiza el estado operativo en tiempo real y ejecuta aperturas o cierres con
          control total.
        </p>
        <div className={styles.heroMeta}>
          <span className={cajaAbierta ? styles.badgeOpen : styles.badgeClosed}>
            {cajaAbierta ? "Caja abierta" : "Caja cerrada"}
          </span>
          <span>Ultima actualizacion: {ultimaActualizacion || "-"}</span>
        </div>
      </section>

      <ExecutivePulseBar
        modulo="Cajas"
        estado={cajaAbierta ? "Caja abierta" : "Caja cerrada"}
        foco="Supervision en vivo del flujo de efectivo y operaciones de apertura/cierre."
        accion={{ label: "Ir a POS", href: "pos" }}
        metricas={[
          { label: "Estado", value: estadoCaja },
          { label: "Movimientos", value: String(movimientos.length) },
          { label: "Saldo", value: formatoMoneda(montoActual), tone: "good" },
        ]}
      />

      {mensajeError ? <p className={styles.errorBox}>{mensajeError}</p> : null}

      <section className={`${styles.metricsGrid} stagger`}>
        <article className={styles.metricCard}>
          <p>Monto inicial</p>
          <h3>{formatoMoneda(montoInicial)}</h3>
          <small>Base al iniciar caja</small>
        </article>

        <article className={styles.metricCard}>
          <p>Monto operativo</p>
          <h3>{formatoMoneda(montoActual)}</h3>
          <small>Saldo actual estimado</small>
        </article>

        <article className={styles.metricCard}>
          <p>Diferencial</p>
          <h3>{formatoMoneda(montoActual - montoInicial)}</h3>
          <small>Variacion respecto a la apertura</small>
        </article>
      </section>

      <section className={styles.actionPanel}>
        <div>
          <h2>Control de caja</h2>
          <p>
            Define el monto de apertura y ejecuta acciones segun el estado operativo actual.
          </p>
        </div>

        <label className={styles.fieldLabel} htmlFor="monto-inicial">
          Monto inicial de apertura
        </label>
        <input
          id="monto-inicial"
          className={`${styles.moneyInput} focus-ring`}
          type="number"
          min={0}
          step="0.01"
          value={montoInicial}
          onChange={(e) => setMontoInicial(Number(e.target.value))}
          disabled={cajaAbierta}
        />

        <div className={styles.actionsRow}>
          <button
            onClick={abrirCaja}
            className={`${styles.primaryBtn} focus-ring`}
            disabled={cajaAbierta || enProceso !== null}
          >
            {enProceso === "abrir" ? "Abriendo..." : "Abrir caja"}
          </button>

          <button
            onClick={cerrarCaja}
            className={`${styles.secondaryBtn} focus-ring`}
            disabled={!cajaAbierta || enProceso !== null}
          >
            {enProceso === "cerrar" ? "Cerrando..." : "Cerrar caja"}
          </button>
        </div>

        <p className={styles.helperText}>
          {cajaAbierta
            ? "Caja operativa y habilitada para registrar ventas."
            : "Caja cerrada. Debes abrirla antes de registrar ventas en POS."}
        </p>
      </section>

      <section className={`${styles.movementsCard} uiEnter`} data-stagger="2">
        <Toolbar
          title="Movimientos recientes"
          right={<StatusBadge text="Backoffice / comfy" variant="neutral" />}
        />

        <DataTable
          headers={["Fecha", "Tipo", "Concepto", "Monto"]}
          minWidth={820}
          density="comfy"
        >
          {movimientos.map((mov) => (
            <tr key={mov.id}>
              <td>{mov.fecha ? new Date(mov.fecha).toLocaleString() : "-"}</td>
              <td>
                <StatusBadge
                  text={mov.tipo || "MOV"}
                  variant={mov.tipo?.toUpperCase() === "EGRESO" ? "danger" : "success"}
                />
              </td>
              <td>{mov.concepto || "-"}</td>
              <td>{formatoMoneda(Number(mov.monto ?? 0))}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      </main>
    </div>
  );
}