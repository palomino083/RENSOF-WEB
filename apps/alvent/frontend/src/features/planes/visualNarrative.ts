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
    lema: "Ideal para primera implementación",
    accentClass: "free",
  },
  BASICO: {
    subtitulo: "Operación estable",
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
    lema: "Operación con prioridad total",
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

export type PlanGovernanceProfile = {
  disponibilidad: string;
  soporte: string;
  seguridad: string[];
  servicio: string[];
};

const PLAN_GOVERNANCE_PROFILE: Record<string, PlanGovernanceProfile> = {
  GRATUITO: {
    disponibilidad: "99.5%",
    soporte: "Base",
    seguridad: [
      "Cifrado TLS en tránsito",
      "Credenciales protegidas y control por rol",
      "Backups manuales bajo demanda",
    ],
    servicio: [
      "Tablero de producto personalizable (base)",
      "Atención por chat en horario estándar",
      "Inicio rápido para micro y pequeños negocios",
    ],
  },
  BASICO: {
    disponibilidad: "99.7%",
    soporte: "Prioridad media",
    seguridad: [
      "Cifrado TLS + endurecimiento de sesión",
      "Bitácora operativa con trazabilidad básica",
      "Backups programables por operación",
    ],
    servicio: [
      "Tablero personalizable por rubro de negocio",
      "Soporte funcional con tiempo objetivo mejorado",
      "Escalamiento guiado para continuidad comercial",
    ],
  },
  PRO: {
    disponibilidad: "99.9%",
    soporte: "Prioridad alta",
    seguridad: [
      "Monitoreo de incidentes y alertas proactivas",
      "Auditoría de acciones administrativas",
      "Safe mode para contingencias críticas",
    ],
    servicio: [
      "Tablero de producto con atributos avanzados",
      "Acompañamiento técnico para equipos en crecimiento",
      "Respuesta prioritaria en incidencias de operación",
    ],
  },
  PREMIUM: {
    disponibilidad: "99.95%",
    soporte: "VIP 24/7",
    seguridad: [
      "Controles avanzados de seguridad y cumplimiento",
      "Retención ampliada de evidencia operativa",
      "Guardian runtime con respuesta asistida",
    ],
    servicio: [
      "Tablero totalmente adaptable por unidad de negocio",
      "Soporte experto con escalamiento ejecutivo",
      "Acompañamiento continuo para operaciones complejas",
    ],
  },
};

export const getPlanGovernanceProfile = (plan?: string | null): PlanGovernanceProfile => {
  const codigo = normalizarPlan(plan);
  return PLAN_GOVERNANCE_PROFILE[codigo] || PLAN_GOVERNANCE_PROFILE.GRATUITO;
};

export const formatLimite = (value: number | null | undefined) => (value == null ? "Ilimitado" : String(value));
