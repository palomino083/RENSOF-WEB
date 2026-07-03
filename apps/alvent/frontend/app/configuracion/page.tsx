"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Menu from "@/components/Menu";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExecutiveThemeSwitch from "@/components/ExecutiveThemeSwitch";
import Toolbar from "@/components/ui/Toolbar";
import ModalCard from "@/components/ui/ModalCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { systemService } from "@/services/systemService";
import { API_URL } from "@/services/api";
import { negocioService, type Negocio } from "@/services/negocioService";
import { getApiErrorMessage } from "@/utils/apiError";
import styles from "./page.module.css";

const PLAN_OPTIONS = [
  { value: "GRATUITO", label: "Gratuito" },
  { value: "BASICO", label: "Basico" },
  { value: "PRO", label: "Pro" },
  { value: "PREMIUM", label: "Premium" },
] as const;

const LEGACY_PLAN_ALIAS: Record<string, string> = {
  FREE: "GRATUITO",
};

const normalizarPlan = (plan?: string | null) => {
  const raw = String(plan || "GRATUITO").toUpperCase();
  return LEGACY_PLAN_ALIAS[raw] || raw;
};

const nombrePlan = (plan?: string | null) => {
  const normalizado = normalizarPlan(plan);
  return PLAN_OPTIONS.find((p) => p.value === normalizado)?.label || normalizado;
};

const normalizarRol = (rol: string) => {
  const raw = String(rol || "").toUpperCase().trim();
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  if (compact === "SUPERADMIN" || compact === "SUPERADMINISTRADOR") return "SUPERADMIN";
  if (compact === "ADMIN" || compact === "ADMINISTRADOR") return "ADMINISTRADOR";
  return raw;
};

const parseNumero = (value: string | null | undefined) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
};

const getStorageItem = (key: string) => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
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

const PLAN_BONDAD_SOURCES = ["GRATUITO", "BASICO", "PRO", "PREMIUM"] as const;
const PLANES_VISIBLES_EN_SECCION = ["GRATUITO", "BASICO", "PRO", "PREMIUM"] as const;

const PLAN_VISUAL_PROPUESTA = [
  {
    key: "GRATUITO",
    titulo: "Plan Gratuito",
    precio: "S/0",
    subtitulo: "Entrada sin costo",
    lema: "Ideal para primera implementacion",
    beneficios: [
      { icon: "check", text: "Consultas basicas" },
      { icon: "spark", text: "Tareas operativas" },
      { icon: "chart", text: "Control inicial" },
      { icon: "user", text: "Uso personal" },
    ],
    accentClass: "free",
  },
  {
    key: "BASICO",
    titulo: "Plan Basico",
    precio: "S/20",
    subtitulo: "Operacion estable",
    lema: "Control diario para negocios en crecimiento",
    beneficios: [
      { icon: "check", text: "Mas usuarios" },
      { icon: "spark", text: "Flujo comercial continuo" },
      { icon: "chart", text: "Operacion ordenada" },
      { icon: "briefcase", text: "Base para escalar" },
    ],
    accentClass: "basic",
  },
  {
    key: "PRO",
    titulo: "Plan Pro",
    precio: "S/45",
    subtitulo: "Escala comercial",
    lema: "Mayor velocidad y analitica",
    beneficios: [
      { icon: "check", text: "Todo lo del gratuito" },
      { icon: "spark", text: "Mayor velocidad" },
      { icon: "chart", text: "Reportes avanzados" },
      { icon: "rocket", text: "Apoyo a negocio" },
    ],
    accentClass: "pro",
  },
  {
    key: "PREMIUM",
    titulo: "Plan Premium",
    precio: "S/65",
    subtitulo: "Maximo rendimiento",
    lema: "Operacion con prioridad total",
    beneficios: [
      { icon: "crown", text: "Rendimiento maximo" },
      { icon: "shield", text: "Acceso prioritario" },
      { icon: "chart", text: "Marketing y ventas" },
      { icon: "briefcase", text: "Uso profesional" },
    ],
    accentClass: "premium",
  },
] as const;

