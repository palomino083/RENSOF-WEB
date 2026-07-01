"use client";

import { useState, useEffect } from "react";
import { api } from "@/services/api";

export interface CurrentUser {
  id: number;
  usuario: string;
  email: string;
  nombres: string;
  rol: string;
  negocio_id: number | null;
  activo: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setLoading(false);
          return;
        }

        const res = await api.get("/auth/me");
        setUser(res.data);
      } catch (err: any) {
        console.error("Error fetching user:", err);
        setError(err?.response?.data?.detail || "Error al obtener usuario");
        
        // Si token inválido, limpiar localStorage
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("usuario_id");
          localStorage.removeItem("negocio_id");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario_id");
    localStorage.removeItem("negocio_id");
    localStorage.removeItem("usuario");
    setUser(null);
    window.location.href = "/login";
  };

  return { user, loading, error, logout };
}
