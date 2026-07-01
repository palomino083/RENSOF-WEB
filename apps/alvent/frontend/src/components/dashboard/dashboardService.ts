const API_URL = "http://localhost:8000";

export const dashboardService = {

  async getKPIs() {
    const res = await fetch(`${API_URL}/dashboard/resumen`);
    return res.json();
  },

  async getVentas() {
    const res = await fetch(`${API_URL}/dashboard/ventas`);
    return res.json();
  },

  async getCaja() {
    const res = await fetch(`${API_URL}/dashboard/caja`);
    return res.json();
  },

  async getTopProductos() {
    const res = await fetch(`${API_URL}/dashboard/top-productos`);
    return res.json();
  },

  async getAlertas() {
    const res = await fetch(`${API_URL}/dashboard/alertas`);
    return res.json();
  },

  async getResumen() {
    const res = await fetch(`${API_URL}/dashboard/resumen`);
    return res.json();
  }

};