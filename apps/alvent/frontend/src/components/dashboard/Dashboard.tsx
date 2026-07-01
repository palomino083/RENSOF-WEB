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

  useEffect(() => {
    async function load() {
      try {
        const [
          kpisData,
          ventasData,
          cajaData,
          topData,
          alertasData
        ] = await Promise.all([
          dashboardService.getKPIs(),
          dashboardService.getVentas(),
          dashboardService.getCaja(),
          dashboardService.getTopProductos(),
          dashboardService.getAlertas()
        ]);

        setKpis(kpisData);
        setVentas(ventasData);
        setCaja(cajaData);
        setTopProductos(topData);
        setAlertas(alertasData);

      } catch (error) {
        console.error("Error cargando dashboard:", error);
      }
    }

    load();
  }, []);

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