"use client";

import { useEffect, useState } from "react";
import { dashboardService } from "@/services/dashboardService";

import KPIGrid from "./KPIGrid";
import VentasChart from "./VentasChart";
import CajaCard from "./CajaCard";
import TopProductos from "./TopProductos";
import AlertasPanel from "./AlertasPanel";
import ResumenGeneral from "./ResumenGeneral";

export default function Dashboard() {
  const [kpis, setKpis] = useState<any>(null);
  const [ventas, setVentas] = useState<any[]>([]);
  const [caja, setCaja] = useState<any>(null);
  const [topProductos, setTopProductos] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const overview = await dashboardService.getOverview();
        if (cancelled) return;

        setKpis(overview?.kpis || null);
        setVentas(Array.isArray(overview?.ventas) ? overview.ventas : []);
        setCaja(overview?.caja || null);
        setTopProductos(Array.isArray(overview?.top_productos) ? overview.top_productos : []);
        setAlertas(Array.isArray(overview?.alertas) ? overview.alertas : []);
      } catch (error) {
        if (!cancelled) {
          setError("No se pudo cargar el dashboard");

          // Fallback de compatibilidad para instalaciones con backend legacy.
          try {
            const [
              kpisData,
              ventasData,
              cajaData,
              topData,
              alertasData,
            ] = await Promise.all([
              dashboardService.getKPIs(),
              dashboardService.getVentas(),
              dashboardService.getCaja(),
              dashboardService.getTopProductos(),
              dashboardService.getAlertas(),
            ]);

            if (cancelled) return;

            setKpis(kpisData);
            setVentas(Array.isArray(ventasData) ? ventasData : []);
            setCaja(cajaData || null);
            setTopProductos(Array.isArray(topData) ? topData : []);
            setAlertas(Array.isArray(alertasData) ? alertasData : []);
            setError("");
          } catch {
            // Si también falla el fallback, mantenemos el mensaje principal.
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-4">Cargando dashboard...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  return (
    <div className="p-4 space-y-6">

      {/* KPI PRINCIPAL */}
      <KPIGrid data={kpis} />

      {/* GRÁFICO + CAJA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VentasChart data={ventas} />
        <CajaCard data={caja} />
      </div>

      {/* TOP + ALERTAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopProductos data={topProductos} />
        <AlertasPanel data={alertas} />
      </div>

      {/* RESUMEN DERIVADO DEL MISMO KPI */}
      <ResumenGeneral data={kpis} />

    </div>
  );
}