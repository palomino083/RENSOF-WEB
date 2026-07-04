import { api } from "./api";

export type ResetMode = "parcial" | "completo";

export type SoportePrioridad = "ALTA" | "MEDIA" | "BAJA";
export type SoporteEstado = "ABIERTO" | "EN_PROCESO" | "RESUELTO";

export type GuardianSeverity = "info" | "warning" | "error" | "critical";

export type GuardianIncident = {
  id: string;
  timestamp: string;
  severity: GuardianSeverity;
  source: string;
  title: string;
  details: Record<string, unknown>;
  auto_action?: string | null;
  acked: boolean;
  acked_at?: string | null;
  acked_by?: string | null;
  ack_note?: string | null;
};

export type GuardianStatus = {
  enabled: boolean;
  started_at: string;
  safe_mode: {
    enabled: boolean;
    reason: string;
    auto_enabled: boolean;
  };
  metrics: {
    requests_total: number;
    requests_2xx: number;
    requests_4xx: number;
    requests_5xx: number;
    exceptions_total: number;
    consecutive_5xx: number;
    latency_warn_ms: number;
    error_burst_threshold: number;
  };
  last_events: {
    last_error_at?: string | null;
    last_exception?: string | null;
    last_high_latency_at?: string | null;
  };
  open_incidents: number;
  total_incidents: number;
};

export type SoporteTicket = {
  id: number;
  negocio_id?: number | null;
  usuario_id: number;
  usuario_nombre: string;
  asunto: string;
  consulta: string;
  prioridad: SoportePrioridad;
  estado: SoporteEstado;
  recomendacion_ia?: string | null;
  respuesta_superadmin?: string | null;
  atendido_por_usuario_id?: number | null;
  atendido_por_nombre?: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
};

export type SoporteTicketsQuery = {
  negocioId?: number;
  estado?: "ABIERTO" | "EN_PROCESO" | "RESUELTO" | "TODOS";
  prioridad?: "ALTA" | "MEDIA" | "BAJA" | "TODAS";
  page?: number;
  pageSize?: number;
};

export const systemService = {

  reset: async (modo: ResetMode, password: string) => {
    const res = await api.delete("/system/reset", {
      data: { modo, password },
    });

    return res.data;
  },

  health: async () => {
    const res = await api.get("/health");
    return res.data;
  },

  backup: async () => {
    const res = await api.get("/system/backup", {
      responseType: "blob",
    });
    return res;
  },

  listarTicketsSoporte: async (query?: SoporteTicketsQuery) => {
    const res = await api.get("/system/soporte/tickets", {
      params: {
        negocio_id: query?.negocioId || undefined,
        estado: query?.estado && query?.estado !== "TODOS" ? query.estado : undefined,
        prioridad: query?.prioridad && query?.prioridad !== "TODAS" ? query.prioridad : undefined,
        page: query?.page || 1,
        page_size: query?.pageSize || 8,
      },
    });
    return res.data as {
      tickets: SoporteTicket[];
      pagination: {
        page: number;
        page_size: number;
        total: number;
        total_pages: number;
      };
      filtros: {
        estado?: string | null;
        prioridad?: string | null;
      };
    };
  },

  crearTicketSoporte: async (data: {
    asunto: string;
    consulta: string;
    prioridad: SoportePrioridad;
    negocio_id?: number;
  }) => {
    const res = await api.post("/system/soporte/tickets", data);
    return res.data as {
      ok: boolean;
      mensaje: string;
      ticket: SoporteTicket;
      sugerencia_ia?: {
        categoria: string;
        recomendacion: string;
        origen: string;
      };
    };
  },

  atenderTicketSoporte: async (
    ticketId: number,
    data: { estado: SoporteEstado; respuesta_superadmin: string }
  ) => {
    const res = await api.patch(`/system/soporte/tickets/${ticketId}/atender`, data);
    return res.data as { ok: boolean; mensaje: string; ticket: SoporteTicket };
  },

  sugerenciaIaSoporte: async (data: { consulta: string; asunto?: string }) => {
    const res = await api.post("/system/soporte/ia/sugerencia", data);
    return res.data as {
      ok: boolean;
      categoria: string;
      recomendacion: string;
      origen: string;
    };
  },

  guardianStatus: async () => {
    const res = await api.get("/system/guardian/status");
    return res.data as {
      ok: boolean;
      guardian: GuardianStatus;
      viewer: {
        usuario_id?: number;
        is_superadmin: boolean;
      };
    };
  },

  guardianIncidentes: async (params?: { limit?: number; includeAcked?: boolean }) => {
    const res = await api.get("/system/guardian/incidentes", {
      params: {
        limit: params?.limit ?? 50,
        include_acked: params?.includeAcked ?? true,
      },
    });
    return res.data as {
      ok: boolean;
      items: GuardianIncident[];
      count: number;
    };
  },

  guardianAckIncidente: async (incidentId: string, note?: string) => {
    const res = await api.post(`/system/guardian/incidentes/${incidentId}/ack`, {
      note: note?.trim() || undefined,
    });
    return res.data as {
      ok: boolean;
      item: GuardianIncident;
    };
  },

  guardianSafeMode: async (enabled: boolean, reason?: string) => {
    const res = await api.post("/system/guardian/safe-mode", {
      enabled,
      reason: reason?.trim() || undefined,
    });
    return res.data as {
      ok: boolean;
      safe_mode: {
        enabled: boolean;
        reason: string;
        auto_enabled: boolean;
      };
      incident: GuardianIncident;
    };
  },

};