"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { productosService } from "@/services/productosService";
import { API_URL } from "@/services/api";
import { getApiErrorMessage } from "@/utils/apiError";
import { appPath } from "@/utils/appPath";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import Toolbar from "@/components/ui/Toolbar";
import ModalCard from "@/components/ui/ModalCard";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./page.module.css";

/* =========================
   TIPOS
========================= */
type Producto = {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  marca: string;
  talla?: string;
  color?: string;
  sexo?: string;
  costo: number;
  precio: number;
  stock: number;
  foto: string;
  atributos_extra?: Record<string, string>;
};

type ColumnaCustom = {
  key: string;
  label: string;
};

type ColumnaPresetKey = "categoria" | "marca" | "talla" | "color" | "sexo";
type ColumnaCoreKey =
  | "foto"
  | "codigo"
  | "nombre"
  | "costo"
  | "precio"
  | "utilidad"
  | "margen"
  | "stock"
  | "estado"
  | "acciones";

type TableColumn = {
  key: string;
  label: string;
  locked?: boolean;
};

type TipoNegocio = "tienda" | "restaurante" | "farmacia" | "supermercado" | "otro";

const COLUMNAS_FIJAS_TABLERO: ColumnaCoreKey[] = ["codigo", "foto", "costo", "precio", "utilidad"];

const TIPOS_NEGOCIO_OPTIONS: Array<{ value: TipoNegocio; label: string }> = [
  { value: "tienda", label: "Tienda" },
  { value: "restaurante", label: "Restaurante" },
  { value: "farmacia", label: "Farmacia" },
  { value: "supermercado", label: "Supermercado" },
  { value: "otro", label: "Otro" },
];

const COLUMNAS_POR_TIPO: Record<TipoNegocio, ColumnaPresetKey[]> = {
  tienda: ["talla", "color", "sexo"],
  restaurante: [],
  farmacia: [],
  supermercado: ["color"],
  otro: [],
};

const LABEL_COLUMNA: Record<ColumnaPresetKey, string> = {
  categoria: "Categoria",
  marca: "Marca",
  talla: "Talla",
  color: "Color",
  sexo: "Sexo",
};

const CORE_COLUMNS_BEFORE: Array<{ key: ColumnaCoreKey; label: string; locked?: boolean }> = [
  { key: "foto", label: "Foto", locked: true },
  { key: "codigo", label: "Codigo", locked: true },
  { key: "nombre", label: "Nombre", locked: true },
];

const CORE_COLUMNS_AFTER: Array<{ key: ColumnaCoreKey; label: string; locked?: boolean }> = [
  { key: "costo", label: "Costo", locked: true },
  { key: "precio", label: "Precio", locked: true },
  { key: "utilidad", label: "Utilidad", locked: true },
  { key: "margen", label: "Margen" },
  { key: "stock", label: "Stock" },
  { key: "estado", label: "Estado" },
  { key: "acciones", label: "Acciones", locked: true },
];

const ATRIBUTOS_SUGERIDOS_CATALOGO = [
  "Proveedor",
  "Modelo",
  "SKU fabricante",
  "Codigo barras",
  "Unidad medida",
  "Presentacion",
  "Contenido neto",
  "Peso",
  "Volumen",
  "Material",
  "Sabor",
  "Fragancia",
  "Temporada",
  "Coleccion",
  "Genero",
  "Lote",
  "Fecha vencimiento",
  "Registro sanitario",
  "Laboratorio",
  "Ubicacion almacen",
  "Pasillo",
  "Estante",
  "Nivel",
  "Garantia",
  "Compatibilidad",
  "Origen",
  "Pais",
  "Linea",
  "Subcategoria",
  "Notas internas",
];

