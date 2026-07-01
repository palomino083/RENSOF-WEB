const DEFAULT_APP_BASE_PATH = "/alven/app";

export const APP_BASE_PATH =
  (process.env.NEXT_PUBLIC_APP_BASE_PATH || DEFAULT_APP_BASE_PATH).replace(/\/$/, "");

export function appPath(path: string = "") {
  const normalizedPath = path
    ? `/${path.replace(/^\/+/, "")}`
    : "";

  return `${APP_BASE_PATH}${normalizedPath}`;
}