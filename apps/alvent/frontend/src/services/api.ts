import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

import { appPath } from "@/utils/appPath";

/* =========================================================
   CONFIGURACIÓN GENERAL
========================================================= */

const RENDER_API_URL = "https://alvent-backend.onrender.com";
const LOCAL_API_URL = "http://127.0.0.1:8000";

type RetryableAxiosConfig = InternalAxiosRequestConfig & {
  __retryAfterRefresh?: boolean;
  __networkFallbacks?: string[];
  __networkRetryIndex?: number;
};

type FailedRequest = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "");
}

function isLocalApiUrl(url: string): boolean {
  return /127\.0\.0\.1|localhost/i.test(url);
}

function isLegacyProxyApiUrl(url: string): boolean {
  const normalized = normalizeUrl(url).toLowerCase();

  return (
    normalized === "/alven/api" ||
    normalized === "/alvent/api"
  );
}

function isLocalBrowser(): boolean {
  if (!isBrowser()) return false;

  return (
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost"
  );
}

function resolveApiUrl(): string {
  const envValue = normalizeUrl(
    process.env.NEXT_PUBLIC_API_URL || ""
  );

  /*
   * Durante build o renderizado del servidor no existe window.
   * En ese caso utilizamos directamente la API de producción.
   */
  if (!isBrowser()) {
    return envValue || RENDER_API_URL;
  }

  const localBrowser = isLocalBrowser();

  if (envValue) {
    /*
     * Evita que el frontend desplegado intente conectarse
     * al localhost del visitante.
     */
    if (
      !localBrowser &&
      (isLocalApiUrl(envValue) || isLegacyProxyApiUrl(envValue))
    ) {
      return RENDER_API_URL;
    }

    return envValue;
  }

  return localBrowser ? LOCAL_API_URL : RENDER_API_URL;
}

export const API_URL = resolveApiUrl();

/* =========================================================
   INSTANCIA AXIOS
========================================================= */

export const api = axios.create({
  baseURL: API_URL,

  /*
   * Render puede tardar algunos segundos en despertar.
   * 30 segundos evita falsos errores durante el arranque.
   */
  timeout: 30000,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/* =========================================================
   UTILIDADES
========================================================= */

function getToken(): string | null {
  if (!isBrowser()) return null;

  return localStorage.getItem("token");
}

function getRefreshToken(): string | null {
  if (!isBrowser()) return null;

  return localStorage.getItem("refreshToken");
}

function clearSession(): void {
  if (!isBrowser()) return;

  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("usuario_id");
  localStorage.removeItem("negocio_id");
  localStorage.removeItem("usuario");
}

function redirectToLogin(): void {
  if (!isBrowser()) return;

  const loginPath = appPath("login");
  const currentPath = window.location.pathname;

  /*
   * Evita un ciclo infinito cuando el usuario ya está
   * ubicado en la página de inicio de sesión.
   */
  if (currentPath !== loginPath && !currentPath.endsWith("/login")) {
    window.location.assign(loginPath);
  }
}

function redirectToRegistration(): void {
  if (!isBrowser()) return;

  const registrationPath = appPath("registro");
  const currentPath = window.location.pathname;

  if (
    currentPath !== registrationPath &&
    !currentPath.endsWith("/registro")
  ) {
    window.location.assign(registrationPath);
  }
}

function isHtmlInsteadOfJsonError(error: AxiosError): boolean {
  const message = String(error.message || "").toLowerCase();

  const responseData =
    typeof error.response?.data === "string"
      ? error.response.data.toLowerCase()
      : "";

  return (
    message.includes("unexpected token '<'") ||
    message.includes("<!doctype") ||
    message.includes("is not valid json") ||
    responseData.includes("<!doctype html")
  );
}

function getLocalFallbackBaseUrls(
  currentBaseURL?: string
): string[] {
  /*
   * Los reintentos alternativos solamente deben ejecutarse
   * en desarrollo local.
   */
  if (!isLocalBrowser()) {
    return [];
  }

  const current = normalizeUrl(currentBaseURL || "");

  const candidates = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
  ];

  return candidates.filter(
    (candidate) => normalizeUrl(candidate) !== current
  );
}

function isLoginRequest(url?: string): boolean {
  return Boolean(url?.includes("/auth/login"));
}

function isRefreshRequest(url?: string): boolean {
  return Boolean(url?.includes("/auth/refresh"));
}

function isPublicAuthRequest(url?: string): boolean {
  if (!url) return false;

  return (
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/forgot-password") ||
    url.includes("/auth/reset-password") ||
    url.includes("/auth/verify-email")
  );
}

/* =========================================================
   CONTROL DE REFRESH TOKEN
========================================================= */

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

function processQueue(
  error: unknown,
  token: string | null = null
): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
      return;
    }

    if (token) {
      resolve(token);
      return;
    }

    reject(new Error("No se pudo renovar la sesión"));
  });

  failedQueue = [];
}

