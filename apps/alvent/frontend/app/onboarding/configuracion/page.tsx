"use client";

import { useState, useEffect } from "react";
import { api } from "@/services/api";
import { getApiErrorMessage } from "@/utils/apiError";
import { appPath } from "@/utils/appPath";

export default function ConfiguracionNegocioPage() {
  const [negocioId, setNegocioId] = useState<number | null>(null);
  const [negocio, setNegocio] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("negocio_id");
    if (id) {
      setNegocioId(parseInt(id));
      cargarDatos(parseInt(id));
    }
  }, []);

  const cargarDatos = async (id: number) => {
    try {
      const [resNegocio, resConfig] = await Promise.all([
        api.get(`/negocios/${id}`),
        api.get(`/negocios/${id}/configuracion`),
      ]);
      
      setNegocio(resNegocio.data);
      setConfig(resConfig.data);
    } catch (err) {
      setError("Error cargando datos");
    } finally {
      setLoading(false);
    }
  };

  const actualizarNegocio = async () => {
    if (!negocio) return;
    
    setSaving(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await api.put(`/negocios/${negocioId}`, negocio);
      setNegocio(res.data);
      setSuccess("✅ Negocio actualizado correctamente");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Error al actualizar"));
    } finally {
      setSaving(false);
    }
  };

  const actualizarConfig = async () => {
    if (!config) return;
    
    setSaving(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await api.put(`/negocios/${negocioId}/configuracion`, config);
      setConfig(res.data);
      setSuccess("✅ Configuración actualizada correctamente");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Error al actualizar"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main style={{ padding: "40px", textAlign: "center" }}>
        <h1>Cargando configuración...</h1>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", padding: "40px 20px" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ marginBottom: "40px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: "700", color: "#1a202c", margin: 0 }}>
            ⚙️ Configuración del Negocio
          </h1>
          <p style={{ color: "#718096", marginTop: "8px" }}>
            Personaliza tu negocio y todas sus funcionalidades
          </p>
        </div>

        {/* ALERTAS */}
        {error && (
          <div style={{
            background: "#fed7d7",
            border: "1px solid #fc8181",
            color: "#c53030",
            padding: "16px",
            borderRadius: "10px",
            marginBottom: "20px",
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: "#c6f6d5",
            border: "1px solid #9ae6b4",
            color: "#22543d",
            padding: "16px",
            borderRadius: "10px",
            marginBottom: "20px",
          }}>
            {success}
          </div>
        )}

        {/* SECCIÓN 1: INFORMACIÓN DEL NEGOCIO */}
        {negocio && (
          <div style={{
            background: "white",
            padding: "30px",
            borderRadius: "15px",
            marginBottom: "30px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "25px", marginTop: 0 }}>
              📋 Información del Negocio
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                  Nombre del Negocio
                </label>
                <input
                  value={negocio.nombre}
                  onChange={(e) => setNegocio({ ...negocio, nombre: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                  Tipo
                </label>
                <select
                  value={negocio.tipo}
                  onChange={(e) => setNegocio({ ...negocio, tipo: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="tienda">🏪 Tienda</option>
                  <option value="restaurante">🍽️ Restaurante</option>
                  <option value="farmacia">💊 Farmacia</option>
                  <option value="supermercado">🛒 Supermercado</option>
                  <option value="boutique">👗 Boutique</option>
                  <option value="desarrollo_software">💻 Desarrollo de software</option>
                  <option value="servicio_aplicativos">📱 Servicio de aplicativos</option>
                  <option value="kiosko">🏬 Kiosko</option>
                  <option value="otro">🧩 Otro</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                  RUC
                </label>
                <input
                  value={negocio.ruc || ""}
                  onChange={(e) => setNegocio({ ...negocio, ruc: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                  Razón Social
                </label>
                <input
                  value={negocio.razon_social || ""}
                  onChange={(e) => setNegocio({ ...negocio, razon_social: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                  Teléfono
                </label>
                <input
                  value={negocio.telefono || ""}
                  onChange={(e) => setNegocio({ ...negocio, telefono: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                  Moneda
                </label>
                <select
                  value={negocio.moneda || "PEN"}
                  onChange={(e) => setNegocio({ ...negocio, moneda: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="PEN">🇵🇪 Soles (PEN)</option>
                  <option value="USD">🇺🇸 Dólares (USD)</option>
                  <option value="EUR">🇪🇺 Euros (EUR)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                Dirección
              </label>
              <input
                value={negocio.direccion || ""}
                onChange={(e) => setNegocio({ ...negocio, direccion: e.target.value })}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e2e8f0",
                  borderRadius: "10px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  marginBottom: "20px",
                }}
              />
            </div>

            <button
              onClick={actualizarNegocio}
              disabled={saving}
              style={{
                padding: "12px 30px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontWeight: "700",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Guardando..." : "💾 Guardar Información"}
            </button>
          </div>
        )}

        {/* SECCIÓN 2: CONFIGURACIÓN */}
        {config && (
          <div style={{
            background: "white",
            padding: "30px",
            borderRadius: "15px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "25px", marginTop: 0 }}>
              🔧 Configuración Avanzada
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                  Impuesto Predeterminado (%)
                </label>
                <input
                  type="number"
                  value={config.impuesto_predeterminado}
                  onChange={(e) => setConfig({ ...config, impuesto_predeterminado: parseFloat(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                  Margen Mínimo (%)
                </label>
                <input
                  type="number"
                  value={config.margen_minimo}
                  onChange={(e) => setConfig({ ...config, margen_minimo: parseFloat(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
              marginBottom: "20px",
              padding: "20px",
              background: "#f7fafc",
              borderRadius: "10px",
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.permitir_descuentos}
                  onChange={(e) => setConfig({ ...config, permitir_descuentos: e.target.checked })}
                  style={{ width: "18px", height: "18px" }}
                />
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Permitir Descuentos</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.permitir_venta_negativo}
                  onChange={(e) => setConfig({ ...config, permitir_venta_negativo: e.target.checked })}
                  style={{ width: "18px", height: "18px" }}
                />
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Permitir Stock Negativo</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.requiere_lote}
                  onChange={(e) => setConfig({ ...config, requiere_lote: e.target.checked })}
                  style={{ width: "18px", height: "18px" }}
                />
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Requerir Lote</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.requiere_vencimiento}
                  onChange={(e) => setConfig({ ...config, requiere_vencimiento: e.target.checked })}
                  style={{ width: "18px", height: "18px" }}
                />
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Requerir Vencimiento</span>
              </label>
            </div>

            <button
              onClick={actualizarConfig}
              disabled={saving}
              style={{
                padding: "12px 30px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontWeight: "700",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Guardando..." : "💾 Guardar Configuración"}
            </button>
          </div>
        )}

        {/* BOTÓN CONTINUAR */}
        <div style={{ marginTop: "40px", textAlign: "center" }}>
          <a
            href={appPath("dashboard")}
            style={{
              display: "inline-block",
              padding: "14px 40px",
              background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
              color: "white",
              textDecoration: "none",
              borderRadius: "10px",
              fontWeight: "700",
              fontSize: "15px",
            }}
          >
            ✅ Ir al Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
