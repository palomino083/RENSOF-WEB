const DEFAULT_APP_BASE_PATH = "/alven/app";

export const APP_BASE_PATH =
  (process.env.NEXT_PUBLIC_APP_BASE_PATH || DEFAULT_APP_BASE_PATH).replace(/\/$/, "");

export function appPath(path: string = "") {
  const raw = String(path || "").trim();
  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const [pathOnly] = noOrigin.split(/[?#]/);
  let normalizedPath = pathOnly ? `/${pathOnly.replace(/^\/+/, "")}` : "";

  // Evita duplicados como /alven/app/alven/app/reportes cuando la ruta
  // de entrada ya viene con basePath por arrastre de estado o builds previos.
  while (normalizedPath.startsWith(`${APP_BASE_PATH}/`)) {
    normalizedPath = normalizedPath.slice(APP_BASE_PATH.length);
  }

  if (normalizedPath === APP_BASE_PATH) {
    normalizedPath = "";
  }

  return `${APP_BASE_PATH}${normalizedPath}`;
}