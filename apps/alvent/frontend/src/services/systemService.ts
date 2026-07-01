import { api } from "./api";

export type ResetMode = "parcial" | "completo";

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

};