type FormProducto = {
  codigo: string;
  nombre: string;
  categoria: string;
  marca: string;
  talla: string;
  color: string;
  sexo: string;
  costo: string;
  precio: string;
  stock: string;
  foto: string;
  atributos_extra: Record<string, string>;
};

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tipoNegocio, setTipoNegocio] = useState<string>("");
  const [tiposCustom, setTiposCustom] = useState<string[]>([]);
  const [newTipoNegocio, setNewTipoNegocio] = useState("");
  const [savingTableConfig, setSavingTableConfig] = useState(false);
  const [columnasCustom, setColumnasCustom] = useState<ColumnaCustom[]>([]);
  const [columnasVisibles, setColumnasVisibles] = useState<string[]>([]);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [selectedCatalogAttribute, setSelectedCatalogAttribute] = useState("");
  const [showPersonalizacion, setShowPersonalizacion] = useState(false);
  const [draggingColumnKey, setDraggingColumnKey] = useState<string | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<FormProducto>({
    codigo: "",
    nombre: "",
    categoria: "",
    marca: "",
    talla: "",
    color: "",
    sexo: "UNISEX",
    costo: "",
    precio: "",
    stock: "",
    foto: "",
    atributos_extra: {},
  });

  /* =========================
     HELPERS
  ========================= */
  const normalizeFotoPath = (foto: string) => {
    const limpia = String(foto || "").trim().replace(/\\/g, "/");
    if (!limpia) return "";
    if (/^https?:\/\//i.test(limpia)) return limpia;
    const withSlash = limpia.startsWith("/") ? limpia : `/${limpia}`;
    return withSlash.replace(/^\/uploads\/uploads\//, "/uploads/");
  };

  const normalizarKeyColumna = (value: string) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 40);

  const tipoNegocioValido = useMemo(() => String(tipoNegocio || "").trim().length > 0, [tipoNegocio]);

  const columnasPresetActivas = useMemo<ColumnaPresetKey[]>(() => {
    const fallback: TipoNegocio = "otro";
    const tipo = tipoNegocio in COLUMNAS_POR_TIPO ? (tipoNegocio as TipoNegocio) : fallback;
    return COLUMNAS_POR_TIPO[tipo] || COLUMNAS_POR_TIPO.otro;
  }, [tipoNegocio]);

  const columnasDisponibles = useMemo<TableColumn[]>(() => {
    const preset = columnasPresetActivas.map((key) => ({ key, label: LABEL_COLUMNA[key] }));
    const custom = columnasCustom.map((col) => ({ key: `custom:${col.key}`, label: col.label }));
    return [...CORE_COLUMNS_BEFORE, ...preset, ...custom, ...CORE_COLUMNS_AFTER];
  }, [columnasPresetActivas, columnasCustom]);

  const columnasDisponiblesMap = useMemo(() => {
    const map = new Map<string, TableColumn>();
    columnasDisponibles.forEach((col) => map.set(col.key, col));
    return map;
  }, [columnasDisponibles]);

  const columnasTabla = useMemo<TableColumn[]>(() => {
    const requested = columnasVisibles.length > 0 ? columnasVisibles : columnasDisponibles.map((c) => c.key);
    const seen = new Set<string>();
    const ordered: TableColumn[] = [];

    requested.forEach((key) => {
      const col = columnasDisponiblesMap.get(key);
      if (!col || seen.has(key)) return;
      seen.add(key);
      ordered.push(col);
    });

    columnasDisponibles.forEach((col) => {
      if (!seen.has(col.key)) {
        seen.add(col.key);
        ordered.push(col);
      }
    });

    return ordered;
  }, [columnasVisibles, columnasDisponibles, columnasDisponiblesMap]);

  const allTiposOptions = useMemo(() => {
    const base = TIPOS_NEGOCIO_OPTIONS.map((item) => ({ value: item.value, label: item.label }));
    const custom = tiposCustom
      .filter((tipo) => !TIPOS_NEGOCIO_OPTIONS.some((item) => item.value === tipo))
      .map((tipo) => ({
        value: tipo,
        label: tipo.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      }));
    return [...base, ...custom];
  }, [tiposCustom]);

  const guardarConfigTabla = async (next?: { tipo?: string; columnas?: ColumnaCustom[]; tipos?: string[]; visibles?: string[] }) => {
    try {
      setSavingTableConfig(true);
      setError("");
      setSuccess("");

      const tipoPayload = (next?.tipo ?? tipoNegocio) || "";
      const columnasPayload = next?.columnas ?? columnasCustom;
      const tiposPayload = next?.tipos ?? tiposCustom;
      const visiblesPayload = next?.visibles ?? columnasVisibles;

      const resp = await productosService.updateTableConfig({
        tipo_negocio: tipoPayload || undefined,
        columnas_custom: columnasPayload,
        tipos_custom: tiposPayload,
        columnas_visibles: visiblesPayload,
      });

      setTipoNegocio(String(resp.tipo_negocio || ""));
      setColumnasCustom(Array.isArray(resp.columnas_custom) ? resp.columnas_custom : []);
      setTiposCustom(Array.isArray(resp.tipos_custom) ? resp.tipos_custom : []);
      setColumnasVisibles(Array.isArray(resp.columnas_visibles) ? resp.columnas_visibles : []);
      setSuccess(resp.mensaje || "Configuracion de tabla guardada");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo guardar la configuracion de tabla"));
    } finally {
      setSavingTableConfig(false);
    }
  };

  const getImageUrl = (foto?: string) => {
    if (!foto) return "/no-image.png";

    const normalized = normalizeFotoPath(foto);
    if (!normalized) return "/no-image.png";
    if (/^https?:\/\//i.test(normalized)) return normalized;

    const envBase = API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL;
    const base =
      /^https?:\/\//i.test(envBase)
        ? envBase
        : (typeof window !== "undefined" && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"))
          ? "http://127.0.0.1:8000/alven/api"
          : envBase;

    return `${base}${normalized}`;
  };

  const fallbackImage = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const src = img.getAttribute("src") || "";

    if (src.includes("127.0.0.1")) {
      img.src = src.replace("127.0.0.1", "localhost");
      return;
    }

    if (src.includes("localhost")) {
      img.src = src.replace("localhost", "127.0.0.1");
      return;
    }

    img.onerror = null;
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80'%3E%3Crect width='100%25' height='100%25' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364758b' font-size='12'%3ESin imagen%3C/text%3E%3C/svg%3E";
  };

  /* =========================
     CARGAR PRODUCTOS
  ========================= */
  const cargarProductos = async () => {
    try {
      setLoading(true);
      setError("");
      const productosData = (await productosService.getAll()) as Producto[];
      setProductos(productosData);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Error cargando productos");
      setError(msg);

      if (msg.includes("asociado con un negocio")) {
        window.location.href = appPath("registro");
      }
    } finally {
      setLoading(false);
    }
  };

  const cargarConfigTabla = async () => {
    try {
      const cfg = await productosService.getTableConfig();
      setTipoNegocio(String(cfg?.tipo_negocio || ""));
      setColumnasCustom(Array.isArray(cfg?.columnas_custom) ? cfg.columnas_custom : []);
      setTiposCustom(Array.isArray(cfg?.tipos_custom) ? cfg.tipos_custom : []);
      setColumnasVisibles(Array.isArray(cfg?.columnas_visibles) ? cfg.columnas_visibles : []);
    } catch {
      setTipoNegocio("");
      setColumnasCustom([]);
      setTiposCustom([]);
      setColumnasVisibles([]);
    }
  };

  useEffect(() => {
    void cargarProductos();
    void cargarConfigTabla();
  }, []);

  /* =========================
     GUARDAR
  ========================= */
  const guardarProducto = async () => {
    try {
      const payload = {
        codigo: form.codigo,
        nombre: form.nombre,
        categoria: form.categoria,
        marca: form.marca,
        talla: form.talla.trim() || undefined,
        color: form.color.trim() || undefined,
        sexo: form.sexo.trim() || undefined,
        costo: Number(form.costo),
        precio: Number(form.precio),
        stock: Number(form.stock),
        foto: form.foto,
        atributos_extra: form.atributos_extra,
      };

      if (editMode) {
        await productosService.update(form.codigo, payload);
      } else {
        await productosService.create(payload);
      }

      setForm({
        codigo: "",
        nombre: "",
        categoria: "",
        marca: "",
        talla: "",
        color: "",
        sexo: "UNISEX",
        costo: "",
        precio: "",
        stock: "",
        foto: "",
        atributos_extra: {},
      });

      setOpenModal(false);
      setEditMode(false);

      await cargarProductos();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error guardando producto"));
    }
  };

/* =========================
   EDITAR
========================= */
  const editarProducto = (p: Producto) => {
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      categoria: p.categoria,
      marca: p.marca,
      talla: p.talla || "",
      color: p.color || "",
      sexo: p.sexo || "UNISEX",
      costo: String(p.costo),
      precio: String(p.precio),
      stock: String(p.stock),
      foto: p.foto || "",
      atributos_extra: p.atributos_extra || {},
    });

    setEditMode(true);
    setOpenModal(true);
  };

