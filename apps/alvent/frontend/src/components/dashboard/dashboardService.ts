import { api } from "@/services/api";

export const dashboardService = {

  async getKPIs() {
    const res = await api.get("/dashboard/resumen");
    return res.data;
  },

  async getVentas() {
    const res = await api.get("/dashboard/ventas");
    return res.data;
  },

  async getCaja() {
    const res = await api.get("/dashboard/caja");
    return res.data;
  },

  async getTopProductos() {
    const res = await api.get("/dashboard/top-productos");
    return res.data;
  },

  async getAlertas() {
    const res = await api.get("/dashboard/alertas");
    return res.data;
  },

  async getResumen() {
    const res = await api.get("/dashboard/resumen");
    return res.data;
  }

};