import { api } from "./api";

export type Negocio = {
  id: number;
  nombre: string;
  tipo: string;
  plan?: "GRATUITO" | "PRUEBA" | "BASICO" | "LITE" | "PRO" | "PREMIUM" | string;
  descripcion?: string | null;
  logo_url?: string | null;
  ruc?: string | null;
  razon_social?: string | null;
  documento_propietario?: string | null;
  email?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  pais?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  direccion?: string | null;
  codigo_postal?: string | null;
  moneda?: string | null;
  zona_horaria?: string | null;
  idioma?: string | null;
};

export const negocioService = {
  list: async () => {
    const res = await api.get(`/negocios/`);
    return res.data as Negocio[];
  },

  getById: async (negocioId: number) => {
    const res = await api.get(`/negocios/${negocioId}`);
    return res.data as Negocio;
  },

  update: async (negocioId: number, data: Partial<Negocio>) => {
    const res = await api.put(`/negocios/${negocioId}`, data);
    return res.data as Negocio;
  },

  uploadLogo: async (negocioId: number, file: File) => {
    const formData = new FormData();
    formData.append("archivo", file);

    const res = await api.post(`/negocios/${negocioId}/logo`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return res.data as Negocio;
  },

  getPlanLimits: async (negocioId: number) => {
    const res = await api.get(`/negocios/${negocioId}/plan-limites`);
    return res.data as {
      negocio_id: number;
      plan: string;
      usuarios: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
      reportes: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
      backups: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    };
  },

  getPlanCatalog: async () => {
    const res = await api.get(`/negocios/planes/catalogo`);
    return res.data as {
      planes: Array<{
        codigo: string;
        nombre: string;
        usuarios_limite: number | null;
        reportes_habilitado: boolean;
        reportes_limite: number | null;
        backups_habilitado: boolean;
        backups_limite: number | null;
      }>;
    };
  },

  getEditablePlanCatalog: async (negocioId: number) => {
    const res = await api.get(`/negocios/${negocioId}/planes/catalogo-editable`);
    return res.data as {
      negocio_id: number;
      planes: Array<{
        codigo: string;
        nombre: string;
        usuarios_limite: number | null;
        reportes_habilitado: boolean;
        reportes_limite: number | null;
        backups_habilitado: boolean;
        backups_limite: number | null;
      }>;
    };
  },

  updateEditablePlanCatalog: async (
    negocioId: number,
    planes: Array<{
      codigo: string;
      usuarios_limite: number | null;
      reportes_habilitado: boolean;
      reportes_limite: number | null;
      backups_habilitado: boolean;
      backups_limite: number | null;
    }>
  ) => {
    const res = await api.put(`/negocios/${negocioId}/planes/catalogo-editable`, { planes });
    return res.data as {
      ok: boolean;
      mensaje: string;
      planes: Array<{
        codigo: string;
        nombre: string;
        usuarios_limite: number | null;
        reportes_habilitado: boolean;
        reportes_limite: number | null;
        backups_habilitado: boolean;
        backups_limite: number | null;
      }>;
    };
  },

  getFreePlanPerks: async (negocioId: number) => {
    const res = await api.get(`/negocios/${negocioId}/plan-gratuito-bondades`);
    return res.data as {
      usuarios_limite: number | null;
      reportes_habilitado: boolean;
      reportes_limite: number | null;
      backups_habilitado: boolean;
      backups_limite: number | null;
      custom: {
        usuarios_limite: number | null;
        reportes_habilitado: boolean;
        reportes_limite: number | null;
        backups_habilitado: boolean;
        backups_limite: number | null;
      };
    };
  },

  updateFreePlanPerks: async (
    negocioId: number,
    data: {
      usuarios_source_plan: string;
      habilitar_reportes: boolean;
      reportes_source_plan: string;
      habilitar_backups: boolean;
      backups_source_plan: string;
    }
  ) => {
    const res = await api.put(`/negocios/${negocioId}/plan-gratuito-bondades`, data);
    return res.data as {
      ok: boolean;
      mensaje: string;
      usuarios_limite: number | null;
      reportes_habilitado: boolean;
      reportes_limite: number | null;
      backups_habilitado: boolean;
      backups_limite: number | null;
    };
  },

  getPlanAmounts: async (negocioId: number) => {
    const res = await api.get(`/negocios/${negocioId}/planes/montos`);
    return res.data as {
      negocio_id: number;
      montos: {
        gratuito: number;
        prueba: number;
        basico: number;
        lite: number;
        pro: number;
        premium: number;
      };
    };
  },

  updatePlanAmounts: async (
    negocioId: number,
    data: {
      gratuito: number;
      prueba: number;
      basico: number;
      lite: number;
      pro: number;
      premium: number;
    }
  ) => {
    const res = await api.put(`/negocios/${negocioId}/planes/montos`, data);
    return res.data as {
      ok: boolean;
      mensaje: string;
      montos: {
        gratuito: number;
        prueba: number;
        basico: number;
        lite: number;
        pro: number;
        premium: number;
      };
    };
  },

  requestPlanChange: async (
    negocioId: number,
    data: {
      plan_objetivo: string;
      referencia_pago: string;
      canal_pago?: string;
      validacion_modo?: "AUTO" | "MANUAL";
      declaracion_anti_fraude?: boolean;
      observaciones?: string;
      comprobante_url?: string;
    }
  ) => {
    const res = await api.post(`/negocios/${negocioId}/solicitar-plan`, data);
    return res.data as {
      ok: boolean;
      mensaje: string;
      plan_actual: string;
      plan_solicitado: string;
      referencia_pago: string;
      estado: string;
      validacion_modo_solicitada: string;
      validacion_modo_aplicada: string;
      riesgo_score: number;
      riesgo_nivel: string;
    };
  },

  uploadPlanComprobante: async (negocioId: number, file: File) => {
    const formData = new FormData();
    formData.append("archivo", file);

    const res = await api.post(`/negocios/${negocioId}/planes/comprobante`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return res.data as { url: string };
  },

  getPlanHistory: async (negocioId: number) => {
    const res = await api.get(`/negocios/${negocioId}/planes/historial`);
    return res.data as Array<{
      id: number;
      usuario_id?: number | null;
      plan_actual: string;
      plan_solicitado: string;
      canal_pago: string;
      referencia_pago: string;
      observaciones?: string | null;
      comprobante_url?: string | null;
      estado: string;
      fecha: string;
    }>;
  },

  getPaymentDestinations: async (negocioId: number) => {
    const res = await api.get(`/negocios/${negocioId}/planes/cuentas-cobro`);
    return res.data as {
      negocio_id: number;
      cuentas: {
        transferencia: { titulo: string; detalle: string[] };
        tarjeta: { titulo: string; detalle: string[] };
        yape: { titulo: string; detalle: string[] };
        plin: { titulo: string; detalle: string[] };
      };
    };
  },

  updatePaymentDestinations: async (
    negocioId: number,
    cuentas: {
      transferencia: { titulo: string; detalle: string[] };
      tarjeta: { titulo: string; detalle: string[] };
      yape: { titulo: string; detalle: string[] };
      plin: { titulo: string; detalle: string[] };
    }
  ) => {
    const res = await api.put(`/negocios/${negocioId}/planes/cuentas-cobro`, cuentas);
    return res.data as {
      ok: boolean;
      mensaje: string;
      negocio_id: number;
      cuentas: {
        transferencia: { titulo: string; detalle: string[] };
        tarjeta: { titulo: string; detalle: string[] };
        yape: { titulo: string; detalle: string[] };
        plin: { titulo: string; detalle: string[] };
      };
    };
  },

  validatePlanPayment: async (
    negocioId: number,
    planPagoId: number,
    accion: "APROBAR" | "RECHAZAR"
  ) => {
    const res = await api.patch(`/negocios/${negocioId}/planes/historial/${planPagoId}/validar`, {
      accion,
    });
    return res.data as {
      ok: boolean;
      mensaje: string;
      plan_pago_id: number;
      estado: string;
      plan_solicitado: string;
    };
  },

  getSimulationScenarios: async (negocioId: number) => {
    const res = await api.get(`/negocios/${negocioId}/simulador/escenarios`);
    return res.data as {
      negocio_id: number;
      escenarios: Array<{
        id: string;
        nombre: string;
        planCodigo: string;
        override: {
          habilitado: boolean;
          usuarios_ilimitado: boolean;
          usuarios_limite: number;
          reportes_habilitado: boolean;
          reportes_ilimitado: boolean;
          reportes_limite: number;
          backups_habilitado: boolean;
          backups_ilimitado: boolean;
          backups_limite: number;
        };
        fecha: string;
      }>;
    };
  },

  updateSimulationScenarios: async (
    negocioId: number,
    escenarios: Array<{
      id: string;
      nombre: string;
      planCodigo: string;
      override: {
        habilitado: boolean;
        usuarios_ilimitado: boolean;
        usuarios_limite: number;
        reportes_habilitado: boolean;
        reportes_ilimitado: boolean;
        reportes_limite: number;
        backups_habilitado: boolean;
        backups_ilimitado: boolean;
        backups_limite: number;
      };
      fecha: string;
    }>
  ) => {
    const res = await api.put(`/negocios/${negocioId}/simulador/escenarios`, { escenarios });
    return res.data as {
      ok: boolean;
      mensaje: string;
      escenarios: Array<{
        id: string;
        nombre: string;
        planCodigo: string;
        override: {
          habilitado: boolean;
          usuarios_ilimitado: boolean;
          usuarios_limite: number;
          reportes_habilitado: boolean;
          reportes_ilimitado: boolean;
          reportes_limite: number;
          backups_habilitado: boolean;
          backups_ilimitado: boolean;
          backups_limite: number;
        };
        fecha: string;
      }>;
    };
  },
};
