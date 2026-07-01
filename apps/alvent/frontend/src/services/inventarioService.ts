import { api } from "./api";

export const inventarioService = {

  ingresar: async (
    producto_id: number,
    cantidad: number
  ) => {
    const res = await api.post(
      "/inventario/ingresar",
      {
        producto_id,
        cantidad,
      }
    );

    return res.data;
  },

  descontar: async (
    producto_id: number,
    cantidad: number
  ) => {
    const res = await api.post(
      "/inventario/descontar",
      {
        producto_id,
        cantidad,
      }
    );

    return res.data;
  },

  ajustar: async (
    producto_id: number,
    nuevo_stock: number
  ) => {
    const res = await api.post(
      "/inventario/ajustar",
      {
        producto_id,
        nuevo_stock,
      }
    );

    return res.data;
  },

  kardex: async (
    producto_id: number
  ) => {
    const res = await api.get(
      `/inventario/kardex/${producto_id}`
    );

    return res.data;
  },

  resumen: async (
    producto_id: number
  ) => {
    const res = await api.get(
      `/inventario/resumen/${producto_id}`
    );

    return res.data;
  },

};