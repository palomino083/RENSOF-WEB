import { api } from "./api";

export type ResetMode = "parcial" | "completo";

export type SoportePrioridad = "ALTA" | "MEDIA" | "BAJA";
export type SoporteEstado = "ABIERTO" | "EN_PROCESO" | "RESUELTO";

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

};