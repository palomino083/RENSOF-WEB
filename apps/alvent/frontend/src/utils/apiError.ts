type ValidationDetailItem = {
  msg?: string;
  loc?: Array<string | number>;
};

function formatValidationDetail(items: ValidationDetailItem[]): string {
  const messages = items
    .map((item) => {
      const msg = item?.msg;
      const loc = Array.isArray(item?.loc)
        ? item.loc.filter((x) => x !== "body").join(".")
        : "";

      if (msg && loc) return `${loc}: ${msg}`;
      if (msg) return msg;
      return null;
    })
    .filter(Boolean) as string[];

  return messages.length > 0 ? messages.join(" | ") : "Error de validacion";
}

function isNegocioIdPathValidationMessage(message: string): boolean {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("path.negocio_id") ||
    (normalized.includes("negocio_id") && normalized.includes("valid integer"));
}

export function getApiErrorMessage(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail;
  const data = error?.response?.data;
  const status = Number(error?.response?.status || 0);

  if (status >= 500) {
    return fallback;
  }

  if (typeof data === "string") {
    const preview = data.trim().slice(0, 32).toLowerCase();
    if (preview.startsWith("<!doctype") || preview.startsWith("<html")) {
      return fallback;
    }
  }

  if (typeof detail === "string") {
    if (isNegocioIdPathValidationMessage(detail)) {
      return fallback;
    }
    return detail;
  }

  if (Array.isArray(detail)) {
    const formatted = formatValidationDetail(detail);
    if (isNegocioIdPathValidationMessage(formatted)) {
      return fallback;
    }
    return formatted;
  }

  if (detail && typeof detail === "object") {
    if (typeof detail.msg === "string") return detail.msg;
    return JSON.stringify(detail);
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    if (error.message.toLowerCase().includes("network error")) {
      return "No hay conexion con el servidor. Verifica backend y proxy local.";
    }
    return error.message;
  }

  return fallback;
}