/* =========================================================
   INTERCEPTOR DE SOLICITUD
========================================================= */

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error: unknown) => Promise.reject(error)
);

/* =========================================================
   INTERCEPTOR DE RESPUESTA
========================================================= */

api.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const response = error.response;
    const config = error.config as RetryableAxiosConfig | undefined;

    if (!config) {
      return Promise.reject(error);
    }

    /* -----------------------------------------------------
       FALLBACK EXCLUSIVO PARA DESARROLLO LOCAL
    ----------------------------------------------------- */

    const networkFailure = !response;
    const htmlFailure = isHtmlInsteadOfJsonError(error);

    if (
      isLocalBrowser() &&
      (networkFailure || htmlFailure)
    ) {
      const currentBaseURL = normalizeUrl(
        String(config.baseURL || API_URL)
      );

      if (!config.__networkFallbacks) {
        config.__networkFallbacks =
          getLocalFallbackBaseUrls(currentBaseURL);

        config.__networkRetryIndex = 0;
      }

      const retryIndex = config.__networkRetryIndex || 0;
      const nextBaseURL =
        config.__networkFallbacks[retryIndex];

      if (nextBaseURL) {
        config.__networkRetryIndex = retryIndex + 1;
        config.baseURL = nextBaseURL;

        if (process.env.NODE_ENV !== "production") {
          console.warn("AXIOS NETWORK RETRY:", {
            from: currentBaseURL,
            to: nextBaseURL,
            url: config.url,
            attempt: config.__networkRetryIndex,
          });
        }

        return api(config);
      }
    }

    /* -----------------------------------------------------
       RENOVACIÓN AUTOMÁTICA DEL TOKEN
    ----------------------------------------------------- */

    const mustRefreshToken =
      response?.status === 401 &&
      !isLoginRequest(config.url) &&
      !isRefreshRequest(config.url) &&
      !isPublicAuthRequest(config.url) &&
      !config.__retryAfterRefresh;

    if (mustRefreshToken) {
      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        clearSession();
        redirectToLogin();

        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (newToken: string) => {
              config.headers.Authorization =
                `Bearer ${newToken}`;

              config.__retryAfterRefresh = true;

              resolve(api(config));
            },

            reject,
          });
        });
      }

      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(
          `${API_URL}/auth/refresh`,
          {
            refresh_token: refreshToken,
          },
          {
            timeout: 30000,
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }
        );

        const accessToken = String(
          refreshResponse.data?.access_token || ""
        );

        if (!accessToken) {
          throw new Error(
            "El backend no devolvió un nuevo access token"
          );
        }

        if (isBrowser()) {
          localStorage.setItem("token", accessToken);
        }

        api.defaults.headers.common.Authorization =
          `Bearer ${accessToken}`;

        config.headers.Authorization =
          `Bearer ${accessToken}`;

        config.__retryAfterRefresh = true;

        processQueue(null, accessToken);

        return api(config);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearSession();
        redirectToLogin();

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    /* -----------------------------------------------------
       SESIÓN INVÁLIDA
    ----------------------------------------------------- */

    if (
      response?.status === 401 &&
      !isPublicAuthRequest(config.url)
    ) {
      clearSession();
      redirectToLogin();
    }

    /* -----------------------------------------------------
       USUARIO SIN NEGOCIO
    ----------------------------------------------------- */

    const responseDetail =
      typeof response?.data === "object" &&
      response?.data !== null &&
      "detail" in response.data
        ? String(
            (response.data as { detail?: unknown }).detail || ""
          )
        : "";

    if (
      response?.status === 403 &&
      responseDetail
        .toLowerCase()
        .includes("asociado con un negocio")
    ) {
      redirectToRegistration();
    }

    /* -----------------------------------------------------
       DEPURACIÓN LOCAL
    ----------------------------------------------------- */

    if (
      isBrowser() &&
      process.env.NODE_ENV !== "production"
    ) {
      console.error("AXIOS ERROR:", {
        code: error.code,
        message: error.message,
        baseURL: config.baseURL,
        url: config.url,
        status: response?.status,
        response: response?.data,
      });
    }

    return Promise.reject(error);
  }
);