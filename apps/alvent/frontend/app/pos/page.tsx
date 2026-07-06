"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { productosService } from "@/services/productosService";
import { ventasService } from "@/services/ventasService";
import { clientesService } from "@/services/clientesService";
import { negocioService } from "@/services/negocioService";
import { generarComprobanteHtml, imprimirComprobanteHtml } from "@/utils/comprobantePdf";
import { getApiErrorMessage } from "@/utils/apiError";
import { appPath } from "@/utils/appPath";
import { applyFallbackImage, toMediaUrl } from "@/utils/mediaUrl";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import Toolbar from "@/components/ui/Toolbar";
import StatusBadge from "@/components/ui/StatusBadge";
import DataTable from "@/components/ui/DataTable";
import ModalCard from "@/components/ui/ModalCard";
import styles from "./page.module.css";

type Producto = {
  id: number;
  codigo?: string;
  codigo_barras?: string;
  nombre: string;
  categoria?: string;
  marca?: string;
  talla?: string;
  color?: string;
  sexo?: string;
  precio: number;
  costo?: number;
  stock: number;
  foto?: string;
  atributos_extra?: Record<string, string>;
};

type ItemCarrito = {
  id: number;
  nombre: string;
  precio: number;
  cantidad: number;
};

type TipoComprobante = "NINGUNO" | "BOLETA" | "FACTURA";

type NegocioBranding = {
  nombre: string;
  razon_social?: string | null;
  logo_url?: string | null;
};

type VentaReciente = {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: string;
  estado?: string;
};

