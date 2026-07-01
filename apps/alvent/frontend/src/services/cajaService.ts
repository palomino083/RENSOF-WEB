import { api } from "@/services/api";

/* =========================
   TYPES
========================= */

export interface CajaIngresoEgresoPayload {
  usuario_id: number;
  tipo: string;
  concepto: string;
  monto: number;
}

export interface CajaCerrarPayload {
  monto_final: number;
  observacion?: string;
}

/* =========================
   SERVICE
========================= */

export const cajaService = {
  // =========================
  // LISTAR CAJAS
  // =========================
  async getAll() {
    const res = await api.get("/cajas/");
    return res.data;
  },

  // =========================
  // CAJA ACTUAL
  // =========================
  async actual() {
    try {
      const res = await api.get("/cajas/actual");
      return res.data;
    } catch (error: any) {
      // 404 = no hay caja abierta (caso normal ERP)
      if (error?.response?.status === 404) return null;
      throw error;
    }
  },

  // =========================
  // ABRIR CAJA
  // =========================
  async abrir(usuario_id: number, monto_inicial: number) {
    const res = await api.post("/cajas/abrir", {
      usuario_id,
      monto_inicial,
    });

    return res.data;
  },

  // =========================
  // INGRESO CAJA
  // =========================
  async ingreso(payload: CajaIngresoEgresoPayload) {
    const res = await api.post("/cajas/ingreso", payload);
    return res.data;
  },

  // =========================
  // EGRESO CAJA
  // =========================
  async egreso(payload: CajaIngresoEgresoPayload) {
    const res = await api.post("/cajas/egreso", payload);
    return res.data;
  },

  // =========================
  // MOVIMIENTOS
  // =========================
  async movimientos() {
    const res = await api.get("/cajas/movimientos");
    return res.data;
  },

  // =========================
  // CERRAR CAJA
  // =========================
  async cerrar(caja_id: number, payload: CajaCerrarPayload) {
    const res = await api.put(
      `/cajas/cerrar/${caja_id}`,
      payload
    );

    return res.data;
  },
};