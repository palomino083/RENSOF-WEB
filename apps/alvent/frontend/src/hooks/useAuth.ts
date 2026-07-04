"use client";

import { useState, useEffect } from "react";
import { api } from "@/services/api";
import { appPath } from "@/utils/appPath";

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

  const clearAuthStorage = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("usuario_id");
    localStorage.removeItem("negocio_id");
    localStorage.removeItem("usuario");
  };

  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        const res = await api.get("/auth/me");
        if (isMounted) {
          setUser(res.data);
        }
      } catch (err: any) {
        if (err.response?.status === 401) {
          clearAuthStorage();
          if (isMounted) {
            setUser(null);
          }
        } else if (isMounted) {
          if (process.env.NODE_ENV !== "production") {
            console.error("Error fetching user:", err);
          }
          setError(err?.response?.data?.detail || "Error al obtener usuario");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const logout = () => {
    clearAuthStorage();
    setUser(null);
    window.location.href = appPath("login");
  };

  return { user, loading, error, logout };
}
