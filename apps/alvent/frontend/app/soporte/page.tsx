"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Menu from "@/components/Menu";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import ExecutivePulseBar from "@/components/ExecutivePulseBar";
import Toolbar from "@/components/ui/Toolbar";
import ModalCard from "@/components/ui/ModalCard";
import StatusBadge from "@/components/ui/StatusBadge";
import PlanVisualCards, { type PlanVisualCardItem } from "@/features/planes/components/PlanVisualCards";
import {
  systemService,
  type GuardianIncident,
  type GuardianSeverity,
  type GuardianStatus,
  type SoporteEstado,
  type SoportePrioridad,
  type SoporteTicket,
} from "@/services/systemService";
import { API_URL } from "@/services/api";
import { negocioService, type Negocio } from "@/services/negocioService";
import { productosService } from "@/services/productosService";
import {
  PLANES_VISIBLES_EN_SECCION,
  PLAN_PRICE_MAP,
  PLAN_VISUAL_META,
  normalizarPlan,
} from "@/features/planes/visualNarrative";
import { getApiErrorMessage } from "@/utils/apiError";
import styles from "./page.module.css";

const PLAN_OPTIONS = [
  { value: "GRATUITO", label: "Gratuito" },
  { value: "BASICO", label: "Básico" },
  { value: "PRO", label: "Pro" },
  { value: "PREMIUM", label: "Premium" },
] as const;

const nombrePlan = (plan?: string | null) => {
  const normalizado = normalizarPlan(plan);
  return PLAN_OPTIONS.find((p) => p.value === normalizado)?.label || normalizado;
};

const TIPO_NEGOCIO_LABELS: Record<string, string> = {
  tienda: "Tienda",
  restaurante: "Restaurante",
  farmacia: "Farmacia",
  supermercado: "Supermercado",
  boutique: "Boutique",
  kiosko: "Kiosko",
  desarrollo_software: "Desarrollo de software",
  servicio_aplicativos: "Servicio de aplicativos",
  otro: "Otro",
};

const TIPO_NEGOCIO_ALIAS: Record<string, string> = {
  servicio_de_aplicativos: "servicio_aplicativos",
  servicios_aplicativos: "servicio_aplicativos",
  desarrollo_de_software: "desarrollo_software",
};

const normalizarTipoNegocio = (tipo?: string | null) => {
  const base = String(tipo || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  return TIPO_NEGOCIO_ALIAS[base] || base;
};

const nombreTipoNegocio = (tipo?: string | null) => {
  const key = normalizarTipoNegocio(tipo);
  return TIPO_NEGOCIO_LABELS[key] || (tipo ? String(tipo) : "No definido");
};

const etiquetaTipoPersonalizado = (tipo: string) =>
  String(tipo || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const normalizarRol = (rol: string) => {
  const raw = String(rol || "").toUpperCase().trim();
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  if (compact === "SUPERADMIN" || compact === "SUPERADMINISTRADOR") return "SUPERADMIN";
  if (compact === "ADMIN" || compact === "ADMINISTRADOR") return "ADMINISTRADOR";
  return raw;
};

const parseNumero = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return 0;
  const num = Number(raw);
  return Number.isSafeInteger(num) && num > 0 ? num : 0;
};

const sanitizarRuc = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").slice(0, 11);

const sanitizarCelular = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").slice(0, 9);

const getStorageItem = (key: string) => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
};

const getNegocioIdFromSession = () => {
  const fromStorage = parseNumero(getStorageItem("negocio_id"));
  if (fromStorage) return fromStorage;

  const rawUsuario = getStorageItem("usuario");
  if (!rawUsuario) return 0;

  try {
    const parsed = JSON.parse(rawUsuario);
    return parseNumero(String(parsed?.negocio_id || 0));
  } catch {
    return 0;
  }
};

const normalizarApiUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "");

const toAbsoluteUrl = (url?: string | null) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${normalizarApiUrl(API_URL)}${url.startsWith("/") ? "" : "/"}${url}`;
};

const MODULOS_BASE = [
  "Dashboard",
  "POS",
  "Ventas",
  "Productos",
  "Inventario",
  "Clientes",
  "Usuarios",
  "Cajas",
  "Reportes",
  "Backups",
] as const;

const PLAN_BONDAD_SOURCES = PLANES_VISIBLES_EN_SECCION;

type CanalPago = "transferencia" | "tarjeta" | "yape" | "plin";
type DestinoCobro = { titulo: string; detalle: string[] };
type PaymentDestinations = Record<CanalPago, DestinoCobro>;
type SoporteCategoria = "acceso" | "facturacion" | "inventario" | "ventas" | "rendimiento" | "integracion" | "otro";
type SoporteClasificacion = {
  categoria: SoporteCategoria;
  prioridadSugerida: SoportePrioridad;
  confianza: number;
  asunto: string;
  resumen: string;
  checklist: string[];
};

const CANALES_PAGO: Array<{ value: CanalPago; label: string }> = [
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "yape", label: "Yape" },
  { value: "plin", label: "Plin" },
];

const PAYMENT_DESTINATIONS_DEFAULT: PaymentDestinations = {
  transferencia: {
    titulo: "Cuenta bancaria para transferencia",
    detalle: [
      "Banco: BCP",
      "Titular: RENSOF S.A.C.",
      "Cuenta corriente: 191-2587456-0-21",
      "CCI: 00219100258745602137",
    ],
  },
  tarjeta: {
    titulo: "Pago con tarjeta (alineado a cuenta bancaria)",
    detalle: [
      "Deposita el abono en la misma cuenta bancaria oficial de ALVENT ERP PRO.",
      "Banco: BCP - Cuenta corriente 191-2587456-0-21",
      "CCI: 00219100258745602137",
    ],
  },
  yape: {
    titulo: "Yape",
    detalle: [
      "Numero de abono Yape: 987 654 321",
      "Titular: RENSOF S.A.C.",
    ],
  },
  plin: {
    titulo: "Plin",
    detalle: [
      "Numero de abono Plin: 987 654 321",
      "Titular: RENSOF S.A.C.",
    ],
  },
};

const normalizarDestinoCobro = (
  value: unknown,
  fallback: DestinoCobro
): DestinoCobro => {
  const raw = typeof value === "object" && value !== null ? (value as Partial<DestinoCobro>) : {};
  const titulo = String(raw.titulo || fallback.titulo).trim() || fallback.titulo;
  const detalleRaw = Array.isArray(raw.detalle) ? raw.detalle : fallback.detalle;
  const detalle = detalleRaw
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    titulo,
    detalle: detalle.length > 0 ? detalle : fallback.detalle,
  };
};

const normalizarPaymentDestinations = (value: unknown): PaymentDestinations => {
  const raw = typeof value === "object" && value !== null ? (value as Partial<PaymentDestinations>) : {};
  return {
    transferencia: normalizarDestinoCobro(raw.transferencia, PAYMENT_DESTINATIONS_DEFAULT.transferencia),
    tarjeta: normalizarDestinoCobro(raw.tarjeta, PAYMENT_DESTINATIONS_DEFAULT.tarjeta),
    yape: normalizarDestinoCobro(raw.yape, PAYMENT_DESTINATIONS_DEFAULT.yape),
    plin: normalizarDestinoCobro(raw.plin, PAYMENT_DESTINATIONS_DEFAULT.plin),
  };
};

const esCanalPago = (value: string): value is CanalPago =>
  CANALES_PAGO.some((item) => item.value === value);

const SHOW_SOPORTE_SLIM_VIEW = true;

const SOPORTE_QUICK_PROMPTS: Array<{ label: string; text: string; prioridad: SoportePrioridad }> = [
  {
    label: "No puedo ingresar",
    text: "No puedo iniciar sesion, me sale error de acceso. Necesito recuperar acceso cuanto antes.",
    prioridad: "ALTA",
  },
  {
    label: "POS lento",
    text: "El modulo POS esta lento y tarda mucho en confirmar ventas. Ocurre desde hoy en varias terminales.",
    prioridad: "ALTA",
  },
  {
    label: "Stock descuadrado",
    text: "El inventario muestra stock distinto al esperado despues de ventas y ajustes. Necesito reconciliarlo.",
    prioridad: "MEDIA",
  },
  {
    label: "Plan y facturacion",
    text: "Necesito validar si mi pago de plan ya fue aplicado y por que no veo los modulos esperados.",
    prioridad: "MEDIA",
  },
];

const buildWelcomeMessage = (): { id: string; role: "bot"; text: string } => ({
  id: "soporte-bot-welcome",
  role: "bot",
  text: "Hola, soy SofIA, tu asistente de soporte ALVENT. Te ayudo con diagnosticos tecnicos, estadisticas operativas y escalamiento a RENSOF, siempre con respeto, confidencialidad y cumplimiento normativo en Peru.",
});

type SofiaResponseLevel = "EJECUTIVO" | "TECNICO" | "USUARIO_FINAL";
type SoporteTemplateKey = "ACCESO" | "SUNAT_FACTURACION" | "RENDIMIENTO" | "INVENTARIO_VENTAS" | "GENERAL";

const buildSofiaOperatingContext = (level: SofiaResponseLevel) => {
  const nivelDetalle =
    level === "EJECUTIVO"
      ? "Nivel de respuesta: EJECUTIVO (impacto, riesgo y decision)."
      : level === "TECNICO"
        ? "Nivel de respuesta: TECNICO (causa probable, pasos y validacion)."
        : "Nivel de respuesta: USUARIO_FINAL (pasos simples y lenguaje claro).";

  return [
    "[Protocolo SofIA]",
    "Identidad: SofIA, asistente de soporte ALVENT.",
    "Tono: saludo cordial, trato respetuoso y lenguaje profesional.",
    "Privacidad: proteger datos personales y evitar exponer informacion sensible.",
    "Marco normativo: actuar bajo normativa aplicable del Peru (Ley 29733 y buenas practicas de seguridad).",
    "Objetivo: diagnostico claro, accionable y orientado a continuidad operativa.",
    nivelDetalle,
  ].join("\n");
};

const resolveSofiaLevelByRole = (rol: string, roles: string[] = [], isSuper = false): SofiaResponseLevel => {
  if (isSuper) return "EJECUTIVO";
  const normalized = [rol, ...roles].map((item) => normalizarRol(item));
  if (normalized.includes("SUPERADMIN")) return "EJECUTIVO";
  if (normalized.includes("ADMINISTRADOR") || normalized.includes("ADMIN")) return "TECNICO";
  return "USUARIO_FINAL";
};

const INCIDENT_TEMPLATE_LABELS: Record<SoporteTemplateKey, string> = {
  ACCESO: "Acceso y autenticacion",
  SUNAT_FACTURACION: "SUNAT y facturacion",
  RENDIMIENTO: "Rendimiento y estabilidad",
  INVENTARIO_VENTAS: "Inventario y ventas",
  GENERAL: "Consulta general",
};

const inferIncidentTemplateKey = (ticket?: SoporteTicket | null): SoporteTemplateKey => {
  if (!ticket) return "GENERAL";
  const raw = `${ticket.asunto || ""} ${ticket.consulta || ""} ${ticket.recomendacion_ia || ""}`.toLowerCase();
  if (/(login|ingresar|contrasena|contraseña|token|acceso|401|403)/.test(raw)) return "ACCESO";
  if (/(sunat|nubefact|factura|boleta|fiscal|comprobante)/.test(raw)) return "SUNAT_FACTURACION";
  if (/(lento|latencia|demora|500|error|caido|caído|timeout)/.test(raw)) return "RENDIMIENTO";
  if (/(inventario|stock|producto|venta|pos|caja)/.test(raw)) return "INVENTARIO_VENTAS";
  return "GENERAL";
};

const buildTemplateReply = (template: SoporteTemplateKey, level: SofiaResponseLevel, ticket?: SoporteTicket | null) => {
  const intro = "Hola, gracias por tu reporte. Con gusto te ayudo.";
  const cierre = "Quedo atento a tu confirmacion para cerrar o escalar internamente con RENSOF.";

  const levelLine =
    level === "EJECUTIVO"
      ? "Resumen ejecutivo: impacto controlado, accion inmediata y seguimiento con SLA."
      : level === "TECNICO"
        ? "Detalle tecnico: causa probable, validacion y evidencia requerida."
        : "Guia usuario final: pasos claros para resolver rapido.";

  const base = {
    ACCESO: "Valida credenciales, estado del usuario, permisos de rol y sesion activa. Si persiste, envia hora exacta y mensaje mostrado.",
    SUNAT_FACTURACION: "Revisa integracion SUNAT activa, token vigente, series configuradas y RUC emisor valido. Luego prueba un comprobante controlado.",
    RENDIMIENTO: "Verifica latencia por modulo, incidentes Guardian y errores recientes. Comparte pantalla/modulo afectado y rango horario.",
    INVENTARIO_VENTAS: "Contrasta stock esperado vs real, ultimo movimiento y caja activa. Valida tambien rol del usuario y negocio asociado.",
    GENERAL: "Comparte modulo, accion, resultado esperado y mensaje exacto para responder con mayor precision.",
  } as const;

  return [
    intro,
    levelLine,
    `Categoria atendida: ${INCIDENT_TEMPLATE_LABELS[template]}.`,
    `Accion recomendada: ${base[template]}`,
    ticket ? `Referencia ticket #${ticket.id}.` : "",
    cierre,
  ].filter(Boolean).join("\n\n");
};

const buildChatStorageKey = (isSuperadmin: boolean, negocioId: number) =>
  `alvent_support_chat_v2:${isSuperadmin ? "superadmin" : "usuario"}:${negocioId || "global"}`;

const normalizarCanalPago = (value?: string | null): CanalPago => {
  const raw = String(value || "").trim().toLowerCase();
  return esCanalPago(raw) ? raw : "transferencia";
};

const renderBenefitIcon = (icon: string) => {
  if (icon === "spark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l1.9 4.8L19 10l-5.1 2.2L12 17l-1.9-4.8L5 10l5.1-2.2L12 3z" />
      </svg>
    );
  }
  if (icon === "chart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16M7 16V9m5 7V5m5 11v-4" />
      </svg>
    );
  }
  if (icon === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" />
      </svg>
    );
  }
  if (icon === "rocket") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19l4-1 7-7a6 6 0 001-8 6 6 0 00-8 1l-7 7-1 4 4-1zM9 15l-2 2" />
      </svg>
    );
  }
  if (icon === "crown") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 18h18l-2-10-5 4-2-4-2 4-5-4-2 10z" />
      </svg>
    );
  }
  if (icon === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
      </svg>
    );
  }
  if (icon === "briefcase") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 8h18v11H3V8zm6-3h6v3H9V5zM3 12h18" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
};

const severityToBadgeVariant = (severity?: GuardianSeverity) => {
  if (severity === "critical" || severity === "error") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
};

const PRIORIDAD_RANK: Record<SoportePrioridad, number> = {
  BAJA: 1,
  MEDIA: 2,
  ALTA: 3,
};

const elevarPrioridad = (a: SoportePrioridad, b: SoportePrioridad): SoportePrioridad =>
  PRIORIDAD_RANK[a] >= PRIORIDAD_RANK[b] ? a : b;

const clasificarConsultaSoporte = (consulta: string): SoporteClasificacion => {
  const text = String(consulta || "").toLowerCase();

  const score = {
    acceso: 0,
    facturacion: 0,
    inventario: 0,
    ventas: 0,
    rendimiento: 0,
    integracion: 0,
  };

  const pushScore = (bucket: keyof typeof score, terms: string[], points = 1) => {
    terms.forEach((t) => {
      if (text.includes(t)) score[bucket] += points;
    });
  };

  pushScore("acceso", ["login", "ingresar", "contrasena", "contraseña", "token", "usuario", "sesion", "sesión", "401", "403"], 2);
  pushScore("facturacion", ["plan", "pago", "finanzas", "factura", "boleta", "cobro", "suscripcion", "suscripción"], 2);
  pushScore("inventario", ["stock", "inventario", "producto", "kardex", "almacen", "almacén", "sku"], 2);
  pushScore("ventas", ["venta", "pos", "caja", "cliente", "comprobante", "ticket", "sunat"], 2);
  pushScore("rendimiento", ["lento", "demora", "timeout", "congelado", "500", "error", "caido", "caído"], 2);
  pushScore("integracion", ["api", "webhook", "integracion", "integración", "importar", "exportar", "sincronizar"], 2);

  const ordered = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const top = ordered[0];
  const second = ordered[1];

  let categoria: SoporteCategoria = "otro";
  if (top && top[1] > 0) categoria = top[0] as SoporteCategoria;

  const margen = Math.max(0, (top?.[1] || 0) - (second?.[1] || 0));
  const confianza = Math.min(0.95, 0.55 + margen * 0.1 + Math.min(0.2, (top?.[1] || 0) * 0.03));

  const byCategory: Record<SoporteCategoria, Omit<SoporteClasificacion, "categoria" | "confianza">> = {
    acceso: {
      prioridadSugerida: "ALTA",
      asunto: "Incidencia de acceso/autenticacion",
      resumen: "Detecté un posible incidente de acceso. Validemos credenciales, sesión y permisos.",
      checklist: [
        "Confirmar usuario/rol y hora exacta del fallo",
        "Capturar mensaje exacto (401/403 u otro)",
        "Reintentar login y validar /auth/me",
      ],
    },
    facturacion: {
      prioridadSugerida: "MEDIA",
      asunto: "Consulta de facturacion y plan",
      resumen: "Parece una consulta de pagos/plan. Revisemos estado del pago y reflejo en finanzas.",
      checklist: [
        "Validar referencia de pago y estado",
        "Comprobar historial de planes",
        "Confirmar visibilidad en Finanzas",
      ],
    },
    inventario: {
      prioridadSugerida: "MEDIA",
      asunto: "Incidencia de inventario/productos",
      resumen: "Se detecta caso de inventario/productos. Verifiquemos datos y sincronía de stock.",
      checklist: [
        "Producto/código afectado",
        "Stock esperado vs mostrado",
        "Último movimiento relacionado",
      ],
    },
    ventas: {
      prioridadSugerida: "MEDIA",
      asunto: "Incidencia operativa de ventas/POS",
      resumen: "Parece un incidente de ventas/POS. Revisemos flujo completo de transacción.",
      checklist: [
        "Hora de venta y usuario",
        "Paso exacto donde falla",
        "Respuesta de sistema o comprobante",
      ],
    },
    rendimiento: {
      prioridadSugerida: "ALTA",
      asunto: "Incidencia de rendimiento/estabilidad",
      resumen: "Detecté señales de rendimiento o estabilidad. Recomiendo escalar con evidencia técnica.",
      checklist: [
        "Tiempo de respuesta aproximado",
        "Pantalla/endpoints involucrados",
        "Errores visibles en consola o backend",
      ],
    },
    integracion: {
      prioridadSugerida: "MEDIA",
      asunto: "Incidencia de integración/API",
      resumen: "Se trata de una integración. Necesitamos request/response y datos de trazabilidad.",
      checklist: [
        "Endpoint o módulo de integración",
        "Payload resumido (sin secretos)",
        "Código de respuesta y mensaje",
      ],
    },
    otro: {
      prioridadSugerida: "BAJA",
      asunto: "Consulta general de soporte",
      resumen: "Clasificación general. Te guío con pasos mínimos y, si persiste, escalamos.",
      checklist: [
        "Qué esperabas que ocurra",
        "Qué ocurrió realmente",
        "Cuándo empezó el problema",
      ],
    },
  };

  const cfg = byCategory[categoria];
  return {
    categoria,
    confianza,
    prioridadSugerida: cfg.prioridadSugerida,
    asunto: cfg.asunto,
    resumen: cfg.resumen,
    checklist: cfg.checklist,
  };
};

const construirFallbackSoporte = (clasif: SoporteClasificacion) => {
  const pasos = clasif.checklist.map((item, idx) => `${idx + 1}. ${item}`).join("\n");
  return [
    `${clasif.resumen}`,
    `Categoría detectada: ${clasif.categoria.toUpperCase()} (${Math.round(clasif.confianza * 100)}% confianza).`,
    "Para avanzar rápido, recopila:",
    pasos,
    "Si continúa, usa 'Escalar a RENSOF' para abrir ticket con contexto técnico.",
  ].join("\n");
};


