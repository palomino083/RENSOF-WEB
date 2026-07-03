import { api } from "./api";

export const usuariosService = {

  getPermissionsMatrix: async () => {
    const res = await api.get("/usuarios/permisos-matriz");
    return res.data as {
      negocio_id: number;
      matriz: Record<string, string[]>;
    };
  },

  updatePermissionsMatrix: async (matriz: Record<string, string[]>) => {
    const res = await api.put("/usuarios/permisos-matriz", { matriz });
    return res.data as {
      ok: boolean;
      mensaje: string;
      negocio_id: number;
      matriz: Record<string, string[]>;
    };
  },

  getAll: async () => {
    const res = await api.get("/usuarios/");
    return res.data;
  },

  create: async (data: any) => {
    const res = await api.post("/usuarios/", data);
    return res.data;
  },

  update: async (
    id: number,
    data: any
  ) => {
    const res = await api.patch(
      `/usuarios/${id}`,
      data
    );

    return res.data;
  },

  toggleEstado: async (
    id: number
  ) => {
    const res = await api.patch(
      `/usuarios/${id}/estado`
    );

    return res.data;
  },

  delete: async (
    id: number
  ) => {
    try {
      const res = await api.delete(
        `/usuarios/${id}`
      );

      return res.data;
    } catch (error: any) {
      // Compatibilidad con backends legacy que exigen slash final.
      if (!error?.response) {
        const res = await api.delete(
          `/usuarios/${id}/`
        );
        return res.data;
      }

      throw error;
    }
  },

};