"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ventasService } from "@/services/ventasService";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import Toolbar from "@/components/ui/Toolbar";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Menu from "@/components/Menu";
import styles from "./page.module.css";

type VentaItem = {
  producto_id: number;
  nombre?: string;
  cantidad: number;
  precio?: number;
};

type Venta = {
  id: number;
  fecha: string;
  metodo_pago: string;
  estado: string;
  subtotal: number;
  descuento: number;
  total: number;
  items: VentaItem[];
};

type Resumen = {
  hoy: { ventas: number; monto: number };
  semana: { ventas: number; monto: number };
  mes: { ventas: number; monto: number };
  anio: { ventas: number; monto: number };
};

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // ==========================
  // CARGA INICIAL
  // ==========================
  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      const [lista, resumenData] = await Promise.all([
        ventasService.detalleVentas({
          fecha_inicio: fechaInicio || undefined,
          fecha_fin: fechaFin || undefined,
        }),
        ventasService.resumenVentas(),
      ]);

      setVentas(Array.isArray(lista) ? lista : []);
      setResumen(resumenData);
    } catch (error) {
      console.error("Error cargando ventas:", error);
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const ventasFiltradas = ventas;

  // ==========================
  // TOTAL GENERAL
  // ==========================
  const totalGeneral = ventas.reduce(
    (acc, v) => acc + Number(v.total ?? 0),
    0
  );

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(value || 0);

  const ticketPromedioMes =
    resumen && resumen.mes.ventas > 0 ? resumen.mes.monto / resumen.mes.ventas : 0;

  return (
    <div className="app-layout">
      <Menu />
      <main className={`${styles.shell} app-content`}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Analítica comercial</p>
          <h1>Ventas premium</h1>
          <p>Monitorea rendimiento diario y revisa cada venta en detalle sin fricción.</p>
        </div>
        <ExecutiveThemeSwitch />
      </section>

      <ExecutivePulseBar
        modulo="Ventas"
        estado={loading ? "Actualizando" : "Operativo"}
        foco="Seguimiento comercial por rango y lectura ejecutiva de conversion diaria."
        accion={{ label: "Ver reportes", href: "reportes" }}
        metricas={[
          { label: "Operaciones", value: String(ventasFiltradas.length) },
          {
            label: "Mes",
            value: resumen ? formatMoney(resumen.mes.monto) : "S/0.00",
            tone: "good",
          },
          {
            label: "Ticket",
            value: formatMoney(ticketPromedioMes),
            tone: ticketPromedioMes > 0 ? "neutral" : "warn",
          },
        ]}
      />

      {resumen ? (
        <section className={`${styles.kpiGrid} stagger`}>
          <article className={styles.kpiCard}>
            <p>Hoy</p>
            <h3>{formatMoney(resumen.hoy.monto)}</h3>
            <small>{resumen.hoy.ventas} ventas</small>
          </article>
          <article className={styles.kpiCard}>
            <p>Semana</p>
            <h3>{formatMoney(resumen.semana.monto)}</h3>
            <small>{resumen.semana.ventas} ventas</small>
          </article>
          <article className={styles.kpiCard}>
            <p>Mes</p>
            <h3>{formatMoney(resumen.mes.monto)}</h3>
            <small>{resumen.mes.ventas} ventas</small>
          </article>
          <article className={`${styles.kpiCard} ${styles.totalCard}`}>
            <p>Total general</p>
            <h3>{formatMoney(totalGeneral)}</h3>
            <small>{ventas.length} operaciones</small>
          </article>
        </section>
      ) : null}

      <section className={`${styles.panel} uiEnter`} data-stagger="2">
        <Toolbar
          title="Historial de ventas"
          right={
            <div className={styles.toolbarActions}>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className={`focus-ring ${styles.search}`}
                aria-label="Fecha inicio"
              />
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className={`focus-ring ${styles.search}`}
                aria-label="Fecha fin"
              />
              <button
                type="button"
                className={`${styles.detailBtn} focus-ring`}
                onClick={cargarDatos}
              >
                Aplicar rango
              </button>
            </div>
          }
        />

        {loading ? <p className={styles.empty}>Cargando ventas...</p> : null}
        {!loading && ventasFiltradas.length === 0 ? (
          <p className={styles.empty}>No hay ventas para los filtros seleccionados.</p>
        ) : null}

        <DataTable
          headers={["ID", "Fecha", "Metodo", "Estado", "Total", "Acciones"]}
          minWidth={920}
          density="comfy"
        >
          {ventasFiltradas.map((venta) => (
            <Fragment key={`venta-${venta.id}`}>
              <tr>
                <td>#{venta.id}</td>
                <td>{new Date(venta.fecha).toLocaleString()}</td>
                <td>{venta.metodo_pago || "-"}</td>
                <td>
                  <StatusBadge
                    text={venta.estado || "Registrada"}
                    variant={venta.estado?.toUpperCase() === "ANULADA" ? "danger" : "success"}
                  />
                </td>
                <td>{formatMoney(Number(venta.total ?? 0))}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={`${styles.detailBtn} focus-ring`}
                      onClick={() => setExpanded(expanded === venta.id ? null : venta.id)}
                    >
                      {expanded === venta.id ? "Ocultar" : "Ver detalle"}
                    </button>
                  </div>
                </td>
              </tr>

              {expanded === venta.id ? (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.saleBody}>
                      <p>Pago: {venta.metodo_pago}</p>
                      <p>Estado: {venta.estado || "Registrada"}</p>

                      <ul>
                        {venta.items?.map((item, i) => (
                          <li key={`${venta.id}-${item.producto_id}-${i}`}>
                            <span>{item.nombre ?? `Producto ${item.producto_id}`}</span>
                            <span>
                              {item.cantidad} x {formatMoney(Number(item.precio ?? 0))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </DataTable>
      </section>
      </main>
    </div>
  );
}