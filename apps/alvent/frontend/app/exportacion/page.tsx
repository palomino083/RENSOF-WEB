"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

import Menu from "../../src/components/Menu";
import ProtectedRoute from "../../src/components/ProtectedRoute";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";

import { dashboardService } from "../../src/services/dashboardService";
import { productosService } from "../../src/services/productosService";
import { ventasService } from "../../src/services/ventasService";
import { clientesService } from "../../src/services/clientesService";
import { usuariosService } from "../../src/services/usuariosService";
import styles from "./page.module.css";

type ExportModuleKey = "dashboard" | "productos" | "inventario" | "ventas" | "clientes" | "usuarios";

type ExportSection = {
  key: ExportModuleKey;
  label: string;
  rows: Array<Record<string, string | number | boolean | null>>;
};

type DateRangeFilter = {
  from: string;
  to: string;
};

const EXPORT_LABELS: Record<ExportModuleKey, string> = {
  dashboard: "Dashboard",
  productos: "Productos",
  inventario: "Inventario",
  ventas: "Ventas",
  clientes: "Clientes",
  usuarios: "Usuarios",
};

const EXPORT_KEYS: ExportModuleKey[] = ["dashboard", "productos", "inventario", "ventas", "clientes", "usuarios"];

export default function ExportacionPage() {
  const [exportSelection, setExportSelection] = useState<Record<ExportModuleKey, boolean>>({
    dashboard: true,
    productos: true,
    inventario: true,
    ventas: true,
    clientes: true,
    usuarios: true,
  });
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [autoPrintOnOpen, setAutoPrintOnOpen] = useState(false);

  const formatDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("es-PE");
  };

  const sanitizeSheetName = (value: string) => String(value || "Hoja").replace(/[\\/?*\[\]:]/g, "").slice(0, 31);

  const parseBoundaryDate = (value: string, endOfDay: boolean): Date | null => {
    if (!value) return null;
    const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const isDateRangeValid = (range: DateRangeFilter): boolean => {
    if (!range.from || !range.to) return true;
    return range.from <= range.to;
  };

  const isDateWithinRange = (value: unknown, range: DateRangeFilter): boolean => {
    if (!range.from && !range.to) return true;
    const candidate = new Date(String(value || ""));
    if (Number.isNaN(candidate.getTime())) return false;

    const fromDate = parseBoundaryDate(range.from, false);
    const toDate = parseBoundaryDate(range.to, true);

    if (fromDate && candidate < fromDate) return false;
    if (toDate && candidate > toDate) return false;
    return true;
  };

  const toggleExportModule = (key: ExportModuleKey) => {
    setExportSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const seleccionarTodoExport = (enabled: boolean) => {
    const next = {} as Record<ExportModuleKey, boolean>;
    EXPORT_KEYS.forEach((key) => {
      next[key] = enabled;
    });
    setExportSelection(next);
  };

  const getSelectedExportKeys = (): ExportModuleKey[] => EXPORT_KEYS.filter((key) => exportSelection[key]);
  const hasExportSelection = getSelectedExportKeys().length > 0;
  const selectedExportCount = getSelectedExportKeys().length;
  const rangeLabel = fechaInicio || fechaFin ? `${fechaInicio || "..."} a ${fechaFin || "..."}` : "Sin filtro";

  const buildExportSections = async (keys: ExportModuleKey[], dateRange: DateRangeFilter): Promise<ExportSection[]> => {
    const sections: ExportSection[] = [];

    let productosData: Array<any> | null = null;
    if (keys.includes("productos") || keys.includes("inventario")) {
      productosData = await productosService.getAll();
    }

    if (keys.includes("dashboard")) {
      const overview = await dashboardService.getOverview();
      sections.push({
        key: "dashboard",
        label: EXPORT_LABELS.dashboard,
        rows: [
          {
            productos: Number(overview?.kpis?.productos ?? 0),
            clientes: Number(overview?.kpis?.clientes ?? 0),
            ventas: Number(overview?.kpis?.ventas ?? 0),
            usuarios: Number(overview?.kpis?.usuarios ?? 0),
            monto_vendido: Number(overview?.kpis?.monto_vendido ?? 0),
            caja_abierta: Boolean(overview?.kpis?.caja_abierta),
            total_productos_inventario: Number(overview?.inventario?.total_productos ?? 0),
            stock_critico: Number(overview?.inventario?.stock_critico ?? 0),
            valor_inventario: Number(overview?.inventario?.valor_inventario ?? 0),
          },
        ],
      });
    }

    if (keys.includes("productos")) {
      const rows = (productosData || []).map((p) => {
        const utilidad = Number(p.precio ?? 0) - Number(p.costo ?? 0);
        const margen = Number(p.precio ?? 0) > 0 ? (utilidad / Number(p.precio ?? 0)) * 100 : 0;
        return {
          codigo: p.codigo,
          nombre: p.nombre,
          categoria: p.categoria || "-",
          marca: p.marca || "-",
          costo: Number(p.costo ?? 0),
          precio: Number(p.precio ?? 0),
          utilidad,
          margen: Number(margen.toFixed(1)),
          stock: Number(p.stock ?? 0),
        };
      });

      sections.push({ key: "productos", label: EXPORT_LABELS.productos, rows });
    }

    if (keys.includes("inventario")) {
      const rows = (productosData || []).map((p) => {
        const stockMinimo = Number(p.stock_minimo ?? 5);
        const stock = Number(p.stock ?? 0);
        const estado = stock <= stockMinimo ? "Bajo" : stock <= stockMinimo * 2 ? "Medio" : "OK";
        return {
          codigo: p.codigo,
          nombre: p.nombre,
          stock,
          stock_minimo: stockMinimo,
          estado,
        };
      });

      sections.push({ key: "inventario", label: EXPORT_LABELS.inventario, rows });
    }

    if (keys.includes("ventas")) {
      const ventasData = await ventasService.getAll();
      const rows = (Array.isArray(ventasData) ? ventasData : [])
        .filter((v: any) => isDateWithinRange(v?.fecha, dateRange))
        .map((v: any) => ({
        id: v.id,
        fecha: formatDateTime(String(v.fecha || "")),
        metodo_pago: v.metodo_pago || "-",
        estado: v.estado || "Registrada",
        subtotal: Number(v.subtotal ?? 0),
        descuento: Number(v.descuento ?? 0),
        total: Number(v.total ?? 0),
        items: Array.isArray(v.items) ? v.items.length : 0,
      }));
      sections.push({ key: "ventas", label: EXPORT_LABELS.ventas, rows });
    }

    if (keys.includes("clientes")) {
      const clientesData = await clientesService.getAll();
      const rows = (Array.isArray(clientesData) ? clientesData : []).map((c: any) => ({
        id: c.id,
        nombre: c.nombre || "-",
        dni: c.dni || "-",
        telefono: c.telefono || "-",
        email: c.email || "-",
        activo: c.activo !== false,
      }));
      sections.push({ key: "clientes", label: EXPORT_LABELS.clientes, rows });
    }

    if (keys.includes("usuarios")) {
      const usuariosData = await usuariosService.getAll();
      const rows = (Array.isArray(usuariosData) ? usuariosData : []).map((u: any) => ({
        id: u.id,
        nombres: u.nombres || "-",
        usuario: u.usuario || "-",
        rol: u.rol || "-",
        estado: u.activo === false ? "Inactivo" : "Activo",
      }));
      sections.push({ key: "usuarios", label: EXPORT_LABELS.usuarios, rows });
    }

    return sections;
  };

  const exportarConsolidadoExcel = async (all: boolean) => {
    const keys = all ? EXPORT_KEYS : getSelectedExportKeys();
    const dateRange: DateRangeFilter = { from: fechaInicio, to: fechaFin };
    if (keys.length === 0) {
      alert("Selecciona al menos un modulo para exportar.");
      return;
    }

    if (!isDateRangeValid(dateRange)) {
      alert("El rango de fechas es inválido. La fecha Desde no puede ser mayor que Hasta.");
      return;
    }

    try {
      setExportingExcel(true);
      const sections = await buildExportSections(keys, dateRange);
      const workbook = XLSX.utils.book_new();

      sections.forEach((section) => {
        const rows = section.rows.length > 0 ? section.rows : [{ mensaje: "Sin datos" }];
        const sheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(section.label));
      });

      const fileName = `exportacion_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error(err);
      }
      alert(err?.message || "No se pudo generar el Excel consolidado.");
    } finally {
      setExportingExcel(false);
    }
  };

  const escapeHtml = (value: string | number | boolean | null | undefined) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const exportarConsolidadoPdf = async (all: boolean, openInNewPage = false) => {
    const keys = all ? EXPORT_KEYS : getSelectedExportKeys();
    const dateRange: DateRangeFilter = { from: fechaInicio, to: fechaFin };

    let previewWindow: Window | null = null;
    if (openInNewPage) {
      // Abrimos la pestaña dentro del gesto del usuario para evitar bloqueo del navegador.
      previewWindow = window.open("", "_blank");
      if (!previewWindow) {
        alert("No se pudo abrir la nueva página. Habilita popups e intenta nuevamente.");
        return;
      }
    }

    if (keys.length === 0) {
      alert("Selecciona al menos un modulo para exportar.");
      if (previewWindow) {
        previewWindow.close();
      }
      return;
    }

    if (!isDateRangeValid(dateRange)) {
      alert("El rango de fechas es inválido. La fecha Desde no puede ser mayor que Hasta.");
      if (previewWindow) {
        previewWindow.close();
      }
      return;
    }

    try {
      setExportingPdf(true);
      const sections = await buildExportSections(keys, dateRange);
      const rangeLabel =
        dateRange.from || dateRange.to
          ? `Rango: ${dateRange.from || "-"} a ${dateRange.to || "-"}`
          : "Rango: Todo";

      const sectionsHtml = sections
        .map((section) => {
          const headers =
            section.rows.length > 0
              ? Array.from(
                  section.rows.reduce((acc, row) => {
                    Object.keys(row).forEach((key) => acc.add(key));
                    return acc;
                  }, new Set<string>())
                )
              : ["mensaje"];

          const rows = section.rows.length > 0 ? section.rows : [{ mensaje: "Sin datos" }];

          const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
          const tbody = rows
            .map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`)
            .join("");

          return `
            <section>
              <h2>${escapeHtml(section.label)}</h2>
              <table>
                <thead>${thead}</thead>
                <tbody>${tbody}</tbody>
              </table>
            </section>
          `;
        })
        .join("");

      const printableHtml = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Exportacion - ALVENT ERP</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
              h1 { margin: 0 0 10px; font-size: 22px; }
              h2 { margin: 18px 0 8px; font-size: 16px; }
              p { margin: 0 0 14px; font-size: 12px; color: #334155; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 10px; }
              th, td { border: 1px solid #cbd5e1; padding: 5px; text-align: left; }
              th { background: #e2e8f0; }
            </style>
          </head>
          <body>
            <h1>Exportacion - ALVENT ERP</h1>
            <p>Generado: ${new Date().toLocaleString("es-PE")} | Modulos: ${sections.length}</p>
            <p>${rangeLabel}</p>
            ${sectionsHtml}
            ${
              previewWindow && autoPrintOnOpen
                ? `<script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 700); });</script>`
                : ""
            }
          </body>
        </html>
      `;

      if (previewWindow) {
        previewWindow.document.open();
        previewWindow.document.write(printableHtml);
        previewWindow.document.close();
        previewWindow.focus();
        return;
      }

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);

      const frameWindow = iframe.contentWindow;
      const frameDocument = frameWindow?.document;

      if (!frameWindow || !frameDocument) {
        document.body.removeChild(iframe);
        throw new Error("No se pudo preparar la impresion del PDF.");
      }

      frameDocument.open();
      frameDocument.write(printableHtml);
      frameDocument.close();

      const runPrint = () => {
        frameWindow.focus();
        frameWindow.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      };

      if (frameDocument.readyState === "complete") {
        runPrint();
      } else {
        iframe.onload = runPrint;
      }
    } catch (err: any) {
      if (previewWindow) {
        previewWindow.close();
      }
      if (process.env.NODE_ENV !== "production") {
        console.error(err);
      }
      alert(err?.message || "No se pudo generar el PDF consolidado.");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Menu />
        <main className={`app-content ${styles.shell}`}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>Consolidación de información</p>
              <h1>Exportación</h1>
              <p>Selecciona módulos y genera archivos consolidados en Excel o PDF.</p>
            </div>
            <ExecutiveThemeSwitch />
          </section>

          <ExecutivePulseBar
            modulo="Exportacion"
            estado={exportingExcel || exportingPdf ? "Generando" : "Listo"}
            foco="Consolidacion controlada de datos para auditoria, direccion y despliegue." 
            accion={{ label: "Abrir reportes", href: "reportes" }}
            metricas={[
              { label: "Modulos", value: String(selectedExportCount) },
              { label: "Rango", value: rangeLabel },
              { label: "Auto print", value: autoPrintOnOpen ? "Activo" : "Inactivo" },
            ]}
          />

          <section className={styles.exportCenterCard}>
            <header className={styles.exportHeader}>
              <div>
                <h2>Exportación</h2>
                <p>Selecciona módulos y exporta en un solo archivo consolidado.</p>
              </div>
              <div className={styles.exportQuickActions}>
                <button
                  type="button"
                  className={`${styles.exportGhostBtn} focus-ring`}
                  onClick={() => seleccionarTodoExport(true)}
                >
                  Marcar todo
                </button>
                <button
                  type="button"
                  className={`${styles.exportGhostBtn} focus-ring`}
                  onClick={() => seleccionarTodoExport(false)}
                >
                  Limpiar
                </button>
              </div>
            </header>

            <div className={styles.exportChecksGrid}>
              {EXPORT_KEYS.map((key) => (
                <label key={key} className={styles.exportCheckItem}>
                  <input
                    type="checkbox"
                    checked={exportSelection[key]}
                    onChange={() => toggleExportModule(key)}
                  />
                  <span>{EXPORT_LABELS[key]}</span>
                </label>
              ))}
            </div>

            <div className={styles.dateRangeRow}>
              <label className={styles.dateField}>
                <span>Desde</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={fechaInicio}
                  onChange={(event) => setFechaInicio(event.target.value)}
                />
              </label>
              <label className={styles.dateField}>
                <span>Hasta</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={fechaFin}
                  onChange={(event) => setFechaFin(event.target.value)}
                />
              </label>
              <p className={styles.dateHint}>El rango aplica al módulo de Ventas.</p>
            </div>

            <div className={styles.exportActionsRow}>
              <button
                type="button"
                className={`${styles.exportBtn} focus-ring`}
                onClick={() => void exportarConsolidadoExcel(false)}
                disabled={exportingExcel || exportingPdf || !hasExportSelection}
              >
                {exportingExcel ? "Generando Excel..." : "Exportar Excel"}
              </button>
              <button
                type="button"
                className={`${styles.exportBtn} focus-ring`}
                onClick={() => void exportarConsolidadoPdf(false)}
                disabled={exportingExcel || exportingPdf || !hasExportSelection}
              >
                {exportingPdf ? "Generando PDF..." : "Exportar PDF"}
              </button>
              <button
                type="button"
                className={`${styles.exportPrimaryBtn} focus-ring`}
                onClick={() => void exportarConsolidadoPdf(false, true)}
                disabled={exportingExcel || exportingPdf || !hasExportSelection}
              >
                {exportingPdf ? "Generando vista..." : "Abrir en nueva página"}
              </button>
            </div>

            <label className={styles.openOptionRow}>
              <input
                type="checkbox"
                checked={autoPrintOnOpen}
                onChange={(event) => setAutoPrintOnOpen(event.target.checked)}
              />
              <span>Imprimir automáticamente al abrir en nueva página</span>
            </label>

            {!hasExportSelection ? (
              <p className={styles.exportHint}>Selecciona al menos un módulo para exportar.</p>
            ) : null}
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
