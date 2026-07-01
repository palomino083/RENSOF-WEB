import { api } from "./api";

export interface Cliente {
  id?: number;
  nombre: string;
  dni: string;
  telefono?: string;
  email?: string;
  activo?: boolean;
}

// =========================
// ERROR HANDLER CENTRAL
// =========================
function handleError(error: any, mensaje: string) {
  const err = error as any;

  if (err?.response) {
    console.error(mensaje, {
      status: err.response.status,
      data: err.response.data,
    });

    throw new Error(err.response.data?.detail || mensaje);
  }

  console.error(mensaje, err?.message || err);
  throw new Error(mensaje);
}

// =========================
// CLIENTES SERVICE
// =========================
export const clientesService = {

  // LISTAR
  async getAll(): Promise<Cliente[]> {
    try {
      const res = await api.get("/clientes/");
      return res.data;
    } catch (error) {
      handleError(error, "ERROR OBTENIENDO CLIENTES");
      return [];
    }
  },

  // CREAR
  async create(cliente: Cliente): Promise<Cliente> {
    try {
      const res = await api.post("/clientes/", cliente);
      return res.data;
    } catch (error) {
      handleError(error, "ERROR CREANDO CLIENTE");
      throw error;
    }
  },

  // ACTUALIZAR (IMPORTANTE: usar Partial)
  async update(id: number, cliente: Partial<Cliente>): Promise<Cliente> {
    try {
      const res = await api.put(`/clientes/${id}`, cliente);
      return res.data;
    } catch (error) {
      handleError(error, "ERROR ACTUALIZANDO CLIENTE");
      throw error;
    }
  },

  // ELIMINAR
  async delete(id: number): Promise<{ message: string }> {
    try {
      const res = await api.delete(`/clientes/${id}`);
      return res.data;
    } catch (error) {
      handleError(error, "ERROR ELIMINANDO CLIENTE");
      throw error;
    }
  },

  // BUSCAR
  async buscar(texto: string): Promise<Cliente[]> {
    try {
      const res = await api.get(
        `/clientes/?buscar=${encodeURIComponent(texto)}`
      );
      return res.data;
    } catch (error) {
      handleError(error, "ERROR BUSCANDO CLIENTES");
      return [];
    }
  },

  // =========================
  // GUARDAR (CREATE / UPDATE)
  // =========================
  async guardar(cliente: Cliente): Promise<Cliente> {
    try {
      if (cliente.id) {
        const { id, ...data } = cliente; // 👈 importante limpiar id del body
        return await this.update(id, data);
      }

      return await this.create(cliente);
    } catch (error) {
      handleError(error, "ERROR GUARDANDO CLIENTE");
      throw error;
    }
  },
};