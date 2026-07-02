import { api } from "./api";

/* =========================
   TIPOS
========================= */
export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  marca: string;
  talla?: string;
  color?: string;
  sexo?: string;
  costo: number;
  precio: number;
  stock: number;
  stock_minimo?: number;
  foto?: string;
}

export interface ProductoCreate {
  codigo: string;
  nombre: string;
  categoria: string;
  marca: string;
  talla?: string;
  color?: string;
  sexo?: string;
  costo: number;
  precio: number;
  stock: number;
  stock_minimo?: number;
  foto?: string;
}

export interface ProductoUpdate {
  nombre?: string;
  categoria?: string;
  marca?: string;
  talla?: string;
  color?: string;
  sexo?: string;
  costo?: number;
  precio?: number;
  stock?: number;
  stock_minimo?: number;
  foto?: string;
}

/* =========================
   SERVICE
========================= */
export const productosService = {
  /* =========================
     LISTAR
  ========================= */
  async getAll(): Promise<Producto[]> {
    const res = await api.get<Producto[]>("/productos/");
    return res.data;
  },
  
/* =========================
     CREAR
  ========================= */
  async create(data: ProductoCreate): Promise<Producto> {
    const res = await api.post<Producto>("/productos/", data);
    return res.data;
  },

  /* =========================
     ACTUALIZAR
  ========================= */
  async update(
    codigo: string,
    data: ProductoUpdate
  ): Promise<Producto> {
    const res = await api.put<Producto>(
      `/productos/${codigo}`,
      data
    );
    return res.data;
  },

  /* =========================
     ELIMINAR
  ========================= */
  async delete(codigo: string): Promise<void> {
    await api.delete(`/productos/${codigo}`);
  },

  /* =========================
     BUSCAR
  ========================= */
  async search(query: string): Promise<Producto[]> {
    const res = await api.get<Producto[]>(
      `/productos/?search=${query}`
    );
    return res.data;
  },

  /* =========================
     UPLOAD FOTO
  ========================= */
  async uploadFoto(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append("archivo", file);

    const res = await api.post<{ url: string }>(
      "/productos/upload",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    return res.data;
  },
};