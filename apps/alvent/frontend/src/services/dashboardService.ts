import { api } from "@/services/api";

export type DashboardOverview = {
  contexto?: {
    modo_global: boolean;
    negocio_id: number | null;
  };

  kpis: {
    productos: number;
    clientes: number;
    usuarios: number;
    ventas: number;
    monto_vendido: number;
    caja_abierta: boolean;
  };

  ventas: {
    fecha: string;
    ventas: number;
  }[];

  caja: {
    estado: string;
    saldo_inicial: number;
    ingresos: number;
    egresos: number;
    saldo_actual: number;
  };

  inventario: {
    total_productos: number;
    stock_critico: number;
    valor_inventario: number;
  };

  top_productos: {
    id: number;
    codigo: string;
    nombre: string;
    cantidad: number;
  }[];

  alertas: Array<
    | string
    | {
        tipo?: string;
        mensaje?: string;
      }
  >;
};

class DashboardService {
  private async request<T>(endpoint: string): Promise<T> {
    const response = await api.get<T>(endpoint);
    return response.data;
  }

  // ==========================================
  // DASHBOARD PRINCIPAL (ERP 3.0)
  // ==========================================

  async getOverview(): Promise<DashboardOverview> {
    return this.request<DashboardOverview>("/dashboard/overview");
  }

  // ==========================================
  // ALIAS TEMPORALES DE COMPATIBILIDAD
  // ==========================================

  async getKPIs(): Promise<DashboardOverview> {
    return this.getOverview();
  }

  async getVentas(): Promise<DashboardOverview> {
    return this.getOverview();
  }

  async getCaja(): Promise<DashboardOverview> {
    return this.getOverview();
  }

  async getTopProductos(): Promise<DashboardOverview> {
    return this.getOverview();
  }

  async getAlertas(): Promise<DashboardOverview> {
    return this.getOverview();
  }

  async getInventario(): Promise<DashboardOverview> {
    return this.getOverview();
  }
}

export const dashboardService = new DashboardService();