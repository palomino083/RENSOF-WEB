"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { productosService } from "@/services/productosService";
import { API_URL } from "@/services/api";
import { getApiErrorMessage } from "@/utils/apiError";
import { appPath } from "@/utils/appPath";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import Toolbar from "@/components/ui/Toolbar";
import DataTable from "@/components/ui/DataTable";
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

type TipoNegocio = "tienda" | "restaurante" | "farmacia" | "supermercado" | "otro";

const TIPOS_NEGOCIO_OPTIONS: Array<{ value: TipoNegocio; label: string }> = [
  { value: "tienda", label: "Tienda" },
  { value: "restaurante", label: "Restaurante" },
  { value: "farmacia", label: "Farmacia" },
  { value: "supermercado", label: "Supermercado" },
  { value: "otro", label: "Otro" },
];

const COLUMNAS_POR_TIPO: Record<TipoNegocio, ColumnaPresetKey[]> = {
  tienda: ["categoria", "marca", "talla", "color", "sexo"],
  restaurante: ["categoria", "marca"],
  farmacia: ["categoria", "marca"],
  supermercado: ["categoria", "marca", "color"],
  otro: ["categoria", "marca"],
};

const LABEL_COLUMNA: Record<ColumnaPresetKey, string> = {
  categoria: "Categoria",
  marca: "Marca",
  talla: "Talla",
  color: "Color",
  sexo: "Sexo",
};

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
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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

  const guardarConfigTabla = async (next?: { tipo?: string; columnas?: ColumnaCustom[]; tipos?: string[] }) => {
    try {
      setSavingTableConfig(true);
      setError("");
      setSuccess("");

      const tipoPayload = (next?.tipo ?? tipoNegocio) || "";
      const columnasPayload = next?.columnas ?? columnasCustom;
      const tiposPayload = next?.tipos ?? tiposCustom;

      const resp = await productosService.updateTableConfig({
        tipo_negocio: tipoPayload || undefined,
        columnas_custom: columnasPayload,
        tipos_custom: tiposPayload,
      });

      setTipoNegocio(String(resp.tipo_negocio || ""));
      setColumnasCustom(Array.isArray(resp.columnas_custom) ? resp.columnas_custom : []);
      setTiposCustom(Array.isArray(resp.tipos_custom) ? resp.tipos_custom : []);
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

    const base = API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL;
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
    } catch {
      setTipoNegocio("");
      setColumnasCustom([]);
      setTiposCustom([]);
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

  const tableHeaders = [
    "Foto",
    "Codigo",
    "Nombre",
    ...columnasPresetActivas.map((key) => LABEL_COLUMNA[key]),
    ...columnasCustom.map((col) => col.label),
    "Costo",
    "Precio",
    "Utilidad",
    "Margen",
    "Stock",
    "Estado",
    "Acciones",
  ];

  const tableMinWidth = 980 + (columnasPresetActivas.length + columnasCustom.length) * 92;

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
      </section>

      <ModalCard
        open={openModal}
        title={editMode ? "Editar producto" : "Nuevo producto"}
        subtitle="Completa los datos comerciales y de stock"
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
        <input
          placeholder="Categoria"
          value={form.categoria}
          onChange={(e) => setForm({ ...form, categoria: e.target.value })}
          className="focus-ring"
        />
        <input
          placeholder="Marca"
          value={form.marca}
          onChange={(e) => setForm({ ...form, marca: e.target.value })}
          className="focus-ring"
        />
        <input
          placeholder="Talla (ej. 38, M, L, 40)"
          value={form.talla}
          onChange={(e) => setForm({ ...form, talla: e.target.value })}
          className="focus-ring"
        />
        <input
          placeholder="Color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          className="focus-ring"
        />
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
            onClick={() => cameraInputRef.current?.click()}
          >
            Tomar foto
          </button>
          <button
            type="button"
            className={styles.uploadButton}
            onClick={() => galleryInputRef.current?.click()}
          >
            Subir desde galeria
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className={styles.hiddenFileInput}
          onChange={(e) => void manejarArchivoFoto(e.target.files?.[0])}
        />

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
        <DataTable
          headers={tableHeaders}
          minWidth={tableMinWidth}
          density="executive"
        >
          {productosFiltrados.map((p) => {
            const utilidad = p.precio - (p.costo ?? 0);
            const margen = p.precio > 0 ? (utilidad / p.precio) * 100 : 0;
            const estado = p.stock <= 5 ? "Bajo" : p.stock <= 15 ? "Medio" : "OK";
            const estadoVariant = estado === "Bajo" ? "danger" : estado === "Medio" ? "warning" : "success";

            return (
              <tr key={p.codigo}>
                <td>
                  {p.foto ? (
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
                  )}
                </td>
                <td>{p.codigo}</td>
                <td>{p.nombre}</td>
                {columnasPresetActivas.map((col) => (
                  <td key={`${p.codigo}-${col}`}>{String((p as Record<string, unknown>)[col] || "-")}</td>
                ))}
                {columnasCustom.map((col) => (
                  <td key={`${p.codigo}-${col.key}`}>{p.atributos_extra?.[col.key] || "-"}</td>
                ))}
                <td>{formatMoney(Number(p.costo ?? 0))}</td>
                <td>{formatMoney(Number(p.precio ?? 0))}</td>
                <td className={utilidad >= 0 ? styles.up : styles.down}>{formatMoney(utilidad)}</td>
                <td>{margen.toFixed(1)}%</td>
                <td>{p.stock}</td>
                <td><StatusBadge text={estado} variant={estadoVariant} /></td>
                <td>
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
                </td>
              </tr>
            );
          })}
        </DataTable>
      </section>
    </main>
  );
}
