import { api } from "@/services/api";

class DashboardService {
  private async request<T = any>(endpoint: string): Promise<T> {
    const response = await api.get(endpoint);
    return response.data;
  }

  // ==========================================
  // DASHBOARD PRINCIPAL (ERP 3.0)
  // ==========================================

  async getOverview() {
    return this.request("/dashboard/overview");
  }

  // ==========================================
  // Alias temporal para mantener compatibilidad
  // Todos apuntan al endpoint único
  // ==========================================

  async getKPIs() {
    return this.getOverview();
  }

  async getVentas() {
    return this.getOverview();
  }

  async getCaja() {
    return this.getOverview();
  }

  async getTopProductos() {
    return this.getOverview();
  }

  async getAlertas() {
    return this.getOverview();
  }

  async getInventario() {
    return this.getOverview();
  }
}

export const dashboardService = new DashboardService();