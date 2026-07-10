import { API_URL } from "@/services/api";
import type { SyntheticEvent } from "react";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80'%3E%3Crect width='100%25' height='100%25' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364758b' font-size='12'%3ESin imagen%3C/text%3E%3C/svg%3E";

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");
const apiBase = trimTrailingSlash(API_URL);
const apiOriginFromApiBase = apiBase.replace(/\/alven\/api\/?$/i, "");
const isLocalHost = (host: string) => host === "127.0.0.1" || host === "localhost";

const normalizeUploadsPath = (value: string) => {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const normalizedPath = parsed.pathname
        .replace(/^\/alven\/api\/uploads\/uploads\//i, "/uploads/")
        .replace(/^\/alven\/api\/uploads\//i, "/uploads/")
        .replace(/^\/uploads\/uploads\//i, "/uploads/");

      if (/^\/uploads\//i.test(normalizedPath)) {
        return `${parsed.origin}${normalizedPath}`;
      }

      if (isLocalHost(parsed.hostname) && /\/uploads\//i.test(parsed.pathname)) {
        const fromUploads = parsed.pathname.match(/\/uploads\/.*/i);
        return fromUploads ? fromUploads[0] : parsed.pathname;
      }
    } catch {
      return raw;
    }
    return raw;
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const fromUploads = withLeadingSlash.match(/\/uploads\/.*/i);
  const normalizedUploads = fromUploads ? fromUploads[0] : withLeadingSlash;

  return normalizedUploads
    .replace(/^\/alven\/api\/uploads\/uploads\//i, "/uploads/")
    .replace(/^\/alven\/api\/uploads\//i, "/uploads/")
    .replace(/^\/uploads\/uploads\//i, "/uploads/");
};

const getApiOrigin = () => {
  if (/^https?:\/\//i.test(apiOriginFromApiBase)) {
    return apiOriginFromApiBase;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
};

export const toMediaUrl = (value?: string | null) => {
  const normalized = normalizeUploadsPath(String(value || ""));
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized;

  if (normalized.startsWith("/uploads/")) {
    // Prioriza la ruta API/proxy para evitar bloqueos ORB en navegadores locales.
    if (apiBase) {
      return `${apiBase}${normalized}`;
    }

    const apiOrigin = getApiOrigin();
    return apiOrigin ? `${apiOrigin}${normalized}` : normalized;
  }

  return `${apiBase}${normalized}`;
};

export const applyFallbackImage = (event: SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  const retryCount = Number(img.dataset.mediaRetryCount || "0");
  const src = img.currentSrc || img.src || "";

  if (retryCount < 3) {
    const candidates: string[] = [];

    if (/\/alven\/api\/uploads\//i.test(src)) {
      candidates.push(src.replace(/\/alven\/api\/uploads\//i, "/uploads/"));
    }

    if (/\/uploads\//i.test(src) && !/\/alven\/api\/uploads\//i.test(src)) {
      candidates.push(src.replace(/\/uploads\//i, "/alvent/api/uploads/"));
    }

    if (/\/alven\/api\/uploads\//i.test(src)) {
      candidates.push(src.replace(/\/alven\/api\/uploads\//i, "/uploads/"));
    }

    if (/:8000\b/.test(src)) {
      candidates.push(src.replace(/:8000\b/g, ":8001"));
    }

    if (/:8001\b/.test(src)) {
      candidates.push(src.replace(/:8001\b/g, ":8000"));
    }

    const next = candidates.find((candidate) => candidate && candidate !== src);
    if (next) {
      img.dataset.mediaRetryCount = String(retryCount + 1);
      img.src = next;
      return;
    }
  }

  img.onerror = null;
  img.src = PLACEHOLDER_IMAGE;
};
