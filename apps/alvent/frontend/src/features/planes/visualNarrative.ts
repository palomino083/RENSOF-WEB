export const PLANES_VISIBLES_EN_SECCION = ["GRATUITO", "BASICO", "PRO", "PREMIUM"] as const;

const LEGACY_PLAN_ALIAS: Record<string, string> = {
  FREE: "GRATUITO",
};

export const normalizarPlan = (plan?: string | null) => {
  const raw = String(plan || "GRATUITO").toUpperCase();
  return LEGACY_PLAN_ALIAS[raw] || raw;
};

export const PLAN_VISUAL_META: Record<string, {
  subtitulo: string;
  lema: string;
  accentClass: "free" | "basic" | "pro" | "premium";
}> = {
  GRATUITO: {
    subtitulo: "Entrada sin costo",
    lema: "Ideal para primera implementacion",
    accentClass: "free",
  },
  BASICO: {
    subtitulo: "Operacion estable",
    lema: "Control diario para negocios en crecimiento",
    accentClass: "basic",
  },
  PRO: {
    subtitulo: "Escala comercial",
    lema: "Mayor velocidad y analitica",
    accentClass: "pro",
  },
  PREMIUM: {
    subtitulo: "Maximo rendimiento",
    lema: "Operacion con prioridad total",
    accentClass: "premium",
  },
};

export const PLAN_PRICE_MAP: Record<string, "gratuito" | "prueba" | "basico" | "lite" | "pro" | "premium"> = {
  GRATUITO: "gratuito",
  PRUEBA: "prueba",
  BASICO: "basico",
  LITE: "lite",
  PRO: "pro",
  PREMIUM: "premium",
};

export const formatLimite = (value: number | null | undefined) => (value == null ? "Ilimitado" : String(value));
