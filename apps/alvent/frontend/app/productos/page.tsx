"use client";

import { useEffect, useRef, useState } from "react";
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
};

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  useEffect(() => {
    cargarProductos();
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
        costo: "",
        precio: "",
        stock: "",
        foto: "",
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
          headers={["Foto", "Codigo", "Nombre", "Talla", "Color", "Sexo", "Costo", "Precio", "Utilidad", "Margen", "Stock", "Estado", "Acciones"]}
          minWidth={1180}
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
                <td>{p.talla || "-"}</td>
                <td>{p.color || "-"}</td>
                <td>{p.sexo || "-"}</td>
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