export default function PosPage() {
  const router = useRouter();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [descuento, setDescuento] = useState(0);
  const [metodo_pago, setMetodo_pago] = useState("Efectivo");
  const [montoRecibido, setMontoRecibido] = useState(0);
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>("NINGUNO");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteDocumento, setClienteDocumento] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteWhatsapp, setClienteWhatsapp] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [enviarWhatsapp, setEnviarWhatsapp] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [accionVentaId, setAccionVentaId] = useState<number | null>(null);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [codigoRapido, setCodigoRapido] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scannerActivo, setScannerActivo] = useState(false);
  const [scanStatus, setScanStatus] = useState("Escaner listo");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [negocioBranding, setNegocioBranding] = useState<NegocioBranding | null>(null);
  const [ventasRecientes, setVentasRecientes] = useState<VentaReciente[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);

  const requiereComprobante = tipoComprobante !== "NINGUNO";

  useEffect(() => {
    cargarProductos();
    cargarBrandingNegocio();
    cargarVentasRecientes();
  }, []);

  const toAbsoluteUrl = (url: string) => {
    return toMediaUrl(url) || url;
  };

  const cargarBrandingNegocio = async () => {
    try {
      const negocioId = Number(localStorage.getItem("negocio_id") || 0);
      if (!negocioId) return;

      const negocio = await negocioService.getById(negocioId);
      setNegocioBranding({
        nombre: negocio.nombre,
        razon_social: negocio.razon_social,
        logo_url: negocio.logo_url,
      });
    } catch (err: unknown) {
      console.warn("No se pudo cargar branding de negocio", err);
    }
  };

  const stopScanner = () => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScannerActivo(false);
  };

  const buscarYAgregarPorCodigo = (codigo: string, origen: "scan" | "manual" = "manual") => {
    const target = String(codigo || "").trim();
    if (!target) return;

    const upper = target.toUpperCase();
    const exacto = productos.find((p) => String(p.codigo || "").toUpperCase() === upper);
    const parcial = productos.find((p) => String(p.codigo || "").toUpperCase().includes(upper));
    const producto = exacto || parcial;

    if (!producto) {
      setError(`No se encontro producto para codigo: ${target}`);
      return;
    }

    agregarCarrito(producto);
    setSuccess(`${producto.nombre} agregado por codigo ${target}`);
    setError("");

    if (origen === "scan") {
      setScanStatus(`Codigo detectado: ${target}`);
      setScanOpen(false);
      stopScanner();
    }
  };

  const startScanner = async () => {
    try {
      setError("");
      setScanStatus("Iniciando camara...");

      const BarcodeDetectorCtor = (window as any).BarcodeDetector;
      if (!BarcodeDetectorCtor) {
        setScanStatus("Tu navegador no soporta BarcodeDetector");
        return;
      }

      detectorRef.current = new BarcodeDetectorCtor({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"],
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScannerActivo(true);
      setScanStatus("Escaneando... apunta al codigo de barras");

      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || !detectorRef.current) return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (Array.isArray(barcodes) && barcodes.length > 0) {
            const rawValue = String(barcodes[0]?.rawValue || "").trim();
            if (rawValue) {
              buscarYAgregarPorCodigo(rawValue, "scan");
            }
          }
        } catch {
          // Ignore transient detect errors from frames.
        }
      }, 500);
    } catch (err: unknown) {
      setScanStatus("No se pudo iniciar el escaner");
      setError(getApiErrorMessage(err, "Permite acceso a camara para escanear"));
      stopScanner();
    }
  };

  const getImageUrl = (foto?: string) => {
    return toMediaUrl(foto) || "";
  };

  useEffect(() => {
    if (scanOpen) {
      void startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOpen]);

  // =========================
  // PRODUCTOS
  // =========================
  const cargarProductos = async () => {
    try {
      setError("");
      const data = await productosService.getAll();
      setProductos(data);
    } catch (err: unknown) {
      setProductos([]);
      setError(getApiErrorMessage(err, "No se pudo cargar productos"));
    }
  };

  const cargarVentasRecientes = async () => {
    try {
      setLoadingVentas(true);
      const data = await ventasService.detalleVentas();
      const recientes = (Array.isArray(data) ? data : []).slice(0, 8).map((v: any) => ({
        id: Number(v.id),
        fecha: String(v.fecha || ""),
        total: Number(v.total || 0),
        metodo_pago: String(v.metodo_pago || "-"),
        estado: String(v.estado || "pagada").toLowerCase(),
      }));
      setVentasRecientes(recientes);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar ventas recientes"));
      setVentasRecientes([]);
    } finally {
      setLoadingVentas(false);
    }
  };

  const aplicarPostVenta = async (venta: VentaReciente, tipo: "anular" | "devolver") => {
    const etiqueta = tipo === "anular" ? "anular" : "devolver";
    if (!confirm(`¿Deseas ${etiqueta} la venta #${venta.id}? Esta accion repone stock.`)) {
      return;
    }

    try {
      setAccionVentaId(venta.id);
      setError("");
      setSuccess("");
      const motivo = prompt("Motivo (opcional):") || undefined;

      if (tipo === "anular") {
        await ventasService.anularVenta(venta.id, motivo);
        setSuccess(`Venta #${venta.id} anulada correctamente`);
      } else {
        await ventasService.devolverVenta(venta.id, motivo);
        setSuccess(`Devolucion de venta #${venta.id} registrada`);
      }

      await Promise.all([cargarVentasRecientes(), cargarProductos()]);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo procesar la postventa"));
    } finally {
      setAccionVentaId(null);
    }
  };

  // =========================
  // CARRITO (MEJORADO)
  // =========================
  const agregarCarrito = (producto: Producto) => {
    if (producto.stock <= 0) {
      alert("Sin stock disponible");
      return;
    }

    setCarrito((prev) => {
      const existe = prev.find((x) => x.id === producto.id);

      if (existe) {
        if (existe.cantidad >= producto.stock) {
          alert("No hay más stock disponible");
          return prev;
        }

        return prev.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }

      return [
        ...prev,
        {
          id: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          cantidad: 1,
        },
      ];
    });
  };

  const quitarUno = (id: number) => {
    setCarrito((prev) =>
      prev
        .map((p) =>
          p.id === id ? { ...p, cantidad: p.cantidad - 1 } : p
        )
        .filter((p) => p.cantidad > 0)
    );
  };

  // =========================
  // TOTALES
  // =========================
  const subtotal = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

  const total = Math.max(0, subtotal - descuento);

  const limpiarNumero = (value: string) => value.replace(/\D/g, "");

  const nombreEmpresaComprobante = () => {
    const razonSocial = String(negocioBranding?.razon_social || "").trim();
    const nombreNegocio = String(negocioBranding?.nombre || "").trim();
    return razonSocial || nombreNegocio || "ALVENT ERP";
  };

  const registrarClienteAutomatico = async (): Promise<number | null> => {
    const nombre = clienteNombre.trim();
    const documento = limpiarNumero(clienteDocumento);
    const celular = limpiarNumero(clienteWhatsapp).slice(0, 9);

    if (!nombre || !documento) return null;
    if (documento.length !== 8 && documento.length !== 11) return null;

    const clientes = await clientesService.getAll();
    const existente = clientes.find((c) => c.dni === documento);

    if (existente?.id) {
      const nombreDistinto = existente.nombre !== nombre;
      const telefonoDistinto = (existente.telefono || "") !== celular;
      const emailDistinto = (existente.email || "") !== clienteEmail.trim();

      if (nombreDistinto || telefonoDistinto || emailDistinto) {
        await clientesService.update(existente.id, {
          nombre,
          telefono: celular || undefined,
          email: clienteEmail.trim() || undefined,
        });
      }

      return existente.id;
    }

    const nuevo = await clientesService.create({
      nombre,
      dni: documento,
      telefono: celular || undefined,
      email: clienteEmail.trim() || undefined,
    });

    return nuevo.id || null;
  };

  const compartirComprobante = (ventaId: number | null, totalVenta: number, pdfUrl?: string) => {
    if (tipoComprobante === "NINGUNO") return;

    const empresa = nombreEmpresaComprobante();
    const cliente = clienteNombre.trim() || "Cliente";
    const doc = limpiarNumero(clienteDocumento);
    const resumen = [
      `Comprobante ${tipoComprobante}`,
      ventaId ? `Operación #${ventaId}` : "Operación registrada",
      `Cliente: ${cliente}`,
      doc ? `Documento: ${doc}` : "",
      `Metodo: ${metodo_pago}`,
      `Total: ${formatMoney(totalVenta)}`,
      pdfUrl ? `PDF: ${pdfUrl}` : "",
      `Gracias por tu compra en ${empresa}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (enviarEmail && clienteEmail.trim()) {
      const subject = encodeURIComponent(`${tipoComprobante} ${empresa}`);
      const body = encodeURIComponent(resumen);
      window.open(`mailto:${clienteEmail.trim()}?subject=${subject}&body=${body}`, "_blank");
    }

    if (enviarWhatsapp && clienteWhatsapp.trim()) {
      const numero = limpiarNumero(clienteWhatsapp);
      if (numero) {
        const text = encodeURIComponent(resumen);
        window.open(`https://wa.me/${numero}?text=${text}`, "_blank");
      }
    }
  };

  // =========================
  // CHECKOUT (MEJORADO)
  // =========================
  const finalizarVenta = async () => {
    if (processing) {
      return;
    }

    if (carrito.length === 0) {
      alert("Carrito vacío");
      return;
    }

    if (metodo_pago === "Efectivo" && montoRecibido < total) {
      alert("Monto insuficiente");
      return;
    }

    const documento = limpiarNumero(clienteDocumento);

    if (tipoComprobante === "FACTURA") {
      if (!clienteNombre.trim()) {
        alert("Para factura, ingresa nombre o razón social del cliente");
        return;
      }
      if (documento.length !== 11) {
        alert("Para factura, ingresa RUC válido de 11 dígitos");
        return;
      }
    }

    if (tipoComprobante === "BOLETA" && documento.length !== 8) {
      alert("Para boleta, ingresa DNI válido de 8 dígitos");
      return;
    }

    if (tipoComprobante !== "NINGUNO" && enviarEmail && !clienteEmail.trim()) {
      alert("Activas envio por email, pero falta correo del cliente");
      return;
    }

    if (tipoComprobante !== "NINGUNO" && enviarWhatsapp && !limpiarNumero(clienteWhatsapp)) {
      alert("Activas envio por WhatsApp, pero falta numero valido");
      return;
    }

    if (clienteWhatsapp.trim() && limpiarNumero(clienteWhatsapp).length !== 9) {
      alert("El celular debe tener exactamente 9 digitos numericos");
      return;
    }

    let cliente_id: number | null = null;

    if (requiereComprobante && clienteNombre.trim() && documento) {
      try {
        cliente_id = await registrarClienteAutomatico();
      } catch (err: unknown) {
        console.warn("No se pudo registrar/actualizar cliente automaticamente", err);
      }
    }

    const payload = {
      cliente_id,
      usuario_id: Number(localStorage.getItem("usuario_id") || 0),
      subtotal,
      descuento,
      metodo_pago,
      comprobante: {
        tipo_comprobante: tipoComprobante,
        cliente_nombre: clienteNombre.trim() || undefined,
        cliente_documento: documento || undefined,
        cliente_email: clienteEmail.trim() || undefined,
      },
      items: carrito.map((item) => ({
        producto_id: item.id,
        cantidad: item.cantidad,
        precio: item.precio,
      })),
    };

    if (!payload.usuario_id) {
      alert("Sesión inválida. Vuelve a iniciar sesión.");
      router.push(appPath("login"));
      return;
    }

    try {
      setProcessing(true);
      setError("");
      setSuccess("");

      const ventaCreada = await ventasService.create(payload);
      const ventaId =
        typeof ventaCreada?.venta_id === "number"
          ? ventaCreada.venta_id
          : typeof ventaCreada?.id === "number"
            ? ventaCreada.id
            : null;
      const sunatInfo = ventaCreada?.sunat as
        | {
          tipo_comprobante?: string;
          serie?: string;
          numero?: string;
          estado?: string;
          mensaje?: string;
          codigo?: string;
          hash?: string;
          ticket?: string;
          cdr_url?: string;
        }
        | undefined;

      let comprobantePdfUrl: string | undefined;
      if (requiereComprobante) {
        const empresa = nombreEmpresaComprobante();
        const comprobanteHtml = generarComprobanteHtml({
          tipoComprobante,
          ventaId,
          fechaIso: new Date().toISOString(),
          negocioNombre: empresa,
          negocioLogoUrl: negocioBranding?.logo_url
            ? toAbsoluteUrl(negocioBranding.logo_url)
            : undefined,
          clienteNombre: clienteNombre.trim() || undefined,
          clienteDocumento: documento || undefined,
          metodoPago: metodo_pago,
          subtotal,
          descuento,
          total,
          items: carrito.map((item) => ({
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio: item.precio,
          })),
        });

        imprimirComprobanteHtml(comprobanteHtml);

        // La carga es opcional: si falla, la venta igual se completa con el comprobante impreso localmente.
        try {
          const htmlBlob = new Blob([comprobanteHtml], { type: "text/html;charset=utf-8" });
          const htmlFile = new File(
            [htmlBlob],
            `${tipoComprobante.toLowerCase()}_${ventaId || "sin_id"}.html`,
            { type: "text/html" }
          );

          const upload = await ventasService.uploadComprobantePdf(htmlFile, ventaId);
          comprobantePdfUrl = toAbsoluteUrl(upload.url);
        } catch (uploadError) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("No se pudo subir comprobante HTML:", uploadError);
          }
        }
      }

      compartirComprobante(ventaId, total, comprobantePdfUrl);

      const comprobanteLabel = tipoComprobante === "NINGUNO" ? "Sin comprobante" : tipoComprobante;

      alert(
        `Venta registrada\nComprobante: ${comprobanteLabel}${sunatInfo?.serie && sunatInfo?.numero ? ` (${sunatInfo.serie}-${sunatInfo.numero})` : ""}\nMetodo: ${metodo_pago}\nTotal: S/${total.toFixed(2)}${sunatInfo?.estado ? `\nSUNAT: ${sunatInfo.estado}` : ""}${sunatInfo?.mensaje ? `\nDetalle SUNAT: ${sunatInfo.mensaje}` : ""}${comprobantePdfUrl ? `\nPDF: ${comprobantePdfUrl}` : ""}`
      );

      setCarrito([]);
      setDescuento(0);
      setMetodo_pago("Efectivo");
      setMontoRecibido(0);
      setTipoComprobante("NINGUNO");
      setClienteNombre("");
      setClienteDocumento("");
      setClienteEmail("");
      setClienteWhatsapp("");
      setEnviarEmail(false);
      setEnviarWhatsapp(false);

      await cargarProductos();
      await cargarVentasRecientes();

      setSuccess(`Venta #${ventaId || ""} registrada correctamente`);

      router.push(appPath("ventas"));
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, "Error creando venta"));
      setError(getApiErrorMessage(err, "Error creando venta"));
    } finally {
      setProcessing(false);
    }
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(value || 0);

  const itemsCarrito = carrito.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);

  const productosFiltrados = productos.filter((p) => {
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return true;

    const atributosExtra = Object.values(p.atributos_extra || {}).map((v) => String(v || ""));
    const atributosBase = [
      p.nombre,
      p.codigo,
      p.codigo_barras,
      p.categoria,
      p.marca,
      p.talla,
      p.color,
      p.sexo,
      p.precio,
      p.costo,
      p.stock,
    ].map((v) => String(v ?? ""));

    const indiceBusqueda = [...atributosBase, ...atributosExtra]
      .join(" ")
      .toLowerCase();

    return indiceBusqueda.includes(q);
  });

  // =========================
  // UI
  // =========================
  return (
    <main className={`${styles.shell} app-content`}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Operación en tiempo real</p>
          <h1>POS premium</h1>
          <p>Cobros fluidos, control de stock y cierre rápido con vista ejecutiva.</p>
        </div>
        <ExecutiveThemeSwitch />
      </section>

      <ExecutivePulseBar
        modulo="POS"
        estado={processing ? "Registrando venta" : "Operativo"}
        foco="Cobro en tiempo real con control de ticket, flujo de caja y continuidad comercial."
        accion={{ label: "Ir a ventas", href: "ventas" }}
        metricas={[
          { label: "Items", value: String(itemsCarrito) },
          { label: "Total", value: formatMoney(total), tone: "good" },
          { label: "Ventas recientes", value: String(ventasRecientes.length) },
        ]}
      />

      {error ? <p className={styles.errorBox}>{error}</p> : null}
      {success ? <p className={styles.successBox}>{success}</p> : null}

      <section className={`${styles.grid} uiEnter`} data-stagger="2">
        <article className={`${styles.card} ${styles.productsCard}`}>
          <Toolbar
            title="Catalogo disponible"
            right={(
              <div className={styles.catalogActions}>
                <input
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  placeholder="Buscar por nombre o codigo"
                  className={`${styles.searchInput} focus-ring`}
                />
                <input
                  value={codigoRapido}
                  onChange={(e) => setCodigoRapido(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      buscarYAgregarPorCodigo(codigoRapido, "manual");
                      setCodigoRapido("");
                    }
                  }}
                  placeholder="Código rápido"
                  className={`${styles.codeInput} focus-ring`}
                />
                <button
                  type="button"
                  className={styles.scanBtn}
                  onClick={() => setScanOpen(true)}
                >
                  Escanear
                </button>
                <StatusBadge text={`${productosFiltrados.length} items`} variant="info" />
              </div>
            )}
          />

          <div className={styles.productsList}>
            {productosFiltrados.map((p) => (
              <div className={styles.productItem} key={p.id}>
                <div className={styles.productInfo}>
                  {p.foto ? (
                    <Image
                      src={getImageUrl(p.foto)}
                      alt={p.nombre}
                      width={64}
                      height={64}
                      unoptimized
                      className={styles.productThumb}
                                      onError={applyFallbackImage}
                    />
                  ) : (
                    <div className={styles.productThumbFallback}>IMG</div>
                  )}
                  <div>
                  <strong>{p.nombre}</strong>
                  <p>Stock: {p.stock}</p>
                  </div>
                </div>
                <div className={styles.productMeta}>
                  <span>{formatMoney(p.precio)}</span>
                  <button
                    type="button"
                    className="focus-ring"
                    disabled={p.stock <= 0}
                    onClick={() => agregarCarrito(p)}
                  >
                    {p.stock <= 0 ? "Sin stock" : "Agregar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className={`${styles.card} ${styles.checkoutCard}`}>
          <Toolbar
            title="Carrito y cobro"
            right={<StatusBadge text={`${carrito.length} productos`} variant="neutral" />}
          />

          <div className={styles.cartList}>
            {carrito.length === 0 ? (
              <p className={styles.empty}>Carrito vacio</p>
            ) : (
              <DataTable
                headers={["Producto", "Cant.", "Precio", "Subtotal", "Accion"]}
                minWidth={560}
                density="compact"
              >
                {carrito.map((item) => (
                  <tr key={item.id}>
                    <td>{item.nombre}</td>
                    <td>{item.cantidad}</td>
                    <td>{formatMoney(item.precio)}</td>
                    <td>{formatMoney(item.cantidad * item.precio)}</td>
                    <td>
                      <button type="button" onClick={() => quitarUno(item.id)} className={styles.rowBtn}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>

          <div className={styles.formRow}>
            <label htmlFor="descuento">Descuento</label>
            <input
              id="descuento"
              type="number"
              value={descuento}
              onChange={(e) => setDescuento(Number(e.target.value))}
              className="focus-ring"
            />
          </div>

          <div className={styles.formRow}>
            <label htmlFor="metodo">Metodo de pago</label>
            <select
              id="metodo"
              value={metodo_pago}
              onChange={(e) => setMetodo_pago(e.target.value)}
              className="focus-ring"
            >
              <option>Efectivo</option>
              <option>Tarjeta</option>
              <option>Yape</option>
              <option>Plin</option>
            </select>
          </div>

          <section className={styles.deliveryCard}>
            <Toolbar
              title="Comprobante y entrega"
              right={<StatusBadge text="POS / compact" variant="neutral" />}
            />

            <div className={styles.formRow}>
              <label htmlFor="comprobante">Tipo de comprobante</label>
              <select
                id="comprobante"
                value={tipoComprobante}
                onChange={(e) => setTipoComprobante(e.target.value as TipoComprobante)}
                className="focus-ring"
              >
                <option value="NINGUNO">Ninguno</option>
                <option value="BOLETA">Boleta</option>
                <option value="FACTURA">Factura</option>
              </select>
            </div>

            {requiereComprobante ? (
              <>
                <div className={styles.formRow}>
                  <label htmlFor="cliente-nombre">Cliente / Razon social</label>
                  <input
                    id="cliente-nombre"
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    placeholder="Nombre del cliente"
                    className="focus-ring"
                  />
                </div>

                <div className={styles.formRow}>
                  <label htmlFor="cliente-doc">{tipoComprobante === "FACTURA" ? "RUC" : "DNI"}</label>
                  <input
                    id="cliente-doc"
                    value={clienteDocumento}
                    onChange={(e) => {
                      const soloDigitos = e.target.value.replace(/\D/g, "");
                      const maxLen = tipoComprobante === "FACTURA" ? 11 : 8;
                      setClienteDocumento(soloDigitos.slice(0, maxLen));
                    }}
                    placeholder={tipoComprobante === "FACTURA" ? "11 digitos" : "8 digitos"}
                    inputMode="numeric"
                    maxLength={tipoComprobante === "FACTURA" ? 11 : 8}
                    pattern={tipoComprobante === "FACTURA" ? "[0-9]{11}" : "[0-9]{8}"}
                    className="focus-ring"
                  />
                </div>

                <div className={styles.formRow}>
                  <label htmlFor="cliente-email">Correo para envio</label>
                  <input
                    id="cliente-email"
                    type="email"
                    value={clienteEmail}
                    onChange={(e) => setClienteEmail(e.target.value)}
                    placeholder="cliente@correo.com"
                    className="focus-ring"
                  />
                </div>

                <div className={styles.formRow}>
                  <label htmlFor="cliente-wa">WhatsApp para envio</label>
                  <input
                    id="cliente-wa"
                    value={clienteWhatsapp}
                    onChange={(e) => setClienteWhatsapp(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    placeholder="999999999"
                    inputMode="numeric"
                    maxLength={9}
                    pattern="[0-9]{9}"
                    className="focus-ring"
                  />
                  {Boolean(clienteWhatsapp) && limpiarNumero(clienteWhatsapp).length !== 9 ? (
                    <small>Celular incompleto: deben ser 9 digitos.</small>
                  ) : null}
                </div>

                <div className={styles.channelRow}>
                  <label className={styles.channelItem}>
                    <input
                      type="checkbox"
                      checked={enviarEmail}
                      onChange={(e) => setEnviarEmail(e.target.checked)}
                    />
                    Enviar por correo
                  </label>
                  <label className={styles.channelItem}>
                    <input
                      type="checkbox"
                      checked={enviarWhatsapp}
                      onChange={(e) => setEnviarWhatsapp(e.target.checked)}
                    />
                    Enviar por WhatsApp
                  </label>
                </div>

                <small>
                  Si completas cliente + documento, se registra automaticamente en tu base de clientes.
                </small>
              </>
            ) : (
              <small>
                Sin comprobante: no se solicitaran ni registraran datos del cliente.
              </small>
            )}
          </section>

          {metodo_pago === "Efectivo" ? (
            <div className={styles.formRow}>
              <label htmlFor="monto">Monto recibido</label>
              <input
                id="monto"
                type="number"
                placeholder="0.00"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(Number(e.target.value))}
                className="focus-ring"
              />
              <small>Cambio: {formatMoney(Math.max(0, montoRecibido - total))}</small>
            </div>
          ) : null}

          <div className={styles.totals}>
            <p>
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal)}</strong>
            </p>
            <p>
              <span>Total</span>
              <strong>{formatMoney(total)}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={finalizarVenta}
            disabled={processing || carrito.length === 0}
            title={carrito.length === 0 ? "Agrega al menos un producto para cobrar" : undefined}
            className={`${styles.payButton} focus-ring`}
          >
            {processing ? "Procesando..." : "Cobrar"}
          </button>
        </article>
      </section>

      <section className={`${styles.card} uiEnter`} data-stagger="3">
        <Toolbar
          title="Postventa: anular y devoluciones"
          right={<StatusBadge text={loadingVentas ? "Cargando" : `${ventasRecientes.length} ventas`} variant="warning" />}
        />

        <p className={styles.postventaHint}>
          Gestiona ventas recientes desde POS. Al anular o devolver, el stock se repone automaticamente.
        </p>

        <DataTable
          headers={["Venta", "Fecha", "Total", "Pago", "Estado", "Acciones"]}
          minWidth={760}
          density="compact"
        >
          {ventasRecientes.length === 0 && !loadingVentas ? (
            <tr>
              <td colSpan={6} className={styles.emptyRow}>No hay ventas recientes disponibles.</td>
            </tr>
          ) : null}

          {ventasRecientes.map((v) => {
            const estado = String(v.estado || "pagada").toLowerCase();
            const estadoVariant = estado === "anulada" ? "danger" : estado === "devuelta" ? "warning" : "success";
            const bloqueada = estado === "anulada" || estado === "devuelta";
            return (
              <tr key={v.id}>
                <td>#{v.id}</td>
                <td>{v.fecha ? new Date(v.fecha).toLocaleString() : "-"}</td>
                <td>{formatMoney(v.total)}</td>
                <td>{v.metodo_pago}</td>
                <td><StatusBadge text={estado.toUpperCase()} variant={estadoVariant as any} /></td>
                <td>
                  <div className={styles.postventaActions}>
                    <button
                      type="button"
                      className={styles.rowBtn}
                      disabled={bloqueada || accionVentaId === v.id}
                      onClick={() => aplicarPostVenta(v, "anular")}
                    >
                      {accionVentaId === v.id ? "Procesando..." : "Anular"}
                    </button>
                    <button
                      type="button"
                      className={styles.returnBtn}
                      disabled={bloqueada || accionVentaId === v.id}
                      onClick={() => aplicarPostVenta(v, "devolver")}
                    >
                      {accionVentaId === v.id ? "Procesando..." : "Devolver"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </section>

      <ModalCard
        open={scanOpen}
        title="Escanear codigo de barras"
        subtitle="Usa la camara del celular para leer el codigo y agregar el producto"
        actions={(
          <>
            <button
              type="button"
              className={styles.scanBtn}
              onClick={() => {
                buscarYAgregarPorCodigo(codigoRapido, "manual");
                setCodigoRapido("");
              }}
            >
              Agregar por codigo
            </button>
            <button
              type="button"
              className={styles.rowBtn}
              onClick={() => setScanOpen(false)}
            >
              Cerrar
            </button>
          </>
        )}
      >
        <div className={styles.scanPanel}>
          <video ref={videoRef} className={styles.scanVideo} muted playsInline />
          <div className={styles.scanStatus}>{scannerActivo ? scanStatus : "Escaner detenido"}</div>
          <input
            value={codigoRapido}
            onChange={(e) => setCodigoRapido(e.target.value)}
            placeholder="Si no detecta, escribe el codigo aqui"
            className="focus-ring"
          />
        </div>
      </ModalCard>
    </main>
  );
}