import { api } from "@/services/api";

class DashboardService {

  private async request(endpoint: string) {
    const response = await api.get(endpoint);
    return response.data;
  }

  // ==========================================
  // NUEVO ENDPOINT ÚNICO (ERP 3.0)
  // ==========================================

  async getOverview() {
    return this.request("/dashboard/overview");
  }

  // ==========================================
  // COMPATIBILIDAD (opcional)
  // Eliminar cuando todo el frontend use overview
  // ==========================================

  async getKPIs() {
    return this.request("/dashboard/resumen");
  }

  async getVentas() {
    return this.request("/dashboard/ventas");
  }

  async getCaja() {
    return this.request("/dashboard/caja");
  }

  async getTopProductos() {
    return this.request("/dashboard/top-productos");
  }

  async getAlertas() {
    return this.request("/dashboard/alertas");
  }

  async getInventario() {
    return this.request("/dashboard/inventario");
  }

}

export const dashboardService = new DashboardService();