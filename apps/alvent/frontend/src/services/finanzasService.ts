import { api } from "./api";

export type IngresoPlan = {
  id: number;
  negocio_id: number;
  negocio_nombre: string;
  plan_solicitado: string;
  canal_pago: string;
  referencia_pago: string;
  fecha: string;
  monto: number;
};

export type GastoOperativo = {
  id: number;
  categoria: string;
  descripcion: string;
  monto: number;
  proveedor?: string | null;
  comprobante_url?: string | null;
  fecha_gasto: string;
  creado_por?: number | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
};

export type CierreMensual = {
  id: number;
  periodo: string;
  ingresos_total: number;
  gastos_total: number;
  utilidad_total: number;
  observaciones?: string | null;
  cerrado_por?: number | null;
  fecha_cierre: string;
};

export const finanzasService = {
  getCategorias: async () => {
    const res = await api.get("/finanzas/categorias");
    return res.data as { categorias: string[] };
  },

  getResumen: async (periodo: string) => {
    const res = await api.get("/finanzas/resumen", { params: { periodo } });
    return res.data as {
      periodo: string;
      ingresos_total: number;
      gastos_total: number;
      utilidad_total: number;
      ingresos: IngresoPlan[];
      gastos: GastoOperativo[];
    };
  },

  listGastos: async (periodo: string) => {
    const res = await api.get("/finanzas/gastos", { params: { periodo } });
    return res.data as GastoOperativo[];
  },

  createGasto: async (payload: {
    categoria: string;
    descripcion: string;
    monto: number;
    proveedor?: string;
    fecha_gasto?: string;
  }) => {
    const res = await api.post("/finanzas/gastos", payload);
    return res.data as GastoOperativo;
  },

  updateGasto: async (
    gastoId: number,
    payload: Partial<{
      categoria: string;
      descripcion: string;
      monto: number;
      proveedor: string;
      fecha_gasto: string;
    }>
  ) => {
    const res = await api.put(`/finanzas/gastos/${gastoId}`, payload);
    return res.data as GastoOperativo;
  },

  deleteGasto: async (gastoId: number) => {
    const res = await api.delete(`/finanzas/gastos/${gastoId}`);
    return res.data as { ok: boolean; mensaje: string };
  },

  uploadComprobante: async (gastoId: number, file: File) => {
    const formData = new FormData();
    formData.append("archivo", file);
    const res = await api.post(`/finanzas/gastos/${gastoId}/comprobante`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data as GastoOperativo;
  },

  cerrarMes: async (periodo: string, observaciones?: string) => {
    const res = await api.post("/finanzas/cierre-mensual", { periodo, observaciones });
    return res.data as CierreMensual;
  },

  listCierres: async () => {
    const res = await api.get("/finanzas/cierres");
    return res.data as CierreMensual[];
  },
};