/* =========================
   ELIMINAR
========================= */
  const eliminarProducto = async (codigo: string) => {
    if (!confirm("Eliminar producto?")) return;

    try {
      await productosService.delete(codigo);
      await cargarProductos();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo eliminar"));
    }
  };

/* =========================
   FILTRO
========================= */
  const productosFiltrados = productos.filter(
    (p) =>
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo.toLowerCase().includes(search.toLowerCase()) ||
      String(p.color || "").toLowerCase().includes(search.toLowerCase()) ||
      String(p.talla || "").toLowerCase().includes(search.toLowerCase()) ||
      String(p.sexo || "").toLowerCase().includes(search.toLowerCase())
  );

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  const manejarArchivoFoto = async (file?: File | null) => {
    if (!file) return;
    try {
      setError("");
      const data = await productosService.uploadFoto(file);
      setForm((prev) => ({ ...prev, foto: data.url }));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error subiendo foto"));
    }
  };

  const agregarColumnaCustom = () => {
    const label = newColumnLabel.trim();
    if (!label) {
      setError("Ingresa un nombre para la columna personalizada");
      return;
    }

    const key = normalizarKeyColumna(label);
    if (!key) {
      setError("El nombre de columna no es valido");
      return;
    }

    const existeEnColumnasBaseActivas = columnasDisponibles.some((col) => col.key === key);
    if (existeEnColumnasBaseActivas) {
      setError("Ese atributo ya existe en la configuracion actual de tabla");
      return;
    }

    if (columnasCustom.some((c) => c.key === key)) {
      setError("Ya existe una columna personalizada con ese nombre");
      return;
    }

    setError("");
    setSuccess("");
    setColumnasCustom((prev) => [...prev, { key, label }]);
    setForm((prev) => ({
      ...prev,
      atributos_extra: {
        ...prev.atributos_extra,
        [key]: "",
      },
    }));
    setNewColumnLabel("");
    setSelectedCatalogAttribute("");
  };

  const agregarTipoNegocioCustom = () => {
    const normalizado = normalizarKeyColumna(newTipoNegocio);
    if (!normalizado) {
      setError("Ingresa un nombre valido para el nuevo tipo de negocio");
      return;
    }
    if (allTiposOptions.some((item) => item.value === normalizado)) {
      setError("Ese tipo de negocio ya existe en la lista");
      return;
    }

    setError("");
    setSuccess("");
    setTiposCustom((prev) => [...prev, normalizado]);
    setTipoNegocio(normalizado);
    setNewTipoNegocio("");
  };

  const removerColumnaCustom = (key: string) => {
    const nextColumns = columnasCustom.filter((item) => item.key !== key);
    setColumnasCustom(nextColumns);
    setColumnasVisibles((prev) => prev.filter((item) => item !== `custom:${key}`));
    setForm((prev) => {
      const nextExtra = { ...(prev.atributos_extra || {}) };
      delete nextExtra[key];
      return {
        ...prev,
        atributos_extra: nextExtra,
      };
    });
  };


  const cambiarValorAtributoExtra = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      atributos_extra: {
        ...(prev.atributos_extra || {}),
        [key]: value,
      },
    }));
  };

  useEffect(() => {
    if (columnasDisponibles.length === 0) return;
    setColumnasVisibles((prev) => {
      if (prev.length === 0) {
        const ordered = columnasDisponibles.map((c) => c.key);
        const resto = ordered.filter((key) => !COLUMNAS_FIJAS_TABLERO.includes(key as ColumnaCoreKey));
        return [...COLUMNAS_FIJAS_TABLERO, ...resto];
      }

      const available = new Set(columnasDisponibles.map((c) => c.key));
      const merged = prev.filter((key) => available.has(key));
      columnasDisponibles.forEach((col) => {
        if (!merged.includes(col.key)) {
          merged.push(col.key);
        }
      });

      const resto = merged.filter((key) => !COLUMNAS_FIJAS_TABLERO.includes(key as ColumnaCoreKey));
      return [...COLUMNAS_FIJAS_TABLERO, ...resto];
    });
  }, [columnasDisponibles]);

  const tableHeaders = columnasTabla.map((col) => col.label);

  const tableMinWidth = 980 + Math.max(0, columnasTabla.length - 10) * 92;

  const mostrarCampoConfigurado = (key: ColumnaPresetKey) =>
    columnasDisponiblesMap.has(key);

  const moverColumnaPorDrag = (fromKey: string, toKey: string) => {
    if (!fromKey || !toKey || fromKey === toKey) return;

    setColumnasVisibles((prev) => {
      const base = prev.length > 0 ? [...prev] : columnasTabla.map((col) => col.key);
      const fromIndex = base.indexOf(fromKey);
      const toIndex = base.indexOf(toKey);
      if (fromIndex < 0 || toIndex < 0) return base;

      const next = [...base];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const iniciarDragColumna = (key: string) => {
    setDraggingColumnKey(key);
    setDragOverColumnKey(null);
  };

  const finalizarDragColumna = () => {
    setDraggingColumnKey(null);
    setDragOverColumnKey(null);
  };

  const soltarDragEnColumna = (targetKey: string) => {
    if (!draggingColumnKey || draggingColumnKey === targetKey) return;
    moverColumnaPorDrag(draggingColumnKey, targetKey);
    setSuccess("Orden de columnas actualizado");
    setError("");
    finalizarDragColumna();
  };

  const renderCell = (p: Producto, col: TableColumn) => {
    const utilidad = p.precio - (p.costo ?? 0);
    const margen = p.precio > 0 ? (utilidad / p.precio) * 100 : 0;
    const estado = p.stock <= 5 ? "Bajo" : p.stock <= 15 ? "Medio" : "OK";
    const estadoVariant = estado === "Bajo" ? "danger" : estado === "Medio" ? "warning" : "success";

    if (col.key === "foto") {
      return p.foto ? (
        <Image
          src={getImageUrl(p.foto)}
          alt={p.nombre}
          width={120}
          height={80}
          unoptimized
          className={styles.tableImage}
          onError={fallbackImage}
        />
      ) : (
        <span className={styles.fallback}>IMG</span>
      );
    }

    if (col.key === "codigo") return p.codigo;
    if (col.key === "nombre") return p.nombre;
    if (col.key === "categoria") return p.categoria || "-";
    if (col.key === "marca") return p.marca || "-";
    if (col.key === "talla") return p.talla || "-";
    if (col.key === "color") return p.color || "-";
    if (col.key === "sexo") return p.sexo || "-";
    if (col.key === "costo") return formatMoney(Number(p.costo ?? 0));
    if (col.key === "precio") return formatMoney(Number(p.precio ?? 0));
    if (col.key === "utilidad") {
      return <span className={utilidad >= 0 ? styles.up : styles.down}>{formatMoney(utilidad)}</span>;
    }
    if (col.key === "margen") return `${margen.toFixed(1)}%`;
    if (col.key === "stock") return p.stock;
    if (col.key === "estado") {
      return <StatusBadge text={estado} variant={estadoVariant} />;
    }
    if (col.key === "acciones") {
      return (
        <div className={styles.actionRow}>
          <button type="button" onClick={() => editarProducto(p)} className={styles.rowButton}>
            Editar
          </button>
          <button
            type="button"
            onClick={() => eliminarProducto(p.codigo)}
            className={`${styles.rowButton} ${styles.deleteButton}`}
          >
            Eliminar
          </button>
        </div>
      );
    }

    if (col.key.startsWith("custom:")) {
      const customKey = col.key.slice("custom:".length);
      return p.atributos_extra?.[customKey] || "-";
    }

    return "-";
  };

  /* =========================
     UI
  ========================= */
  return (
    <main className={`${styles.shell} app-content`}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Comercial y stock</p>
          <h1>Productos premium</h1>
          <p>Administra catalogo, precios y utilidad desde una interfaz moderna.</p>
        </div>
        <ExecutiveThemeSwitch />
      </section>

      <section className="uiEnter" data-stagger="2">
        <Toolbar
          title="Catalogo de productos"
          className={styles.toolbar}
          right={(
            <>
              <input
                placeholder="Buscar por codigo o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`focus-ring ${styles.search}`}
              />

              <button
                type="button"
                className={`${styles.newButton} focus-ring`}
                onClick={() => {
                  setOpenModal(true);
                  setEditMode(false);
                  setForm({
                    codigo: "",
                    nombre: "",
                    categoria: "",
                    marca: "",
                    talla: "",
                    color: "",
                    sexo: "UNISEX",
                    costo: "",
                    precio: "",
                    stock: "",
                    foto: "",
                    atributos_extra: {},
                  });
                }}
              >
                Nuevo producto
              </button>
            </>
          )}
        />
      </section>

      {error ? <p className={styles.errorBox}>{error}</p> : null}
      {success ? <p className={styles.successBox}>{success}</p> : null}

      <section className={styles.configPanel}>
        <div className={styles.configPanelHeader}>
          <div>
            <strong>Personalizacion de tabla</strong>
            <p className={styles.hint}>Administra tipo, columnas y orden cuando lo necesites.</p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setShowPersonalizacion((prev) => !prev)}
          >
            {showPersonalizacion ? "Ocultar personalizacion" : "Abrir personalizacion"}
          </button>
        </div>

        {showPersonalizacion ? (
          <div className={styles.configPanelContent}>
            <div className={styles.configBlock}>
              <label htmlFor="tipo-negocio-productos">Tipo de negocio aplicado en tabla</label>
              <div className={styles.configInline}>
                <select
                  id="tipo-negocio-productos"
                  value={tipoNegocio}
                  onChange={(e) => setTipoNegocio(e.target.value)}
                  className="focus-ring"
                >
                  <option value="">Seleccionar tipo...</option>
                  {allTiposOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={savingTableConfig || !tipoNegocio}
                  onClick={() => void guardarConfigTabla({ tipo: tipoNegocio })}
                >
                  {savingTableConfig ? "Guardando..." : "Guardar tipo"}
                </button>
              </div>
              {!tipoNegocioValido ? (
                <p className={styles.hintWarning}>
                  Si no encuentras el tipo de negocio en la lista, crea uno nuevo y guárdalo.
                </p>
              ) : null}
              <div className={styles.configInline}>
                <input
                  value={newTipoNegocio}
                  onChange={(e) => setNewTipoNegocio(e.target.value)}
                  placeholder="Nuevo tipo (ej. ferreteria, libreria, veterinaria)"
                  className="focus-ring"
                />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={agregarTipoNegocioCustom}
                >
                  Crear tipo
                </button>
              </div>
            </div>

            <div className={styles.configBlock}>
              <label htmlFor="nueva-columna-custom">Agregar columna personalizada</label>
              <div className={styles.configInline}>
                <select
                  value={selectedCatalogAttribute}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedCatalogAttribute(next);
                    setNewColumnLabel(next);
                  }}
                  className="focus-ring"
                >
                  <option value="">Seleccionar atributo sugerido...</option>
                  {ATRIBUTOS_SUGERIDOS_CATALOGO.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <span className={styles.hint}>Puedes elegir del listado o escribir uno nuevo.</span>
              </div>
              <div className={styles.configInline}>
                <input
                  id="nueva-columna-custom"
                  value={newColumnLabel}
                  onChange={(e) => setNewColumnLabel(e.target.value)}
                  placeholder="Ejemplo: Laboratorio, Sabor, Presentacion"
                  className="focus-ring"
                />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={agregarColumnaCustom}
                >
                  Agregar
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={savingTableConfig}
                  onClick={() => void guardarConfigTabla({ columnas: columnasCustom })}
                >
                  {savingTableConfig ? "Guardando..." : "Guardar estructura"}
                </button>
              </div>

              {columnasCustom.length > 0 ? (
                <div className={styles.chipsRow}>
                  {columnasCustom.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      className={styles.chipButton}
                      onClick={() => removerColumnaCustom(col.key)}
                      title="Quitar columna"
                    >
                      {col.label} x
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.hint}>No hay columnas personalizadas todavia.</p>
              )}
            </div>

          </div>
        ) : null}
      </section>

      <ModalCard
        open={openModal}
        title={editMode ? "Editar producto" : "Nuevo producto"}
        subtitle="Completa los datos base y los campos definidos en la configuracion de tabla"
        actions={(
          <>
            <button type="button" onClick={guardarProducto} className={styles.saveButton}>
              Guardar
            </button>
            <button type="button" onClick={() => setOpenModal(false)} className={styles.cancelButton}>
              Cancelar
            </button>
          </>
        )}
      >
        <input
          placeholder="Codigo"
          disabled={editMode}
          value={form.codigo}
          onChange={(e) => setForm({ ...form, codigo: e.target.value })}
          className="focus-ring"
        />
        <input
          placeholder="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="focus-ring"
        />
        {mostrarCampoConfigurado("categoria") ? (
          <input
            placeholder="Categoria"
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className="focus-ring"
          />
        ) : null}
        {mostrarCampoConfigurado("marca") ? (
          <input
            placeholder="Marca"
            value={form.marca}
            onChange={(e) => setForm({ ...form, marca: e.target.value })}
            className="focus-ring"
          />
        ) : null}
        {mostrarCampoConfigurado("talla") ? (
          <input
            placeholder="Talla (ej. 38, M, L, 40)"
            value={form.talla}
            onChange={(e) => setForm({ ...form, talla: e.target.value })}
            className="focus-ring"
          />
        ) : null}
        {mostrarCampoConfigurado("color") ? (
          <input
            placeholder="Color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="focus-ring"
          />
        ) : null}
        {mostrarCampoConfigurado("sexo") ? (
          <select
            value={form.sexo}
            onChange={(e) => setForm({ ...form, sexo: e.target.value })}
            className="focus-ring"
          >
            <option value="UNISEX">Unisex</option>
            <option value="MUJER">Mujer</option>
            <option value="HOMBRE">Hombre</option>
            <option value="NINA">Nina</option>
            <option value="NINO">Nino</option>
          </select>
        ) : null}
        <input
          type="number"
          placeholder="Costo"
          value={form.costo}
          onChange={(e) => setForm({ ...form, costo: e.target.value })}
          className="focus-ring"
        />
        <input
          type="number"
          placeholder="Precio"
          value={form.precio}
          onChange={(e) => setForm({ ...form, precio: e.target.value })}
          className="focus-ring"
        />
        <input
          type="number"
          placeholder="Stock"
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: e.target.value })}
          className="focus-ring"
        />

        {columnasCustom.length > 0 ? (
          <div className={styles.customInputsGrid}>
            {columnasCustom.map((col) => (
              <input
                key={`attr-${col.key}`}
                placeholder={col.label}
                value={form.atributos_extra?.[col.key] || ""}
                onChange={(e) => cambiarValorAtributoExtra(col.key, e.target.value)}
                className="focus-ring"
              />
            ))}
          </div>
        ) : null}

        <div className={styles.photoActions}>
          <button
            type="button"
            className={styles.uploadButton}
            onClick={() => galleryInputRef.current?.click()}
          >
            Subir desde galeria
          </button>
        </div>

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className={styles.hiddenFileInput}
          onChange={(e) => void manejarArchivoFoto(e.target.files?.[0])}
        />

        {form.foto ? (
          <Image
            src={getImageUrl(form.foto)}
            alt="preview"
            width={120}
            height={80}
            unoptimized
            className={styles.preview}
            onError={fallbackImage}
          />
        ) : null}
      </ModalCard>

      <section className={`${styles.tableCard} uiEnter`} data-stagger="3">
        {loading ? <p>Cargando productos...</p> : null}
        <div className={styles.tableWrap}>
          <table style={{ minWidth: tableMinWidth }}>
            <thead>
              <tr>
                {columnasTabla.map((col) => {
                  const isDragging = draggingColumnKey === col.key;
                  const isDragOver = dragOverColumnKey === col.key;
                  return (
                    <th
                      key={`header-${col.key}`}
                      draggable
                      onDragStart={() => iniciarDragColumna(col.key)}
                      onDragEnd={finalizarDragColumna}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragOverColumnKey !== col.key) {
                          setDragOverColumnKey(col.key);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        soltarDragEnColumna(col.key);
                      }}
                      className={`${styles.draggableHeader} ${isDragging ? styles.draggingHeader : ""} ${isDragOver ? styles.dragOverHeader : ""}`}
                      title="Arrastra para mover esta columna"
                    >
                      <span className={styles.dragHandle} aria-hidden="true">↔</span>
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p) => {
                return (
                  <tr key={p.codigo}>
                    {columnasTabla.map((col) => (
                      <td key={`${p.codigo}-${col.key}`}>{renderCell(p, col)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
