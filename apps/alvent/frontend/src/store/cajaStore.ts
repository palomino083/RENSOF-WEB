import { create } from "zustand";
import { cajaService } from "@/services/cajaService";

type Caja = {
  id: number;
  usuario_id: number;
  monto_inicial: number;
  estado: string;
  total_ventas: number;
  total_ingresos: number;
  total_egresos: number;
};

type CajaStore = {
  cajaActual: Caja | null;
  loading: boolean;

  // actions
  fetchCaja: () => Promise<void>;
  abrirCaja: (usuario_id: number, monto: number) => Promise<void>;
  cerrarCaja: (caja_id: number, data: any) => Promise<void>;
  limpiarCaja: () => void;
};

export const useCajaStore = create<CajaStore>((set, get) => ({
  cajaActual: null,
  loading: false,

  // =========================
  // OBTENER CAJA ACTIVA
  // =========================
  fetchCaja: async () => {
    try {
      set({ loading: true });

      const data = await cajaService.actual();

      set({ cajaActual: data });
    } catch (err) {
      set({ cajaActual: null });
    } finally {
      set({ loading: false });
    }
  },

  // =========================
  // ABRIR CAJA
  // =========================
  abrirCaja: async (usuario_id, monto) => {
    const data = await cajaService.abrir(usuario_id, monto);

    set({ cajaActual: data });
  },

  // =========================
  // CERRAR CAJA
  // =========================
  cerrarCaja: async (caja_id, payload) => {
    await cajaService.cerrar(caja_id, payload);

    set({ cajaActual: null });
  },

  // =========================
  // LIMPIAR
  // =========================
  limpiarCaja: () => {
    set({ cajaActual: null });
  },
}));