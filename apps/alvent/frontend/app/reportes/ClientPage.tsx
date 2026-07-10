"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ventasService } from "@/services/ventasService";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataTable from "@/components/ui/DataTable";
import Toolbar from "@/components/ui/Toolbar";
import StatusBadge from "@/components/ui/StatusBadge";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import Menu from "@/components/Menu";
import styles from "./page.module.css";

type ResumenBloque = {
  ventas: number;
  monto: number;
};

type ResumenVentas = {
  hoy: ResumenBloque;
  semana: ResumenBloque;
  mes: ResumenBloque;
  anio: ResumenBloque;
};

const resumenVacio: ResumenVentas = {
  hoy: { ventas: 0, monto: 0 },
  semana: { ventas: 0, monto: 0 },
  mes: { ventas: 0, monto: 0 },
  anio: { ventas: 0, monto: 0 },
};

function normalizarResumen(input: unknown): ResumenVentas {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<ResumenVentas>;

  const toBloque = (value: unknown): ResumenBloque => {
    const source = (value && typeof value === "object" ? value : {}) as Partial<ResumenBloque>;
    return {
      ventas: Number(source.ventas || 0),
      monto: Number(source.monto || 0),
    };
  };

  return {
    hoy: toBloque(raw.hoy),
    semana: toBloque(raw.semana),
    mes: toBloque(raw.mes),
    anio: toBloque(raw.anio),
  };
}

export default function ReportesPage() {
  const [resumen, setResumen] = useState<ResumenVentas>(resumenVacio);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargar = async () => {
      try {
        setError("");
        const data = await ventasService.resumenVentas();
        setResumen(normalizarResumen(data));
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, "No se pudo cargar el resumen"));
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, []);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(value || 0);

  const cards = useMemo(
    () => [
      { label: "Hoy", data: resumen.hoy, accent: styles.aqua },
      { label: "Semana", data: resumen.semana, accent: styles.blue },
      { label: "Mes", data: resumen.mes, accent: styles.mint },
      { label: "Anio", data: resumen.anio, accent: styles.rose },
    ],
    [resumen]
  );

  const promedioTicket =
    resumen.mes.ventas > 0 ? resumen.mes.monto / resumen.mes.ventas : 0;

  const trendData = [
    { periodo: "Hoy", monto: resumen.hoy.monto, ventas: resumen.hoy.ventas },
    { periodo: "Semana", monto: resumen.semana.monto, ventas: resumen.semana.ventas },
    { periodo: "Mes", monto: resumen.mes.monto, ventas: resumen.mes.ventas },
    { periodo: "Anio", monto: resumen.anio.monto, ventas: resumen.anio.ventas },
  ];

  const mayorBloque = [...trendData].sort((a, b) => b.monto - a.monto)[0];

  return (
    <div className="app-layout">
      <Menu />
      <main className={`${styles.shell} app-content`}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Centro de inteligencia</p>
        <h1>Reportes con narrativa de negocio</h1>
        <p>
          Une lectura financiera y operativa en una sola pantalla para decidir rápido
          y con confianza.
        </p>
      </section>

      <ExecutivePulseBar
        modulo="Reportes"
        estado={loading ? "Calculando" : "Actualizado"}
        foco="Narrativa ejecutiva para decisiones de margen, ritmo comercial y crecimiento."
        accion={{ label: "Ir a exportacion", href: "exportacion" }}
        metricas={[
          { label: "Ticket mes", value: formatMoney(promedioTicket), tone: "good" },
          { label: "Ventas mes", value: String(resumen.mes.ventas) },
          { label: "Pico", value: mayorBloque?.periodo || "-" },
        ]}
      />

      {error ? <p className={styles.errorBox}>{error}</p> : null}

      <section className={`${styles.grid} stagger`}>
        {cards.map((card) => (
          <article className={`${styles.kpi} ${card.accent}`} key={card.label}>
            <p>{card.label}</p>
            <h3>{formatMoney(card.data.monto)}</h3>
            <small>{card.data.ventas} ventas</small>
          </article>
        ))}
      </section>

      <section className={styles.chartPanel}>
        <div>
          <h2>Tendencia comercial</h2>
          <p>Lectura progresiva de facturacion por horizonte de tiempo.</p>
        </div>

        <div className={styles.chartWrap}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="montoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" />
              <XAxis dataKey="periodo" stroke="#475569" />
              <YAxis stroke="#475569" width={74} tickFormatter={(value) => `S/${value}`} />
              <Tooltip
                formatter={(value) => [formatMoney(Number(value ?? 0)), "Monto"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #cbd5e1" }}
              />
              <Area
                type="monotone"
                dataKey="monto"
                stroke="#0284c7"
                strokeWidth={3}
                fill="url(#montoGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartInsight}>
          <span>Pico actual</span>
          <strong>{mayorBloque?.periodo || "-"}</strong>
          <p>{formatMoney(mayorBloque?.monto || 0)}</p>
        </div>
      </section>

      <section className={`${styles.matrixCard} uiEnter`} data-stagger="2">
        <Toolbar title="Matriz de periodos" right={<StatusBadge text="Executive" variant="info" />} />
        <DataTable
          headers={["Periodo", "Ventas", "Monto", "Ticket promedio"]}
          minWidth={760}
          density="executive"
        >
          {trendData.map((row) => (
            <tr key={row.periodo}>
              <td>{row.periodo}</td>
              <td>{row.ventas}</td>
              <td>{formatMoney(row.monto)}</td>
              <td>{formatMoney(row.ventas > 0 ? row.monto / row.ventas : 0)}</td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className={`${styles.story} stagger`}>
        <article>
          <h2>Salud comercial</h2>
          {loading ? (
            <p>Cargando indicadores...</p>
          ) : (
            <>
              <p>
                Ticket promedio del mes: <strong>{formatMoney(promedioTicket)}</strong>
              </p>
              <p>
                Flujo anual acumulado: <strong>{formatMoney(resumen.anio.monto)}</strong>
              </p>
            </>
          )}
        </article>

        <article className={styles.cta}>
          <h3>Explora reportes avanzados</h3>
          <p>
            Visualiza margen real, costos y detalle por venta con una lectura lista para
            tomar decisiones.
          </p>
          <Link href="/reportes/ganancias" className={styles.ctaButton}>
            Ir a Ganancias Reales
          </Link>
        </article>
      </section>
      </main>
    </div>
  );
}
