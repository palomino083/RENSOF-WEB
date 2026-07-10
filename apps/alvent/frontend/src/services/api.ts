import axios from "axios";

import { appPath } from "@/utils/appPath";

function isLocalApiUrl(url: string): boolean {
  return /127\.0\.0\.1|localhost/i.test(url);
}

function resolveApiUrl(): string {
  const envValue = String(process.env.NEXT_PUBLIC_API_URL || "").trim();

  const isBrowser = typeof window !== "undefined";
  const isLocalHost =
    isBrowser &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");

  // En algunos entornos Windows la variable puede existir vacia;
  // en ese caso forzamos un fallback seguro para desarrollo local.
  if (envValue) {
    // Blindaje: en produccion no permitir un API apuntando a localhost.
    if (!isLocalHost && isLocalApiUrl(envValue)) {
      return "/alvent/api";
    }
    return envValue;
  }

  if (isLocalHost) {
    return "http://127.0.0.1:8000/alvent/api";
  }

  return "/alvent/api";
}

export const API_URL = resolveApiUrl();

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

const shouldLogNetworkDebug =
  typeof window !== "undefined" && process.env.NODE_ENV !== "production";

function isHtmlInsteadOfJsonError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("unexpected token '<'") ||
    message.includes("<!doctype") ||
    message.includes("is not valid json")
  );
}

function getLocalFallbackBaseUrls(currentBaseURL?: string): string[] {
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");

  const candidates = isLocalHost
    ? [
        "/alvent/api",
        "http://127.0.0.1:8000/alvent/api",
        "http://localhost:8000/alvent/api",
      ]
    : ["/alvent/api"];

  const current = (currentBaseURL || "").replace(/\/$/, "");
  return candidates.filter((url) => url !== current);
}

// Flag para evitar múltiples refresh simultáneos
let isRefreshing = false;
let failedQueue: Array<{
  onSuccess: (token: string) => void;
  onFailed: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.onFailed(error);
    } else if (token) {
      prom.onSuccess(token);
    }
  });

  isRefreshing = false;
  failedQueue = [];
};

// INTERCEPTOR PARA AGREGAR TOKEN
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// INTERCEPTOR PARA MANEJAR ERRORES Y AUTO-REFRESH
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { config, response } = error;

    // Fallback de red para desarrollo local:
    // si el backend no responde en baseURL actual, reintenta en hosts/puertos comunes.
    if ((!response && config) || (config && isHtmlInsteadOfJsonError(error))) {
      const currentBaseURL = (config.baseURL || API_URL || "").replace(/\/$/, "");

      if (!config.__networkFallbacks) {
        config.__networkFallbacks = getLocalFallbackBaseUrls(currentBaseURL);
        config.__networkRetryIndex = 0;
      }

      const retryIndex = Number(config.__networkRetryIndex || 0);
      const nextBaseURL = config.__networkFallbacks?.[retryIndex];

      if (nextBaseURL) {
        config.__networkRetryIndex = retryIndex + 1;
        config.baseURL = nextBaseURL;

        if (shouldLogNetworkDebug) {
          console.warn("AXIOS NETWORK RETRY:", {
            from: currentBaseURL,
            to: nextBaseURL,
            url: config.url,
            attempt: config.__networkRetryIndex,
            reason: !response ? "network" : "html-instead-of-json",
          });
        }

        return api(config);
      }
    }

    // Si es 401 y no es un endpoint de refresh/login, intentar refrescar token
    if (
      response?.status === 401 &&
      config &&
      !config.url?.includes("/auth/refresh") &&
      !config.url?.includes("/auth/login") &&
      !config.__retryAfterRefresh
    ) {
      const originalRequest = config;

      if (!isRefreshing) {
        isRefreshing = true;

        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) {
          localStorage.clear();
          processQueue(error, null);

          if (typeof window !== "undefined") {
            window.location.href = appPath("login");
          }

          return Promise.reject(error);
        }

        // Intentar refrescar el token
        return api
          .post("/auth/refresh", { refresh_token: refreshToken })
          .then((res) => {
            const { access_token } = res.data;
            localStorage.setItem("token", access_token);

            // Actualizar token en la instancia actual
            api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
            originalRequest.__retryAfterRefresh = true;

            processQueue(null, access_token);

            // Reintentar la solicitud original con el nuevo token
            return api(originalRequest);
          })
          .catch((err) => {
            // Si falla el refresh, logout
            localStorage.clear();
            processQueue(err, null);

            if (typeof window !== "undefined") {
              window.location.href = appPath("login");
            }

            return Promise.reject(err);
          });
      }

      // Encolar la solicitud mientras se refresca
      return new Promise((resolve, reject) => {
        failedQueue.push({
          onSuccess: (token: string) => {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
            config.__retryAfterRefresh = true;
            resolve(api(config));
          },
          onFailed: (err) => {
            reject(err);
          },
        });
      });
    }

    // Si es error de logout explícito (otro endpoint 401)
    if (response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("usuario_id");
      localStorage.removeItem("negocio_id");

      if (typeof window !== "undefined") {
        window.location.href = appPath("login");
      }
    }

    // Si el usuario no tiene negocio asociado, redirigir al flujo de onboarding/registro.
    if (
      response?.status === 403 &&
      typeof response?.data?.detail === "string" &&
      response.data.detail.includes("asociado con un negocio")
    ) {
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/registro")
      ) {
        window.location.href = appPath("registro");
      }
    }

    if (shouldLogNetworkDebug) {
      console.log("AXIOS ERROR:", {
        code: error.code,
        message: error.message,
        url: error.config?.url,
        status: error.response?.status,
        response: error.response?.data,
      });
    }

    return Promise.reject(error);
  }
);
