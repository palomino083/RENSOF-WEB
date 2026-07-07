import { api } from "./api";

export type VentaItem = {
  producto_id: number;
  cantidad: number;
};

export type VentaCreate = {
  cliente_id?: number | null;
  usuario_id: number;
  subtotal: number;
  descuento: number;
  metodo_pago: string;
  comprobante?: {
    tipo_comprobante: "NINGUNO" | "BOLETA" | "FACTURA";
    cliente_nombre?: string;
    cliente_documento?: string;
    cliente_email?: string;
  };
  items: VentaItem[];
};

type FiltroVentas = {
  fecha_inicio?: string;
  fecha_fin?: string;
};

export const ventasService = {
  getAll: async () => {
    const res = await api.get("/ventas/");
    return res.data;
  },

  create: async (data: VentaCreate) => {
    const res = await api.post("/ventas/", data);
    return res.data as {
      mensaje: string;
      venta_id: number;
      total: number;
      comprobante_pdf_url?: string | null;
      sunat?: {
        tipo_comprobante?: string;
        serie?: string;
        numero?: string;
        estado?: string;
        mensaje?: string;
        codigo?: string;
        hash?: string;
        ticket?: string;
        cdr_url?: string;
      };
    };
  },

  reporteGanancias: async () => {
    const res = await api.get("/ventas/reporte/ganancias");
    return res.data;
  },

  resumenVentas: async () => {
    const res = await api.get("/ventas/resumen");
    return res.data;
  },

  detalleVentas: async (filtros?: FiltroVentas) => {
    const res = await api.get("/ventas/", {
      params: {
        fecha_inicio: filtros?.fecha_inicio,
        fecha_fin: filtros?.fecha_fin,
      },
    });
    return res.data;
  },

  uploadComprobantePdf: async (file: File, ventaId?: number | null) => {
    const formData = new FormData();
    formData.append("archivo", file);

    if (typeof ventaId === "number") {
      formData.append("venta_id", String(ventaId));
    }

    const res = await api.post("/ventas/comprobante/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return res.data as {
      mensaje: string;
      url: string;
      venta_id?: number;
    };
  },

  anularVenta: async (ventaId: number, motivo?: string) => {
    const res = await api.patch(`/ventas/${ventaId}/anular`, null, {
      params: { motivo },
    });
    return res.data as {
      ok: boolean;
      mensaje: string;
      venta_id: number;
      estado: string;
    };
  },

  devolverVenta: async (ventaId: number, motivo?: string) => {
    const res = await api.patch(`/ventas/${ventaId}/devolver`, null, {
      params: { motivo },
    });
    return res.data as {
      ok: boolean;
      mensaje: string;
      venta_id: number;
      estado: string;
    };
  },
};
