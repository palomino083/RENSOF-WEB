"use client";

import { useEffect, useState } from "react";
import { productosService } from "@/services/productosService";
import { inventarioService } from "@/services/inventarioService";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import DataTable from "@/components/ui/DataTable";
import Toolbar from "@/components/ui/Toolbar";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./page.module.css";

type Producto = {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  marca: string;
  costo: number;
  precio: number;
  stock: number;
  stock_minimo?: number;
};

type Movimiento = {
  id: number;
  tipo: string;
  cantidad: number;
  referencia: string;
  fecha: string;
};

type ResumenInventario = {
  producto: string;
  stock_actual: number;
  entradas: number;
  salidas: number;
  movimiento_neto: number;
};

export default function Inventario() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [kardex, setKardex] = useState<Movimiento[]>([]);
  const [resumen, setResumen] = useState<ResumenInventario | null>(null);
  const [filtroKardex, setFiltroKardex] = useState<"TODOS" | "ENTRADA" | "SALIDA">("TODOS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [codigoSeleccionado, setCodigoSeleccionado] = useState("");

  const kardexFiltrado =
    filtroKardex === "TODOS" ? kardex : kardex.filter((mov) => mov.tipo === filtroKardex);

  const loadInventario = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await productosService.getAll();
      setProductos(data);
    } catch (err) {
      console.error(err);
      setError("Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  const cargarResumen = async (productoId: number): Promise<void> => {
    try {
      const data = await inventarioService.resumen(productoId);
      setResumen(data);
    } catch (err) {
      console.error("Error cargando resumen:", err);
      setResumen(null);
    }
  };

  const cargarKardex = async (productoId: number): Promise<void> => {
    try {
      const data = await inventarioService.kardex(productoId);
      setKardex(data);
    } catch (err) {
      console.error("Error cargando kardex:", err);
      setKardex([]);
    }
  };

  useEffect(() => {
    loadInventario();
  }, []);

  const productosFiltrados = codigoSeleccionado
    ? productos.filter((p) => p.codigo === codigoSeleccionado)
    : productos;

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  return (
    <main className={`${styles.shell} app-content`}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Control de existencias</p>
          <h1>Inventario premium</h1>
          <p>Monitorea stock, flujo de entradas y salidas con enfoque operacional.</p>
        </div>
        <ExecutiveThemeSwitch />
      </section>

      <section className={styles.selectorPanel}>
        <label htmlFor="selector">Seleccionar producto</label>
        <select
          id="selector"
          value={codigoSeleccionado}
          onChange={(e) => {
            const codigo = e.target.value;
            setCodigoSeleccionado(codigo);

            if (!codigo) {
              setKardex([]);
              setResumen(null);
              return;
            }

            const producto = productos.find((p) => p.codigo === codigo);
            if (producto) {
              cargarKardex(producto.id);
              cargarResumen(producto.id);
            }
          }}
          className="focus-ring"
        >
          <option value="">Seleccionar producto</option>
          {productos.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.codigo} - {p.nombre}
            </option>
          ))}
        </select>
      </section>

      {resumen ? (
        <section className={`${styles.summaryGrid} stagger`}>
          <article className={styles.summaryCard}>
            <p>Stock actual</p>
            <h3>{resumen.stock_actual}</h3>
          </article>
          <article className={styles.summaryCard}>
            <p>Entradas</p>
            <h3>{resumen.entradas}</h3>
          </article>
          <article className={styles.summaryCard}>
            <p>Salidas</p>
            <h3>{resumen.salidas}</h3>
          </article>
          <article className={styles.summaryCard}>
            <p>Movimiento neto</p>
            <h3>{resumen.movimiento_neto}</h3>
          </article>
        </section>
      ) : null}

      {kardex.length > 0 ? (
        <section className={`${styles.kardexCard} uiEnter`} data-stagger="2">
          <Toolbar
            title="Kardex"
            right={(
              <select
                value={filtroKardex}
                onChange={(e) =>
                  setFiltroKardex(e.target.value as "TODOS" | "ENTRADA" | "SALIDA")
                }
                className="focus-ring"
              >
                <option value="TODOS">Todos</option>
                <option value="ENTRADA">Entradas</option>
                <option value="SALIDA">Salidas</option>
              </select>
            )}
          />

          <DataTable
            headers={["Fecha", "Tipo", "Cantidad", "Referencia"]}
            minWidth={860}
            density="compact"
          >
            {kardexFiltrado.map((mov) => (
              <tr key={mov.id}>
                <td>{new Date(mov.fecha).toLocaleString()}</td>
                <td>
                  <StatusBadge
                    text={mov.tipo}
                    variant={mov.tipo === "ENTRADA" ? "success" : "danger"}
                  />
                </td>
                <td>{mov.cantidad}</td>
                <td>{mov.referencia}</td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : null}

      {loading ? <p className={styles.msg}>Cargando inventario...</p> : null}
      {error ? <p className={styles.errorBox}>{error}</p> : null}

      {!loading && !error ? (
        <section className={`${styles.tableCard} uiEnter`} data-stagger="3">
          <DataTable
            headers={["Codigo", "Nombre", "Categoria", "Marca", "Costo", "Precio", "Utilidad", "Margen", "Stock", "Estado"]}
            minWidth={980}
            density="executive"
          >
            {productosFiltrados.map((p) => {
              const utilidad = Number(p.precio ?? 0) - Number(p.costo ?? 0);
              const margen = p.precio > 0 ? (utilidad / p.precio) * 100 : 0;
              const stockMinimo = p.stock_minimo ?? 5;
              const estado = p.stock <= stockMinimo ? "Bajo" : p.stock <= stockMinimo * 2 ? "Medio" : "OK";
              const estadoVariant = estado === "Bajo" ? "danger" : estado === "Medio" ? "warning" : "success";

              return (
                <tr key={p.codigo}>
                  <td>{p.codigo}</td>
                  <td>{p.nombre}</td>
                  <td>{p.categoria}</td>
                  <td>{p.marca}</td>
                  <td>{formatMoney(Number(p.costo ?? 0))}</td>
                  <td>{formatMoney(Number(p.precio ?? 0))}</td>
                  <td className={utilidad >= 0 ? styles.up : styles.down}>{formatMoney(utilidad)}</td>
                  <td>{margen.toFixed(1)}%</td>
                  <td>{p.stock}</td>
                  <td><StatusBadge text={estado} variant={estadoVariant} /></td>
                </tr>
              );
            })}
          </DataTable>
        </section>
      ) : null}
    </main>
  );
}
