"use client";

import { useEffect, useState } from "react";
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
  { value: "PRUEBA", label: "Prueba" },
  { value: "BASICO", label: "Basico" },
  { value: "LITE", label: "Lite" },
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

const PLAN_BONDAD_SOURCES = ["GRATUITO", "PRUEBA", "BASICO", "LITE", "PRO", "PREMIUM"] as const;

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
  const [planSimulado, setPlanSimulado] = useState<string>("BASICO");
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
  const [freePlanBoost, setFreePlanBoost] = useState({
    usuarios_source_plan: "BASICO",
    habilitar_reportes: false,
    reportes_source_plan: "LITE",
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

  const normalizarApiUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "");
  const irASeccion = (id: string) => {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const toAbsoluteUrl = (url?: string | null) => {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${normalizarApiUrl(API_URL)}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const getNegocioIdActivo = () => {
    if (isSuperadmin) return negocioSeleccionadoId;
    return parseNumero(localStorage.getItem("negocio_id"));
  };

  const cargarBranding = async (negocioIdArg?: number) => {
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
  };

  const seleccionarLogo = (file: File | null) => {
    setLogoFile(file);
    if (!file) return;
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  const cargarPlanStats = async () => {
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
  };

  const guardarLogo = async () => {
    if (!logoFile) {
      setError("Selecciona una imagen antes de guardar");
      return;
    }

    const negocioId = getNegocioIdActivo();
    if (!negocioId) {
      setError("No se encontro negocio asociado");
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
    const negocioId = getNegocioIdActivo();
    if (!negocioId) {
      setError("No se encontro negocio asociado");
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

  const cargarCatalogoPlanes = async () => {
    try {
      const data = await negocioService.getPlanCatalog();
      setPlanCatalogo(Array.isArray(data.planes) ? data.planes : []);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar el catalogo de planes"));
    }
  };

  const cargarNegociosSuperadmin = async () => {
    if (!isSuperadmin) return;
    try {
      const items = await negocioService.list();
      setNegociosDisponibles(items || []);
      const primerNegocio = items?.[0]?.id || 0;
      setNegocioSeleccionadoId((prev) => prev || primerNegocio);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "No se pudo cargar negocios"));
    }
  };

  const cargarHistorialPlanes = async (negocioIdArg?: number) => {
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
  };

  const cargarBondadesPlanGratuito = async (negocioIdArg?: number) => {
    const negocioId = negocioIdArg || getNegocioIdActivo();
    if (!isSuperadmin || !negocioId) return;

    try {
      const data = await negocioService.getFreePlanPerks(negocioId);

      const inferirSourcePorLimite = (limite: number | null, habilitado: boolean, tipo: "reportes" | "backups" | "usuarios") => {
        const candidatos = planCatalogo.length > 0 ? planCatalogo : [];
        const match = candidatos.find((plan) => {
          if (tipo === "usuarios") return plan.usuarios_limite === limite;
          if (tipo === "reportes") return plan.reportes_habilitado === habilitado && plan.reportes_limite === limite;
          return plan.backups_habilitado === habilitado && plan.backups_limite === limite;
        });
        return match?.codigo || (tipo === "reportes" ? "LITE" : tipo === "backups" ? "PRO" : "BASICO");
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
  };

  const guardarBondadesPlanGratuito = async () => {
    const negocioId = getNegocioIdActivo();
    if (!isSuperadmin || !negocioId) return;

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
    const negocioId = getNegocioIdActivo();
    if (!isSuperadmin || !negocioId) return;
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

  const datosPlanSimuladoEfectivo = normalizarPlan(planSimulado) === "GRATUITO"
    ? datosPlanGratuitoPromocional
    : datosPlanSimulado;
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

  useEffect(() => {
    const rawUsuario = localStorage.getItem("usuario");
    if (!rawUsuario) return;
    try {
      const parsed = JSON.parse(rawUsuario);
      const rol = normalizarRol(String(parsed?.rol || ""));
      const roles = Array.isArray(parsed?.roles)
        ? parsed.roles.map((r: string) => normalizarRol(String(r || "")))
        : [];
      const esSuper = rol === "SUPERADMIN" || roles.includes("SUPERADMIN") || parseNumero(localStorage.getItem("usuario_id")) === 1;
      setIsSuperadmin(esSuper);

      if (!esSuper) {
        const negocioIdLocal = parseNumero(localStorage.getItem("negocio_id"));
        setNegocioSeleccionadoId(negocioIdLocal);
      }
    } catch {
      setIsSuperadmin(false);
      setNegocioSeleccionadoId(parseNumero(localStorage.getItem("negocio_id")));
    }
  }, []);

  useEffect(() => {
    if (isSuperadmin) {
      void cargarNegociosSuperadmin();
    }
    void cargarCatalogoPlanes();
  }, [isSuperadmin]);

  useEffect(() => {
    if (!negocioSeleccionadoId) return;
    void cargarBranding(negocioSeleccionadoId);
    void cargarPlanStats();
    void cargarHistorialPlanes(negocioSeleccionadoId);
    void cargarBondadesPlanGratuito(negocioSeleccionadoId);
  }, [negocioSeleccionadoId, isSuperadmin]);

  useEffect(() => {
    setPlanSimulado(normalizarPlan(businessForm.plan));
  }, [businessForm.plan]);

  useEffect(() => {
    if (isSuperadmin) return;
    const negocioId = parseNumero(localStorage.getItem("negocio_id"));
    if (!negocioId) return;
    void cargarBranding(negocioId);
    void cargarPlanStats();
    void cargarHistorialPlanes(negocioId);
  }, [isSuperadmin]);

  

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
              {isSuperadmin ? (
                <select
                  className={`${styles.negocioSelect} focus-ring`}
                  value={negocioSeleccionadoId || ""}
                  onChange={(e) => setNegocioSeleccionadoId(Number(e.target.value))}
                >
                  <option value="">Selecciona negocio</option>
                  {negociosDisponibles.map((item) => (
                    <option key={item.id} value={item.id}>{item.id} - {item.nombre}</option>
                  ))}
                </select>
              ) : null}
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

                    <div className={styles.identityGrid}>
                      <div className={styles.logoFrame}>
                        {logoPreviewUrl ? (
                          <img src={logoPreviewUrl} alt="Logotipo de empresa" className={styles.logoImage} />
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
                          disabled={!logoFile || savingLogo}
                          className={`${styles.saveLogoBtn} focus-ring`}
                        >
                          {savingLogo ? "Guardando..." : "Guardar logotipo"}
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
                disabled={savingBusiness}
                className={`${styles.saveBusinessBtn} focus-ring`}
              >
                {savingBusiness ? "Guardando..." : "Guardar datos de empresa"}
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
              Resumen en tiempo real de límites consumidos para usuarios, reportes y backups.
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
                      <strong>{plan.precio}</strong>
                      <span>por mes</span>
                    </div>
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
                <div>
                  <strong>Activa ALVENT segun tu etapa comercial</strong>
                  <p>Empieza con el gratuito y escala a Pro o Premium cuando tu operacion lo requiera.</p>
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

            <div className={styles.planGrid}>
              <article className={styles.planItem}>
                <h4>Usuarios</h4>
                <p>Consumidos: <strong>{planStats?.usuarios.consumidos ?? 0}</strong></p>
                <p>Límite: <strong>{planStats?.usuarios.limite ?? "Ilimitado"}</strong></p>
                <p>Disponibles: <strong>{planStats?.usuarios.disponibles ?? "Ilimitado"}</strong></p>
              </article>

              <article className={styles.planItem}>
                <h4>Reportes</h4>
                <p>Consumidos: <strong>{planStats?.reportes.consumidos ?? 0}</strong></p>
                <p>Límite: <strong>{planStats?.reportes.limite ?? "Ilimitado"}</strong></p>
                <p>Estado: <strong>{planStats?.reportes.habilitado ? "Habilitado" : "Bloqueado"}</strong></p>
              </article>

              <article className={styles.planItem}>
                <h4>Backups</h4>
                <p>Consumidos: <strong>{planStats?.backups.consumidos ?? 0}</strong></p>
                <p>Límite: <strong>{planStats?.backups.limite ?? "Ilimitado"}</strong></p>
                <p>Estado: <strong>{planStats?.backups.habilitado ? "Habilitado" : "Bloqueado"}</strong></p>
              </article>
            </div>

            {isSuperadmin ? (
              <>
                <h3 className={styles.catalogTitle}>Catalogo de planes</h3>
                <p className={styles.catalogText}>Selecciona un plan para aplicar al negocio activo y visualizar sus funcionalidades.</p>

                <div className={styles.freePlanBoostBox}>
                  <h4>Plan Gratuito promocional (solo superadministrador)</h4>
                  <p>
                    Mezcla bondades de planes superiores para captar nuevos clientes sin costo inicial.
                  </p>

                  <div className={styles.freePlanBoostGrid}>
                    <div className={styles.formRow}>
                      <label htmlFor="free-usuarios-source">Usuarios desde plan</label>
                      <select
                        id="free-usuarios-source"
                        className="focus-ring"
                        value={freePlanBoost.usuarios_source_plan}
                        onChange={(e) => {
                          const source = e.target.value;
                          const sourcePlan = planCatalogo.find((p) => p.codigo === source);
                          setFreePlanBoost((prev) => ({
                            ...prev,
                            usuarios_source_plan: source,
                            usuarios_limite: sourcePlan?.usuarios_limite ?? prev.usuarios_limite,
                          }));
                        }}
                      >
                        {PLAN_BONDAD_SOURCES.map((source) => (
                          <option key={`usuarios-${source}`} value={source}>{nombrePlan(source)}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.formRow}>
                      <label htmlFor="free-reportes-source">Reportes desde plan</label>
                      <select
                        id="free-reportes-source"
                        className="focus-ring"
                        value={freePlanBoost.reportes_source_plan}
                        disabled={!freePlanBoost.habilitar_reportes}
                        onChange={(e) => {
                          const source = e.target.value;
                          const sourcePlan = planCatalogo.find((p) => p.codigo === source);
                          setFreePlanBoost((prev) => ({
                            ...prev,
                            reportes_source_plan: source,
                            reportes_limite: sourcePlan?.reportes_limite ?? prev.reportes_limite,
                          }));
                        }}
                      >
                        {PLAN_BONDAD_SOURCES.map((source) => (
                          <option key={`reportes-${source}`} value={source}>{nombrePlan(source)}</option>
                        ))}
                      </select>
                      <label className={styles.inlineCheck}>
                        <input
                          type="checkbox"
                          checked={freePlanBoost.habilitar_reportes}
                          onChange={(e) => setFreePlanBoost((prev) => ({ ...prev, habilitar_reportes: e.target.checked }))}
                        />
                        Habilitar reportes en gratuito
                      </label>
                    </div>

                    <div className={styles.formRow}>
                      <label htmlFor="free-backups-source">Backups desde plan</label>
                      <select
                        id="free-backups-source"
                        className="focus-ring"
                        value={freePlanBoost.backups_source_plan}
                        disabled={!freePlanBoost.habilitar_backups}
                        onChange={(e) => {
                          const source = e.target.value;
                          const sourcePlan = planCatalogo.find((p) => p.codigo === source);
                          setFreePlanBoost((prev) => ({
                            ...prev,
                            backups_source_plan: source,
                            backups_limite: sourcePlan?.backups_limite ?? prev.backups_limite,
                          }));
                        }}
                      >
                        {PLAN_BONDAD_SOURCES.map((source) => (
                          <option key={`backups-${source}`} value={source}>{nombrePlan(source)}</option>
                        ))}
                      </select>
                      <label className={styles.inlineCheck}>
                        <input
                          type="checkbox"
                          checked={freePlanBoost.habilitar_backups}
                          onChange={(e) => setFreePlanBoost((prev) => ({ ...prev, habilitar_backups: e.target.checked }))}
                        />
                        Habilitar backups en gratuito
                      </label>
                    </div>
                  </div>

                  <div className={styles.freePlanBoostStats}>
                    <span>Usuarios gratuitos: <strong>{freePlanBoost.usuarios_limite ?? "Ilimitado"}</strong></span>
                    <span>Reportes gratis: <strong>{freePlanBoost.habilitar_reportes ? (freePlanBoost.reportes_limite ?? "Ilimitado") : "No"}</strong></span>
                    <span>Backups gratis: <strong>{freePlanBoost.habilitar_backups ? (freePlanBoost.backups_limite ?? "Ilimitado") : "No"}</strong></span>
                  </div>

                  <button
                    type="button"
                    className={`${styles.planApplyMainBtn} focus-ring`}
                    onClick={guardarBondadesPlanGratuito}
                    disabled={savingFreePlanBoost || !negocioSeleccionadoId}
                  >
                    {savingFreePlanBoost ? "Guardando bondades..." : "Guardar bondades promocionales"}
                  </button>
                </div>

                <div className={styles.simulatorBox}>
                  <div className={styles.simulatorHead}>
                    <div>
                      <h4>Simulador visual de plan</h4>
                      <p>
                        Simulando: <strong>{nombrePlan(planSimulado)}</strong> | Activo: <strong>{nombrePlan(businessForm.plan)}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`${styles.planApplyMainBtn} focus-ring`}
                      disabled={
                        changingPlan ||
                        !negocioSeleccionadoId ||
                        normalizarPlan(planSimulado) === normalizarPlan(businessForm.plan)
                      }
                      onClick={() => cambiarPlanNegocio(planSimulado)}
                    >
                      {changingPlan ? "Aplicando..." : "Aplicar plan simulado"}
                    </button>
                  </div>

                  <div className={styles.moduleGrid}>
                    {MODULOS_BASE.map((modulo) => {
                      const activo = estadoModuloSimulado(modulo);
                      return (
                        <article key={modulo} className={`${styles.moduleCard} ${activo ? styles.moduleCardOn : styles.moduleCardOff}`}>
                          <h5>{modulo}</h5>
                          <p>{activo ? "Activo" : "Desactivado"}</p>
                        </article>
                      );
                    })}
                  </div>

                  <div className={styles.simulatorKpis}>
                    <p>Usuarios permitidos: <strong>{datosPlanSimuladoEfectivo?.usuarios_limite ?? "Ilimitado"}</strong></p>
                    <p>Reportes permitidos: <strong>{datosPlanSimuladoEfectivo?.reportes_habilitado ? (datosPlanSimuladoEfectivo.reportes_limite ?? "Ilimitado") : "No"}</strong></p>
                    <p>Backups permitidos: <strong>{datosPlanSimuladoEfectivo?.backups_habilitado ? (datosPlanSimuladoEfectivo.backups_limite ?? "Ilimitado") : "No"}</strong></p>
                  </div>

                  <div className={styles.diffBox}>
                    <h5>Diferencias antes vs despues</h5>
                    <p className={styles.diffSubtitle}>
                      Antes: <strong>{nombrePlan(businessForm.plan)}</strong> | Despues: <strong>{nombrePlan(planSimulado)}</strong>
                    </p>

                    <div className={styles.diffGrid}>
                      {MODULOS_BASE.map((modulo) => {
                        const antes = estadoModuloActual(modulo);
                        const despues = estadoModuloSimulado(modulo);
                        const cambio = antes !== despues;
                        const delta = !cambio ? "Sin cambio" : despues ? "Se activa" : "Se desactiva";
                        return (
                          <article key={`diff-${modulo}`} className={`${styles.diffItem} ${cambio ? (despues ? styles.diffUp : styles.diffDown) : styles.diffSame}`}>
                            <strong>{modulo}</strong>
                            <span>{antes ? "Activo" : "Desactivado"} → {despues ? "Activo" : "Desactivado"}</span>
                            <small>{delta}</small>
                          </article>
                        );
                      })}
                    </div>

                    <div className={styles.diffLimits}>
                      <article className={`${styles.diffItem} ${styles[compararLimite(datosPlanActualEfectivo?.usuarios_limite, datosPlanSimuladoEfectivo?.usuarios_limite)]}`}>
                        <strong>Usuarios</strong>
                        <span>{formatLimite(datosPlanActualEfectivo?.usuarios_limite)} → {formatLimite(datosPlanSimuladoEfectivo?.usuarios_limite)}</span>
                      </article>

                      <article className={`${styles.diffItem} ${(datosPlanActualEfectivo?.reportes_habilitado === datosPlanSimuladoEfectivo?.reportes_habilitado && compararLimite(datosPlanActualEfectivo?.reportes_limite, datosPlanSimuladoEfectivo?.reportes_limite) === "igual") ? styles.diffSame : ((datosPlanSimuladoEfectivo?.reportes_habilitado ? 1 : 0) >= (datosPlanActualEfectivo?.reportes_habilitado ? 1 : 0) ? styles.diffUp : styles.diffDown)}`}>
                        <strong>Reportes</strong>
                        <span>
                          {datosPlanActualEfectivo?.reportes_habilitado ? formatLimite(datosPlanActualEfectivo?.reportes_limite) : "No"} → {datosPlanSimuladoEfectivo?.reportes_habilitado ? formatLimite(datosPlanSimuladoEfectivo?.reportes_limite) : "No"}
                        </span>
                      </article>

                      <article className={`${styles.diffItem} ${(datosPlanActualEfectivo?.backups_habilitado === datosPlanSimuladoEfectivo?.backups_habilitado && compararLimite(datosPlanActualEfectivo?.backups_limite, datosPlanSimuladoEfectivo?.backups_limite) === "igual") ? styles.diffSame : ((datosPlanSimuladoEfectivo?.backups_habilitado ? 1 : 0) >= (datosPlanActualEfectivo?.backups_habilitado ? 1 : 0) ? styles.diffUp : styles.diffDown)}`}>
                        <strong>Backups</strong>
                        <span>
                          {datosPlanActualEfectivo?.backups_habilitado ? formatLimite(datosPlanActualEfectivo?.backups_limite) : "No"} → {datosPlanSimuladoEfectivo?.backups_habilitado ? formatLimite(datosPlanSimuladoEfectivo?.backups_limite) : "No"}
                        </span>
                      </article>
                    </div>
                  </div>
                </div>

                <div className={styles.catalogGrid}>
                  {planCatalogo.map((plan) => {
                    const activo = normalizarPlan(businessForm.plan) === plan.codigo;
                    const simulado = normalizarPlan(planSimulado) === plan.codigo;
                    return (
                      <article key={plan.codigo} className={`${styles.catalogCard} ${activo ? styles.catalogCardActive : ""}`}>
                        <h4>{plan.nombre}</h4>
                        <p className={styles.cardState}>{activo ? "Activo" : simulado ? "Simulado" : "Disponible"}</p>
                        <p>Usuarios: <strong>{plan.usuarios_limite ?? "Ilimitado"}</strong></p>
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
                            disabled={activo || changingPlan || !negocioSeleccionadoId}
                            onClick={() => cambiarPlanNegocio(plan.codigo)}
                          >
                            {activo ? "Plan activo" : changingPlan ? "Aplicando..." : "Aplicar"}
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
                  {planCatalogo.map((plan) => {
                    const activo = normalizarPlan(businessForm.plan) === plan.codigo;
                    const simulado = normalizarPlan(planSimulado) === plan.codigo;

                    return (
                      <article key={`cliente-${plan.codigo}`} className={`${styles.catalogCard} ${activo ? styles.catalogCardActive : ""}`}>
                        <h4>{plan.nombre}</h4>
                        <p className={styles.cardState}>{activo ? "Plan activo" : "Disponible"}</p>
                        <p>Usuarios: <strong>{plan.usuarios_limite ?? "Ilimitado"}</strong></p>
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