const PLAN_PRICE_MAP: Record<string, "gratuito" | "prueba" | "basico" | "lite" | "pro" | "premium"> = {
  GRATUITO: "gratuito",
  PRUEBA: "prueba",
  BASICO: "basico",
  LITE: "lite",
  PRO: "pro",
  PREMIUM: "premium",
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


export default function ConfiguracionPage() {
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
  const [savingLogo, setSavingLogo] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [planStats, setPlanStats] = useState<{
    plan: string;
    usuarios: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    reportes: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
    backups: { consumidos: number; limite: number | null; disponibles: number | null; habilitado: boolean };
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
  const [solicitudPlan, setSolicitudPlan] = useState({
    plan_objetivo: "PRO",
    referencia_pago: "",
    canal_pago: "transferencia",
    observaciones: "",
  });
  const [sendingSolicitudPlan, setSendingSolicitudPlan] = useState(false);
  const [savingFreePlanBoost, setSavingFreePlanBoost] = useState(false);
  const [savingPlanAmounts, setSavingPlanAmounts] = useState(false);
  const [savingPlanLimits, setSavingPlanLimits] = useState(false);
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
    plan: "BASICO",
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

  const irASeccion = (id: string) => {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const getNegocioIdActivo = useCallback(() => {
    if (isSuperadmin) {
      const negocioSesion = parseNumero(getStorageItem("negocio_id"));
      return negocioSeleccionadoId || negocioSesion;
    }
    return parseNumero(getStorageItem("negocio_id"));
  }, [isSuperadmin, negocioSeleccionadoId]);

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
      setBusinessForm({
        nombre: data.nombre || "",
        tipo: data.tipo || "tienda",
        plan: normalizarPlan(data.plan),
        descripcion: data.descripcion || "",
        ruc: data.ruc || "",
        razon_social: data.razon_social || "",
        documento_propietario: data.documento_propietario || "",
        email: data.email || "",
        telefono: data.telefono || "",
        whatsapp: data.whatsapp || "",
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
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar el logotipo");
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

    try {
      setSavingBusiness(true);
      setError("");
      setSuccess("");

      const actualizado = await negocioService.update(negocioId, {
        nombre: businessForm.nombre.trim(),
        tipo: businessForm.tipo,
        descripcion: businessForm.descripcion.trim() || undefined,
        ruc: businessForm.ruc.trim() || undefined,
        razon_social: businessForm.razon_social.trim() || undefined,
        documento_propietario: businessForm.documento_propietario.trim() || undefined,
        email: businessForm.email.trim() || undefined,
        telefono: businessForm.telefono.trim() || undefined,
        whatsapp: businessForm.whatsapp.trim() || undefined,
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

      setNegocio(actualizado);
      setSuccess("Datos de la empresa actualizados correctamente");
      await cargarPlanStats();
    } catch (err) {
      console.error(err);
      setError("No se pudo actualizar los datos de la empresa");
    } finally {
      setSavingBusiness(false);
    }
  };

  const cargarCatalogoPlanes = useCallback(async (negocioIdArg?: number) => {
    try {
      const negocioId = negocioIdArg || getNegocioIdActivo();
      const data = negocioId
        ? await negocioService.getEditablePlanCatalog(negocioId)
        : await negocioService.getPlanCatalog();
      setPlanCatalogo(Array.isArray(data.planes) ? data.planes : []);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar el catalogo de planes"));
    }
  }, [getNegocioIdActivo]);

  const cargarNegociosSuperadmin = useCallback(async () => {
    if (!isSuperadmin) return;
    try {
      const items = await negocioService.list();
      setNegociosDisponibles(items || []);
      const negocioSesion = parseNumero(getStorageItem("negocio_id"));
      setNegocioSeleccionadoId((prev) => prev || negocioSesion);
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

      const ultimoCanal = String(lista[0]?.canal_pago || "").trim();
      if (ultimoCanal) {
        setSolicitudPlan((prev) => ({ ...prev, canal_pago: ultimoCanal }));
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar historial de planes"));
    } finally {
      setLoadingHistorialPlanes(false);
    }
  }, [getNegocioIdActivo]);

  const cargarBondadesPlanGratuito = useCallback(async (negocioIdArg?: number) => {
    const negocioId = negocioIdArg || getNegocioIdActivo();
    if (!isSuperadmin || !negocioId) return;

    try {
      const data = await negocioService.getFreePlanPerks(negocioId);

      const inferirSourcePorLimite = (limite: number | null, habilitado: boolean, tipo: "reportes" | "backups" | "usuarios") => {
        const candidatos = planCatalogo.filter((plan) => PLAN_BONDAD_SOURCES.includes(plan.codigo as (typeof PLAN_BONDAD_SOURCES)[number]));
        const match = candidatos.find((plan) => {
          if (tipo === "usuarios") return plan.usuarios_limite === limite;
          if (tipo === "reportes") return plan.reportes_habilitado === habilitado && plan.reportes_limite === limite;
          return plan.backups_habilitado === habilitado && plan.backups_limite === limite;
        });
        return match?.codigo || (tipo === "reportes" ? "PRO" : tipo === "backups" ? "PRO" : "BASICO");
      };

      setFreePlanBoost((prev) => ({
        ...prev,
        usuarios_source_plan: inferirSourcePorLimite(data.custom.usuarios_limite, true, "usuarios"),
        habilitar_reportes: Boolean(data.custom.reportes_habilitado),
        reportes_source_plan: inferirSourcePorLimite(data.custom.reportes_limite, Boolean(data.custom.reportes_habilitado), "reportes"),
        habilitar_backups: Boolean(data.custom.backups_habilitado),
        backups_source_plan: inferirSourcePorLimite(data.custom.backups_limite, Boolean(data.custom.backups_habilitado), "backups"),
        usuarios_limite: data.usuarios_limite,
        reportes_limite: data.reportes_limite,
        backups_limite: data.backups_limite,
      }));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar bondades del plan gratuito"));
    }
  }, [getNegocioIdActivo, isSuperadmin, planCatalogo]);

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
    campo: "usuarios_limite" | "reportes_habilitado" | "reportes_limite" | "backups_habilitado" | "backups_limite",
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
  }) => {
    if (plan.codigo === "GRATUITO") return datosPlanGratuitoPromocional;
    return plan;
  };

  const consumoUsuarios = planStats?.usuarios.consumidos ?? 0;
  const consumoReportes = planStats?.reportes.consumidos ?? 0;
  const consumoBackups = planStats?.backups.consumidos ?? 0;

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
      return usuariosOk && reportesOk && backupsOk;
    }) || null;

  const resumenSugerencia = planSugerido
    ? `Sugerido: ${nombrePlan(planSugerido.codigo)} para ${consumoUsuarios} usuarios, ${consumoReportes} reportes y ${consumoBackups} backups consumidos.`
    : "No hay un plan visible que cubra totalmente el consumo actual. Revisa limites y montos.";

  const evaluarSemaforoPlan = (plan: {
    codigo: string;
    nombre: string;
    usuarios_limite: number | null;
    reportes_habilitado: boolean;
    reportes_limite: number | null;
    backups_habilitado: boolean;
    backups_limite: number | null;
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
    setSimuladorOverride({
      habilitado: false,
      usuarios_ilimitado: datosPlanSimuladoBase.usuarios_limite == null,
      usuarios_limite: datosPlanSimuladoBase.usuarios_limite ?? 0,
      reportes_habilitado: Boolean(datosPlanSimuladoBase.reportes_habilitado),
      reportes_ilimitado: datosPlanSimuladoBase.reportes_limite == null,
      reportes_limite: datosPlanSimuladoBase.reportes_limite ?? 0,
      backups_habilitado: Boolean(datosPlanSimuladoBase.backups_habilitado),
      backups_ilimitado: datosPlanSimuladoBase.backups_limite == null,
      backups_limite: datosPlanSimuladoBase.backups_limite ?? 0,
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

      if (!esSuper) {
        const negocioIdLocal = parseNumero(getStorageItem("negocio_id"));
        setNegocioSeleccionadoId(negocioIdLocal);
      }
    } catch {
      setIsSuperadmin(false);
      setNegocioSeleccionadoId(parseNumero(getStorageItem("negocio_id")));
    }
  }, []);

  useEffect(() => {
    if (isSuperadmin) {
      void cargarNegociosSuperadmin();
    }
    void cargarCatalogoPlanes();
  }, [isSuperadmin, cargarNegociosSuperadmin, cargarCatalogoPlanes]);

  useEffect(() => {
    if (!isSuperadmin || negociosDisponibles.length === 0) return;
    const existeSeleccion = negociosDisponibles.some((n) => n.id === negocioSeleccionadoId);
    if (!existeSeleccion) {
      setNegocioSeleccionadoId(0);
    }
  }, [isSuperadmin, negociosDisponibles, negocioSeleccionadoId]);

  useEffect(() => {
    const negocioId = getNegocioIdActivo();
    if (!negocioId) return;
    void cargarBranding(negocioId);
    void cargarPlanStats();
    void cargarHistorialPlanes(negocioId);
    void cargarCatalogoPlanes(negocioId);
    void cargarBondadesPlanGratuito(negocioId);
    void cargarMontosPlanes(negocioId);
  }, [
    negocioSeleccionadoId,
    isSuperadmin,
    getNegocioIdActivo,
    cargarBranding,
    cargarPlanStats,
    cargarHistorialPlanes,
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
    const negocioId = parseNumero(getStorageItem("negocio_id"));
    if (!negocioId) return;
    void cargarBranding(negocioId);
    void cargarPlanStats();
    void cargarHistorialPlanes(negocioId);
    void cargarCatalogoPlanes(negocioId);
    void cargarMontosPlanes(negocioId);
  }, [isSuperadmin, cargarBranding, cargarPlanStats, cargarHistorialPlanes, cargarCatalogoPlanes, cargarMontosPlanes]);

  useEffect(() => {
    void cargarEscenariosSimulador();
  }, [cargarEscenariosSimulador, negocioSeleccionadoId, isSuperadmin]);

  

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
        canal_pago: solicitudPlan.canal_pago,
        observaciones: solicitudPlan.observaciones.trim() || undefined,
        comprobante_url,
      });

      setSuccess(resp.mensaje);
      setShowPagoPlanModal(false);
      setComprobantePagoFile(null);
      setSolicitudPlan((prev) => ({ ...prev, referencia_pago: "", observaciones: "" }));
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

  const planActual = nombrePlan(planStats?.plan || businessForm.plan || "-");
  const nombreEmpresa = negocio?.nombre || businessForm.nombre || "Empresa";
  const estadoBackups = planStats?.backups.habilitado ? "Habilitado" : "Bloqueado";
  const estadoReportes = planStats?.reportes.habilitado ? "Habilitado" : "Bloqueado";
  const negocioActivoId = getNegocioIdActivo();
  const planSugeridoActivo = planSugerido
    ? normalizarPlan(planSugerido.codigo) === normalizarPlan(businessForm.plan)
    : false;
  const puedeAplicarSugerido = Boolean(planSugerido) && !planSugeridoActivo && !changingPlan && !simuladorOverride.habilitado && Boolean(negocioActivoId);
  const formatPrecio = (value: number) => `S/${Number(value || 0).toFixed(0)}`;

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Menu />

        <main className={`app-content ${styles.shell}`}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>Centro de control</p>
              <h1>Configuracion empresarial</h1>
              <p>Gestiona acciones sensibles del sistema con mayor claridad y seguridad.</p>
            </div>
            <ExecutiveThemeSwitch />
          </section>

          {error ? <p className={styles.errorBox}>{error}</p> : null}
          {success ? <p className={styles.successBox}>{success}</p> : null}

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
            <article className={styles.overviewCard}>
              <span>Backups</span>
              <strong>{estadoBackups}</strong>
            </article>
          </section>

          <section className={`${styles.actionBar} uiEnter`} data-stagger="3">
            <div className={styles.actionGroup}>
              <button type="button" className={styles.actionBtn} onClick={() => irASeccion("cfg-empresa")}>Empresa</button>
              <button type="button" className={styles.actionBtn} onClick={() => irASeccion("cfg-operaciones")}>Operaciones</button>
              <button type="button" className={styles.actionBtn} onClick={() => irASeccion("cfg-plan")}>Plan</button>
            </div>
            <button
              type="button"
              onClick={descargarBackup}
              disabled={loadingBackup}
              className={`${styles.backupBtn} focus-ring`}
            >
              {loadingBackup ? "Generando backup..." : "Backup rapido"}
            </button>
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
                  Ubicacion
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
                      <label htmlFor="empresa-negocio-objetivo">Negocio objetivo</label>
                      <select
                        id="empresa-negocio-objetivo"
                        className={`${styles.negocioSelect} focus-ring`}
                        value={negocioSeleccionadoId || ""}
                        onChange={(e) => setNegocioSeleccionadoId(Number(e.target.value))}
                      >
                        <option value="">Selecciona negocio objetivo</option>
                        {negociosDisponibles.map((item) => (
                          <option key={`empresa-neg-${item.id}`} value={item.id}>{item.id} - {item.nombre}</option>
                        ))}
                      </select>
                      {!negocioActivoId ? (
                        <small className={styles.helperText}>Selecciona una empresa cliente para poder guardar datos.</small>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {empresaTab === "general" ? (
                  <div className={styles.companyBlock}>
                    <h3>Informacion general</h3>
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
                        <label htmlFor="empresa-tipo">Tipo de negocio</label>
                        <select
                          id="empresa-tipo"
                          value={businessForm.tipo}
                          onChange={(e) => setBusinessForm({ ...businessForm, tipo: e.target.value })}
                          className="focus-ring"
                        >
                          <option value="tienda">Tienda</option>
                          <option value="restaurante">Restaurante</option>
                          <option value="farmacia">Farmacia</option>
                          <option value="supermercado">Supermercado</option>
                          <option value="boutique">Boutique</option>
                          <option value="kiosko">Kiosko</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-plan">Plan</label>
                        <select
                          id="empresa-plan"
                          value={businessForm.plan}
                          onChange={(e) => setBusinessForm({ ...businessForm, plan: e.target.value })}
                          className="focus-ring"
                          disabled={!isSuperadmin}
                        >
                          {PLAN_OPTIONS.map((plan) => (
                            <option key={plan.value} value={plan.value}>{plan.label}</option>
                          ))}
                        </select>
                        {!isSuperadmin ? <small className={styles.helperText}>Solo superadministrador puede cambiar el plan.</small> : null}
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
                          <option value="es">Espanol</option>
                          <option value="en">Ingles</option>
                        </select>
                      </div>

                      <div className={`${styles.formRow} ${styles.fullRow}`}>
                        <label htmlFor="empresa-descripcion">Descripcion del negocio</label>
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
                    <h3>Informacion fiscal</h3>
                    <div className={styles.businessGrid}>
                      <div className={styles.formRow}>
                        <label htmlFor="empresa-ruc">RUC</label>
                        <input
                          id="empresa-ruc"
                          value={businessForm.ruc}
                          onChange={(e) => setBusinessForm({ ...businessForm, ruc: e.target.value })}
                          className="focus-ring"
                        />
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
                    </div>
                  </div>
                ) : null}

                {empresaTab === "ubicacion" ? (
                  <div className={styles.companyBlock}>
                    <h3>Contacto y ubicacion</h3>
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
                          onChange={(e) => setBusinessForm({ ...businessForm, telefono: e.target.value })}
                          className="focus-ring"
                        />
                      </div>

                      <div className={styles.formRow}>
                        <label htmlFor="empresa-whatsapp">WhatsApp</label>
                        <input
                          id="empresa-whatsapp"
                          value={businessForm.whatsapp}
                          onChange={(e) => setBusinessForm({ ...businessForm, whatsapp: e.target.value })}
                          className="focus-ring"
                        />
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

                    {isSuperadmin ? (
                      <div className={styles.formRow}>
                        <label htmlFor="branding-negocio-objetivo">Negocio objetivo</label>
                        <select
                          id="branding-negocio-objetivo"
                          className={`${styles.negocioSelect} focus-ring`}
                          value={negocioSeleccionadoId || ""}
                          onChange={(e) => setNegocioSeleccionadoId(Number(e.target.value))}
                        >
                          <option value="">Selecciona negocio objetivo</option>
                          {negociosDisponibles.map((item) => (
                            <option key={`branding-neg-${item.id}`} value={item.id}>{item.id} - {item.nombre}</option>
                          ))}
                        </select>
                      </div>
                    ) : null}

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

            <article className={`${styles.card} ${styles.dangerCard}`}>
              <Toolbar
                title="Reinicio de sistema"
                right={<StatusBadge text="Operacion sensible" variant="danger" />}
              />

              <p>
                Usa esta opcion solo cuando sea necesario. Requiere confirmacion con credenciales de administrador.
              </p>

              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className={`${styles.resetBtn} focus-ring`}
              >
                Abrir panel de reinicio
              </button>
            </article>
          </section>

          <section id="cfg-plan" className={`${styles.card} uiEnter`} data-stagger="6">
            <Toolbar
              title="Consumo del plan"
              right={<StatusBadge text={nombrePlan(planStats?.plan || "-")} variant="info" />}
            />

            <p>
              Resumen en tiempo real de l├¡mites consumidos para usuarios, reportes y backups.
            </p>

            <div className={styles.planVisualBoard}>
              <header className={styles.planVisualHero}>
                <p className={styles.planVisualEyebrow}>ALVENT PREMIUM 2026</p>
                <h3 className={styles.planVisualHeadline}>Activa tu plan segun el ritmo de crecimiento</h3>
                <p className={styles.planVisualSubhead}>Version comercial para captar nuevos clientes con una lectura rapida de valor.</p>
              </header>
              <div className={styles.planVisualGrid}>
                {PLAN_VISUAL_PROPUESTA.map((plan, index) => (
                  <article
                    key={`visual-${plan.key}`}
                    className={`${styles.planVisualCard} ${styles[`planVisualCard_${plan.accentClass}`]} ${index === 0 ? styles.planVisualCardFree : ""}`}
                  >
                    <div className={styles.planVisualCardHead}>
                      <span className={styles.planVisualPill}>{plan.titulo}</span>
                      <small>{plan.subtitulo}</small>
                    </div>
                    <div className={styles.planVisualPriceWrap}>
                      <strong>{formatPrecio(planAmounts[PLAN_PRICE_MAP[plan.key]])}</strong>
                      <span>por mes</span>
                    </div>
                    <div className={styles.planVisualPriceDivider} aria-hidden="true" />
                    <p className={styles.planVisualLema}>{plan.lema}</p>
                    <ul className={styles.planVisualList}>
                      {plan.beneficios.map((item) => (
                        <li key={`${plan.key}-${item.text}`}>
                          <span className={styles.planVisualIcon}>{renderBenefitIcon(item.icon)}</span>
                          <span>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              <div className={styles.planVisualCallout}>
                <div className={styles.planVisualCalloutCopy}>
                  <strong>Activa ALVENT segun tu etapa comercial</strong>
                  <p>Empieza con el gratuito y escala a Basico, Pro o Premium cuando tu operacion lo requiera.</p>
                  <div className={styles.planVisualMiniStrip} aria-label="Beneficios destacados">
                    <span title="Respuestas inteligentes">{renderBenefitIcon("spark")}</span>
                    <span title="Ahorro de tiempo">{renderBenefitIcon("rocket")}</span>
                    <span title="Ideas ilimitadas">{renderBenefitIcon("chart")}</span>
                    <span title="Seguridad de acceso">{renderBenefitIcon("shield")}</span>
                    <span title="Uso profesional">{renderBenefitIcon("briefcase")}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.planVisualCtaBtn} focus-ring`}
                  onClick={() => {
                    setPlanSimulado("GRATUITO");
                    const nodo = document.getElementById("cfg-plan");
                    if (nodo) nodo.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Activar simulacion gratuita
                </button>
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
                    <span>Guardar todo el catalogo de montos:</span>
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
                    <h4>Limites editables por plan</h4>
                    <p>Define usuarios, reportes y backups por plan. Estos limites se aplican al negocio seleccionado.</p>
                    {!negocioActivoId ? (
                      <small className={styles.helperText}>
                        Sin negocio objetivo seleccionado: puedes seleccionar plan para analisis, pero aplicar requiere elegir una empresa.
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
                            checked={Boolean(plan.backups_habilitado)}
                            onChange={(e) => actualizarCampoPlanCatalogo(plan.codigo, "backups_habilitado", e.target.checked)}
                          />
                          Backups
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          className="focus-ring"
                          value={plan.backups_limite ?? 0}
                          onChange={(e) => actualizarCampoPlanCatalogo(plan.codigo, "backups_limite", Number(e.target.value || 0))}
                          disabled={!plan.backups_habilitado}
                        />
                      </div>
                    ))}
                  </div>

                  <div className={styles.freePlanBoostQuickActions}>
                    <span>Guardar limites efectivos del catalogo:</span>
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
                    <h4>Negocio objetivo para aplicar plan</h4>
                    <p>Selecciona explicitamente la empresa cliente sobre la que deseas ejecutar cambios de plan.</p>
                  </div>
                  <div className={styles.actionGroup}>
                    <select
                      className={`${styles.negocioSelect} focus-ring`}
                      value={negocioSeleccionadoId || ""}
                      onChange={(e) => setNegocioSeleccionadoId(Number(e.target.value))}
                    >
                      <option value="">Selecciona negocio objetivo</option>
                      {negociosDisponibles.map((item) => (
                        <option key={item.id} value={item.id}>{item.id} - {item.nombre}</option>
                      ))}
                    </select>
                    {!negocioActivoId ? (
                      <small className={styles.helperText}>Sin negocio seleccionado, aplicar plan estara bloqueado.</small>
                    ) : null}
                  </div>
                </section>

                <div className={styles.catalogGrid}>
                  {planCatalogoVisible.map((plan) => {
                    const activo = Boolean(negocioActivoId) && normalizarPlan(businessForm.plan) === plan.codigo;
                    const simulado = normalizarPlan(planSimulado) === plan.codigo;
                    const stateLabel = !negocioActivoId
                      ? (simulado ? "Seleccionado" : "Disponible")
                      : activo
                        ? "Activo"
                        : simulado
                          ? "Simulado"
                          : "Disponible";
                    const stateClass = activo ? styles.cardStateActive : simulado ? styles.cardStateSimulated : styles.cardStateAvailable;
                    const planAmountKey = PLAN_PRICE_MAP[plan.codigo] as keyof typeof planAmounts;
                    const signal = evaluarSemaforoPlan(plan);
                    const signalClass = signal.tone === "up" ? styles.catalogSignalUp : signal.tone === "down" ? styles.catalogSignalDown : styles.catalogSignalNeutral;
                    return (
                      <article key={plan.codigo} className={`${styles.catalogCard} ${(activo || (!negocioActivoId && simulado)) ? styles.catalogCardActive : ""}`}>
                        <h4>{plan.nombre}</h4>
                        <p className={`${styles.cardState} ${stateClass}`}>{stateLabel}</p>
                        <p className={`${styles.catalogSignal} ${signalClass}`}>{signal.text}</p>

                        <div className={styles.catalogMetrics}>
                          <p>Usuarios: <strong>{plan.usuarios_limite ?? "Ilimitado"}</strong></p>
                          <p>Monto: <strong>{formatPrecio(planAmounts[planAmountKey])}</strong></p>
                          <p>Reportes: <strong>{plan.reportes_habilitado ? (plan.reportes_limite ?? "Ilimitado") : "No"}</strong></p>
                          <p>Backups: <strong>{plan.backups_habilitado ? (plan.backups_limite ?? "Ilimitado") : "No"}</strong></p>
                        </div>

                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={`${styles.planSimBtn} focus-ring`}
                            disabled={simulado}
                            onClick={() => setPlanSimulado(plan.codigo)}
                          >
                            {simulado ? "Seleccionado" : "Seleccionar plan"}
                          </button>
                          <button
                            type="button"
                            className={`${styles.planPickBtn} focus-ring`}
                            disabled={activo || changingPlan || !negocioActivoId}
                            onClick={() => void cambiarPlanNegocio(plan.codigo)}
                            title={!negocioActivoId ? "Selecciona primero el negocio objetivo" : ""}
                          >
                            {activo ? "Plan activo" : changingPlan ? "Aplicando..." : !negocioActivoId ? "Elegir negocio" : "Aplicar plan"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className={styles.clientPlanRequestBox}>
                <h3>Escoge tu plan y activa con pago</h3>
                <p>
                  Mismo formato visual por plan. Al hacer clic en Aplicar se abre la opcion de pago inmediatamente.
                </p>

                <div className={styles.userPlanGrid}>
                  {planCatalogoVisible.map((plan) => {
                    const activo = normalizarPlan(businessForm.plan) === plan.codigo;
                    const simulado = normalizarPlan(planSimulado) === plan.codigo;

                    return (
                      <article key={`cliente-${plan.codigo}`} className={`${styles.catalogCard} ${activo ? styles.catalogCardActive : ""}`}>
                        <h4>{plan.nombre}</h4>
                        <p className={styles.cardState}>{activo ? "Plan activo" : "Disponible"}</p>
                        <p>Usuarios: <strong>{plan.usuarios_limite ?? "Ilimitado"}</strong></p>
                        <p>Monto: <strong>{formatPrecio(planAmounts[PLAN_PRICE_MAP[plan.codigo]])}</strong></p>
                        <p>Reportes: <strong>{plan.reportes_habilitado ? (plan.reportes_limite ?? "Ilimitado") : "No"}</strong></p>
                        <p>Backups: <strong>{plan.backups_habilitado ? (plan.backups_limite ?? "Ilimitado") : "No"}</strong></p>
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={`${styles.planSimBtn} focus-ring`}
                            disabled={simulado}
                            onClick={() => setPlanSimulado(plan.codigo)}
                          >
                            {simulado ? "Simulando" : "Simular"}
                          </button>
                          <button
                            type="button"
                            className={`${styles.planPickBtn} focus-ring`}
                            disabled={activo}
                            onClick={() => abrirPagoPlan(plan.codigo)}
                          >
                            {activo ? "Plan activo" : "Aplicar"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

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
              value={solicitudPlan.canal_pago}
              onChange={(e) => setSolicitudPlan((prev) => ({ ...prev, canal_pago: e.target.value }))}
            >
              <option value="transferencia">Transferencia</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="efectivo">Efectivo</option>
            </select>

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
              placeholder="Contrase├▒a administrador"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </ModalCard>
        </main>
      </div>
    </ProtectedRoute>
  );
}