export default function ConfiguracionPage() {
  type ConfigAccessMode = "soporte" | "configuracion";

  type SimuladorEscenario = {
    id: string;
    nombre: string;
    planCodigo: string;
    override: {
      habilitado: boolean;
      usuarios_ilimitado: boolean;
      usuarios_limite: number;
      reportes_habilitado: boolean;
      reportes_ilimitado: boolean;
      reportes_limite: number;
      backups_habilitado: boolean;
      backups_ilimitado: boolean;
      backups_limite: number;
    };
    fecha: string;
  };

  type SoporteChatMessage = {
    id: string;
    role: "user" | "bot";
    text: string;
    meta?: string;
  };

  // ==========================
  // STATE CENTRALIZADO
  // ==========================
  const [showResetModal, setShowResetModal] = useState(false);
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<"parcial" | "completo">("parcial");
  const [loadingReset, setLoadingReset] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loadingBranding, setLoadingBranding] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [negocioSeleccionadoId, setNegocioSeleccionadoId] = useState<number>(0);
  const [negociosDisponibles, setNegociosDisponibles] = useState<Negocio[]>([]);
  const [negocioTipoFiltro, setNegocioTipoFiltro] = useState<string>("todos");
  const [savingLogo, setSavingLogo] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [vincularComprobantesSunat, setVincularComprobantesSunat] = useState(false);
  const [tiposNegocioProductos, setTiposNegocioProductos] = useState<string[]>([]);
  const [nuevoTipoNegocioEmpresa, setNuevoTipoNegocioEmpresa] = useState("");
  const [savingTipoNegocioEmpresa, setSavingTipoNegocioEmpresa] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [planStats, setPlanStats] = useState<{
    plan: string;
    usuarios: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    reportes: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    backups: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    productos: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    soporte: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    reinicio: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    sunat: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
  } | null>(null);
  const [empresaTab, setEmpresaTab] = useState<"general" | "fiscal" | "ubicacion" | "branding">("general");
  const [planCatalogo, setPlanCatalogo] = useState<Array<{
    codigo: string;
    nombre: string;
    usuarios_limite: number | null;
    reportes_habilitado: boolean;
    reportes_limite: number | null;
    backups_habilitado: boolean;
    backups_limite: number | null;
    soporte_habilitado: boolean;
    reinicio_habilitado: boolean;
    productos_limite: number | null;
    sunat_habilitado: boolean;
  }>>([]);
  const [planControlSeleccionado, setPlanControlSeleccionado] = useState<string>("GRATUITO");
  const [planControlAccion, setPlanControlAccion] = useState<"simular" | "aplicar" | "guardar_monto" | "guardar_limites" | "bondades">("simular");
  const [planSimulado, setPlanSimulado] = useState<string>("BASICO");
  const [simuladorOverride, setSimuladorOverride] = useState({
    habilitado: false,
    usuarios_ilimitado: false,
    usuarios_limite: 0,
    reportes_habilitado: false,
    reportes_ilimitado: false,
    reportes_limite: 0,
    backups_habilitado: false,
    backups_ilimitado: false,
    backups_limite: 0,
  });
  const [simuladorEscenarioNombre, setSimuladorEscenarioNombre] = useState("");
  const [simuladorEscenarios, setSimuladorEscenarios] = useState<SimuladorEscenario[]>([]);
  const [showPagoPlanModal, setShowPagoPlanModal] = useState(false);
  const [planPagoObjetivo, setPlanPagoObjetivo] = useState("PRO");
  const [comprobantePagoFile, setComprobantePagoFile] = useState<File | null>(null);
  const [historialPlanes, setHistorialPlanes] = useState<Array<{
    id: number;
    usuario_id?: number | null;
    plan_actual: string;
    plan_solicitado: string;
    canal_pago: string;
    referencia_pago: string;
    observaciones?: string | null;
    comprobante_url?: string | null;
    estado: string;
    fecha: string;
  }>>([]);
  const [loadingHistorialPlanes, setLoadingHistorialPlanes] = useState(false);
  const [paymentDestinations, setPaymentDestinations] = useState<PaymentDestinations>(PAYMENT_DESTINATIONS_DEFAULT);
  const [savingPaymentDestinations, setSavingPaymentDestinations] = useState(false);
  const [filtroEstadoHistorialPlan, setFiltroEstadoHistorialPlan] = useState<"TODOS" | "PENDIENTE_VALIDACION" | "APLICADO" | "RECHAZADO">("TODOS");
  const [planApprovalAlertText, setPlanApprovalAlertText] = useState("");
  const [planApprovalAlertPulse, setPlanApprovalAlertPulse] = useState(false);
  const pendingPlanApprovalsRef = useRef(0);
  const [validatingPlanPagoId, setValidatingPlanPagoId] = useState<number | null>(null);
  const [solicitudPlan, setSolicitudPlan] = useState({
    plan_objetivo: "PRO",
    referencia_pago: "",
    canal_pago: "transferencia",
    validacion_modo: "MANUAL" as "AUTO" | "MANUAL",
    declaracion_anti_fraude: true,
    observaciones: "",
  });
  const [sendingSolicitudPlan, setSendingSolicitudPlan] = useState(false);
  const [savingFreePlanBoost, setSavingFreePlanBoost] = useState(false);
  const [savingPlanAmounts, setSavingPlanAmounts] = useState(false);
  const [savingPlanLimits, setSavingPlanLimits] = useState(false);
  const [soporteTickets, setSoporteTickets] = useState<SoporteTicket[]>([]);
  const [loadingSoporte, setLoadingSoporte] = useState(false);
  const [creatingSoporte, setCreatingSoporte] = useState(false);
  const [updatingSoporteId, setUpdatingSoporteId] = useState<number | null>(null);
  const [loadingSugerenciaIa, setLoadingSugerenciaIa] = useState(false);
  const [soporteFiltroEstado, setSoporteFiltroEstado] = useState<"TODOS" | SoporteEstado>("TODOS");
  const [soporteFiltroPrioridad, setSoporteFiltroPrioridad] = useState<"TODAS" | SoportePrioridad>("TODAS");
  const [soportePage, setSoportePage] = useState(1);
  const [soportePageSize] = useState(5);
  const [soporteTotal, setSoporteTotal] = useState(0);
  const [soporteTotalPages, setSoporteTotalPages] = useState(1);
  const [showAtencionSoporteModal, setShowAtencionSoporteModal] = useState(false);
  const [ticketAtencion, setTicketAtencion] = useState<SoporteTicket | null>(null);
  const [atencionForm, setAtencionForm] = useState<{ estado: SoporteEstado; respuesta: string }>({
    estado: "EN_PROCESO",
    respuesta: "",
  });
  const [showSoporteInteligente, setShowSoporteInteligente] = useState(false);
  const [guardianStatus, setGuardianStatus] = useState<GuardianStatus | null>(null);
  const [guardianIncidents, setGuardianIncidents] = useState<GuardianIncident[]>([]);
  const [loadingGuardian, setLoadingGuardian] = useState(false);
  const [loadingGuardianIncidents, setLoadingGuardianIncidents] = useState(false);
  const [guardianSafeModeBusy, setGuardianSafeModeBusy] = useState(false);
  const [ackingGuardianIncidentId, setAckingGuardianIncidentId] = useState<string | null>(null);
  const [showSoporteChatModal, setShowSoporteChatModal] = useState(false);
  const [configAccessMode, setConfigAccessMode] = useState<ConfigAccessMode>("configuracion");
  const [soporteChatInput, setSoporteChatInput] = useState("");
  const [soporteChatPrioridad, setSoporteChatPrioridad] = useState<SoportePrioridad>("MEDIA");
  const [soporteChatMessages, setSoporteChatMessages] = useState<SoporteChatMessage[]>([buildWelcomeMessage()]);
  const [soporteClasificacion, setSoporteClasificacion] = useState<SoporteClasificacion | null>(null);
  const [sofiaResponseLevel, setSofiaResponseLevel] = useState<SofiaResponseLevel>("USUARIO_FINAL");
  const [atencionTemplateKey, setAtencionTemplateKey] = useState<SoporteTemplateKey>("GENERAL");
  const [loadingDiagnosticoSuperagente, setLoadingDiagnosticoSuperagente] = useState(false);
  const [chatPersistReady, setChatPersistReady] = useState(false);
  const [planAmounts, setPlanAmounts] = useState({
    gratuito: 0,
    prueba: 15,
    basico: 20,
    lite: 35,
    pro: 45,
    premium: 65,
  });
  const [freePlanBoost, setFreePlanBoost] = useState({
    usuarios_source_plan: "BASICO",
    habilitar_reportes: false,
    reportes_source_plan: "PRO",
    habilitar_backups: false,
    backups_source_plan: "PRO",
    usuarios_limite: 1 as number | null,
    reportes_limite: 0 as number | null,
    backups_limite: 0 as number | null,
  });
  const [businessForm, setBusinessForm] = useState({
    nombre: "",
    tipo: "tienda",
    plan: "GRATUITO",
    descripcion: "",
    ruc: "",
    razon_social: "",
    documento_propietario: "",
    email: "",
    telefono: "",
    whatsapp: "",
    pais: "Peru",
    direccion: "",
    departamento: "",
    provincia: "",
    distrito: "",
    codigo_postal: "",
    moneda: "PEN",
    zona_horaria: "America/Lima",
    idioma: "es",
  });

  const opcionesTipoNegocioEmpresa = useMemo(() => {
    const base = Object.entries(TIPO_NEGOCIO_LABELS).map(([value, label]) => ({ value, label }));
    const baseValues = new Set(base.map((item) => item.value));

    const custom = tiposNegocioProductos
      .map((tipo) => normalizarTipoNegocio(tipo))
      .filter((tipo) => Boolean(tipo) && !baseValues.has(tipo))
      .map((tipo) => ({ value: tipo, label: etiquetaTipoPersonalizado(tipo) }));

    return [...base, ...custom];
  }, [tiposNegocioProductos]);

  const opcionesTipoFiltroEmpresa = useMemo(() => {
    return Object.entries(TIPO_NEGOCIO_LABELS)
      .map(([value, label]) => ({ value, label }))
      .concat(
        tiposNegocioProductos
          .map((tipo) => normalizarTipoNegocio(tipo))
          .filter((tipo) => Boolean(tipo) && !TIPO_NEGOCIO_LABELS[tipo])
          .map((tipo) => ({ value: tipo, label: etiquetaTipoPersonalizado(tipo) }))
      );
  }, [tiposNegocioProductos]);

  const historialPlanesFiltrado =
    filtroEstadoHistorialPlan === "TODOS"
      ? historialPlanes
      : historialPlanes.filter(
        (item) => String(item.estado || "").toUpperCase() === filtroEstadoHistorialPlan
      );
  const pendingPlanApprovals = historialPlanes.filter(
    (item) => String(item.estado || "").toUpperCase() === "PENDIENTE_VALIDACION"
  ).length;

  const irASeccion = (id: string) => {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isNegocioDisponible = useCallback((negocioId: number) => {
    if (!negocioId) return false;
    return negociosDisponibles.some((item) => item.id === negocioId);
  }, [negociosDisponibles]);

  const getNegocioSesionSuperadminValido = useCallback(() => {
    const negocioSesion = parseNumero(getStorageItem("negocio_id"));
    return isNegocioDisponible(negocioSesion) ? negocioSesion : 0;
  }, [isNegocioDisponible]);

  const getNegocioIdActivo = useCallback(() => {
    if (isSuperadmin) {
      if (isNegocioDisponible(negocioSeleccionadoId)) return negocioSeleccionadoId;
      return getNegocioSesionSuperadminValido();
    }
    return getNegocioIdFromSession();
  }, [isSuperadmin, negocioSeleccionadoId, isNegocioDisponible, getNegocioSesionSuperadminValido]);

  const cargarBranding = useCallback(async (negocioIdArg?: number) => {
    try {
      setLoadingBranding(true);
      const negocioId = negocioIdArg || getNegocioIdActivo();
      if (!negocioId) {
        setNegocio(null);
        return;
      }

      const data = await negocioService.getById(negocioId);
      setNegocio(data);
      setLogoPreviewUrl(data.logo_url ? toAbsoluteUrl(data.logo_url) : "");
      const tipoNormalizado = normalizarTipoNegocio(data.tipo);
      setBusinessForm({
        nombre: data.nombre || "",
        tipo: tipoNormalizado || "otro",
        plan: normalizarPlan(data.plan),
        descripcion: data.descripcion || "",
        ruc: sanitizarRuc(data.ruc),
        razon_social: data.razon_social || "",
        documento_propietario: data.documento_propietario || "",
        email: data.email || "",
        telefono: sanitizarCelular(data.telefono),
        whatsapp: sanitizarCelular(data.whatsapp),
        pais: data.pais || "Peru",
        direccion: data.direccion || "",
        departamento: data.departamento || "",
        provincia: data.provincia || "",
        distrito: data.distrito || "",
        codigo_postal: data.codigo_postal || "",
        moneda: data.moneda || "PEN",
        zona_horaria: data.zona_horaria || "America/Lima",
        idioma: data.idioma || "es",
      });
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la identidad de empresa");
    } finally {
      setLoadingBranding(false);
    }
  }, [getNegocioIdActivo]);

  const cargarTiposNegocioDesdeProductos = useCallback(async () => {
    try {
      const cfg = await productosService.getTableConfig();
      const tipos = Array.isArray(cfg?.tipos_custom) ? cfg.tipos_custom : [];
      setTiposNegocioProductos(tipos);
    } catch {
      setTiposNegocioProductos([]);
    }
  }, []);

  const guardarTipoNegocioEmpresaEnProductos = async (tipoValue?: string) => {
    const tipo = normalizarTipoNegocio(tipoValue || businessForm.tipo);
    if (!tipo) {
      setError("Selecciona un tipo de negocio válido");
      return false;
    }

    try {
      setSavingTipoNegocioEmpresa(true);
      setError("");
      setSuccess("");

      const cfg = await productosService.getTableConfig();
      const columnasCustom = Array.isArray(cfg?.columnas_custom) ? cfg.columnas_custom : [];
      const columnasVisibles = Array.isArray(cfg?.columnas_visibles) ? cfg.columnas_visibles : [];

      const tiposPrevios = Array.isArray(cfg?.tipos_custom)
        ? cfg.tipos_custom.map((item) => normalizarTipoNegocio(item)).filter(Boolean)
        : [];

      const tiposMerged = [...new Set([
        ...tiposPrevios,
        ...(TIPO_NEGOCIO_LABELS[tipo] ? [] : [tipo]),
      ])];

      await productosService.updateTableConfig({
        tipo_negocio: tipo,
        columnas_custom: columnasCustom,
        tipos_custom: tiposMerged,
        columnas_visibles: columnasVisibles,
      });

      setBusinessForm((prev) => ({ ...prev, tipo }));
      setTiposNegocioProductos(tiposMerged);
      setSuccess("Tipo de negocio guardado y sincronizado con Productos");
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo guardar el tipo de negocio"));
      return false;
    } finally {
      setSavingTipoNegocioEmpresa(false);
    }
  };

  const crearTipoNegocioEmpresa = async () => {
    const tipo = normalizarTipoNegocio(nuevoTipoNegocioEmpresa);
    if (!tipo) {
      setError("Ingresa un tipo de negocio válido");
      return;
    }

    const creado = await guardarTipoNegocioEmpresaEnProductos(tipo);
    if (creado) {
      setNuevoTipoNegocioEmpresa("");
    }
  };

  const aplicarPlantillaRensofSac = () => {
    setBusinessForm((prev) => ({
      ...prev,
      nombre: "RENSOF SAC",
      tipo: "desarrollo_software",
      descripcion: "Servicios de tecnología, software empresarial y transformación digital.",
      razon_social: "RENSOF S.A.C.",
      pais: "Peru",
      moneda: "PEN",
      zona_horaria: "America/Lima",
      idioma: "es",
    }));
    setSuccess("Plantilla RENSOF SAC aplicada. Revisa y guarda los datos de empresa.");
    setError("");
  };

  const seleccionarLogo = (file: File | null) => {
    setLogoFile(file);
    if (!file) return;
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  const cargarPlanStats = useCallback(async () => {
    const negocioId = getNegocioIdActivo();
    if (!negocioId) {
      setPlanStats(null);
      return;
    }

    try {
      const stats = await negocioService.getPlanLimits(negocioId);
      setPlanStats(stats);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar consumo del plan"));
    }
  }, [getNegocioIdActivo]);

  const guardarLogo = async () => {
    if (!logoFile) {
      setError("Selecciona una imagen antes de guardar");
      return;
    }

    const negocioId = await resolverNegocioObjetivo("guardar logotipo");
    if (!negocioId) {
      setError("Selecciona explicitamente el negocio objetivo antes de guardar logotipo");
      return;
    }

    try {
      setSavingLogo(true);
      setError("");
      setSuccess("");
      const actualizado = await negocioService.uploadLogo(negocioId, logoFile);
      setNegocio(actualizado);
      setLogoPreviewUrl(toAbsoluteUrl(actualizado.logo_url));
      setLogoFile(null);
      setSuccess("Logotipo actualizado correctamente");
      await cargarPlanStats();
    } catch (err: unknown) {
      console.error(err);
      setError(getApiErrorMessage(err, "No se pudo guardar el logotipo"));
    } finally {
      setSavingLogo(false);
    }
  };

  const guardarDatosEmpresa = async () => {
    const negocioId = await resolverNegocioObjetivo("guardar datos de empresa");
    if (!negocioId) {
      setError("Selecciona explicitamente el negocio objetivo antes de guardar datos de empresa");
      return;
    }

    if (!businessForm.nombre.trim()) {
      setError("El nombre de la empresa es obligatorio");
      return;
    }

    const rucSanitizado = sanitizarRuc(businessForm.ruc);
    const telefonoSanitizado = sanitizarCelular(businessForm.telefono);
    const whatsappSanitizado = sanitizarCelular(businessForm.whatsapp);
    if (rucSanitizado && rucSanitizado.length !== 11) {
      setError("El RUC debe tener exactamente 11 digitos numericos");
      return;
    }
    if (telefonoSanitizado && telefonoSanitizado.length !== 9) {
      setError("El celular debe tener exactamente 9 digitos numericos");
      return;
    }
    if (whatsappSanitizado && whatsappSanitizado.length !== 9) {
      setError("El WhatsApp debe tener exactamente 9 digitos numericos");
      return;
    }

    try {
      setSavingBusiness(true);
      setError("");
      setSuccess("");

      const actualizado = await negocioService.update(negocioId, {
        nombre: businessForm.nombre.trim(),
        tipo: businessForm.tipo,
        descripcion: businessForm.descripcion.trim() || undefined,
        ruc: rucSanitizado || undefined,
        razon_social: businessForm.razon_social.trim() || undefined,
        documento_propietario: businessForm.documento_propietario.trim() || undefined,
        email: businessForm.email.trim() || undefined,
        telefono: telefonoSanitizado || undefined,
        whatsapp: whatsappSanitizado || undefined,
        pais: businessForm.pais.trim() || undefined,
        direccion: businessForm.direccion.trim() || undefined,
        departamento: businessForm.departamento.trim() || undefined,
        provincia: businessForm.provincia.trim() || undefined,
        distrito: businessForm.distrito.trim() || undefined,
        codigo_postal: businessForm.codigo_postal.trim() || undefined,
        moneda: businessForm.moneda.trim() || undefined,
        zona_horaria: businessForm.zona_horaria.trim() || undefined,
        idioma: businessForm.idioma.trim() || undefined,
      });

      let configSunatGuardada = true;
      try {
        await negocioService.updateConfiguracion(negocioId, {
          integracion_sunat: vincularComprobantesSunat,
        });
      } catch {
        configSunatGuardada = false;
      }

      setNegocio(actualizado);
      setSuccess(
        configSunatGuardada
          ? "Datos de la empresa actualizados correctamente"
          : "Datos de la empresa actualizados, pero no se pudo guardar la vinculación SUNAT"
      );
      await cargarPlanStats();
    } catch (err) {
      console.error(err);
      setError("No se pudo actualizar los datos de la empresa");
    } finally {
      setSavingBusiness(false);
    }
  };

  const cargarCatalogoPlanes = useCallback(async (negocioIdArg?: number) => {
    const negocioId = negocioIdArg || getNegocioIdActivo();
    if (!negocioId) {
      setPlanCatalogo([]);
      return;
    }

    try {
      const data = await negocioService.getEditablePlanCatalog(negocioId);
      setPlanCatalogo(Array.isArray(data.planes) ? data.planes : []);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar el catálogo de planes"));
    }
  }, [getNegocioIdActivo]);

  const cargarConfiguracionSunat = useCallback(async (negocioIdArg?: number) => {
    const negocioId = negocioIdArg || getNegocioIdActivo();
    if (!negocioId) {
      setVincularComprobantesSunat(false);
      return;
    }

    try {
      const cfg = await negocioService.getConfiguracion(negocioId);
      setVincularComprobantesSunat(Boolean(cfg?.integracion_sunat));
    } catch {
      setVincularComprobantesSunat(false);
    }
  }, [getNegocioIdActivo]);

  const cargarNegociosSuperadmin = useCallback(async () => {
    if (!isSuperadmin) return;
    try {
      const items = await negocioService.list();
      const lista = items || [];
      setNegociosDisponibles(lista);

      const negocioSesion = parseNumero(getStorageItem("negocio_id"));
      const negocioSesionValido = lista.some((item) => item.id === negocioSesion) ? negocioSesion : 0;
      const fallbackId = negocioSesionValido || Number(lista[0]?.id || 0);

      setNegocioSeleccionadoId((prev) => {
        if (prev && lista.some((item) => item.id === prev)) return prev;
        return fallbackId;
      });

      if (typeof window !== "undefined") {
        if (fallbackId) {
          window.localStorage.setItem("negocio_id", String(fallbackId));
        } else {
          window.localStorage.removeItem("negocio_id");
        }
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar negocios"));
    }
  }, [isSuperadmin]);

  const cargarHistorialPlanes = useCallback(async (negocioIdArg?: number) => {
    const negocioId = negocioIdArg || getNegocioIdActivo();
    if (!negocioId) {
      setHistorialPlanes([]);
      return;
    }

    try {
      setLoadingHistorialPlanes(true);
      const data = await negocioService.getPlanHistory(negocioId);
      const lista = Array.isArray(data) ? data : [];
      setHistorialPlanes(lista);

      const ultimoCanal = normalizarCanalPago(String(lista[0]?.canal_pago || ""));
      setSolicitudPlan((prev) => ({ ...prev, canal_pago: ultimoCanal }));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar historial de planes"));
    } finally {
      setLoadingHistorialPlanes(false);
    }
  }, [getNegocioIdActivo]);

  const cargarCuentasCobro = useCallback(async (negocioIdArg?: number) => {
    const negocioId = negocioIdArg || getNegocioIdActivo();
    if (!negocioId) {
      setPaymentDestinations(PAYMENT_DESTINATIONS_DEFAULT);
      return;
    }

    try {
      const data = await negocioService.getPaymentDestinations(negocioId);
      setPaymentDestinations(normalizarPaymentDestinations(data?.cuentas));
    } catch (err: unknown) {
      setPaymentDestinations(PAYMENT_DESTINATIONS_DEFAULT);
      setError(getApiErrorMessage(err, "No se pudieron cargar las cuentas para pago"));
    }
  }, [getNegocioIdActivo]);

  const guardarCuentasCobro = async () => {
    const negocioId = getNegocioIdActivo();
    if (!isSuperadmin) return;
    if (!negocioId) {
      setError("Selecciona una empresa cliente para guardar cuentas de pago");
      return;
    }

    try {
      setSavingPaymentDestinations(true);
      setError("");
      setSuccess("");
      const payload = normalizarPaymentDestinations(paymentDestinations);
      const data = await negocioService.updatePaymentDestinations(negocioId, payload);
      setPaymentDestinations(normalizarPaymentDestinations(data.cuentas));
      setSuccess(data.mensaje || "Cuentas para pago actualizadas");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudieron actualizar las cuentas para pago"));
    } finally {
      setSavingPaymentDestinations(false);
    }
  };

  const actualizarCuentaCobro = (
    canal: CanalPago,
    campo: "titulo" | "detalle",
    value: string
  ) => {
    setPaymentDestinations((prev) => {
      const actual = prev[canal];
      if (campo === "titulo") {
        return {
          ...prev,
          [canal]: {
            ...actual,
            titulo: value,
          },
        };
      }

      const detalle = value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);
      return {
        ...prev,
        [canal]: {
          ...actual,
          detalle,
        },
      };
    });
  };

  const cargarBondadesPlanGratuito = useCallback(async (negocioIdArg?: number) => {
    const negocioId = negocioIdArg || getNegocioIdActivo();
    if (!isSuperadmin || !negocioId) return;

    try {
      const data = await negocioService.getFreePlanPerks(negocioId);

      setFreePlanBoost((prev) => ({
        ...prev,
        usuarios_source_plan: data.custom.usuarios_limite != null && data.custom.usuarios_limite > 1 ? "BASICO" : "GRATUITO",
        habilitar_reportes: Boolean(data.custom.reportes_habilitado),
        reportes_source_plan: "PRO",
        habilitar_backups: Boolean(data.custom.backups_habilitado),
        backups_source_plan: "PRO",
        usuarios_limite: data.usuarios_limite,
        reportes_limite: data.reportes_limite,
        backups_limite: data.backups_limite,
      }));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar bondades del plan gratuito"));
    }
  }, [getNegocioIdActivo, isSuperadmin]);

  const cargarMontosPlanes = useCallback(async (negocioIdArg?: number) => {
    const negocioId = negocioIdArg || getNegocioIdActivo();
    if (!negocioId) return;
    try {
      const data = await negocioService.getPlanAmounts(negocioId);
      setPlanAmounts(data.montos);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar montos de planes"));
    }
  }, [getNegocioIdActivo]);

  const resolverNegocioObjetivo = async (accion: string) => {
    const negocioId = getNegocioIdActivo();
    if (negocioId) return negocioId;

    if (isSuperadmin && negociosDisponibles.length > 0) {
      const fallbackId = Number(negociosDisponibles[0]?.id || 0);
      if (fallbackId) {
        setNegocioSeleccionadoId(fallbackId);
        return fallbackId;
      }
    }

    return 0;
  };

  const guardarMontosPlanes = async () => {
    if (!isSuperadmin) return;
    const negocioId = await resolverNegocioObjetivo("guardar montos");
    if (!negocioId) {
      setError("Selecciona explicitamente el negocio objetivo para guardar montos");
      return;
    }

    try {
      setSavingPlanAmounts(true);
      setError("");
      setSuccess("");
      const data = await negocioService.updatePlanAmounts(negocioId, planAmounts);
      setPlanAmounts(data.montos);
      setSuccess(data.mensaje);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo actualizar montos de planes"));
    } finally {
      setSavingPlanAmounts(false);
    }
  };

  const actualizarCampoPlanCatalogo = (
    codigo: string,
    campo: "usuarios_limite" | "reportes_habilitado" | "reportes_limite" | "backups_habilitado" | "backups_limite" | "soporte_habilitado" | "reinicio_habilitado" | "productos_limite" | "sunat_habilitado",
    valor: number | boolean | null,
  ) => {
    setPlanCatalogo((prev) => prev.map((plan) => {
      if (plan.codigo !== codigo) return plan;
      const next = { ...plan, [campo]: valor };
      if (campo === "reportes_habilitado" && !Boolean(valor)) {
        next.reportes_limite = 0;
      }
      if (campo === "backups_habilitado" && !Boolean(valor)) {
        next.backups_limite = 0;
      }
      return next;
    }));
  };

  const guardarLimitesPlanes = async () => {
    if (!isSuperadmin) return;
    const negocioId = await resolverNegocioObjetivo("guardar limites");
    if (!negocioId) {
      setError("Selecciona explicitamente el negocio objetivo para guardar limites");
      return;
    }

    try {
      setSavingPlanLimits(true);
      setError("");
      setSuccess("");
      const payload = planCatalogo.map((plan) => ({
        codigo: plan.codigo,
        usuarios_limite: plan.usuarios_limite,
        reportes_habilitado: Boolean(plan.reportes_habilitado),
        reportes_limite: plan.reportes_habilitado ? plan.reportes_limite : 0,
        backups_habilitado: Boolean(plan.backups_habilitado),
        backups_limite: plan.backups_habilitado ? plan.backups_limite : 0,
        soporte_habilitado: Boolean(plan.soporte_habilitado),
        reinicio_habilitado: Boolean(plan.reinicio_habilitado),
        productos_limite: plan.productos_limite,
        sunat_habilitado: Boolean(plan.sunat_habilitado),
      }));
      const data = await negocioService.updateEditablePlanCatalog(negocioId, payload);
      setPlanCatalogo(Array.isArray(data.planes) ? data.planes : []);
      setSuccess(data.mensaje || "Limites de planes actualizados");
      await cargarPlanStats();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo actualizar limites de planes"));
    } finally {
      setSavingPlanLimits(false);
    }
  };

  const guardarBondadesPlanGratuito = async () => {
    const negocioId = getNegocioIdActivo();
    if (!isSuperadmin) return;
    if (!negocioId) {
      setError("Selecciona un negocio para guardar bondades");
      return;
    }

    try {
      setSavingFreePlanBoost(true);
      setError("");
      setSuccess("");
      const data = await negocioService.updateFreePlanPerks(negocioId, {
        usuarios_source_plan: freePlanBoost.usuarios_source_plan,
        habilitar_reportes: freePlanBoost.habilitar_reportes,
        reportes_source_plan: freePlanBoost.reportes_source_plan,
        habilitar_backups: freePlanBoost.habilitar_backups,
        backups_source_plan: freePlanBoost.backups_source_plan,
      });

      setFreePlanBoost((prev) => ({
        ...prev,
        usuarios_limite: data.usuarios_limite,
        reportes_limite: data.reportes_limite,
        backups_limite: data.backups_limite,
      }));
      setSuccess(data.mensaje);
      await cargarPlanStats();
      await cargarCatalogoPlanes();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo actualizar bondades del plan gratuito"));
    } finally {
      setSavingFreePlanBoost(false);
    }
  };

  const cambiarPlanNegocio = async (planCodigo: string) => {
    if (!isSuperadmin) return;
    const negocioId = await resolverNegocioObjetivo("aplicar el plan");
    if (!negocioId) {
      setError("Selecciona explicitamente el negocio objetivo para aplicar cambios de plan");
      return;
    }
    if (normalizarPlan(planCodigo) === normalizarPlan(businessForm.plan)) return;

    try {
      setChangingPlan(true);
      setError("");
      setSuccess("");
      const actualizado = await negocioService.update(negocioId, { plan: normalizarPlan(planCodigo) });
      setNegocio(actualizado);
      setBusinessForm((prev) => ({ ...prev, plan: normalizarPlan(actualizado.plan) }));
      setSuccess(`Plan actualizado a ${nombrePlan(actualizado.plan)} correctamente`);
      await cargarPlanStats();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo actualizar el plan"));
    } finally {
      setChangingPlan(false);
    }
  };

  const datosPlanSimulado = planCatalogo.find((p) => p.codigo === normalizarPlan(planSimulado)) || null;
  const datosPlanActual = planCatalogo.find((p) => p.codigo === normalizarPlan(businessForm.plan)) || null;
  const planCatalogoVisible = planCatalogo.filter((p) => PLANES_VISIBLES_EN_SECCION.includes(p.codigo as (typeof PLANES_VISIBLES_EN_SECCION)[number]));
  const planCatalogoBondades = planCatalogo.filter((p) => PLAN_BONDAD_SOURCES.includes(p.codigo as (typeof PLAN_BONDAD_SOURCES)[number]));
  const planCatalogoBondadesVisible = planCatalogoBondades.length > 0 ? planCatalogoBondades : planCatalogoVisible;
  const datosPlanBaseGratuito = planCatalogo.find((p) => p.codigo === "GRATUITO") || null;

  const datosPlanGratuitoPromocional = {
    codigo: "GRATUITO",
    nombre: "Gratuito",
    usuarios_limite: freePlanBoost.usuarios_limite ?? datosPlanBaseGratuito?.usuarios_limite ?? 1,
    reportes_habilitado: freePlanBoost.habilitar_reportes,
    reportes_limite: freePlanBoost.habilitar_reportes ? (freePlanBoost.reportes_limite ?? 0) : 0,
    backups_habilitado: freePlanBoost.habilitar_backups,
    backups_limite: freePlanBoost.habilitar_backups ? (freePlanBoost.backups_limite ?? 0) : 0,
    soporte_habilitado: Boolean(datosPlanBaseGratuito?.soporte_habilitado ?? true),
    productos_limite: datosPlanBaseGratuito?.productos_limite ?? 100,
    sunat_habilitado: Boolean(datosPlanBaseGratuito?.sunat_habilitado ?? false),
  };

  const datosPlanSimuladoBase = normalizarPlan(planSimulado) === "GRATUITO"
    ? datosPlanGratuitoPromocional
    : datosPlanSimulado;

  const datosPlanSimuladoEfectivo = !datosPlanSimuladoBase
    ? null
    : simuladorOverride.habilitado
      ? {
          ...datosPlanSimuladoBase,
          usuarios_limite: simuladorOverride.usuarios_ilimitado ? null : simuladorOverride.usuarios_limite,
          reportes_habilitado: simuladorOverride.reportes_habilitado,
          reportes_limite: simuladorOverride.reportes_habilitado
            ? (simuladorOverride.reportes_ilimitado ? null : simuladorOverride.reportes_limite)
            : 0,
          backups_habilitado: simuladorOverride.backups_habilitado,
          backups_limite: simuladorOverride.backups_habilitado
            ? (simuladorOverride.backups_ilimitado ? null : simuladorOverride.backups_limite)
            : 0,
        }
      : datosPlanSimuladoBase;
  const datosPlanActualEfectivo = normalizarPlan(businessForm.plan) === "GRATUITO"
    ? datosPlanGratuitoPromocional
    : datosPlanActual;

  const estadoModuloSimulado = (modulo: typeof MODULOS_BASE[number]) => {
    if (!datosPlanSimuladoEfectivo) return false;
    if (modulo === "Reportes") return datosPlanSimuladoEfectivo.reportes_habilitado;
    if (modulo === "Backups") return datosPlanSimuladoEfectivo.backups_habilitado;
    return true;
  };

  const estadoModuloActual = (modulo: typeof MODULOS_BASE[number]) => {
    if (!datosPlanActualEfectivo) return false;
    if (modulo === "Reportes") return datosPlanActualEfectivo.reportes_habilitado;
    if (modulo === "Backups") return datosPlanActualEfectivo.backups_habilitado;
    return true;
  };

  const formatLimite = (value: number | null | undefined) => (value == null ? "Ilimitado" : String(value));

  const compararLimite = (actual: number | null | undefined, simulado: number | null | undefined) => {
    const a = actual ?? Number.POSITIVE_INFINITY;
    const b = simulado ?? Number.POSITIVE_INFINITY;
    if (a === b) return "igual";
    return b > a ? "mejora" : "recorte";
  };

  const modulosActivosAntes = MODULOS_BASE.reduce((acc, modulo) => acc + (estadoModuloActual(modulo) ? 1 : 0), 0);
  const modulosActivosDespues = MODULOS_BASE.reduce((acc, modulo) => acc + (estadoModuloSimulado(modulo) ? 1 : 0), 0);
  const modulosQueSeActivan = MODULOS_BASE.filter((modulo) => !estadoModuloActual(modulo) && estadoModuloSimulado(modulo)).length;
  const modulosQueSeDesactivan = MODULOS_BASE.filter((modulo) => estadoModuloActual(modulo) && !estadoModuloSimulado(modulo)).length;
  const deltaUsuarios = compararLimite(datosPlanActualEfectivo?.usuarios_limite, datosPlanSimuladoEfectivo?.usuarios_limite);
  const deltaReportes = (datosPlanActualEfectivo?.reportes_habilitado === datosPlanSimuladoEfectivo?.reportes_habilitado)
    ? compararLimite(datosPlanActualEfectivo?.reportes_limite, datosPlanSimuladoEfectivo?.reportes_limite)
    : ((datosPlanSimuladoEfectivo?.reportes_habilitado ? 1 : 0) >= (datosPlanActualEfectivo?.reportes_habilitado ? 1 : 0) ? "mejora" : "recorte");
  const deltaBackups = (datosPlanActualEfectivo?.backups_habilitado === datosPlanSimuladoEfectivo?.backups_habilitado)
    ? compararLimite(datosPlanActualEfectivo?.backups_limite, datosPlanSimuladoEfectivo?.backups_limite)
    : ((datosPlanSimuladoEfectivo?.backups_habilitado ? 1 : 0) >= (datosPlanActualEfectivo?.backups_habilitado ? 1 : 0) ? "mejora" : "recorte");
  const scoreImpacto =
    (modulosQueSeActivan * 2) -
    (modulosQueSeDesactivan * 2) +
    (deltaUsuarios === "mejora" ? 3 : deltaUsuarios === "recorte" ? -3 : 0) +
    (deltaReportes === "mejora" ? 3 : deltaReportes === "recorte" ? -3 : 0) +
    (deltaBackups === "mejora" ? 3 : deltaBackups === "recorte" ? -3 : 0);
  const riesgoImpacto = scoreImpacto >= 5 ? "Bajo" : scoreImpacto >= 0 ? "Medio" : "Alto";

  const obtenerPlanEfectivo = (plan: {
    codigo: string;
    nombre: string;
    usuarios_limite: number | null;
    reportes_habilitado: boolean;
    reportes_limite: number | null;
    backups_habilitado: boolean;
    backups_limite: number | null;
    soporte_habilitado: boolean;
    productos_limite: number | null;
    sunat_habilitado: boolean;
  }) => {
    // Superadmin debe ver exactamente el catalogo editable guardado en esta pantalla.
    if (plan.codigo === "GRATUITO" && !isSuperadmin) return datosPlanGratuitoPromocional;
    return plan;
  };

  const consumoUsuarios = planStats?.usuarios.consumidos ?? 0;
  const consumoReportes = planStats?.reportes.consumidos ?? 0;
  const consumoBackups = planStats?.backups.consumidos ?? 0;
  const consumoProductos = planStats?.productos?.consumidos ?? 0;
  const consumoSoporte = planStats?.soporte?.consumidos ?? 0;
  const sunatRequeridoPorNegocio = Boolean(vincularComprobantesSunat);

  const planSugerido = planCatalogoVisible
    .map((plan) => obtenerPlanEfectivo(plan))
    .find((plan) => {
      const usuariosOk = plan.usuarios_limite == null || plan.usuarios_limite >= consumoUsuarios;
      const reportesOk = plan.reportes_habilitado
        ? (plan.reportes_limite == null || plan.reportes_limite >= consumoReportes)
        : consumoReportes === 0;
      const backupsOk = plan.backups_habilitado
        ? (plan.backups_limite == null || plan.backups_limite >= consumoBackups)
        : consumoBackups === 0;
      const productosOk = plan.productos_limite == null || plan.productos_limite >= consumoProductos;
      const soporteOk = plan.soporte_habilitado || consumoSoporte === 0;
      const sunatOk = !sunatRequeridoPorNegocio || plan.sunat_habilitado;
      return usuariosOk && reportesOk && backupsOk && productosOk && soporteOk && sunatOk;
    }) || null;

  const resumenSugerencia = planSugerido
    ? `Sugerido: ${nombrePlan(planSugerido.codigo)} para ${consumoUsuarios} usuarios, ${consumoReportes} reportes, ${consumoProductos} productos y ${consumoSoporte} casos de soporte.`
    : "No hay un plan visible que cubra totalmente el consumo actual. Revisa limites y montos.";

  const evaluarSemaforoPlan = (plan: {
    codigo: string;
    nombre: string;
    usuarios_limite: number | null;
    reportes_habilitado: boolean;
    reportes_limite: number | null;
    backups_habilitado: boolean;
    backups_limite: number | null;
    soporte_habilitado: boolean;
    productos_limite: number | null;
    sunat_habilitado: boolean;
  }) => {
    const objetivo = obtenerPlanEfectivo(plan);
    const actual = datosPlanActualEfectivo;
    if (!actual) return { tone: "neutral", text: "Sin referencia" };

    const du = compararLimite(actual.usuarios_limite, objetivo.usuarios_limite);
    const dr = (actual.reportes_habilitado === objetivo.reportes_habilitado)
      ? compararLimite(actual.reportes_limite, objetivo.reportes_limite)
      : ((objetivo.reportes_habilitado ? 1 : 0) >= (actual.reportes_habilitado ? 1 : 0) ? "mejora" : "recorte");
    const db = (actual.backups_habilitado === objetivo.backups_habilitado)
      ? compararLimite(actual.backups_limite, objetivo.backups_limite)
      : ((objetivo.backups_habilitado ? 1 : 0) >= (actual.backups_habilitado ? 1 : 0) ? "mejora" : "recorte");

    const tieneRecorte = du === "recorte" || dr === "recorte" || db === "recorte";
    const tieneMejora = du === "mejora" || dr === "mejora" || db === "mejora";

    if (tieneRecorte) return { tone: "down", text: "Riesgo: recorte" };
    if (planSugerido && normalizarPlan(planSugerido.codigo) === normalizarPlan(plan.codigo)) {
      return { tone: "up", text: "Recomendado" };
    }
    if (tieneMejora) return { tone: "up", text: "Mejora" };
    return { tone: "neutral", text: "Neutro" };
  };

  const planControlSeleccionadoData = planCatalogoVisible.find((p) => p.codigo === normalizarPlan(planControlSeleccionado)) || planCatalogoVisible[0] || null;
  const planControlActivo = planControlSeleccionadoData
    ? normalizarPlan(businessForm.plan) === planControlSeleccionadoData.codigo
    : false;
  const planControlSimulado = planControlSeleccionadoData
    ? normalizarPlan(planSimulado) === planControlSeleccionadoData.codigo
    : false;
  const planControlSemaforo = planControlSeleccionadoData
    ? evaluarSemaforoPlan(planControlSeleccionadoData)
    : { tone: "neutral", text: "Sin referencia" };
  const planControlMontoKey = planControlSeleccionadoData
    ? PLAN_PRICE_MAP[planControlSeleccionadoData.codigo] as keyof typeof planAmounts
    : null;
  const negocioActivoId = getNegocioIdActivo();
  const planControlAccionRequiereNegocio =
    (planControlAccion === "aplicar" || planControlAccion === "guardar_monto" || planControlAccion === "guardar_limites")
    && !negocioActivoId;
  const canalPagoSeleccionado = normalizarCanalPago(solicitudPlan.canal_pago);
  const destinoCobroSeleccionado = paymentDestinations[canalPagoSeleccionado] || PAYMENT_DESTINATIONS_DEFAULT[canalPagoSeleccionado];

  const copiarBondadesDesdePlan = (codigoPlan: string) => {
    const plan = planCatalogo.find((p) => p.codigo === normalizarPlan(codigoPlan));
    if (!plan) return;
    setFreePlanBoost((prev) => ({
      ...prev,
      usuarios_source_plan: plan.codigo,
      usuarios_limite: plan.usuarios_limite,
      habilitar_reportes: Boolean(plan.reportes_habilitado),
      reportes_source_plan: plan.codigo,
      reportes_limite: plan.reportes_limite,
      habilitar_backups: Boolean(plan.backups_habilitado),
      backups_source_plan: plan.codigo,
      backups_limite: plan.backups_limite,
    }));
  };

  const ejecutarAccionPlanEjecutiva = async () => {
    if (!planControlSeleccionadoData) return;
    if ((planControlAccion === "aplicar" || planControlAccion === "guardar_monto" || planControlAccion === "guardar_limites") && !negocioActivoId) {
      setError("Selecciona un negocio para ejecutar esta accion");
      return;
    }
    if (planControlAccion === "simular") {
      setPlanSimulado(planControlSeleccionadoData.codigo);
      return;
    }
    if (planControlAccion === "aplicar") {
      await cambiarPlanNegocio(planControlSeleccionadoData.codigo);
      return;
    }
    if (planControlAccion === "guardar_monto") {
      await guardarMontosPlanes();
      return;
    }
    if (planControlAccion === "guardar_limites") {
      await guardarLimitesPlanes();
      return;
    }
    if (planControlAccion === "bondades") {
      if (planControlSeleccionadoData.codigo !== "GRATUITO") {
        setError("La edicion de bondades aplica solo para el plan Gratuito");
        return;
      }
      irASeccion("cfg-plan-bondades-gratuito");
    }
  };

  const sincronizarOverrideConPlanBase = useCallback(() => {
    if (!datosPlanSimuladoBase) return;
    const next = {
      habilitado: false,
      usuarios_ilimitado: datosPlanSimuladoBase.usuarios_limite == null,
      usuarios_limite: datosPlanSimuladoBase.usuarios_limite ?? 0,
      reportes_habilitado: Boolean(datosPlanSimuladoBase.reportes_habilitado),
      reportes_ilimitado: datosPlanSimuladoBase.reportes_limite == null,
      reportes_limite: datosPlanSimuladoBase.reportes_limite ?? 0,
      backups_habilitado: Boolean(datosPlanSimuladoBase.backups_habilitado),
      backups_ilimitado: datosPlanSimuladoBase.backups_limite == null,
      backups_limite: datosPlanSimuladoBase.backups_limite ?? 0,
    };

    setSimuladorOverride((prev) => {
      if (
        prev.habilitado === next.habilitado &&
        prev.usuarios_ilimitado === next.usuarios_ilimitado &&
        prev.usuarios_limite === next.usuarios_limite &&
        prev.reportes_habilitado === next.reportes_habilitado &&
        prev.reportes_ilimitado === next.reportes_ilimitado &&
        prev.reportes_limite === next.reportes_limite &&
        prev.backups_habilitado === next.backups_habilitado &&
        prev.backups_ilimitado === next.backups_ilimitado &&
        prev.backups_limite === next.backups_limite
      ) {
        return prev;
      }
      return next;
    });
  }, [datosPlanSimuladoBase]);

  const cargarEscenariosSimulador = useCallback(async () => {
    const negocioId = getNegocioIdActivo();
    if (!isSuperadmin || !negocioId) {
      setSimuladorEscenarios([]);
      return;
    }
    try {
      const data = await negocioService.getSimulationScenarios(negocioId);
      setSimuladorEscenarios(Array.isArray(data.escenarios) ? data.escenarios : []);
    } catch {
      setSimuladorEscenarios([]);
    }
  }, [getNegocioIdActivo, isSuperadmin]);

  const guardarEscenariosSimulador = async (escenarios: SimuladorEscenario[]) => {
    const negocioId = getNegocioIdActivo();
    if (!isSuperadmin || !negocioId) return;
    try {
      const data = await negocioService.updateSimulationScenarios(negocioId, escenarios);
      setSimuladorEscenarios(Array.isArray(data.escenarios) ? data.escenarios : []);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudieron guardar los escenarios del simulador"));
    }
  };

  const guardarEscenarioActual = async () => {
    if (!isSuperadmin) return;
    const nombre = simuladorEscenarioNombre.trim();
    if (!nombre) {
      setError("Ingresa un nombre para guardar el escenario");
      return;
    }
    const nuevo: SimuladorEscenario = {
      id: `esc-${Date.now()}`,
      nombre,
      planCodigo: normalizarPlan(planSimulado),
      override: { ...simuladorOverride, habilitado: true },
      fecha: new Date().toISOString(),
    };
    const actualizados = [nuevo, ...simuladorEscenarios].slice(0, 20);
    await guardarEscenariosSimulador(actualizados);
    setSimuladorEscenarioNombre("");
    setSuccess(`Escenario '${nombre}' guardado`);
  };

  const cargarEscenarioGuardado = (escenario: SimuladorEscenario) => {
    setPlanSimulado(normalizarPlan(escenario.planCodigo));
    setSimuladorOverride(escenario.override);
    setSuccess(`Escenario '${escenario.nombre}' cargado`);
  };

  const eliminarEscenarioGuardado = async (escenarioId: string) => {
    const actualizados = simuladorEscenarios.filter((esc) => esc.id !== escenarioId);
    await guardarEscenariosSimulador(actualizados);
  };

  const aplicarPresetEjecutivo = (preset: "conservador" | "comercial" | "premium") => {
    if (preset === "conservador") {
      setPlanSimulado("BASICO");
      setSimuladorOverride({
        habilitado: true,
        usuarios_ilimitado: false,
        usuarios_limite: 3,
        reportes_habilitado: false,
        reportes_ilimitado: false,
        reportes_limite: 0,
        backups_habilitado: false,
        backups_ilimitado: false,
        backups_limite: 0,
      });
      return;
    }
    if (preset === "comercial") {
      setPlanSimulado("PRO");
      setSimuladorOverride({
        habilitado: true,
        usuarios_ilimitado: false,
        usuarios_limite: 12,
        reportes_habilitado: true,
        reportes_ilimitado: false,
        reportes_limite: 3000,
        backups_habilitado: true,
        backups_ilimitado: false,
        backups_limite: 30,
      });
      return;
    }
    setPlanSimulado("PREMIUM");
    setSimuladorOverride({
      habilitado: true,
      usuarios_ilimitado: true,
      usuarios_limite: 0,
      reportes_habilitado: true,
      reportes_ilimitado: true,
      reportes_limite: 0,
      backups_habilitado: true,
      backups_ilimitado: true,
      backups_limite: 0,
    });
  };

  useEffect(() => {
    const rawUsuario = getStorageItem("usuario");
    if (!rawUsuario) return;
    try {
      const parsed = JSON.parse(rawUsuario);
      const rol = normalizarRol(String(parsed?.rol || ""));
      const roles = Array.isArray(parsed?.roles)
        ? parsed.roles.map((r: string) => normalizarRol(String(r || "")))
        : [];
      const esSuper = rol === "SUPERADMIN" || roles.includes("SUPERADMIN") || parseNumero(getStorageItem("usuario_id")) === 1;
      setIsSuperadmin(esSuper);
      setSofiaResponseLevel(resolveSofiaLevelByRole(rol, roles, esSuper));

      if (!esSuper) {
        const negocioIdLocal = getNegocioIdFromSession();
        setNegocioSeleccionadoId(negocioIdLocal);
      }
    } catch {
      setIsSuperadmin(false);
      setSofiaResponseLevel("USUARIO_FINAL");
      setNegocioSeleccionadoId(getNegocioIdFromSession());
    }
  }, []);

  useEffect(() => {
    if (isSuperadmin) {
      void cargarNegociosSuperadmin();
    }
  }, [isSuperadmin, cargarNegociosSuperadmin]);

  useEffect(() => {
    if (!isSuperadmin || negociosDisponibles.length === 0) return;
    const existeSeleccion = negociosDisponibles.some((n) => n.id === negocioSeleccionadoId);
    if (!existeSeleccion) {
      const fallbackId = Number(negociosDisponibles[0]?.id || 0);
      setNegocioSeleccionadoId(fallbackId);
      if (typeof window !== "undefined") {
        if (fallbackId) {
          window.localStorage.setItem("negocio_id", String(fallbackId));
        } else {
          window.localStorage.removeItem("negocio_id");
        }
      }
    }
  }, [isSuperadmin, negociosDisponibles, negocioSeleccionadoId]);

  useEffect(() => {
    const negocioId = getNegocioIdActivo();
    if (!negocioId) return;
    void cargarBranding(negocioId);
    void cargarTiposNegocioDesdeProductos();
    void cargarConfiguracionSunat(negocioId);
    void cargarPlanStats();
    void cargarHistorialPlanes(negocioId);
    void cargarCuentasCobro(negocioId);
    void cargarCatalogoPlanes(negocioId);
    void cargarBondadesPlanGratuito(negocioId);
    void cargarMontosPlanes(negocioId);
  }, [
    negocioSeleccionadoId,
    isSuperadmin,
    getNegocioIdActivo,
    cargarBranding,
    cargarTiposNegocioDesdeProductos,
    cargarConfiguracionSunat,
    cargarPlanStats,
    cargarHistorialPlanes,
    cargarCuentasCobro,
    cargarCatalogoPlanes,
    cargarBondadesPlanGratuito,
    cargarMontosPlanes,
  ]);

  useEffect(() => {
    setPlanSimulado(normalizarPlan(businessForm.plan));
  }, [businessForm.plan]);

  useEffect(() => {
    sincronizarOverrideConPlanBase();
  }, [
    planSimulado,
    sincronizarOverrideConPlanBase,
  ]);

  useEffect(() => {
    if (isSuperadmin) return;
    const negocioId = getNegocioIdFromSession();
    if (!negocioId) return;
    void cargarBranding(negocioId);
    void cargarTiposNegocioDesdeProductos();
    void cargarConfiguracionSunat(negocioId);
    void cargarPlanStats();
    void cargarHistorialPlanes(negocioId);
    void cargarCuentasCobro(negocioId);
    void cargarCatalogoPlanes(negocioId);
    void cargarMontosPlanes(negocioId);
  }, [isSuperadmin, cargarBranding, cargarTiposNegocioDesdeProductos, cargarConfiguracionSunat, cargarPlanStats, cargarHistorialPlanes, cargarCuentasCobro, cargarCatalogoPlanes, cargarMontosPlanes]);

  useEffect(() => {
    void cargarEscenariosSimulador();
  }, [cargarEscenariosSimulador, negocioSeleccionadoId, isSuperadmin]);

  useEffect(() => {
    if (!isSuperadmin) {
      pendingPlanApprovalsRef.current = pendingPlanApprovals;
      if (pendingPlanApprovals > 0) {
        setPlanApprovalAlertText(`Tu solicitud de plan sigue en validacion. Pendientes: ${pendingPlanApprovals}.`);
      } else {
        setPlanApprovalAlertText("");
      }
      setPlanApprovalAlertPulse(false);
      return;
    }

    const prevPending = pendingPlanApprovalsRef.current;
    if (pendingPlanApprovals > prevPending) {
      const nuevos = pendingPlanApprovals - prevPending;
      const label = nuevos === 1 ? "nueva solicitud" : `${nuevos} nuevas solicitudes`;
      setPlanApprovalAlertText(`Alerta: ${label} de cambio de plan requieren aprobacion.`);
      setPlanApprovalAlertPulse(true);
    } else if (pendingPlanApprovals > 0) {
      setPlanApprovalAlertText(`Hay ${pendingPlanApprovals} solicitud(es) de plan pendiente(s) por revisar.`);
    } else {
      setPlanApprovalAlertText("");
      setPlanApprovalAlertPulse(false);
    }
    pendingPlanApprovalsRef.current = pendingPlanApprovals;
  }, [isSuperadmin, pendingPlanApprovals]);

  useEffect(() => {
    if (!planApprovalAlertPulse) return;
    const timeoutId = window.setTimeout(() => {
      setPlanApprovalAlertPulse(false);
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [planApprovalAlertPulse]);

  useEffect(() => {
    if (!isSuperadmin) return;
    const negocioId = getNegocioIdActivo();
    if (!negocioId) return;

    const intervalId = window.setInterval(() => {
      void cargarHistorialPlanes(negocioId);
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [isSuperadmin, negocioSeleccionadoId, getNegocioIdActivo, cargarHistorialPlanes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Mantener el acceso inicial en modo configuracion para evitar aperturas
    // o cambios de foco automaticos que resultan intrusivos.
    setConfigAccessMode("configuracion");
  }, []);

  useEffect(() => {
    // Apertura automatica desactivada: el modal se abre solo de forma manual.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("alvent_open_support_modal");
    }
  }, []);

  useEffect(() => {
    const handleMenuFocusConfig = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: ConfigAccessMode }>;
      const mode = customEvent.detail?.mode;
      if (mode === "soporte" || mode === "configuracion") {
        setConfigAccessMode(mode);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("alvent-config-menu-focus", handleMenuFocusConfig as EventListener);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("alvent-config-menu-focus", handleMenuFocusConfig as EventListener);
      }
    };
  }, []);

  const cargarTicketsSoporte = useCallback(async (negocioIdArg?: number) => {
    try {
      setLoadingSoporte(true);
      const negocioId = negocioIdArg || getNegocioIdActivo();
      const resp = await systemService.listarTicketsSoporte({
        negocioId: negocioId || undefined,
        estado: soporteFiltroEstado,
        prioridad: soporteFiltroPrioridad,
        page: soportePage,
        pageSize: soportePageSize,
      });
      setSoporteTickets(Array.isArray(resp?.tickets) ? resp.tickets : []);
      setSoporteTotal(Number(resp?.pagination?.total || 0));
      setSoporteTotalPages(Math.max(1, Number(resp?.pagination?.total_pages || 1)));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar el soporte técnico"));
    } finally {
      setLoadingSoporte(false);
    }
  }, [getNegocioIdActivo, soporteFiltroEstado, soporteFiltroPrioridad, soportePage, soportePageSize]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const negocioId = getNegocioIdActivo();
    const storageKey = buildChatStorageKey(isSuperadmin, negocioId);

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setSoporteChatMessages([buildWelcomeMessage()]);
        setSoporteClasificacion(null);
        setSoporteChatPrioridad("MEDIA");
        setChatPersistReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as {
        messages?: SoporteChatMessage[];
        prioridad?: SoportePrioridad;
        clasificacion?: SoporteClasificacion | null;
      };

      const restored = Array.isArray(parsed.messages) ? parsed.messages.slice(-24) : [];
      setSoporteChatMessages(restored.length > 0 ? restored : [buildWelcomeMessage()]);
      setSoporteChatPrioridad(parsed.prioridad || "MEDIA");
      setSoporteClasificacion(parsed.clasificacion || null);
    } catch {
      setSoporteChatMessages([buildWelcomeMessage()]);
      setSoporteClasificacion(null);
      setSoporteChatPrioridad("MEDIA");
    } finally {
      setChatPersistReady(true);
    }
  }, [isSuperadmin, negocioSeleccionadoId, getNegocioIdActivo]);

  useEffect(() => {
    if (typeof window === "undefined" || !chatPersistReady) return;
    const negocioId = getNegocioIdActivo();
    const storageKey = buildChatStorageKey(isSuperadmin, negocioId);
    const payload = {
      messages: soporteChatMessages.slice(-24),
      prioridad: soporteChatPrioridad,
      clasificacion: soporteClasificacion,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [chatPersistReady, isSuperadmin, negocioSeleccionadoId, getNegocioIdActivo, soporteChatMessages, soporteChatPrioridad, soporteClasificacion]);

  useEffect(() => {
    setSoportePage(1);
  }, [soporteFiltroEstado, soporteFiltroPrioridad, negocioSeleccionadoId]);

  useEffect(() => {
    const negocioId = getNegocioIdActivo();
    if (!negocioId && !isSuperadmin) {
      setSoporteTickets([]);
      return;
    }
    void cargarTicketsSoporte(negocioId || undefined);
  }, [isSuperadmin, negocioSeleccionadoId, getNegocioIdActivo, cargarTicketsSoporte, soportePage]);

  const enviarMensajeSoporteChat = async () => {
    if (loadingSugerenciaIa || creatingSoporte || loadingDiagnosticoSuperagente) return;

    const consulta = soporteChatInput.trim();
    if (consulta.length < 8) {
      setError("Describe mejor la consulta para usar SofIA");
      return;
    }

    const userMessage: SoporteChatMessage = {
      id: `soporte-user-${Date.now()}`,
      role: "user",
      text: consulta,
    };
    setSoporteChatMessages((prev) => [...prev, userMessage]);
    setSoporteChatInput("");

    const clasif = clasificarConsultaSoporte(consulta);
    setSoporteClasificacion(clasif);
    setSoporteChatPrioridad((prev) => elevarPrioridad(prev, clasif.prioridadSugerida));

    try {
      setLoadingSugerenciaIa(true);
      setError("");
      const resp = await systemService.sugerenciaIaSoporte({
        asunto: clasif.asunto,
        consulta: `${consulta}\n\n${buildSofiaOperatingContext(sofiaResponseLevel)}\n\n[Clasificación local]\nCategoría: ${clasif.categoria}\nPrioridad sugerida: ${clasif.prioridadSugerida}\nChecklist:\n- ${clasif.checklist.join("\n- ")}`,
      });
      setSoporteChatMessages((prev) => [
        ...prev,
        {
          id: `soporte-bot-${Date.now()}`,
          role: "bot",
          text: `${clasif.resumen}\n\n${resp.recomendacion}\n\nFuente: ${resp.origen}`,
          meta: `Categoria ${resp.categoria || clasif.categoria} | Prioridad sugerida ${clasif.prioridadSugerida} | Nivel ${resp.nivel || sofiaResponseLevel}`,
        },
      ]);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo generar sugerencia IA"));
      setSoporteChatMessages((prev) => [
        ...prev,
        {
          id: `soporte-bot-error-${Date.now()}`,
          role: "bot",
          text: construirFallbackSoporte(clasif),
          meta: "Fallback local activado",
        },
      ]);
    } finally {
      setLoadingSugerenciaIa(false);
    }
  };

  const escalarChatSoporte = async () => {
    if (loadingSugerenciaIa || creatingSoporte || loadingDiagnosticoSuperagente) return;

    const negocioId = getNegocioIdActivo();
    if (!negocioId && !isSuperadmin) {
      setError("Selecciona un negocio para registrar la consulta");
      return;
    }

    const ultimaConsulta = [...soporteChatMessages].reverse().find((m) => m.role === "user")?.text?.trim() || "";
    if (ultimaConsulta.length < 8) {
      setError("Primero envia una consulta en SofIA");
      return;
    }

    const clasif = soporteClasificacion || clasificarConsultaSoporte(ultimaConsulta);
    const ultimoBot = [...soporteChatMessages].reverse().find((m) => m.role === "bot")?.text?.trim() || "";
    const prioridadEscalada = elevarPrioridad(soporteChatPrioridad, clasif.prioridadSugerida);
    const guardianContext = isSuperadmin && guardianStatus
      ? `Guardian -> 5xx=${guardianStatus.metrics?.requests_5xx ?? 0}, excepciones=${guardianStatus.metrics?.exceptions_total ?? 0}, abiertos=${guardianStatus.open_incidents ?? 0}, safe_mode=${guardianStatus.safe_mode?.enabled ? "ON" : "OFF"}`
      : "";

    const consultaEscalada = [
      ultimaConsulta,
      "",
      "[Contexto de escalamiento]",
      `Categoría: ${clasif.categoria}`,
      `Confianza: ${Math.round(clasif.confianza * 100)}%`,
      `Prioridad sugerida: ${clasif.prioridadSugerida}`,
      `Checklist sugerido: ${clasif.checklist.join(" | ")}`,
      guardianContext,
      ultimoBot ? `Ultima respuesta bot: ${ultimoBot.slice(0, 380)}` : "",
    ].filter(Boolean).join("\n");

    try {
      setCreatingSoporte(true);
      setError("");
      const asunto = clasif.asunto;

      const resp = await systemService.crearTicketSoporte({
        asunto,
        consulta: consultaEscalada,
        prioridad: prioridadEscalada,
        negocio_id: negocioId || undefined,
      });

      setSoporteChatMessages((prev) => [
        ...prev,
        {
          id: `soporte-bot-ticket-${Date.now()}`,
          role: "bot",
          text: `Ticket #${resp.ticket.id} escalado a RENSOF con prioridad ${resp.ticket.prioridad} y categoría ${clasif.categoria.toUpperCase()}.`,
          meta: `Escalado con contexto ${Math.round(clasif.confianza * 100)}%`,
        },
      ]);

      setSuccess(resp.mensaje || "Consulta registrada");
      setSoportePage(1);
      await cargarTicketsSoporte(negocioId || undefined);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo registrar la consulta"));
    } finally {
      setCreatingSoporte(false);
    }
  };

  const limpiarConversacionChat = () => {
    setSoporteChatMessages([buildWelcomeMessage()]);
    setSoporteClasificacion(null);
    setSoporteChatPrioridad("MEDIA");
    setSoporteChatInput("");
  };

  const aplicarPromptRapido = (prompt: { text: string; prioridad: SoportePrioridad }) => {
    setSoporteChatInput(prompt.text);
    setSoporteChatPrioridad((prev) => elevarPrioridad(prev, prompt.prioridad));
  };

  const ejecutarDiagnosticoSuperagente = async () => {
    if (!isSuperadmin || loadingSugerenciaIa || creatingSoporte || loadingDiagnosticoSuperagente) return;

    try {
      setLoadingDiagnosticoSuperagente(true);
      setError("");

      const [healthResp, statusResp, incidentsResp] = await Promise.all([
        systemService.health(),
        systemService.guardianStatus(),
        systemService.guardianIncidentes({ limit: 8, includeAcked: false }),
      ]);

      const guardian = statusResp.guardian;
      const topIncident = Array.isArray(incidentsResp.items) && incidentsResp.items.length > 0
        ? incidentsResp.items[0]
        : null;

      const fiveXx = guardian?.metrics?.requests_5xx ?? 0;
      const exceptions = guardian?.metrics?.exceptions_total ?? 0;
      const openIncidents = guardian?.open_incidents ?? 0;
      const safeMode = guardian?.safe_mode?.enabled ? "ON" : "OFF";

      const recomendaciones: string[] = [];
      if (fiveXx > 0 || exceptions > 0) {
        recomendaciones.push("Revisar trazas de backend y endpoints con 5xx.");
      }
      if (openIncidents > 0) {
        recomendaciones.push("Confirmar/ack incidentes Guardian pendientes.");
      }
      if (safeMode === "ON") {
        recomendaciones.push("Validar impacto de Safe Mode antes de desactivarlo.");
      }
      if (recomendaciones.length === 0) {
        recomendaciones.push("Sin alertas criticas. Mantener monitoreo y ejecutar smoke UI cada deploy.");
      }

      const diagnostico = [
        "Diagnostico Superagente completado.",
        `Health API: ${healthResp?.status || "OK"}`,
        `Guardian: safe_mode=${safeMode}, abiertos=${openIncidents}, 5xx=${fiveXx}, excepciones=${exceptions}`,
        topIncident ? `Ultimo incidente: ${topIncident.title} [${topIncident.severity}]` : "Ultimo incidente: sin pendientes",
        "Acciones sugeridas:",
        ...recomendaciones.map((item, idx) => `${idx + 1}. ${item}`),
      ].join("\n");

      setSoporteChatMessages((prev) => [
        ...prev,
        {
          id: `soporte-bot-diagnostico-${Date.now()}`,
          role: "bot",
          text: diagnostico,
          meta: "Fuente: Guardian Runtime + Health",
        },
      ]);

      setConfigAccessMode("soporte");
      setShowSoporteChatModal(true);
      setSuccess("Diagnostico del Superagente generado en el chat de soporte");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo ejecutar el diagnostico del Superagente"));
    } finally {
      setLoadingDiagnosticoSuperagente(false);
    }
  };

  const abrirModalAtencionSoporte = (ticket: SoporteTicket, estadoInicial: SoporteEstado) => {
    if (!isSuperadmin) return;
    const template = inferIncidentTemplateKey(ticket);
    setTicketAtencion(ticket);
    setAtencionForm({
      estado: estadoInicial,
      respuesta: String(ticket.respuesta_superadmin || "").trim(),
    });
    setAtencionTemplateKey(template);

    if (!String(ticket.respuesta_superadmin || "").trim()) {
      setAtencionForm((prev) => ({
        ...prev,
        respuesta: buildTemplateReply(template, sofiaResponseLevel, ticket),
      }));
    }
    setShowAtencionSoporteModal(true);
  };

  const aplicarPlantillaAtencion = (append = false) => {
    if (!ticketAtencion) return;
    const plantilla = buildTemplateReply(atencionTemplateKey, sofiaResponseLevel, ticketAtencion);
    setAtencionForm((prev) => ({
      ...prev,
      respuesta: append && prev.respuesta.trim().length > 0
        ? `${prev.respuesta.trim()}\n\n${plantilla}`
        : plantilla,
    }));
  };

  const atenderTicketSoporte = async () => {
    if (!isSuperadmin || !ticketAtencion) return;

    if (atencionForm.respuesta.trim().length < 4) {
      setError("Debes ingresar una respuesta mínima para atender el ticket");
      return;
    }

    try {
      setUpdatingSoporteId(ticketAtencion.id);
      setError("");
      const resp = await systemService.atenderTicketSoporte(ticketAtencion.id, {
        estado: atencionForm.estado,
        respuesta_superadmin: atencionForm.respuesta.trim(),
      });
      setSuccess(resp.mensaje || "Ticket actualizado");
      setShowAtencionSoporteModal(false);
      setTicketAtencion(null);
      await cargarTicketsSoporte(getNegocioIdActivo() || undefined);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo actualizar el ticket"));
    } finally {
      setUpdatingSoporteId(null);
    }
  };

  const cargarGuardianRuntime = useCallback(async () => {
    if (!isSuperadmin) return;

    try {
      setLoadingGuardian(true);
      setLoadingGuardianIncidents(true);

      const [statusResp, incidentsResp] = await Promise.all([
        systemService.guardianStatus(),
        systemService.guardianIncidentes({ limit: 20, includeAcked: true }),
      ]);

      setGuardianStatus(statusResp.guardian || null);
      setGuardianIncidents(Array.isArray(incidentsResp.items) ? incidentsResp.items : []);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar Runtime Guardian"));
    } finally {
      setLoadingGuardian(false);
      setLoadingGuardianIncidents(false);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    if (!isSuperadmin) {
      setGuardianStatus(null);
      setGuardianIncidents([]);
      return;
    }

    void cargarGuardianRuntime();
    const intervalId = window.setInterval(() => {
      void cargarGuardianRuntime();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [isSuperadmin, cargarGuardianRuntime]);

  const actualizarSafeModeGuardian = async (enabled: boolean) => {
    if (!isSuperadmin || !guardianStatus) return;

    try {
      setGuardianSafeModeBusy(true);
      setError("");
      await systemService.guardianSafeMode(
        enabled,
        enabled ? "Activado manualmente desde panel Configuracion" : "Desactivado manualmente desde panel Configuracion"
      );
      setSuccess(`Guardian Safe Mode ${enabled ? "activado" : "desactivado"}`);
      await cargarGuardianRuntime();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo actualizar Safe Mode"));
    } finally {
      setGuardianSafeModeBusy(false);
    }
  };

  const confirmarIncidenteGuardian = async (incidentId: string) => {
    if (!isSuperadmin) return;

    try {
      setAckingGuardianIncidentId(incidentId);
      setError("");
      await systemService.guardianAckIncidente(incidentId, "Confirmado desde panel Configuracion");
      await cargarGuardianRuntime();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo confirmar incidente"));
    } finally {
      setAckingGuardianIncidentId(null);
    }
  };

  

  // ==========================
  // RESET SISTEMA
  // ==========================
  const resetSistema = async () => {
    try {
      setLoadingReset(true);
      setError("");
      setSuccess("");
      await systemService.reset(modo, password);

      setSuccess("Sistema reiniciado correctamente");

      setShowResetModal(false);
      setPassword("");
    } catch (err: any) {
      console.error(err?.response?.data || err);
      setError("Error al reiniciar sistema");
    } finally {
      setLoadingReset(false);
    }
  };

  const descargarBackup = async () => {
    if (!isSuperadmin) {
      setError("No tienes permisos para descargar backups.");
      return;
    }

    try {
      setLoadingBackup(true);
      setError("");
      setSuccess("");

      const res = await systemService.backup();
      const blob = new Blob([res.data], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const filename = `backup_alvent_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.db`;
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setSuccess("Backup generado y descargado correctamente");
      await cargarPlanStats();
    } catch (err) {
      console.error(err);
      setError("No se pudo generar el backup. Verifica los permisos y limites de tu plan.");
    } finally {
      setLoadingBackup(false);
    }
  };

  const solicitarCambioPlanCliente = async () => {
    const negocioId = getNegocioIdActivo();
    if (!negocioId) {
      setError("No se encontro negocio asociado");
      return;
    }

    if (!solicitudPlan.referencia_pago.trim()) {
      setError("Ingresa la referencia de pago para activar el plan");
      return;
    }

    if (!comprobantePagoFile) {
      setError("Adjunta el comprobante para validar el pago");
      return;
    }

    try {
      setSendingSolicitudPlan(true);
      setError("");
      setSuccess("");

      let comprobante_url: string | undefined;
      if (comprobantePagoFile) {
        const up = await negocioService.uploadPlanComprobante(negocioId, comprobantePagoFile);
        comprobante_url = up.url;
      }

      const resp = await negocioService.requestPlanChange(negocioId, {
        plan_objetivo: planPagoObjetivo,
        referencia_pago: solicitudPlan.referencia_pago.trim(),
        canal_pago: canalPagoSeleccionado,
        validacion_modo: "MANUAL",
        declaracion_anti_fraude: true,
        observaciones: solicitudPlan.observaciones.trim() || undefined,
        comprobante_url,
      });

      const detalleSeguridad = `Nivel de riesgo: ${resp.riesgo_nivel} (score ${resp.riesgo_score}). Validacion aplicada: ${resp.validacion_modo_aplicada}.`;
      setSuccess(`${resp.mensaje} ${detalleSeguridad}`);
      setShowPagoPlanModal(false);
      setComprobantePagoFile(null);
      setSolicitudPlan((prev) => ({ ...prev, referencia_pago: "", observaciones: "", declaracion_anti_fraude: true, validacion_modo: "MANUAL" }));
      await cargarBranding(negocioId);
      await cargarPlanStats();
      await cargarHistorialPlanes(negocioId);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo activar el plan con el pago registrado"));
    } finally {
      setSendingSolicitudPlan(false);
    }
  };

  const abrirPagoPlan = (planCodigo: string) => {
    const normalizado = normalizarPlan(planCodigo);
    setPlanPagoObjetivo(normalizado);
    setSolicitudPlan((prev) => ({ ...prev, plan_objetivo: normalizado }));
    setComprobantePagoFile(null);
    setShowPagoPlanModal(true);
  };

  const validarPagoPlanComoSuperadmin = async (
    planPagoId: number,
    accion: "APROBAR" | "RECHAZAR"
  ) => {
    const negocioId = getNegocioIdActivo();
    if (!isSuperadmin || !negocioId) {
      setError("Selecciona una empresa cliente para validar pagos");
      return;
    }

    try {
      setValidatingPlanPagoId(planPagoId);
      setError("");
      setSuccess("");
      const resp = await negocioService.validatePlanPayment(negocioId, planPagoId, accion);
      setSuccess(resp.mensaje);
      await cargarHistorialPlanes(negocioId);
      await cargarBranding(negocioId);
      await cargarPlanStats();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo validar el pago del plan"));
    } finally {
      setValidatingPlanPagoId(null);
    }
  };

  const planActual = nombrePlan(planStats?.plan || businessForm.plan || "-");
  const nombreEmpresa = negocio?.nombre || businessForm.nombre || "Empresa";
  const estadoBackups = planStats?.backups.habilitado ? "Habilitado" : "Bloqueado";
  const estadoReportes = planStats?.reportes.habilitado ? "Habilitado" : "Bloqueado";
  const reinicioHabilitadoPorPlan = isSuperadmin || Boolean(planStats?.reinicio?.habilitado ?? false);
  const guardianIncidentesPendientes = guardianIncidents.filter((incident) => !incident.acked);
  const guardianOldestPendingMinutes = guardianIncidentesPendientes.length > 0
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - Math.min(...guardianIncidentesPendientes.map((item) => new Date(item.timestamp).getTime())))
          / 60000
        )
      )
    : 0;
  const guardianRiskScore = (() => {
    if (!guardianStatus) return 0;
    const fiveXx = Number(guardianStatus.metrics?.requests_5xx || 0);
    const exceptions = Number(guardianStatus.metrics?.exceptions_total || 0);
    const consecutive5xx = Number(guardianStatus.metrics?.consecutive_5xx || 0);
    const openInc = Number(guardianStatus.open_incidents || 0);
    const safeModeOn = guardianStatus.safe_mode?.enabled ? 1 : 0;
    const agePenalty = Math.min(20, Math.floor(guardianOldestPendingMinutes / 5));

    const scoreRaw =
      (fiveXx * 2.4) +
      (exceptions * 1.6) +
      (consecutive5xx * 3.4) +
      (openInc * 5.5) +
      (safeModeOn * 12) +
      agePenalty;

    return Math.max(0, Math.min(100, Math.round(scoreRaw)));
  })();
  const guardianRiskBand = guardianRiskScore >= 67 ? "ROJO" : guardianRiskScore >= 34 ? "AMBAR" : "VERDE";
  const guardianRiskVariant = guardianRiskBand === "ROJO" ? "danger" : guardianRiskBand === "AMBAR" ? "warning" : "success";
  const guardianSlaTargetMin = 15;
  const guardianSlaBand = guardianOldestPendingMinutes <= guardianSlaTargetMin && guardianRiskScore < 67
    ? "Cumpliendo SLA"
    : guardianOldestPendingMinutes <= guardianSlaTargetMin * 2
      ? "SLA en riesgo"
      : "SLA fuera de objetivo";
  const guardianSlaVariant = guardianSlaBand === "Cumpliendo SLA" ? "success" : guardianSlaBand === "SLA en riesgo" ? "warning" : "danger";
  const guardianSlaProgress = Math.max(0, Math.min(100, Math.round((guardianOldestPendingMinutes / (guardianSlaTargetMin * 2)) * 100)));
  const rucInvalido = Boolean(businessForm.ruc) && businessForm.ruc.length !== 11;
  const telefonoInvalido = Boolean(businessForm.telefono) && businessForm.telefono.length !== 9;
  const whatsappInvalido = Boolean(businessForm.whatsapp) && businessForm.whatsapp.length !== 9;
  const negociosObjetivoFiltrados = negociosDisponibles.filter((item) => {
    if (negocioTipoFiltro === "todos") return true;
    return normalizarTipoNegocio(item.tipo) === negocioTipoFiltro;
  });
  const negociosObjetivoOpciones = negociosObjetivoFiltrados.length > 0
    ? negociosObjetivoFiltrados
    : negociosDisponibles;
  const planSugeridoActivo = planSugerido
    ? normalizarPlan(planSugerido.codigo) === normalizarPlan(businessForm.plan)
    : false;
  const puedeAplicarSugerido = Boolean(planSugerido) && !planSugeridoActivo && !changingPlan && !simuladorOverride.habilitado && Boolean(negocioActivoId);
  const formatPrecio = (value: number) => `S/${Number(value || 0).toFixed(0)}`;

  const planVisualCards: PlanVisualCardItem[] = planCatalogoVisible.map((plan) => {
    const codigo = normalizarPlan(plan.codigo);
    const meta = PLAN_VISUAL_META[codigo] || {
      subtitulo: "Alternativa configurable",
      lema: "Plan editable desde el panel propietario",
      accentClass: "pro" as const,
    };
    const planEfectivo = obtenerPlanEfectivo(plan);
    const planAmountKey = PLAN_PRICE_MAP[codigo] as keyof typeof planAmounts;
    const precio = planAmountKey ? formatPrecio(planAmounts[planAmountKey]) : "S/0";
    const esActual = normalizarPlan(businessForm.plan) === codigo;
    const esSugerido = Boolean(planSugerido) && normalizarPlan(planSugerido?.codigo) === codigo;

    const beneficios: PlanVisualCardItem["beneficios"] = [
      { icon: "user", text: `Usuarios: ${formatLimite(planEfectivo.usuarios_limite)}` },
      {
        icon: "chart",
        text: planEfectivo.reportes_habilitado
          ? `Reportes: ${formatLimite(planEfectivo.reportes_limite)}`
          : "Reportes: no incluidos",
      },
      {
        icon: "shield",
        text: planEfectivo.soporte_habilitado
          ? "Soporte: incluido"
          : "Soporte: no incluido",
      },
      {
        icon: "briefcase",
        text: planEfectivo.sunat_habilitado
          ? "SUNAT: habilitado"
          : "SUNAT: no habilitado",
      },
      {
        icon: esSugerido ? "spark" : "briefcase",
        text: `Productos: ${formatLimite(planEfectivo.productos_limite)}`,
      },
      {
        icon: esSugerido ? "rocket" : "crown",
        text: esSugerido ? "Recomendado por consumo actual" : "Escalable por negocio",
      },
    ];

    return {
      key: codigo,
      titulo: `Plan ${nombrePlan(codigo)}`,
      subtitulo: meta.subtitulo,
      lema: esActual ? "Plan activo en la empresa seleccionada" : meta.lema,
      accentClass: meta.accentClass,
      precio,
      beneficios,
      esActual,
      esSugerido,
    };
  });

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Menu />

        <main className={`app-content ${styles.shell}`}>
          {SHOW_SOPORTE_SLIM_VIEW ? (
            <>
              {error ? <p className={styles.errorBox}>{error}</p> : null}
              {success ? <p className={styles.successBox}>{success}</p> : null}

              <section className={`${styles.supportPremiumShell} uiEnter`} data-stagger="5">
                <header className={styles.supportPremiumHero}>
                  <div className={styles.supportPremiumHeroCopy}>
                    <p className={styles.supportPremiumEyebrow}>ALVENT Concierge</p>
                    <h1 className={styles.supportPremiumTitle}>Soporte operativo con presencia premium</h1>
                    <p className={styles.supportPremiumLead}>
                      Mantén respaldo, soporte y reinicio crítico en una sola superficie ejecutiva, con lectura rápida y acciones directas.
                    </p>
                  </div>

                  <div className={styles.supportPremiumMetaGrid}>
                    <article className={styles.supportPremiumMetaCard}>
                      <span>Tickets</span>
                      <strong>{loadingSoporte ? "Cargando" : soporteTotal}</strong>
                      <small>Seguimiento del soporte activo</small>
                    </article>
                    <article className={styles.supportPremiumMetaCard}>
                      <span>Seguridad</span>
                      <strong>{isSuperadmin ? "Supervisor" : "Operador"}</strong>
                      <small>Acceso contextual por rol</small>
                    </article>
                  </div>
                </header>

                <section id="cfg-operaciones" className={styles.supportPremiumGrid}>
                {isSuperadmin ? (
                  <article className={`${styles.supportPremiumCard} ${styles.supportPremiumCardBackup}`}>
                    <div className={styles.supportPremiumCardHead}>
                      <div>
                        <p className={styles.supportPremiumKicker}>Respaldo</p>
                        <h2>Backup del sistema</h2>
                      </div>
                      <StatusBadge text="Segun plan" variant="warning" />
                    </div>

                    <p className={styles.supportPremiumBody}>
                      Genera una copia de seguridad de la base de datos y descargala en tu equipo.
                    </p>

                    <button
                      type="button"
                      onClick={descargarBackup}
                      disabled={loadingBackup}
                      className={`${styles.backupBtn} ${styles.supportPremiumAction} focus-ring`}
                    >
                      {loadingBackup ? "Generando backup..." : "Descargar backup"}
                    </button>
                  </article>
                ) : null}

                <article className={`${styles.supportPremiumCard} ${styles.supportPremiumCardSupport}`}>
                  <div className={styles.supportPremiumCardHead}>
                    <div>
                      <p className={styles.supportPremiumKicker}>Asistencia</p>
                      <h2>{isSuperadmin ? "Soporte Sistema" : "Soporte usuario"}</h2>
                    </div>
                    <StatusBadge text={loadingSoporte ? "Cargando" : `${soporteTotal} tickets`} variant="info" />
                  </div>

                  <p className={styles.supportPremiumBody}>
                    Conversa con soporte, abre incidencias y escala rápidamente cuando la operación requiera atención inmediata.
                  </p>

                  <div className={styles.supportPremiumActions}>
                    <button
                      type="button"
                      className={`${styles.saveBusinessBtn} ${styles.supportPremiumAction} focus-ring`}
                      onClick={() => {
                        setConfigAccessMode("soporte");
                        setShowSoporteChatModal(true);
                      }}
                    >
                      Soporte usuario
                    </button>
                  </div>

                  {isSuperadmin ? (
                    <button
                      type="button"
                      className={`${styles.supportInteligenteBtn} ${styles.supportPremiumSecondaryAction} focus-ring`}
                      onClick={() => setShowSoporteInteligente((prev) => !prev)}
                    >
                      Soporte Sistema {showSoporteInteligente ? "▲" : "▼"}
                    </button>
                  ) : null}
                </article>

                <article className={`${styles.supportPremiumCard} ${styles.supportPremiumCardDanger}`}>
                  <div className={styles.supportPremiumCardHead}>
                    <div>
                      <p className={styles.supportPremiumKicker}>Contingencia</p>
                      <h2>Reinicio de sistema</h2>
                    </div>
                    <StatusBadge text="Operación sensible" variant="danger" />
                  </div>

                  <p className={styles.supportPremiumBody}>
                    Usa esta opción solo cuando sea necesario. Requiere confirmación con credenciales de administrador.
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowResetModal(true)}
                    disabled={!reinicioHabilitadoPorPlan}
                    className={`${styles.resetBtn} ${styles.supportPremiumAction} focus-ring`}
                    title={!reinicioHabilitadoPorPlan ? "Tu plan no incluye panel de reinicio" : ""}
                  >
                    {reinicioHabilitadoPorPlan ? "Abrir panel de reinicio" : "Panel de reinicio no disponible"}
                  </button>
                </article>
                </section>

                {isSuperadmin && showSoporteInteligente ? (
                  <section className={styles.supportInteligentePanel}>
                    <p className={styles.supportInteligenteIntro}>
                      Atención de incidencias centralizada para RENSOF. Abre el soporte en línea para conversar con SofIA y escalar tickets.
                    </p>

                    <section id="cfg-guardian" className={styles.guardianPanel}>
                      <div className={styles.guardianHead}>
                        <strong>Guardian Runtime en vivo</strong>
                        <StatusBadge
                          text={guardianStatus?.safe_mode?.enabled ? "SAFE MODE ON" : "SAFE MODE OFF"}
                          variant={guardianStatus?.safe_mode?.enabled ? "danger" : "success"}
                        />
                      </div>

                      <p className={styles.helperText}>
                        Vigilancia activa de errores y latencia con autocuración controlada para el núcleo ALVENT.
                      </p>

                      <div className={styles.guardianMetrics}>
                        <span>Req: <strong>{guardianStatus?.metrics?.requests_total ?? 0}</strong></span>
                        <span>5xx: <strong>{guardianStatus?.metrics?.requests_5xx ?? 0}</strong></span>
                        <span>Excepciones: <strong>{guardianStatus?.metrics?.exceptions_total ?? 0}</strong></span>
                        <span>Abiertos: <strong>{guardianStatus?.open_incidents ?? 0}</strong></span>
                      </div>

                      <div className={styles.guardianHealthGrid}>
                        <article className={styles.guardianHealthCard}>
                          <span>Score de riesgo</span>
                          <strong>{guardianRiskScore}/100</strong>
                          <StatusBadge text={guardianRiskBand} variant={guardianRiskVariant} />
                        </article>

                        <article className={styles.guardianHealthCard}>
                          <span>SLA operativo</span>
                          <strong>{guardianSlaBand}</strong>
                          <StatusBadge text={`Objetivo ${guardianSlaTargetMin} min`} variant={guardianSlaVariant} />
                        </article>
                      </div>

                      <div className={styles.guardianSlaTrack}>
                        <div className={styles.guardianSlaTrackHead}>
                          <small>Incidente pendiente mas antiguo: {guardianOldestPendingMinutes} min</small>
                          <small>{guardianSlaProgress}% del umbral maximo</small>
                        </div>
                        <div className={styles.guardianSlaBar}>
                          <div
                            className={`${styles.guardianSlaFill} ${guardianSlaProgress >= 90 ? styles.guardianSlaFillDanger : guardianSlaProgress >= 55 ? styles.guardianSlaFillWarn : styles.guardianSlaFillOk}`}
                            style={{ width: `${guardianSlaProgress}%` }}
                          />
                        </div>
                      </div>

                      <div className={styles.supportActions}>
                        <button
                          type="button"
                          className={`${styles.actionBtn} focus-ring`}
                          onClick={() => void cargarGuardianRuntime()}
                          disabled={loadingGuardian || loadingGuardianIncidents}
                        >
                          {loadingGuardian || loadingGuardianIncidents ? "Consultando..." : "Probar GET estado"}
                        </button>

                        <button
                          type="button"
                          className={`${styles.actionBtn} focus-ring`}
                          onClick={() => void ejecutarDiagnosticoSuperagente()}
                          disabled={loadingDiagnosticoSuperagente || loadingGuardian || loadingGuardianIncidents}
                        >
                          {loadingDiagnosticoSuperagente ? "Diagnosticando..." : "Diagnosticar y enviar al chat"}
                        </button>

                        <button
                          type="button"
                          className={`${styles.saveBusinessBtn} focus-ring`}
                          onClick={() => void actualizarSafeModeGuardian(!Boolean(guardianStatus?.safe_mode?.enabled))}
                          disabled={guardianSafeModeBusy || !guardianStatus}
                        >
                          {guardianSafeModeBusy
                            ? "Aplicando..."
                            : guardianStatus?.safe_mode?.enabled
                              ? "Desactivar Safe Mode"
                              : "Activar Safe Mode"}
                        </button>
                      </div>
                    </section>
                  </section>
                ) : null}
              </section>
            </>
          ) : (
            <>
          <section className={styles.hero}>
            <div className={styles.heroContent}>
              <p className={styles.eyebrow}>Centro de control</p>
              <h1>Configuración empresarial</h1>
              <p>Gestiona acciones sensibles del sistema con mayor claridad y seguridad.</p>
              <div className={styles.modeChipRow}>
                <span className={`${styles.modeChip} ${configAccessMode === "soporte" ? styles.modeChipSupport : styles.modeChipConfig}`}>
                  <span className={styles.modeChipIcon} aria-hidden="true">
                    {configAccessMode === "soporte" ? "🤖" : "⚙️"}
                  </span>

                  <span className={styles.modeChipDesktop}>
                    <strong>Modo: {configAccessMode === "soporte" ? "Soporte" : "Configuración"}</strong>
                    <small>
                      {configAccessMode === "soporte"
                        ? "Atención asistida por IA y escalamiento a RENSOF"
                        : "Administración general del sistema y controles de negocio"}
                    </small>
                  </span>

                  <span className={styles.modeChipMobile}>
                    {configAccessMode === "soporte" ? "Soporte" : "Configuración"}
                  </span>
                </span>
              </div>
            </div>
            <ExecutiveThemeSwitch />
          </section>

          <ExecutivePulseBar
            modulo="Soporte"
            estado={configAccessMode === "soporte" ? "Asistencia activa" : "Modo configuracion"}
            foco="Atencion inteligente con SofIA y control de incidencias para cualquier tipo de negocio."
            accion={{ label: "Abrir configuracion", href: "configuracion" }}
            metricas={[
              { label: "Empresa", value: nombreEmpresa || "No definida" },
              { label: "Plan", value: planActual || "No definido", tone: "good" },
              { label: "Reportes", value: estadoReportes || "N/D" },
            ]}
          />

          {error ? <p className={styles.errorBox}>{error}</p> : null}
          {success ? <p className={styles.successBox}>{success}</p> : null}
          {planApprovalAlertText ? (
            <section className={`${styles.planApprovalAlert} ${planApprovalAlertPulse ? styles.planApprovalAlertPulse : ""}`}>
              <div>
                <strong>{isSuperadmin ? "Alertas de aprobacion de planes" : "Estado de tu solicitud de plan"}</strong>
                <p>{planApprovalAlertText}</p>
              </div>
              <button
                type="button"
                className={`${styles.planApprovalAlertBtn} focus-ring`}
                onClick={() => {
                  if (isSuperadmin) {
                    setFiltroEstadoHistorialPlan("PENDIENTE_VALIDACION");
                    irASeccion("cfg-plan-validaciones");
                    return;
                  }
                  irASeccion("cfg-plan");
                }}
              >
                {isSuperadmin ? "Revisar aprobaciones" : "Ver estado"}
              </button>
            </section>
          ) : null}

          <section className={`${styles.overviewGrid} uiEnter`} data-stagger="2">
            <article className={styles.overviewCard}>
              <span>Empresa</span>
              <strong>{nombreEmpresa}</strong>
            </article>
            <article className={styles.overviewCard}>
              <span>Plan actual</span>
              <strong>{planActual}</strong>
            </article>
            <article className={styles.overviewCard}>
              <span>Reportes</span>
              <strong>{estadoReportes}</strong>
            </article>
          </section>

          <section className={`${styles.actionBar} uiEnter`} data-stagger="3">
            <div className={styles.actionGroup}>
              <button type="button" className={styles.actionBtn} onClick={() => irASeccion("cfg-empresa")}>Empresa</button>
              <button type="button" className={styles.actionBtn} onClick={() => irASeccion("cfg-operaciones")}>Operaciones</button>
              {isSuperadmin ? (
                <button type="button" className={styles.actionBtn} onClick={() => irASeccion("cfg-guardian")}>Guardian</button>
              ) : null}
              <button type="button" className={styles.actionBtn} onClick={() => irASeccion("cfg-plan")}>Plan</button>
            </div>
          </section>

          <section id="cfg-empresa" className={`${styles.card} ${styles.companyCard} uiEnter`} data-stagger="4">
            <Toolbar
              title="Empresa"
              right={<StatusBadge text="Editable" variant="neutral" />}
            />

            <p>
              Configura identidad fiscal, datos comerciales, contacto y preferencias operativas.
            </p>

            <div className={styles.companyTabsLayout}>
              <aside className={styles.companyTabs}>
                <button
                  type="button"
                  onClick={() => setEmpresaTab("general")}
                  className={`${styles.tabBtn} ${empresaTab === "general" ? styles.tabBtnActive : ""}`}
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={() => setEmpresaTab("fiscal")}
                  className={`${styles.tabBtn} ${empresaTab === "fiscal" ? styles.tabBtnActive : ""}`}
                >
                  Fiscal
                </button>
                <button
                  type="button"
                  onClick={() => setEmpresaTab("ubicacion")}
                  className={`${styles.tabBtn} ${empresaTab === "ubicacion" ? styles.tabBtnActive : ""}`}
                >
                  Ubicación
                </button>
                <button
                  type="button"
                  onClick={() => setEmpresaTab("branding")}
                  className={`${styles.tabBtn} ${empresaTab === "branding" ? styles.tabBtnActive : ""}`}
                >
                  Branding
                </button>
              </aside>

              <div className={styles.companyPanel}>
                {isSuperadmin ? (
                  <div className={styles.companyBlock}>
                    <div className={styles.formRow}>
                      <label htmlFor="empresa-negocio-objetivo">Empresa cliente</label>
                      <select
                        id="empresa-negocio-objetivo"
                        className={`${styles.negocioSelect} focus-ring`}
                        value={negocioSeleccionadoId || ""}
                        onChange={(e) => setNegocioSeleccionadoId(parseNumero(e.target.value))}
                        disabled={negociosObjetivoOpciones.length === 0}
                      >
                        <option value="">Selecciona empresa cliente</option>
                        {negociosObjetivoOpciones.map((item) => (
                          <option key={`empresa-neg-${item.id}`} value={item.id}>{item.id} - {item.nombre} ({nombreTipoNegocio(item.tipo)})</option>
                        ))}
                      </select>
                      {negociosDisponibles.length === 0 ? (
                        <small className={styles.helperText}>No hay empresas cliente para el tipo seleccionado.</small>
                      ) : null}
                      {!negocioActivoId ? (
                        <small className={styles.helperText}>Selecciona una empresa cliente para guardar cambios.</small>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {empresaTab === "general" ? (
                  <div className={styles.companyBlock}>
                    <h3>Información general</h3>
                    <div className={styles.presetActions}>
                      <button
                        type="button"
                        className={`${styles.presetBtn} focus-ring`}
                        onClick={aplicarPlantillaRensofSac}
                        disabled={!negocioActivoId}
                        title={!negocioActivoId ? "Selecciona primero el negocio objetivo" : ""}
                      >
                        Usar datos RENSOF SAC
                      </button>
                      <small className={styles.helperText}>
                        Completa automáticamente los campos base para registrar la empresa como RENSOF SAC.
                      </small>
                    </div>
                    <div className={styles.businessGrid}>
                      <div className={styles.formRow}>
                        <label htmlFor="empresa-nombre">Nombre comercial</label>
                        <input
                          id="empresa-nombre"
                          value={businessForm.nombre}
                          onChange={(e) => setBusinessForm({ ...businessForm, nombre: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-tipo">Tipo de negocio de la empresa</label>
                        <div className={styles.tipoNegocioBox}>
                          <div className={styles.tipoNegocioInline}>
                            <select
                              id="empresa-tipo"
                              value={businessForm.tipo}
                              onChange={(e) => setBusinessForm({ ...businessForm, tipo: e.target.value })}
                              className="focus-ring"
                            >
                              {opcionesTipoNegocioEmpresa.map((item) => (
                                <option key={`empresa-tipo-${item.value}`} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className={styles.tipoNegocioBtn}
                              onClick={() => void guardarTipoNegocioEmpresaEnProductos()}
                              disabled={savingTipoNegocioEmpresa || !negocioActivoId}
                            >
                              {savingTipoNegocioEmpresa ? "Guardando..." : "Guardar tipo"}
                            </button>
                          </div>
                          <small className={styles.helperText}>
                            Si no encuentras el tipo en la lista, crea uno nuevo y guárdalo.
                          </small>
                          <div className={styles.tipoNegocioInline}>
                            <input
                              value={nuevoTipoNegocioEmpresa}
                              onChange={(e) => setNuevoTipoNegocioEmpresa(e.target.value)}
                              placeholder="Nuevo tipo (ej. ferreteria, libreria)"
                              className="focus-ring"
                            />
                            <button
                              type="button"
                              className={styles.tipoNegocioBtn}
                              onClick={() => void crearTipoNegocioEmpresa()}
                              disabled={savingTipoNegocioEmpresa || !negocioActivoId}
                            >
                              {savingTipoNegocioEmpresa ? "Creando..." : "Crear tipo"}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-plan">Plan</label>
                        {isSuperadmin ? (
                          <select
                            id="empresa-plan"
                            value={businessForm.plan}
                            onChange={(e) => setBusinessForm({ ...businessForm, plan: e.target.value })}
                            className="focus-ring"
                          >
                            {PLAN_OPTIONS.map((plan) => (
                              <option key={plan.value} value={plan.value}>{plan.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id="empresa-plan"
                            value={nombrePlan(businessForm.plan)}
                            className="focus-ring"
                            readOnly
                          />
                        )}
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-moneda">Moneda</label>
                        <select
                          id="empresa-moneda"
                          value={businessForm.moneda}
                          onChange={(e) => setBusinessForm({ ...businessForm, moneda: e.target.value })}
                          className="focus-ring"
                        >
                          <option value="PEN">Soles (PEN)</option>
                          <option value="USD">Dolares (USD)</option>
                          <option value="EUR">Euros (EUR)</option>
                        </select>
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-zona">Zona horaria</label>
                        <select
                          id="empresa-zona"
                          value={businessForm.zona_horaria}
                          onChange={(e) => setBusinessForm({ ...businessForm, zona_horaria: e.target.value })}
                          className="focus-ring"
                        >
                          <option value="America/Lima">America/Lima</option>
                          <option value="America/Bogota">America/Bogota</option>
                          <option value="America/Santiago">America/Santiago</option>
                          <option value="America/Mexico_City">America/Mexico_City</option>
                        </select>
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-idioma">Idioma</label>
                        <select
                          id="empresa-idioma"
                          value={businessForm.idioma}
                          onChange={(e) => setBusinessForm({ ...businessForm, idioma: e.target.value })}
                          className="focus-ring"
                        >
                          <option value="es">Español</option>
                          <option value="en">Ingles</option>
                        </select>
                      </div>

                      <div className={`${styles.formRow} ${styles.fullRow}`}>
                        <label htmlFor="empresa-descripcion">Descripción del negocio</label>
                        <textarea
                          id="empresa-descripcion"
                          value={businessForm.descripcion}
                          onChange={(e) => setBusinessForm({ ...businessForm, descripcion: e.target.value })}
                          className="focus-ring"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {empresaTab === "fiscal" ? (
                  <div className={styles.companyBlock}>
                    <h3>Información fiscal</h3>
                    <div className={styles.businessGrid}>
                      <div className={styles.formRow}>
                        <label htmlFor="empresa-ruc">RUC</label>
                        <input
                          id="empresa-ruc"
                          value={businessForm.ruc}
                          onChange={(e) => setBusinessForm({ ...businessForm, ruc: sanitizarRuc(e.target.value) })}
                          inputMode="numeric"
                          maxLength={11}
                          pattern="[0-9]{11}"
                          placeholder="11 digitos"
                          className="focus-ring"
                        />
                        {rucInvalido ? <small className={styles.errorHint}>RUC incompleto: deben ser 11 digitos.</small> : null}
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-razon">Razon social</label>
                        <input
                          id="empresa-razon"
                          value={businessForm.razon_social}
                          onChange={(e) => setBusinessForm({ ...businessForm, razon_social: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-doc-prop">Documento propietario</label>
                        <input
                          id="empresa-doc-prop"
                          value={businessForm.documento_propietario}
                          onChange={(e) => setBusinessForm({ ...businessForm, documento_propietario: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-vincular-sunat">Vincular comprobantes a SUNAT</label>
                        <select
                          id="empresa-vincular-sunat"
                          value={vincularComprobantesSunat ? "si" : "no"}
                          onChange={(e) => setVincularComprobantesSunat(e.target.value === "si")}
                          className="focus-ring"
                        >
                          <option value="no">No vincular</option>
                          <option value="si">Si, vincular comprobantes</option>
                        </select>
                        <small className={styles.helperText}>
                          Si se activa, las boletas y facturas intentarán enviarse a SUNAT mediante la integración configurada.
                        </small>
                      </div>
                    </div>
                  </div>
                ) : null}

                {empresaTab === "ubicacion" ? (
                  <div className={styles.companyBlock}>
                    <h3>Contacto y ubicación</h3>
                    <div className={styles.businessGrid}>
                      <div className={styles.formRow}>
                        <label htmlFor="empresa-email">Correo</label>
                        <input
                          id="empresa-email"
                          type="email"
                          value={businessForm.email}
                          onChange={(e) => setBusinessForm({ ...businessForm, email: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-telefono">Telefono</label>
                        <input
                          id="empresa-telefono"
                          value={businessForm.telefono}
                          onChange={(e) => setBusinessForm({ ...businessForm, telefono: sanitizarCelular(e.target.value) })}
                          inputMode="numeric"
                          maxLength={9}
                          pattern="[0-9]{9}"
                          className="focus-ring"
                        />
                        {telefonoInvalido ? <small className={styles.errorHint}>Celular incompleto: deben ser 9 digitos.</small> : null}
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-whatsapp">WhatsApp</label>
                        <input
                          id="empresa-whatsapp"
                          value={businessForm.whatsapp}
                          onChange={(e) => setBusinessForm({ ...businessForm, whatsapp: sanitizarCelular(e.target.value) })}
                          inputMode="numeric"
                          maxLength={9}
                          pattern="[0-9]{9}"
                          className="focus-ring"
                        />
                        {whatsappInvalido ? <small className={styles.errorHint}>WhatsApp incompleto: deben ser 9 digitos.</small> : null}
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-pais">Pais</label>
                        <input
                          id="empresa-pais"
                          value={businessForm.pais}
                          onChange={(e) => setBusinessForm({ ...businessForm, pais: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-direccion">Direccion</label>
                        <input
                          id="empresa-direccion"
                          value={businessForm.direccion}
                          onChange={(e) => setBusinessForm({ ...businessForm, direccion: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-departamento">Departamento</label>
                        <input
                          id="empresa-departamento"
                          value={businessForm.departamento}
                          onChange={(e) => setBusinessForm({ ...businessForm, departamento: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-provincia">Provincia</label>
                        <input
                          id="empresa-provincia"
                          value={businessForm.provincia}
                          onChange={(e) => setBusinessForm({ ...businessForm, provincia: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-distrito">Distrito</label>
                        <input
                          id="empresa-distrito"
                          value={businessForm.distrito}
                          onChange={(e) => setBusinessForm({ ...businessForm, distrito: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-postal">Codigo postal</label>
                        <input
                          id="empresa-postal"
                          value={businessForm.codigo_postal}
                          onChange={(e) => setBusinessForm({ ...businessForm, codigo_postal: e.target.value })}
                          className="focus-ring"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {empresaTab === "branding" ? (
                  <div className={styles.companyBlock}>
                    <h3>Branding e identidad visual</h3>
                    <p>
                      Carga el logotipo oficial para usarlo en boletas y facturas PDF.
                    </p>

                    <div className={styles.identityGrid}>
                      <div className={styles.logoFrame}>
                        {logoPreviewUrl ? (
                          <Image
                            src={logoPreviewUrl}
                            alt="Logotipo de empresa"
                            width={240}
                            height={120}
                            unoptimized
                            className={styles.logoImage}
                          />
                        ) : (
                          <span>Sin logotipo</span>
                        )}
                      </div>

                      <div className={styles.identityForm}>
                        <label htmlFor="logo-file">Seleccionar logotipo (PNG, JPG, WEBP)</label>
                        <input
                          id="logo-file"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => seleccionarLogo(e.target.files?.[0] || null)}
                          className="focus-ring"
                        />

                        <small>
                          Negocio: {negocio?.nombre || "No identificado"}
                        </small>

                        <button
                          type="button"
                          onClick={guardarLogo}
                          disabled={!logoFile || savingLogo || !negocioActivoId}
                          className={`${styles.saveLogoBtn} focus-ring`}
                          title={!negocioActivoId ? "Selecciona primero el negocio objetivo" : ""}
                        >
                          {savingLogo ? "Guardando..." : !negocioActivoId ? "Selecciona negocio" : "Guardar logotipo"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {empresaTab !== "branding" ? (
              <button
                type="button"
                onClick={guardarDatosEmpresa}
                disabled={savingBusiness || !negocioActivoId}
                className={`${styles.saveBusinessBtn} focus-ring`}
                title={!negocioActivoId ? "Selecciona primero el negocio objetivo" : ""}
              >
                {savingBusiness ? "Guardando..." : !negocioActivoId ? "Selecciona negocio" : "Guardar datos de empresa"}
              </button>
            ) : null}
          </section>

          <section id="cfg-operaciones" className={`${styles.operationsGrid} uiEnter`} data-stagger="5">
            {isSuperadmin ? (
              <article className={styles.card}>
                <Toolbar
                  title="Backup del sistema"
                  right={<StatusBadge text="Segun plan" variant="warning" />}
                />

                <p>
                  Genera una copia de seguridad de la base de datos y descargala en tu equipo.
                </p>

                <button
                  type="button"
                  onClick={descargarBackup}
                  disabled={loadingBackup}
                  className={`${styles.backupBtn} focus-ring`}
                >
                  {loadingBackup ? "Generando backup..." : "Descargar backup"}
                </button>
              </article>
            ) : null}

            <article className={styles.card}>
              <Toolbar
                title={isSuperadmin ? "Soporte Sistema" : "Soporte usuario"}
                right={<StatusBadge text={loadingSoporte ? "Cargando" : `${soporteTotal} tickets`} variant="info" />}
              />

              <div className={styles.supportActions}>
                <button
                  type="button"
                  className={`${styles.saveBusinessBtn} focus-ring`}
                  onClick={() => {
                    setConfigAccessMode("soporte");
                    setShowSoporteChatModal(true);
                  }}
                >
                  Soporte usuario
                </button>
              </div>

              {isSuperadmin ? (
                <button
                  type="button"
                  className={`${styles.supportInteligenteBtn} focus-ring`}
                  onClick={() => setShowSoporteInteligente((prev) => !prev)}
                >
                  Soporte Sistema {showSoporteInteligente ? "▲" : "▼"}
                </button>
              ) : null}

              {isSuperadmin && showSoporteInteligente ? (
                <div className={styles.supportInteligentePanel}>
                  <p className={styles.supportInteligenteIntro}>
                      Atención de incidencias centralizada para RENSOF. Abre el soporte en línea para conversar con SofIA y escalar tickets.
                  </p>

                  {isSuperadmin ? (
                    <section id="cfg-guardian" className={styles.guardianPanel}>
                      <div className={styles.guardianHead}>
                        <strong>Guardian Runtime en vivo</strong>
                        <StatusBadge
                          text={guardianStatus?.safe_mode?.enabled ? "SAFE MODE ON" : "SAFE MODE OFF"}
                          variant={guardianStatus?.safe_mode?.enabled ? "danger" : "success"}
                        />
                      </div>

                      <p className={styles.helperText}>
                        Vigilancia activa de errores y latencia con autocuración controlada para el núcleo ALVENT.
                      </p>

                      <div className={styles.guardianMetrics}>
                        <span>Req: <strong>{guardianStatus?.metrics?.requests_total ?? 0}</strong></span>
                        <span>5xx: <strong>{guardianStatus?.metrics?.requests_5xx ?? 0}</strong></span>
                        <span>Excepciones: <strong>{guardianStatus?.metrics?.exceptions_total ?? 0}</strong></span>
                        <span>Abiertos: <strong>{guardianStatus?.open_incidents ?? 0}</strong></span>
                      </div>

                      <div className={styles.supportActions}>
                        <button
                          type="button"
                          className={`${styles.actionBtn} focus-ring`}
                          onClick={() => void cargarGuardianRuntime()}
                          disabled={loadingGuardian || loadingGuardianIncidents}
                        >
                          {loadingGuardian || loadingGuardianIncidents ? "Consultando..." : "Probar GET estado"}
                        </button>

                        <button
                          type="button"
                          className={`${styles.saveBusinessBtn} focus-ring`}
                          onClick={() => void actualizarSafeModeGuardian(!Boolean(guardianStatus?.safe_mode?.enabled))}
                          disabled={guardianSafeModeBusy || !guardianStatus}
                        >
                          {guardianSafeModeBusy
                            ? "Aplicando..."
                            : guardianStatus?.safe_mode?.enabled
                              ? "Desactivar Safe Mode"
                              : "Activar Safe Mode"}
                        </button>
                      </div>

                      <div className={styles.guardianIncidentList}>
                        {guardianIncidents.length === 0 ? (
                          <small className={styles.helperText}>Sin incidentes recientes en Guardian.</small>
                        ) : (
                          guardianIncidents.slice(0, 8).map((incident) => (
                            <article key={`guardian-${incident.id}`} className={styles.supportTicketItem}>
                              <div className={styles.supportTicketHead}>
                                <strong>{incident.title}</strong>
                                <StatusBadge text={incident.severity.toUpperCase()} variant={severityToBadgeVariant(incident.severity)} />
                              </div>
                              <small className={styles.helperText}>
                                {new Date(incident.timestamp).toLocaleString()} | fuente: {incident.source}
                              </small>
                              {incident.details?.reason ? (
                                <small className={styles.helperText}>Detalle: {String(incident.details.reason)}</small>
                              ) : null}
                              {incident.auto_action ? (
                                <small className={styles.helperText}>Auto acción: {incident.auto_action}</small>
                              ) : null}

                              <div className={styles.supportActions}>
                                <StatusBadge text={incident.acked ? "ACK" : "PENDIENTE"} variant={incident.acked ? "success" : "warning"} />
                                <button
                                  type="button"
                                  className={`${styles.actionBtn} focus-ring`}
                                  disabled={incident.acked || ackingGuardianIncidentId === incident.id}
                                  onClick={() => void confirmarIncidenteGuardian(incident.id)}
                                >
                                  {ackingGuardianIncidentId === incident.id ? "Confirmando..." : "Confirmar incidente"}
                                </button>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </section>
                  ) : null}

                  <div className={styles.supportList}>
                <div className={styles.supportFilterBar}>
                  <label>
                    Estado
                    <select
                      className="focus-ring"
                      value={soporteFiltroEstado}
                      onChange={(e) => setSoporteFiltroEstado(e.target.value as "TODOS" | SoporteEstado)}
                    >
                      <option value="TODOS">Todos</option>
                      <option value="ABIERTO">Abierto</option>
                      <option value="EN_PROCESO">En proceso</option>
                      <option value="RESUELTO">Resuelto</option>
                    </select>
                  </label>
                  <label>
                    Prioridad
                    <select
                      className="focus-ring"
                      value={soporteFiltroPrioridad}
                      onChange={(e) => setSoporteFiltroPrioridad(e.target.value as "TODAS" | SoportePrioridad)}
                    >
                      <option value="TODAS">Todas</option>
                      <option value="ALTA">Alta</option>
                      <option value="MEDIA">Media</option>
                      <option value="BAJA">Baja</option>
                    </select>
                  </label>
                </div>

                {soporteTickets.length === 0 ? (
                  <p className={styles.helperText}>Aún no hay consultas registradas.</p>
                ) : (
                  soporteTickets.map((ticket) => (
                    <article key={`soporte-ticket-${ticket.id}`} className={styles.supportTicketItem}>
                      <div className={styles.supportTicketHead}>
                        <strong>#{ticket.id} {ticket.asunto}</strong>
                        <StatusBadge text={ticket.estado} variant={ticket.estado === "RESUELTO" ? "success" : ticket.estado === "EN_PROCESO" ? "warning" : "neutral"} />
                      </div>
                      <p>{ticket.consulta}</p>
                      <small className={styles.helperText}>
                        Prioridad: {ticket.prioridad} | Usuario: {ticket.usuario_nombre}
                      </small>
                      {ticket.recomendacion_ia ? (
                        <small className={styles.helperText}>IA: {ticket.recomendacion_ia}</small>
                      ) : null}
                      {ticket.respuesta_superadmin ? (
                        <small className={styles.helperText}>Respuesta RENSOF: {ticket.respuesta_superadmin}</small>
                      ) : null}

                      {isSuperadmin ? (
                        <div className={styles.supportActions}>
                          <button
                            type="button"
                            className={`${styles.actionBtn} focus-ring`}
                            onClick={() => abrirModalAtencionSoporte(ticket, "EN_PROCESO")}
                            disabled={updatingSoporteId === ticket.id}
                          >
                            {updatingSoporteId === ticket.id ? "Actualizando..." : "Marcar en proceso"}
                          </button>
                          <button
                            type="button"
                            className={`${styles.saveBusinessBtn} focus-ring`}
                            onClick={() => abrirModalAtencionSoporte(ticket, "RESUELTO")}
                            disabled={updatingSoporteId === ticket.id}
                          >
                            {updatingSoporteId === ticket.id ? "Actualizando..." : "Marcar resuelto"}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))
                )}

                <div className={styles.supportPagination}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} focus-ring`}
                    onClick={() => setSoportePage((prev) => Math.max(1, prev - 1))}
                    disabled={soportePage <= 1 || loadingSoporte}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {soportePage} de {soporteTotalPages}
                  </span>
                  <button
                    type="button"
                    className={`${styles.actionBtn} focus-ring`}
                    onClick={() => setSoportePage((prev) => Math.min(soporteTotalPages, prev + 1))}
                    disabled={soportePage >= soporteTotalPages || loadingSoporte}
                  >
                    Siguiente
                  </button>
                </div>
                  </div>
                </div>
              ) : null}
            </article>

            <article className={`${styles.card} ${styles.dangerCard}`}>
              <Toolbar
                title="Reinicio de sistema"
                right={<StatusBadge text="Operación sensible" variant="danger" />}
              />

              <p>
                Usa esta opción solo cuando sea necesario. Requiere confirmación con credenciales de administrador.
              </p>

              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                disabled={!reinicioHabilitadoPorPlan}
                className={`${styles.resetBtn} focus-ring`}
                title={!reinicioHabilitadoPorPlan ? "Tu plan no incluye panel de reinicio" : ""}
              >
                {reinicioHabilitadoPorPlan ? "Abrir panel de reinicio" : "Panel de reinicio no disponible"}
              </button>
            </article>
          </section>

          <section id="cfg-plan" className={`${styles.card} uiEnter`} data-stagger="6">
            <Toolbar
              title="Consumo del plan"
              right={<StatusBadge text={nombrePlan(planStats?.plan || "-")} variant="info" />}
            />

            <p>
              Resumen en tiempo real de limites consumidos para usuarios, reportes, soporte y productos.
            </p>

            <div className={styles.planVisualBoard}>
              <header className={styles.planVisualHero}>
                <p className={styles.planVisualEyebrow}>ALVENT PREMIUM 2026</p>
                <h3 className={styles.planVisualHeadline}>Activa tu plan segun el ritmo de crecimiento</h3>
                <p className={styles.planVisualSubhead}>
                  Alternativas dinámicas conectadas al catálogo editable. {isSuperadmin ? "Como propietario del sistema, ajusta montos y límites desde esta misma sección." : "Solicita el plan ideal según tu consumo."}
                </p>
              </header>
              <PlanVisualCards cards={planVisualCards} />

              <div className={styles.planVisualCallout}>
                <div className={styles.planVisualCalloutCopy}>
                  <strong>Activa ALVENT segun tu etapa comercial</strong>
                  <p>
                    {isSuperadmin
                      ? "Propietario del sistema: define capacidades y precios desde Configuración para que toda la vitrina de planes se actualice al instante."
                      : "Empieza con el gratuito y escala a Básico, Pro o Premium cuando tu operación lo requiera."}
                  </p>
                  <div className={styles.planVisualMiniStrip} aria-label="Beneficios destacados">
                    <span title="Respuestas inteligentes">{renderBenefitIcon("spark")}</span>
                    <span title="Ahorro de tiempo">{renderBenefitIcon("rocket")}</span>
                    <span title="Ideas ilimitadas">{renderBenefitIcon("chart")}</span>
                    <span title="Seguridad de acceso">{renderBenefitIcon("shield")}</span>
                    <span title="Uso profesional">{renderBenefitIcon("briefcase")}</span>
                  </div>
                </div>
              </div>
            </div>

            {isSuperadmin ? (
              <>
                <section className={styles.planAmountsBox}>
                  <div>
                    <h4>Montos editables por plan</h4>
                    <p>Centraliza la edicion de precios antes de guardar los cambios en todos los planes.</p>
                  </div>

                  <div className={styles.planAmountsGrid}>
                    {planCatalogoVisible.map((plan) => {
                      const planAmountKey = PLAN_PRICE_MAP[plan.codigo] as keyof typeof planAmounts;
                      return (
                        <label key={`amount-${plan.codigo}`} className={styles.formRow}>
                          <span>{nombrePlan(plan.codigo)}</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            className="focus-ring"
                            value={planAmounts[planAmountKey]}
                            onChange={(e) =>
                              setPlanAmounts((prev) => ({
                                ...prev,
                                [planAmountKey]: Number(e.target.value || 0),
                              }))
                            }
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div className={styles.freePlanBoostQuickActions}>
                    <span>Guardar todo el catálogo de montos:</span>
                    <button
                      type="button"
                      className={`${styles.saveBusinessBtn} focus-ring`}
                      onClick={() => void guardarMontosPlanes()}
                      disabled={savingPlanAmounts}
                    >
                      {savingPlanAmounts ? "Guardando..." : "Guardar montos"}
                    </button>
                  </div>
                </section>

                <section className={styles.planAmountsBox}>
                  <div>
                    <h4>Límites editables por plan</h4>
                    <p>Define usuarios, reportes, soporte y cantidad de productos por plan. Estos límites se aplican al negocio seleccionado.</p>
                    {!negocioActivoId ? (
                      <small className={styles.helperText}>
                        Sin negocio objetivo seleccionado: puedes seleccionar plan para análisis, pero aplicar requiere elegir una empresa.
                      </small>
                    ) : null}
                  </div>

                  <div className={styles.planAmountsGrid}>
                    {planCatalogoVisible.map((plan) => (
                      <div key={`limits-${plan.codigo}`} className={styles.formRow}>
                        <span>{nombrePlan(plan.codigo)}</span>

                        <label className={styles.inlineCheck}>
                          <span>Usuarios</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            className="focus-ring"
                            value={plan.usuarios_limite ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              actualizarCampoPlanCatalogo(plan.codigo, "usuarios_limite", raw === "" ? null : Number(raw));
                            }}
                            placeholder="Ilimitado"
                          />
                        </label>

                        <label className={styles.inlineCheck}>
                          <input
                            type="checkbox"
                            checked={Boolean(plan.reportes_habilitado)}
                            onChange={(e) => actualizarCampoPlanCatalogo(plan.codigo, "reportes_habilitado", e.target.checked)}
                          />
                          Reportes
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          className="focus-ring"
                          value={plan.reportes_limite ?? 0}
                          onChange={(e) => actualizarCampoPlanCatalogo(plan.codigo, "reportes_limite", Number(e.target.value || 0))}
                          disabled={!plan.reportes_habilitado}
                        />

                        <label className={styles.inlineCheck}>
                          <input
                            type="checkbox"
                            checked={Boolean(plan.soporte_habilitado)}
                            onChange={(e) => actualizarCampoPlanCatalogo(plan.codigo, "soporte_habilitado", e.target.checked)}
                          />
                          Soporte
                        </label>

                        <label className={styles.inlineCheck}>
                          <input
                            type="checkbox"
                            checked={Boolean(plan.sunat_habilitado)}
                            onChange={(e) => actualizarCampoPlanCatalogo(plan.codigo, "sunat_habilitado", e.target.checked)}
                          />
                          SUNAT
                        </label>

                        <label className={styles.inlineCheck}>
                          <span>Cantidad de productos</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            className="focus-ring"
                            value={plan.productos_limite ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              actualizarCampoPlanCatalogo(plan.codigo, "productos_limite", raw === "" ? null : Number(raw));
                            }}
                            placeholder="Ilimitado"
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className={styles.freePlanBoostQuickActions}>
                    <span>Guardar límites efectivos del catálogo:</span>
                    <button
                      type="button"
                      className={`${styles.saveBusinessBtn} focus-ring`}
                      onClick={() => void guardarLimitesPlanes()}
                      disabled={savingPlanLimits}
                    >
                      {savingPlanLimits ? "Guardando..." : "Guardar limites"}
                    </button>
                  </div>
                </section>

                <section className={styles.planAmountsBox}>
                  <div>
                    <h4>Empresa cliente para aplicar plan</h4>
                    <p>Usa la empresa cliente seleccionada en la sección Empresa para ejecutar cambios de plan.</p>
                  </div>
                  {!negocioActivoId ? (
                    <small className={styles.helperText}>Sin empresa cliente seleccionada, aplicar plan estara bloqueado.</small>
                  ) : null}
                </section>

                <section className={styles.planExecutiveControlBar}>
                  <div className={styles.planExecutiveControlHead}>
                    <strong>Panel ejecutivo de decisión</strong>
                    <p>Una sola vista para elegir plan y ejecutar la accion requerida sin duplicar tarjetas.</p>
                  </div>

                  <div className={styles.planExecutiveControlGrid}>
                    <label>
                      Plan objetivo
                      <select
                        value={planControlSeleccionado}
                        onChange={(e) => setPlanControlSeleccionado(e.target.value)}
                        className="focus-ring"
                      >
                        {planCatalogoVisible.map((plan) => (
                          <option key={`control-plan-${plan.codigo}`} value={plan.codigo}>{plan.nombre}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Accion
                      <select
                        value={planControlAccion}
                        onChange={(e) => setPlanControlAccion(e.target.value as "simular" | "aplicar" | "guardar_monto" | "guardar_limites" | "bondades")}
                        className="focus-ring"
                      >
                        <option value="simular">Simular plan</option>
                        <option value="aplicar">Aplicar plan al negocio</option>
                        <option value="guardar_monto">Guardar montos</option>
                        <option value="guardar_limites">Guardar límites</option>
                        <option value="bondades">Ir a bondades del gratuito</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      className={`${styles.planPickBtn} focus-ring`}
                      onClick={() => void ejecutarAccionPlanEjecutiva()}
                      disabled={!planControlSeleccionadoData || changingPlan || savingPlanAmounts || savingPlanLimits || Boolean(planControlAccionRequiereNegocio)}
                      title={planControlAccionRequiereNegocio ? "Selecciona una empresa cliente en la sección Empresa" : ""}
                    >
                      {planControlAccion === "simular" ? "Ejecutar simulación" :
                        planControlAccion === "aplicar" ? (changingPlan ? "Aplicando..." : "Aplicar plan") :
                        planControlAccion === "guardar_monto" ? (savingPlanAmounts ? "Guardando..." : "Guardar montos") :
                        planControlAccion === "guardar_limites" ? (savingPlanLimits ? "Guardando..." : "Guardar límites") :
                        "Ir a bondades"}
                    </button>
                  </div>

                  <div className={styles.planExecutiveControlStats}>
                    <span>Estado: <strong>{planControlActivo ? "Activo" : planControlSimulado ? "Simulado" : "Disponible"}</strong></span>
                    <span>Riesgo: <strong>{planControlSemaforo.text}</strong></span>
                    <span>Usuarios: <strong>{planControlSeleccionadoData?.usuarios_limite ?? "Ilimitado"}</strong></span>
                    <span>Monto: <strong>{planControlMontoKey ? formatPrecio(planAmounts[planControlMontoKey]) : "-"}</strong></span>
                  </div>
                </section>

                <section className={styles.planHistoryBox}>
                  <div className={styles.planHistoryHead}>
                    <h4>Cuentas para pago por canal</h4>
                  </div>
                  {!negocioActivoId ? (
                    <p>Selecciona una empresa cliente para editar cuentas de cobro.</p>
                  ) : (
                    <div className={styles.paymentAccountsEditorGrid}>
                      {CANALES_PAGO.map((canal) => {
                        const cuenta = paymentDestinations[canal.value];
                        return (
                          <article key={`cuenta-${canal.value}`} className={styles.paymentAccountCard}>
                            <h5>{canal.label}</h5>
                            <label>
                              Título
                              <input
                                type="text"
                                className="focus-ring"
                                value={cuenta?.titulo || ""}
                                onChange={(e) => actualizarCuentaCobro(canal.value, "titulo", e.target.value)}
                              />
                            </label>
                            <label>
                              Detalle (una línea por dato)
                              <textarea
                                className="focus-ring"
                                value={(cuenta?.detalle || []).join("\n")}
                                onChange={(e) => actualizarCuentaCobro(canal.value, "detalle", e.target.value)}
                              />
                            </label>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  <div className={styles.freePlanBoostQuickActions}>
                    <span>Aplica estos datos en el modal de pago de usuarios.</span>
                    <button
                      type="button"
                      className={`${styles.saveBusinessBtn} focus-ring`}
                      onClick={() => void guardarCuentasCobro()}
                      disabled={savingPaymentDestinations || !negocioActivoId}
                    >
                      {savingPaymentDestinations ? "Guardando..." : "Guardar cuentas"}
                    </button>
                  </div>
                </section>

                <section id="cfg-plan-validaciones" className={styles.planHistoryBox}>
                  <div className={styles.planHistoryHead}>
                    <h4>Validación de pagos de planes</h4>
                    <label className={styles.planHistoryFilter}>
                      Estado
                      <select
                        value={filtroEstadoHistorialPlan}
                        onChange={(e) => setFiltroEstadoHistorialPlan(e.target.value as "TODOS" | "PENDIENTE_VALIDACION" | "APLICADO" | "RECHAZADO")}
                        className="focus-ring"
                      >
                        <option value="TODOS">Todos</option>
                        <option value="PENDIENTE_VALIDACION">Pendientes</option>
                        <option value="APLICADO">Aprobados</option>
                        <option value="RECHAZADO">Rechazados</option>
                      </select>
                    </label>
                  </div>
                  {!negocioActivoId ? (
                    <p>Selecciona una empresa cliente para revisar pagos pendientes.</p>
                  ) : loadingHistorialPlanes ? (
                    <p>Cargando pagos...</p>
                  ) : historialPlanesFiltrado.length === 0 ? (
                    <p>No hay pagos registrados para esta empresa.</p>
                  ) : (
                    <div className={styles.planHistoryTableWrap}>
                      <table className={styles.planHistoryTable}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Solicitante</th>
                            <th>Cambio</th>
                            <th>Estado</th>
                            <th>Canal</th>
                            <th>Referencia</th>
                            <th>Comprobante</th>
                            <th>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialPlanesFiltrado.map((item) => {
                            const pendiente = String(item.estado || "").toUpperCase() === "PENDIENTE_VALIDACION";
                            return (
                              <tr key={`sa-plan-${item.id}`}>
                                <td>{new Date(item.fecha).toLocaleString()}</td>
                                <td>{item.usuario_id ?? "-"}</td>
                                <td>{nombrePlan(item.plan_actual)} a {nombrePlan(item.plan_solicitado)}</td>
                                <td>{item.estado}</td>
                                <td>{item.canal_pago}</td>
                                <td>{item.referencia_pago}</td>
                                <td>
                                  {item.comprobante_url ? (
                                    <a href={toAbsoluteUrl(item.comprobante_url)} target="_blank" rel="noreferrer">
                                      Ver archivo
                                    </a>
                                  ) : (
                                    "-"
                                  )}
                                </td>
                                <td>
                                  {pendiente ? (
                                    <div className={styles.rowActions}>
                                      <button
                                        type="button"
                                        className={styles.rowBtn}
                                        disabled={validatingPlanPagoId === item.id}
                                        onClick={() => void validarPagoPlanComoSuperadmin(item.id, "APROBAR")}
                                      >
                                        {validatingPlanPagoId === item.id ? "Procesando..." : "Aprobar"}
                                      </button>
                                      <button
                                        type="button"
                                        className={`${styles.rowBtn} ${styles.deleteBtn}`}
                                        disabled={validatingPlanPagoId === item.id}
                                        onClick={() => void validarPagoPlanComoSuperadmin(item.id, "RECHAZAR")}
                                      >
                                        {validatingPlanPagoId === item.id ? "Procesando..." : "Rechazar"}
                                      </button>
                                    </div>
                                  ) : (
                                    "-"
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className={styles.clientPlanRequestBox}>
                <h3>Escoge tu plan y activa con pago</h3>
                <p>
                  Presentacion ejecutiva unificada para elegir plan, simular impacto y activar con pago.
                </p>

                <section className={styles.planExecutiveControlBar}>
                  <div className={styles.planExecutiveControlHead}>
                    <strong>Decision de plan</strong>
                    <p>Selecciona un plan, simula su efecto y activa de inmediato desde un solo bloque.</p>
                  </div>

                  <div className={styles.planExecutiveControlGrid}>
                    <label>
                      Plan objetivo
                      <select
                        value={planControlSeleccionado}
                        onChange={(e) => setPlanControlSeleccionado(e.target.value)}
                        className="focus-ring"
                      >
                        {planCatalogoVisible.map((plan) => (
                          <option key={`cliente-plan-${plan.codigo}`} value={plan.codigo}>{plan.nombre}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Accion rapida
                      <select
                        value={planControlSimulado ? "simulado" : "simular"}
                        onChange={(e) => {
                          if (e.target.value === "simular" && planControlSeleccionadoData) {
                            setPlanSimulado(planControlSeleccionadoData.codigo);
                          }
                        }}
                        className="focus-ring"
                      >
                        <option value="simular">Simular plan</option>
                        <option value="simulado">Plan simulado</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      className={`${styles.planPickBtn} focus-ring`}
                      disabled={!planControlSeleccionadoData || planControlActivo}
                      onClick={() => {
                        if (planControlSeleccionadoData) abrirPagoPlan(planControlSeleccionadoData.codigo);
                      }}
                    >
                      {planControlActivo ? "Plan activo" : "Aplicar con pago"}
                    </button>
                  </div>

                  <div className={styles.planExecutiveControlStats}>
                    <span>Estado: <strong>{planControlActivo ? "Activo" : planControlSimulado ? "Simulado" : "Disponible"}</strong></span>
                    <span>Riesgo: <strong>{planControlSemaforo.text}</strong></span>
                    <span>Usuarios: <strong>{planControlSeleccionadoData?.usuarios_limite ?? "Ilimitado"}</strong></span>
                    <span>Monto: <strong>{planControlMontoKey ? formatPrecio(planAmounts[planControlMontoKey]) : "-"}</strong></span>
                  </div>
                </section>

                <div className={styles.planHistoryBox}>
                  <h4>Historial de planes y pagos</h4>
                  {loadingHistorialPlanes ? (
                    <p>Cargando historial...</p>
                  ) : historialPlanes.length === 0 ? (
                    <p>Aun no hay pagos registrados.</p>
                  ) : (
                    <div className={styles.planHistoryTableWrap}>
                      <table className={styles.planHistoryTable}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Cambio</th>
                            <th>Estado</th>
                            <th>Canal</th>
                            <th>Referencia</th>
                            <th>Comprobante</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialPlanes.map((item) => (
                            <tr key={item.id}>
                              <td>{new Date(item.fecha).toLocaleString()}</td>
                              <td>{nombrePlan(item.plan_actual)} a {nombrePlan(item.plan_solicitado)}</td>
                              <td>{item.estado}</td>
                              <td>{item.canal_pago}</td>
                              <td>{item.referencia_pago}</td>
                              <td>
                                {item.comprobante_url ? (
                                  <a href={toAbsoluteUrl(item.comprobante_url)} target="_blank" rel="noreferrer">
                                    Ver archivo
                                  </a>
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

            </>
          )}

          <ModalCard
            open={showPagoPlanModal}
            title="Registrar pago y activar plan"
            subtitle={`Plan seleccionado: ${nombrePlan(planPagoObjetivo)}`}
            actions={(
              <>
                <button
                  type="button"
                  onClick={solicitarCambioPlanCliente}
                  disabled={sendingSolicitudPlan}
                  className={styles.confirmBtn}
                >
                  {sendingSolicitudPlan ? "Activando plan..." : "Confirmar pago"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPagoPlanModal(false)}
                  disabled={sendingSolicitudPlan}
                  className={styles.cancelBtn}
                >
                  Cancelar
                </button>
              </>
            )}
          >
            <select
              id="cliente-canal-pago"
              className="focus-ring"
              value={canalPagoSeleccionado}
              onChange={(e) => {
                const canal = normalizarCanalPago(e.target.value);
                setSolicitudPlan((prev) => ({ ...prev, canal_pago: canal }));
              }}
            >
              {CANALES_PAGO.map((canal) => (
                <option key={`canal-${canal.value}`} value={canal.value}>{canal.label}</option>
              ))}
            </select>

            <div className={styles.paymentDestinationBox}>
              <strong>{destinoCobroSeleccionado.titulo}</strong>
              <ul>
                {destinoCobroSeleccionado.detalle.map((linea) => (
                  <li key={`destino-${linea}`}>{linea}</li>
                ))}
              </ul>
              <small>Efectivo no aplica para ALVENT ERP PRO.</small>
            </div>

            <input
              id="cliente-referencia"
              className="focus-ring"
              placeholder="Referencia de pago (ej: OP-874512)"
              value={solicitudPlan.referencia_pago}
              onChange={(e) => setSolicitudPlan((prev) => ({ ...prev, referencia_pago: e.target.value }))}
            />

            <input
              id="cliente-observaciones"
              className="focus-ring"
              placeholder="Observaciones (opcional)"
              value={solicitudPlan.observaciones}
              onChange={(e) => setSolicitudPlan((prev) => ({ ...prev, observaciones: e.target.value }))}
            />

            <input
              id="cliente-comprobante"
              className="focus-ring"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setComprobantePagoFile(e.target.files?.[0] || null)}
            />
          </ModalCard>

          <ModalCard
            open={showAtencionSoporteModal}
            title="Atención RENSOF - Soporte"
            subtitle={ticketAtencion ? `Ticket #${ticketAtencion.id} - ${ticketAtencion.asunto}` : "Atender consulta"}
            actions={(
              <>
                <button
                  type="button"
                  onClick={() => void atenderTicketSoporte()}
                  className={styles.confirmBtn}
                  disabled={updatingSoporteId !== null || !ticketAtencion}
                >
                  {updatingSoporteId !== null ? "Guardando..." : "Enviar respuesta"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAtencionSoporteModal(false);
                    setTicketAtencion(null);
                  }}
                  className={styles.cancelBtn}
                  disabled={updatingSoporteId !== null}
                >
                  Cancelar
                </button>
              </>
            )}
          >
            {ticketAtencion ? (
              <div className={styles.supportChatModal}>
                <div className={styles.chatBubbleUser}>
                  <strong>Usuario</strong>
                  <p>{ticketAtencion.consulta}</p>
                </div>

                {ticketAtencion.recomendacion_ia ? (
                  <div className={styles.chatBubbleIa}>
                    <strong>IA</strong>
                    <p>{ticketAtencion.recomendacion_ia}</p>
                  </div>
                ) : null}

                <label className={styles.formRow}>
                  Estado de atención
                  <select
                    className="focus-ring"
                    value={atencionForm.estado}
                    onChange={(e) => setAtencionForm((prev) => ({ ...prev, estado: e.target.value as SoporteEstado }))}
                  >
                    <option value="EN_PROCESO">En proceso</option>
                    <option value="RESUELTO">Resuelto</option>
                  </select>
                </label>

                <label className={styles.formRow}>
                  Plantilla de respuesta RENSOF
                  <select
                    className="focus-ring"
                    value={atencionTemplateKey}
                    onChange={(e) => setAtencionTemplateKey(e.target.value as SoporteTemplateKey)}
                  >
                    {(Object.keys(INCIDENT_TEMPLATE_LABELS) as SoporteTemplateKey[]).map((key) => (
                      <option key={`template-${key}`} value={key}>{INCIDENT_TEMPLATE_LABELS[key]}</option>
                    ))}
                  </select>
                </label>

                <div className={styles.templateActionRow}>
                  <StatusBadge text={`Nivel SofIA: ${sofiaResponseLevel}`} variant="info" />
                  <button
                    type="button"
                    className={`${styles.actionBtn} focus-ring`}
                    onClick={() => aplicarPlantillaAtencion(false)}
                  >
                    Aplicar plantilla
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} focus-ring`}
                    onClick={() => aplicarPlantillaAtencion(true)}
                  >
                    Anexar plantilla
                  </button>
                </div>

                <label className={styles.formRow}>
                  Respuesta de RENSOF
                  <textarea
                    className="focus-ring"
                    rows={4}
                    value={atencionForm.respuesta}
                    onChange={(e) => setAtencionForm((prev) => ({ ...prev, respuesta: e.target.value }))}
                    placeholder="Escribe diagnóstico, pasos aplicados y recomendación final"
                  />
                </label>
              </div>
            ) : null}
          </ModalCard>

          <ModalCard
            open={showSoporteChatModal}
            title="SofIA - Soporte Inteligente"
            subtitle={`Asistente de soporte ALVENT con escalamiento a RENSOF | Nivel ${sofiaResponseLevel}`}
            cardClassName={styles.sofiaModalCard}
            bodyClassName={styles.sofiaModalBody}
            actions={(
              <>
                <button
                  type="button"
                  onClick={() => void enviarMensajeSoporteChat()}
                  className={styles.confirmBtn}
                  disabled={loadingSugerenciaIa || creatingSoporte || loadingDiagnosticoSuperagente}
                >
                  {loadingSugerenciaIa ? "Consultando IA..." : "Consultar IA"}
                </button>
                <button
                  type="button"
                  onClick={() => void escalarChatSoporte()}
                  className={styles.actionBtn}
                  disabled={loadingSugerenciaIa || creatingSoporte || loadingDiagnosticoSuperagente}
                >
                  {creatingSoporte ? "Escalando..." : "Escalar a RENSOF"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSoporteChatModal(false)}
                  className={styles.cancelBtn}
                  disabled={loadingSugerenciaIa || creatingSoporte || loadingDiagnosticoSuperagente}
                >
                  Cerrar
                </button>
              </>
            )}
          >
            <div className={styles.supportChatWindow}>
              <div className={styles.supportChatQuickActions}>
                {SOPORTE_QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={`quick-${prompt.label}`}
                    type="button"
                    className={`${styles.supportQuickBtn} focus-ring`}
                    onClick={() => aplicarPromptRapido(prompt)}
                    disabled={loadingSugerenciaIa || creatingSoporte || loadingDiagnosticoSuperagente}
                  >
                    {prompt.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.supportQuickBtn} ${styles.supportQuickBtnGhost} focus-ring`}
                  onClick={limpiarConversacionChat}
                  disabled={loadingSugerenciaIa || creatingSoporte || loadingDiagnosticoSuperagente}
                >
                  Limpiar chat
                </button>
              </div>

              {soporteClasificacion ? (
                <div className={styles.chatBubbleIa}>
                  <strong>Clasificación automática</strong>
                  <p>
                    {soporteClasificacion.categoria.toUpperCase()} | prioridad sugerida {soporteClasificacion.prioridadSugerida} | confianza {Math.round(soporteClasificacion.confianza * 100)}%
                  </p>
                  <p>{soporteClasificacion.resumen}</p>
                  <p>Checklist: {soporteClasificacion.checklist.join(" | ")}</p>
                </div>
              ) : null}

              <div className={styles.supportChatMessages}>
                {soporteChatMessages.slice(-12).map((message) => (
                  <div
                    key={message.id}
                    className={message.role === "user" ? styles.chatBubbleUser : styles.chatBubbleIa}
                  >
                    <strong>{message.role === "user" ? "Usuario" : "SofIA"}</strong>
                    <p>{message.text}</p>
                    {message.meta ? <small className={styles.chatMetaLine}>{message.meta}</small> : null}
                  </div>
                ))}

                {(loadingSugerenciaIa || loadingDiagnosticoSuperagente) ? (
                  <div className={styles.chatTypingRow}>
                    <span className={styles.chatTypingDot} />
                    <span className={styles.chatTypingDot} />
                    <span className={styles.chatTypingDot} />
                    <small>{loadingDiagnosticoSuperagente ? "SofIA diagnosticando operacion..." : "SofIA analizando incidencia..."}</small>
                  </div>
                ) : null}
              </div>

              <div className={styles.supportChatComposer}>
                <p className={styles.chatLevelHint}>
                  Nivel activo: <strong>{sofiaResponseLevel}</strong>. SofIA adapta profundidad y lenguaje automaticamente segun el rol.
                </p>

                <label className={styles.formRow}>
                  Prioridad para escalar ticket
                  <select
                    className="focus-ring"
                    value={soporteChatPrioridad}
                    onChange={(e) => setSoporteChatPrioridad(e.target.value as SoportePrioridad)}
                  >
                    <option value="BAJA">Baja</option>
                    <option value="MEDIA">Media</option>
                    <option value="ALTA">Alta</option>
                  </select>
                </label>

                <label className={styles.formRow}>
                  Tu consulta
                  <textarea
                    className={`${styles.sofiaInputTextarea} focus-ring`}
                    rows={3}
                    value={soporteChatInput}
                    onChange={(e) => setSoporteChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviarMensajeSoporteChat();
                      }
                    }}
                    placeholder="Describe incidencia, mensaje de error y resultado esperado"
                  />
                </label>
              </div>
            </div>
          </ModalCard>

          <ModalCard
            open={showResetModal}
            title="Reinicio del sistema"
            subtitle="Selecciona el tipo de reinicio"
            actions={(
              <>
                <button
                  type="button"
                  onClick={resetSistema}
                  className={styles.confirmBtn}
                  disabled={loadingReset}
                >
                  {loadingReset ? "Reiniciando..." : "Confirmar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className={styles.cancelBtn}
                  disabled={loadingReset}
                >
                  Cancelar
                </button>
              </>
            )}
          >
            <select
              className="focus-ring"
              value={modo}
              onChange={(e) =>
                setModo(e.target.value as "parcial" | "completo")
              }
            >
              <option value="parcial">
                Parcial (recomendado)
              </option>
              <option value="completo">
                Completo (borra todo)
              </option>
            </select>
            <input
              className="focus-ring"
              type="password"
              placeholder="Contraseña administrador"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </ModalCard>
        </main>
      </div>
    </ProtectedRoute>
  );
}

