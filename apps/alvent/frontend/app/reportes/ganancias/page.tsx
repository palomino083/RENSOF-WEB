"use client";

import { useEffect, useState } from "react";
import { ventasService } from "@/services/ventasService";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataTable from "@/components/ui/DataTable";
import Toolbar from "@/components/ui/Toolbar";
import styles from "./page.module.css";

type GananciaDetalle = {
  venta_id: number;
  fecha: string;
  venta: number;
  costo: number;
  ganancia: number;
};

type ReporteGananciasData = {
  total_ventas: number;
  total_costos: number;
  ganancia_total: number;
  detalle: GananciaDetalle[];
};

export default function ReporteGanancias() {
  const [data, setData] = useState<ReporteGananciasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(value || 0);

  useEffect(() => {
    const cargar = async () => {
      try {
        setError("");
        const res = await ventasService.reporteGanancias();
        setData(res as ReporteGananciasData);
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, "No se pudo cargar el reporte"));
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, []);

  const chartData = (data?.detalle || []).slice(0, 10).map((venta) => ({
    venta: `#${venta.venta_id}`,
    ingreso: venta.venta,
    costo: venta.costo,
    ganancia: venta.ganancia,
  }));

  if (loading) {
    return (
      <main className={`${styles.shell} app-content`}>
        <section className={styles.loader}>Construyendo reporte de ganancias...</section>
      </main>
    );
  }

  return (
    <main className={`${styles.shell} app-content`}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Performance financiero</p>
        <h1>Ganancias reales</h1>
        <p>Controla ingresos, costos y margen por venta en una sola lectura ejecutiva.</p>
      </section>

      {error ? <p className={styles.errorBox}>{error}</p> : null}

      {data ? (
        <>
          <section className={`${styles.kpiGrid} stagger`}>
            <article className={styles.kpiCard}>
              <p>Total ventas</p>
              <h3>{formatMoney(data.total_ventas)}</h3>
            </article>
            <article className={styles.kpiCard}>
              <p>Total costos</p>
              <h3>{formatMoney(data.total_costos)}</h3>
            </article>
            <article className={styles.kpiCardWide}>
              <p>Ganancia total</p>
              <h3>{formatMoney(data.ganancia_total)}</h3>
              <small>
                Margen estimado: {data.total_ventas > 0
                  ? `${((data.ganancia_total / data.total_ventas) * 100).toFixed(1)}%`
                  : "0.0%"}
              </small>
            </article>
          </section>

          <section className={styles.chartCard}>
            <h2>Comparativo de margen por venta</h2>
            <p>Visual de las ultimas 10 ventas para identificar presion de costos.</p>
            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" />
                  <XAxis dataKey="venta" stroke="#475569" />
                  <YAxis stroke="#475569" width={74} tickFormatter={(value) => `S/${value}`} />
                  <Tooltip
                    formatter={(value, name) => [formatMoney(Number(value ?? 0)), String(name)]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #cbd5e1" }}
                  />
                  <Legend />
                  <Bar name="Ingreso" dataKey="ingreso" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                  <Bar name="Costo" dataKey="costo" fill="#f97316" radius={[6, 6, 0, 0]} />
                  <Line
                    name="Ganancia"
                    type="monotone"
                    dataKey="ganancia"
                    stroke="#16a34a"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={styles.tableCard}>
            <Toolbar title="Detalle por venta" />
            <DataTable
              headers={["Venta", "Fecha", "Ingreso", "Costo", "Ganancia"]}
              minWidth={720}
              density="executive"
            >
              {data.detalle.map((venta) => (
                <tr key={venta.venta_id}>
                  <td>#{venta.venta_id}</td>
                  <td>{venta.fecha || "-"}</td>
                  <td>{formatMoney(venta.venta)}</td>
                  <td>{formatMoney(venta.costo)}</td>
                  <td className={venta.ganancia >= 0 ? styles.up : styles.down}>
                    {formatMoney(venta.ganancia)}
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>
        </>
      ) : null}
    </main>
  );
}