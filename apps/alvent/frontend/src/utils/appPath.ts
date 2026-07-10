export const APP_BASE_PATH = "";

export function appPath(path: string = "") {
  const raw = String(path || "").trim();
  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const [pathOnly] = noOrigin.split(/[?#]/);
  let normalizedPath = pathOnly ? `/${pathOnly.replace(/^\/+/, "")}` : "";

  const legacyPrefixes = [
    APP_BASE_PATH,
    `/${["app", "alvent"].join("/")}`,
    `/${["alvent", "app"].join("/")}`,
    `/${["alven", "app"].join("/")}`,
  ]
    .filter(Boolean)
    .map((prefix) => prefix.replace(/\/$/, ""));

  // Limpia base paths heredados de builds o variables antiguas.
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of legacyPrefixes) {
      if (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)) {
        normalizedPath = normalizedPath.slice(prefix.length) || "";
        changed = true;
        break;
      }
    }
  }

  if (normalizedPath === APP_BASE_PATH) {
    normalizedPath = "";
  }

  return `${APP_BASE_PATH}${normalizedPath}` || "/";
}
