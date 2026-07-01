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

export function getApiErrorMessage(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return formatValidationDetail(detail);
  }

  if (detail && typeof detail === "object") {
    if (typeof detail.msg === "string") return detail.msg;
    return JSON.stringify(detail);
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
