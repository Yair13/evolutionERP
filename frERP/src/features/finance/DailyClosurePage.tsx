import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  CheckCircle2,
  AlertTriangle,
  Upload,
  Printer,
  RefreshCw,
  FileText,
  DollarSign,
  ArrowDownRight,
  ArrowUpRight,
  History,
  Eye,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  fetchDailyClosureWorksheet,
  saveDailyClosure,
  fetchDailyClosures,
  fetchGeneralClosureWorksheet,
  saveGeneralClosure,
  fetchGeneralClosures,
  type DailyClosureWorksheet,
  type DailyClosureRecord,
  type GeneralClosureWorksheet,
  type GeneralClosureRecord,
  type ReceiptAuditItem,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { UploadReceiptModal } from "../../components/finance/UploadReceiptModal.js";
import { PrintDailyClosureModal } from "../../components/finance/PrintDailyClosureModal.js";
import { PrintGeneralClosureModal } from "../../components/finance/PrintGeneralClosureModal.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function localTodayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localFirstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function DailyClosurePage({ defaultTab }: { defaultTab?: "current" | "history" | "general" } = {}) {
  const { token, user } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();
  const location = useLocation();
  const canSeeAll =
    isAllWarehouses || user?.roles.includes("super_admin") || user?.roles.includes("secretaria");

  const initialTab = defaultTab || (location.pathname.includes("cierre-general") ? "general" : "current");
  const [activeTab, setActiveTab] = useState<"current" | "history" | "general">(initialTab);

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    } else if (location.pathname.includes("cierre-general")) {
      setActiveTab("general");
    }
  }, [defaultTab, location.pathname]);

  // Filtros principales Cierre Diario
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || "")
  );
  const [closureDate, setClosureDate] = useState(localTodayYmd);

  // Hoja de trabajo de cierre diario actual
  const [worksheet, setWorksheet] = useState<DailyClosureWorksheet | null>(null);
  const [openingCashInput, setOpeningCashInput] = useState<string>("0");
  const [countedCashInput, setCountedCashInput] = useState<string>("0");
  const [cashierName, setCashierName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Historial Cierre Diario
  const [closuresHistory, setClosuresHistory] = useState<DailyClosureRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Cierre Contable General (Rango de fechas)
  const [generalWarehouseId, setGeneralWarehouseId] = useState<string>(
    isAllWarehouses ? "" : (warehouseId || "")
  );
  const [generalDateFrom, setGeneralDateFrom] = useState(localFirstDayOfMonth);
  const [generalDateTo, setGeneralDateTo] = useState(localTodayYmd);
  const [generalWorksheet, setGeneralWorksheet] = useState<GeneralClosureWorksheet | null>(null);
  const [generalCashToKeepInput, setGeneralCashToKeepInput] = useState<string>("0");
  const [generalNotes, setGeneralNotes] = useState<string>("");
  const [loadingGeneral, setLoadingGeneral] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generalHistory, setGeneralHistory] = useState<GeneralClosureRecord[]>([]);
  const [loadingGeneralHistory, setLoadingGeneralHistory] = useState(false);
  const [viewingGeneralClosure, setViewingGeneralClosure] = useState<GeneralClosureRecord | null>(null);

  // Modales
  const [uploadItem, setUploadItem] = useState<ReceiptAuditItem | null>(null);
  const [viewingClosure, setViewingClosure] = useState<DailyClosureRecord | null>(null);
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);

  // Cargar datos de la hoja de trabajo diaria
  const loadWorksheet = useCallback(async () => {
    if (!token || !selectedWarehouseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDailyClosureWorksheet(token, selectedWarehouseId, closureDate);
      setWorksheet(data);
      setOpeningCashInput(String(data.openingCash));
      setCountedCashInput(
        data.existingCountedCash !== null ? String(data.existingCountedCash) : String(data.expectedCash)
      );
      setCashierName(data.existingCashierName || user?.fullName || "");
      setNotes(data.existingNotes || "");
    } catch (err: any) {
      setError(err?.message || "Error al cargar hoja de cierre diario");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouseId, closureDate, user]);

  // Cargar historial de cierres diarios
  const loadHistory = useCallback(async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetchDailyClosures(token, {
        warehouseId: selectedWarehouseId || undefined,
      });
      setClosuresHistory(res.items);
    } catch (err: any) {
      console.error("Error al cargar historial de cierres:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [token, selectedWarehouseId]);

  // Cargar hoja de trabajo de Cierre Contable General
  const loadGeneralWorksheet = useCallback(async () => {
    if (!token) return;
    setLoadingGeneral(true);
    setError(null);
    try {
      const data = await fetchGeneralClosureWorksheet(token, {
        warehouseId: generalWarehouseId || undefined,
        dateFrom: generalDateFrom,
        dateTo: generalDateTo,
      });
      setGeneralWorksheet(data);
      if (data.existingCashToKeep !== null) {
        setGeneralCashToKeepInput(String(data.existingCashToKeep));
      }
      if (data.existingNotes) {
        setGeneralNotes(data.existingNotes);
      }
    } catch (err: any) {
      setError(err?.message || "Error al cargar balance contable del período");
    } finally {
      setLoadingGeneral(false);
    }
  }, [token, generalWarehouseId, generalDateFrom, generalDateTo]);

  // Cargar historial de Cierres Contables Generales
  const loadGeneralHistory = useCallback(async () => {
    if (!token) return;
    setLoadingGeneralHistory(true);
    try {
      const res = await fetchGeneralClosures(token, {
        warehouseId: generalWarehouseId || undefined,
      });
      setGeneralHistory(res.items);
    } catch (err: any) {
      console.error("Error al cargar historial general:", err);
    } finally {
      setLoadingGeneralHistory(false);
    }
  }, [token, generalWarehouseId]);

  useEffect(() => {
    if (activeTab === "current") {
      void loadWorksheet();
    } else if (activeTab === "history") {
      void loadHistory();
    } else if (activeTab === "general") {
      void loadGeneralWorksheet();
      void loadGeneralHistory();
    }
  }, [activeTab, loadWorksheet, loadHistory, loadGeneralWorksheet, loadGeneralHistory]);

  async function handleSaveGeneralClosure() {
    if (!token || !generalWorksheet) return;

    const cashToKeepNum = parseFloat(generalCashToKeepInput.replace(/[^0-9.]/g, "")) || 0;

    setSavingGeneral(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await saveGeneralClosure(token, {
        warehouseId: generalWarehouseId || undefined,
        dateFrom: generalDateFrom,
        dateTo: generalDateTo,
        cashToKeep: cashToKeepNum,
        notes: generalNotes.trim() || undefined,
      });

      setSuccessMsg(`¡Cierre Contable General ${res.item.closureCode} guardado y emitido con éxito!`);
      void loadGeneralWorksheet();
      void loadGeneralHistory();
      setViewingGeneralClosure(res.item);
    } catch (err: any) {
      setError(err?.message || "Error al guardar el cierre contable general");
    } finally {
      setSavingGeneral(false);
    }
  }

  // Cálculos reactivos de la hoja de trabajo
  const openingCashNum = parseFloat(openingCashInput.replace(/[^0-9.]/g, "")) || 0;
  const countedCashNum = parseFloat(countedCashInput.replace(/[^0-9.]/g, "")) || 0;
  const totalCashIn = worksheet ? worksheet.totalCashIn : 0;
  const totalCashOut = worksheet ? worksheet.totalCashOut : 0;
  const dynamicExpectedCash = openingCashNum + totalCashIn - totalCashOut;
  const dynamicDifference = countedCashNum - dynamicExpectedCash;

  // Guardar Cierre Diario
  async function handleSaveClosure() {
    if (!token || !selectedWarehouseId || !worksheet) return;

    if (worksheet.pendingReceiptsCount > 0) {
      const confirmProceed = window.confirm(
        `Hay ${worksheet.pendingReceiptsCount} comprobantes pendientes por adjuntar.\n¿Deseas efectuar el cierre de todas formas?`
      );
      if (!confirmProceed) return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await saveDailyClosure(token, {
        warehouseId: selectedWarehouseId,
        closureDate,
        openingCash: openingCashNum,
        countedCash: countedCashNum,
        cashierName: cashierName.trim() || undefined,
        notes: notes.trim() || undefined,
        status: "approved",
      });

      setSuccessMsg(`¡Cierre Diario ${res.item.closingVoucherNumber} guardado y aprobado con éxito!`);
      void loadWorksheet();
      setViewingClosure(res.item);
    } catch (err: any) {
      setError(err?.message || "Error al guardar cierre diario");
    } finally {
      setSaving(false);
    }
  }

  const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return (
    <div className="container" style={{ paddingBottom: "3rem" }}>
      {/* Encabezado */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.6rem",
              fontWeight: 800,
              margin: "0 0 0.25rem 0",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <ShieldCheck size={28} className="text-primary" />
            Cierre Diario y Arqueo Consolidado
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Cuadre de caja acumulativo día a día, auditoría de soportes bancarios y descuento de egresos y nómina
          </p>
        </div>

        {/* Pestañas de Vista */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`inv-btn ${activeTab === "current" ? "inv-btn--primary" : "inv-btn--ghost"}`}
            onClick={() => setActiveTab("current")}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FileText size={16} /> Cierre del Día
          </button>
          <button
            type="button"
            className={`inv-btn ${activeTab === "history" ? "inv-btn--primary" : "inv-btn--ghost"}`}
            onClick={() => setActiveTab("history")}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <History size={16} /> Historial Diario
          </button>
          <button
            type="button"
            className={`inv-btn ${activeTab === "general" ? "inv-btn--primary" : "inv-btn--ghost"}`}
            onClick={() => setActiveTab("general")}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <ShieldCheck size={16} /> Cierre Contable General (Rango)
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      {activeTab === "general" ? (
        <div
          style={{
            background: "var(--bg-card-subtle, rgba(255,255,255,0.03))",
            border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
            borderRadius: 10,
            padding: "1rem",
            marginBottom: "1.5rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          {canSeeAll && (
            <label className="field" style={{ margin: 0, minWidth: 220 }}>
              <span>Sede de Cierre General</span>
              <select
                value={generalWarehouseId}
                onChange={(e) => setGeneralWarehouseId(e.target.value)}
                style={{ height: 38 }}
              >
                <option value="">Consolidado General (Todas las sedes)</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field" style={{ margin: 0 }}>
            <span>Fecha Inicio</span>
            <input
              type="date"
              value={generalDateFrom}
              onChange={(e) => setGeneralDateFrom(e.target.value)}
              style={{ height: 38 }}
            />
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span>Fecha Fin</span>
            <input
              type="date"
              value={generalDateTo}
              onChange={(e) => setGeneralDateTo(e.target.value)}
              style={{ height: 38 }}
            />
          </label>

          <div style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              style={{ height: 38, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              onClick={() => {
                void loadGeneralWorksheet();
                void loadGeneralHistory();
              }}
            >
              <RefreshCw size={16} className={loadingGeneral ? "spin" : ""} />
              {loadingGeneral ? "Calculando…" : "Consultar Período"}
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: "var(--bg-card-subtle, rgba(255,255,255,0.03))",
            border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
            borderRadius: 10,
            padding: "1rem",
            marginBottom: "1.5rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          {canSeeAll && (
            <label className="field" style={{ margin: 0, minWidth: 200 }}>
              <span>Sede a Auditar / Cerrar</span>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                style={{ height: 38 }}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field" style={{ margin: 0 }}>
            <span>Fecha de Operación / Cierre</span>
            <input
              type="date"
              value={closureDate}
              onChange={(e) => setClosureDate(e.target.value)}
              style={{ height: 38 }}
            />
          </label>

          <div style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              style={{ height: 38, padding: "0 12px" }}
              onClick={() => (activeTab === "current" ? void loadWorksheet() : void loadHistory())}
              title="Refrescar datos"
            >
              <RefreshCw size={16} className={loading || loadingHistory ? "spin" : ""} />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", borderRadius: 8, marginBottom: "1.25rem" }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{ padding: "1rem", background: "rgba(16, 185, 129, 0.15)", color: "#6ee7b7", borderRadius: 8, marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

      {/* ─── PESTAÑA 1: ARQUEO Y CIERRE DEL DÍA ─────────────────────────────────── */}
      {activeTab === "current" && (
        <>
          {loading ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Calculando arqueo y recopilando movimientos del día…
            </div>
          ) : !worksheet ? null : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Banner de Estado del Cierre */}
              {worksheet.isExistingClosure && (
                <div
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, color: "#10b981", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <CheckCircle2 size={18} /> Cierre Oficial Registrado: {worksheet.existingVoucherNumber}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Estado: <strong>{worksheet.existingStatus?.toUpperCase()}</strong> | Contado: {formatMoney(worksheet.existingCountedCash ?? 0)}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inv-btn inv-btn--primary"
                    style={{ fontSize: "0.8rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                    onClick={() => {
                      if (worksheet.existingClosureId) {
                        setViewingClosure({
                          id: worksheet.existingClosureId,
                          warehouseId: worksheet.warehouseId,
                          warehouseCode: worksheet.warehouseCode,
                          warehouseName: worksheet.warehouseName,
                          closureDate: worksheet.closureDate,
                          status: worksheet.existingStatus || "submitted",
                          closingVoucherNumber: worksheet.existingVoucherNumber || "",
                          openingCash: worksheet.openingCash,
                          cashSales: worksheet.cashSales,
                          cashCreditPayments: worksheet.cashCreditPayments,
                          cashLayawayPayments: worksheet.cashLayawayPayments,
                          cashTransfersReceived: worksheet.cashTransfersReceived,
                          cashTransfersSent: worksheet.cashTransfersSent,
                          cashOutflows: worksheet.cashOutflows,
                          cashPayroll: worksheet.cashPayroll,
                          expectedCash: worksheet.expectedCash,
                          countedCash: worksheet.existingCountedCash ?? 0,
                          cashDifference: (worksheet.existingCountedCash ?? 0) - worksheet.expectedCash,
                          bankPaymentsTotal: worksheet.bankPaymentsTotal,
                          pendingReceiptsCount: worksheet.pendingReceiptsCount,
                          cashierName: worksheet.existingCashierName,
                          notes: worksheet.existingNotes,
                          createdBy: null,
                          submittedAt: null,
                          createdAt: "",
                        });
                      }
                    }}
                  >
                    <Printer size={15} /> Ver / Imprimir Acta Oficial
                  </button>
                </div>
              )}

              {/* Tarjetas de Saldo de Arranque y Resumen de Efectivo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                {/* 1. Saldo de Arranque */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    borderRadius: 10,
                    padding: "1.25rem",
                  }}
                >
                  <span style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                    Saldo de Arranque (Base Inicial)
                  </span>

                  <label className="field" style={{ margin: 0 }}>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={openingCashInput}
                      onChange={(e) => setOpeningCashInput(e.target.value)}
                      style={{ fontSize: "1.4rem", fontWeight: 800, height: 44 }}
                    />
                  </label>

                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
                    Base acumulada del día anterior: <strong>{formatMoney(worksheet.suggestedOpeningCash)}</strong>
                  </div>
                </div>

                {/* 2. Entradas de Efectivo (+) */}
                <div
                  style={{
                    background: "rgba(16, 185, 129, 0.06)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: 10,
                    padding: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <ArrowDownRight size={16} /> Entradas Efectivo (+)
                    </span>
                    <strong style={{ fontSize: "1.2rem", color: "#10b981" }}>{formatMoney(totalCashIn)}</strong>
                  </div>

                  <div style={{ fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 3, color: "var(--text-muted)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Ventas mostrador:</span> <strong>{formatMoney(worksheet.cashSales)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Abonos cartera clientes:</span> <strong>{formatMoney(worksheet.cashCreditPayments)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Abonos apartados (separe):</span> <strong>{formatMoney(worksheet.cashLayawayPayments)}</strong>
                    </div>
                    {worksheet.cashTransfersReceived > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#38bdf8" }}>
                        <span>Remesas recibidas:</span> <strong>+ {formatMoney(worksheet.cashTransfersReceived)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Salidas de Efectivo (-) */}
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.06)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 10,
                    padding: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700, color: "#ef4444", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <ArrowUpRight size={16} /> Salidas Efectivo (-)
                    </span>
                    <strong style={{ fontSize: "1.2rem", color: "#ef4444" }}>- {formatMoney(totalCashOut)}</strong>
                  </div>

                  <div style={{ fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 3, color: "var(--text-muted)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Egresos / Vales caja menor:</span> <strong style={{ color: "#ef4444" }}>- {formatMoney(worksheet.cashOutflows)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Nómina pagada en efectivo:</span> <strong style={{ color: "#ef4444" }}>- {formatMoney(worksheet.cashPayroll)}</strong>
                    </div>
                    {worksheet.cashTransfersSent > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Remesas enviadas a otras sedes:</span> <strong style={{ color: "#ef4444" }}>- {formatMoney(worksheet.cashTransfersSent)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Efectivo Neto Esperado en Caja */}
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)",
                    border: "1px solid rgba(2, 132, 199, 0.35)",
                    borderRadius: 10,
                    padding: "1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700, color: "#38bdf8" }}>
                    Efectivo Esperado en Caja
                  </span>
                  <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--text-primary)" }}>
                    {formatMoney(dynamicExpectedCash)}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    Arranque + Entradas - Salidas
                  </span>
                </div>
              </div>

              {/* Sección de Conteo Físico y Cuadre de Caja */}
              <div
                style={{
                  background: "var(--bg-card, #1e293b)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <DollarSign className="text-primary" />
                  Conteo Físico y Cuadre de Caja
                </h2>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem", flexWrap: "wrap" }}>
                  {/* Inputs del Cajero */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <label className="field" style={{ margin: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Efectivo Físico Contado ($ COP) *</span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        required
                        value={countedCashInput}
                        onChange={(e) => setCountedCashInput(e.target.value)}
                        placeholder="Ingresa el dinero físico en billetes y monedas"
                        style={{ height: 44, fontSize: "1.3rem", fontWeight: 800 }}
                      />
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <label className="field" style={{ margin: 0 }}>
                        <span>Cajero / Responsable</span>
                        <input
                          type="text"
                          value={cashierName}
                          onChange={(e) => setCashierName(e.target.value)}
                          placeholder="Nombre de quien entrega caja"
                        />
                      </label>

                      <label className="field" style={{ margin: 0 }}>
                        <span>Notas u Observaciones</span>
                        <input
                          type="text"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Faltantes justificados, monedas, etc."
                        />
                      </label>
                    </div>
                  </div>

                  {/* Panel de Diferencia / Cuadre */}
                  <div
                    style={{
                      borderRadius: 10,
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      background: dynamicDifference === 0
                        ? "rgba(16, 185, 129, 0.1)"
                        : dynamicDifference < 0
                        ? "rgba(239, 68, 68, 0.1)"
                        : "rgba(59, 130, 246, 0.1)",
                      border: `1px solid ${
                        dynamicDifference === 0
                          ? "rgba(16, 185, 129, 0.3)"
                          : dynamicDifference < 0
                          ? "rgba(239, 68, 68, 0.3)"
                          : "rgba(59, 130, 246, 0.3)"
                      }`,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)" }}>
                        Resultado del Cuadre
                      </span>
                      <div
                        style={{
                          fontSize: "1.6rem",
                          fontWeight: 900,
                          margin: "6px 0",
                          color: dynamicDifference === 0 ? "#10b981" : dynamicDifference < 0 ? "#ef4444" : "#3b82f6",
                        }}
                      >
                        {dynamicDifference === 0 ? "✓ CAJA CUADRADA" : dynamicDifference < 0 ? `FALTANTE: ${formatMoney(Math.abs(dynamicDifference))}` : `SOBRANTE: +${formatMoney(dynamicDifference)}`}
                      </div>
                    </div>

                    <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      <div>Esperado: <strong>{formatMoney(dynamicExpectedCash)}</strong></div>
                      <div>Contado: <strong>{formatMoney(countedCashNum)}</strong></div>
                      <div>Diferencia: <strong>{formatMoney(dynamicDifference)}</strong></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Auditoría de Comprobantes Digitales y Soportes */}
              <div
                style={{
                  background: "var(--bg-card, #1e293b)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <FileText className="text-primary" />
                      Auditoría de Comprobantes y Soportes del Día
                    </h2>
                    <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                      Comprobantes bancarios (Bancolombia, Nequi, etc.), vales de egreso, remesas y nómina
                    </p>
                  </div>

                  {worksheet.pendingReceiptsCount > 0 ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "4px 10px",
                        background: "rgba(245, 158, 11, 0.15)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        borderRadius: 6,
                        color: "#f59e0b",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                      }}
                    >
                      <AlertTriangle size={16} /> {worksheet.pendingReceiptsCount} comprobantes pendientes por adjuntar
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "4px 10px",
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        borderRadius: 6,
                        color: "#10b981",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={16} /> 100% de Comprobantes Adjuntados
                    </span>
                  )}
                </div>

                {worksheet.receiptAuditList.length === 0 ? (
                  <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No hay operaciones por cuentas bancarias ni egresos que requieran comprobante en esta fecha.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", textAlign: "left", background: "rgba(255, 255, 255, 0.02)" }}>
                          <th style={{ padding: "8px 12px" }}>Tipo Operación</th>
                          <th style={{ padding: "8px 12px" }}>Referencia</th>
                          <th style={{ padding: "8px 12px" }}>Concepto</th>
                          <th style={{ padding: "8px 12px" }}>Medio</th>
                          <th style={{ padding: "8px 12px", textAlign: "right" }}>Valor</th>
                          <th style={{ padding: "8px 12px", textAlign: "center" }}>Soporte</th>
                          <th style={{ padding: "8px 12px", textAlign: "center" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {worksheet.receiptAuditList.map((item) => {
                          const fullUrl = item.receiptUrl
                            ? (item.receiptUrl.startsWith("http") ? item.receiptUrl : `${apiBase}${item.receiptUrl}`)
                            : null;

                          return (
                            <tr
                              key={`${item.type}-${item.id}`}
                              style={{
                                borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))",
                              }}
                            >
                              <td style={{ padding: "8px 12px", fontWeight: 600 }}>{item.typeLabel}</td>
                              <td style={{ padding: "8px 12px", color: "#38bdf8", fontWeight: 600 }}>{item.reference}</td>
                              <td style={{ padding: "8px 12px" }}>{item.concept}</td>
                              <td style={{ padding: "8px 12px", textTransform: "uppercase", fontSize: "0.78rem" }}>{item.paymentMethod}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>{formatMoney(item.amount)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                {item.isMissing ? (
                                  <span style={{ color: "#ef4444", fontSize: "0.75rem", background: "rgba(239, 68, 68, 0.12)", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                                    ⚠️ Pendiente
                                  </span>
                                ) : (
                                  <span style={{ color: "#10b981", fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.12)", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                                    ✓ Adjuntado
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                <div style={{ display: "inline-flex", gap: "0.3rem" }}>
                                  {fullUrl && (
                                    <button
                                      type="button"
                                      className="inv-btn inv-btn--ghost"
                                      style={{ padding: "3px 6px", fontSize: "0.75rem" }}
                                      onClick={() => setViewingReceiptUrl(fullUrl)}
                                      title="Ver Comprobante"
                                    >
                                      <Eye size={13} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="inv-btn inv-btn--ghost"
                                    style={{
                                      padding: "3px 8px",
                                      fontSize: "0.75rem",
                                      color: item.isMissing ? "#f59e0b" : "var(--text-muted)",
                                      borderColor: item.isMissing ? "rgba(245, 158, 11, 0.4)" : undefined,
                                    }}
                                    onClick={() => setUploadItem(item)}
                                    title={item.isMissing ? "Subir soporte obligatorio" : "Reemplazar soporte"}
                                  >
                                    <Upload size={13} /> {item.isMissing ? "Subir" : "Cambiar"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Botón Principal para Cerrar el Día */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--bg-card, #1e293b)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  borderRadius: 12,
                  padding: "1.25rem 1.5rem",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                    Confirmar Cierre Diario de la Sede
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Al guardar, se emitirá el Acta Oficial con número consecutivo y sello de auditoría.
                  </div>
                </div>

                <button
                  type="button"
                  className="inv-btn inv-btn--primary"
                  disabled={saving}
                  onClick={() => void handleSaveClosure()}
                  style={{
                    padding: "10px 24px",
                    fontSize: "1rem",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <ShieldCheck size={18} />
                  {saving ? "Procesando Cierre…" : worksheet.isExistingClosure ? "Actualizar Cierre Diario" : "Efectuar y Guardar Cierre Diario"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── PESTAÑA 2: HISTORIAL DE CIERRES DIARIOS ───────────────────────────── */}
      {activeTab === "history" && (
        <>
          {loadingHistory ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Cargando historial de cierres diarios…
            </div>
          ) : closuresHistory.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                background: "var(--bg-card, #1e293b)",
                borderRadius: 10,
                border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.1))",
              }}
            >
              <History size={40} className="text-muted" style={{ margin: "0 auto 0.75rem auto", opacity: 0.5 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No hay cierres diarios registrados en este período</p>
              <p style={{ margin: "4px 0 1rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Efectúa el primer cierre desde la pestaña "Cierre del Día".
              </p>
            </div>
          ) : (
            <div
              style={{
                background: "var(--bg-card, #1e293b)",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                borderRadius: 10,
                overflowX: "auto",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", textAlign: "left", background: "rgba(255, 255, 255, 0.02)" }}>
                    <th style={{ padding: "10px 14px" }}>Acta #</th>
                    <th style={{ padding: "10px 14px" }}>Fecha</th>
                    <th style={{ padding: "10px 14px" }}>Sede</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Arranque</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Esperado</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Contado</th>
                    <th style={{ padding: "10px 14px", textAlign: "center" }}>Cuadre / Dif.</th>
                    <th style={{ padding: "10px 14px" }}>Cajero</th>
                    <th style={{ padding: "10px 14px", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {closuresHistory.map((c) => {
                    const isBalanced = c.cashDifference === 0;
                    const isShort = c.cashDifference < 0;

                    return (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))",
                        }}
                      >
                        <td style={{ padding: "10px 14px" }}>
                          <button
                            type="button"
                            onClick={() => setViewingClosure(c)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#38bdf8",
                              fontWeight: 700,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {c.closingVoucherNumber}
                          </button>
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{c.closureDate}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: "0.8rem", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
                            {c.warehouseCode ?? "MAIN"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>{formatMoney(c.openingCash)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{formatMoney(c.expectedCash)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#10b981" }}>{formatMoney(c.countedCash)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              background: isBalanced ? "rgba(16, 185, 129, 0.12)" : isShort ? "rgba(239, 68, 68, 0.12)" : "rgba(59, 130, 246, 0.12)",
                              color: isBalanced ? "#10b981" : isShort ? "#ef4444" : "#3b82f6",
                            }}
                          >
                            {isBalanced ? "✓ Exacto" : formatMoney(c.cashDifference)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>
                          {c.cashierName ?? c.createdByName ?? "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <button
                            type="button"
                            className="inv-btn inv-btn--ghost"
                            style={{ padding: "4px 8px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                            onClick={() => setViewingClosure(c)}
                            title="Ver e imprimir acta oficial de cierre"
                          >
                            <Printer size={14} /> Acta
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── PESTAÑA 3: CIERRE CONTABLE GENERAL (RANGO DE FECHAS) ─────────────── */}
      {activeTab === "general" && (
        <>
          {loadingGeneral ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Calculando balance general y consolidando medios de pago del período…
            </div>
          ) : !generalWorksheet ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Selecciona una sede o consolidado y haz clic en "Consultar Período".
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Banner si ya existe cierre */}
              {generalWorksheet.isExisting && (
                <div
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, color: "#10b981", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <CheckCircle2 size={18} /> Cierre Contable Emitido: {generalWorksheet.existingCode}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Fondo dejado en sede: <strong>{formatMoney(generalWorksheet.existingCashToKeep ?? 0)}</strong> |
                      Efectivo a retirar/consignar: <strong>{formatMoney(generalWorksheet.existingCashToWithdraw ?? 0)}</strong>
                    </div>
                  </div>

                  {generalHistory.find((h) => h.id === generalWorksheet.existingId) && (
                    <button
                      type="button"
                      className="inv-btn inv-btn--primary"
                      onClick={() => {
                        const item = generalHistory.find((h) => h.id === generalWorksheet.existingId);
                        if (item) setViewingGeneralClosure(item);
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                    >
                      <Printer size={16} /> Imprimir Acta Oficial
                    </button>
                  )}
                </div>
              )}

              {/* Tarjetas KPI de Resumen */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "1rem",
                }}
              >
                {/* Ventas Totales */}
                <div
                  style={{
                    background: "var(--bg-card, #1e293b)",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>
                    Ventas Totales Facturadas
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ffffff" }}>
                    {formatMoney(generalWorksheet.totalSales)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
                    Efectivo: <strong style={{ color: "#10b981" }}>{formatMoney(generalWorksheet.totalCashSales)}</strong><br />
                    Bancos / Digital: <strong style={{ color: "#38bdf8" }}>{formatMoney(generalWorksheet.totalBankSales)}</strong>
                  </div>
                </div>

                {/* Recaudos Cartera y Apartados */}
                <div
                  style={{
                    background: "var(--bg-card, #1e293b)",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>
                    Recaudos Cartera y Apartados
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#60a5fa" }}>
                    {formatMoney(generalWorksheet.totalCreditPayments + generalWorksheet.totalLayawayPayments)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
                    Abonos Cartera: {formatMoney(generalWorksheet.totalCreditPayments)}<br />
                    Abonos Apartados: {formatMoney(generalWorksheet.totalLayawayPayments)}
                  </div>
                </div>

                {/* Salidas y Nómina */}
                <div
                  style={{
                    background: "var(--bg-card, #1e293b)",
                    border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>
                    Egresos y Nómina Pagada
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f87171" }}>
                    {formatMoney(generalWorksheet.totalOutflows + generalWorksheet.totalPayroll)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
                    Egresos de caja: {formatMoney(generalWorksheet.totalOutflows)}<br />
                    Nómina cancelada: {formatMoney(generalWorksheet.totalPayroll)}
                  </div>
                </div>

                {/* Efectivo Neto del Período */}
                <div
                  style={{
                    background: "rgba(2, 132, 199, 0.08)",
                    border: "2px solid #0284c7",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", color: "#38bdf8", fontWeight: 600, marginBottom: 4 }}>
                    Efectivo Neto Operativo
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#38bdf8" }}>
                    {formatMoney(generalWorksheet.totalNetCash)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
                    Traslados entre sedes: +{formatMoney(generalWorksheet.totalTransfersReceived)} / -{formatMoney(generalWorksheet.totalTransfersSent)}
                  </div>
                </div>
              </div>

              {/* Tabla de Desglose por Medio de Pago (Efectivo, Bancolombia, Davivienda, etc.) */}
              <div
                style={{
                  background: "var(--bg-card, #1e293b)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  borderRadius: 10,
                  overflowX: "auto",
                  padding: "1.25rem",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 1rem 0",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <DollarSign size={18} className="text-primary" />
                  Desglose de Ventas y Recaudos por Medio de Pago
                </h3>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                        textAlign: "left",
                        background: "rgba(255, 255, 255, 0.02)",
                      }}
                    >
                      <th style={{ padding: "10px 14px" }}>Medio de Pago / Banco</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>Ventas del Período</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>Cartera / Apartados</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>Total Recaudado</th>
                      <th style={{ padding: "10px 14px", textAlign: "center" }}>Operaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generalWorksheet.paymentBreakdown.length > 0 ? (
                      generalWorksheet.paymentBreakdown.map((item) => (
                        <tr
                          key={item.method}
                          style={{
                            borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))",
                          }}
                        >
                          <td style={{ padding: "10px 14px", fontWeight: item.method === "efectivo" ? 700 : 500 }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: item.method === "efectivo" ? "#10b981" : "#6366f1",
                                marginRight: 8,
                              }}
                            />
                            {item.label}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {formatMoney(item.salesAmount)}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {formatMoney(item.creditsAmount)}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>
                            {formatMoney(item.totalAmount)}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "var(--text-muted)" }}>
                            {item.count}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                          No hay operaciones registradas para este rango de fechas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Liquidación: Fondo en caja que se va a dejar y Efectivo a retirar */}
              <div
                style={{
                  background: "var(--bg-card, #1e293b)",
                  border: "2px solid #6366f1",
                  borderRadius: 10,
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 0.35rem 0", fontSize: "1.1rem", fontWeight: 800, color: "#818cf8" }}>
                    Fondo en Caja para la Sede y Efectivo a Retirar / Consignar
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Al efectuar el cierre general, define el valor que permanecerá en la caja de la sede física. El remanente calculado será el valor oficial a retirar o consignar a la cuenta de la empresa y la base para el próximo ciclo.
                  </p>
                </div>

                {(() => {
                  const cashToKeepVal = parseFloat(generalCashToKeepInput.replace(/[^0-9.]/g, "")) || 0;
                  const cashToWithdrawVal = Math.max(0, generalWorksheet.totalNetCash - cashToKeepVal);

                  return (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: "1rem",
                        }}
                      >
                        <div style={{ background: "rgba(255,255,255,0.03)", padding: "1rem", borderRadius: 8 }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Efectivo Neto del Período</span>
                          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#38bdf8", marginTop: 2 }}>
                            {formatMoney(generalWorksheet.totalNetCash)}
                          </div>
                        </div>

                        <div style={{ background: "rgba(99, 102, 241, 0.08)", padding: "1rem", borderRadius: 8, border: "1px solid rgba(99, 102, 241, 0.3)" }}>
                          <label className="field" style={{ margin: 0 }}>
                            <span style={{ color: "#a5b4fc", fontWeight: 700 }}>Valor en caja que se va a dejar ($ COP) *</span>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={generalCashToKeepInput}
                              onChange={(e) => setGeneralCashToKeepInput(e.target.value)}
                              style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ffffff" }}
                              placeholder="0"
                            />
                          </label>
                        </div>

                        <div style={{ background: "rgba(16, 185, 129, 0.08)", padding: "1rem", borderRadius: 8, border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                          <span style={{ fontSize: "0.8rem", color: "#6ee7b7", fontWeight: 600 }}>Efectivo a Retirar / Consignar</span>
                          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#10b981", marginTop: 2 }}>
                            {formatMoney(cashToWithdrawVal)}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                            (Efectivo Neto − Fondo Dejado)
                          </div>
                        </div>
                      </div>

                      <label className="field" style={{ margin: 0 }}>
                        <span>Observaciones / Notas del Cierre General</span>
                        <input
                          type="text"
                          value={generalNotes}
                          onChange={(e) => setGeneralNotes(e.target.value)}
                          placeholder="Ej: Cierre contable mensual septiembre, consignación bancaria realizada..."
                        />
                      </label>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                        <button
                          type="button"
                          className="inv-btn inv-btn--primary"
                          disabled={savingGeneral}
                          onClick={() => void handleSaveGeneralClosure()}
                          style={{
                            padding: "10px 24px",
                            fontSize: "1rem",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <ShieldCheck size={18} />
                          {savingGeneral ? "Guardando Cierre…" : generalWorksheet.isExisting ? "Actualizar Cierre Contable General" : "Emitir y Guardar Cierre Contable General"}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Historial de Cierres Contables Generales Registrados */}
              <div
                style={{
                  background: "var(--bg-card, #1e293b)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                  borderRadius: 10,
                  padding: "1.25rem",
                  marginTop: "1rem",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 1rem 0",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <History size={18} className="text-primary" />
                  Historial de Cierres Contables Generales Emitidos
                </h3>

                {loadingGeneralHistory ? (
                  <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                    Cargando historial de cierres generales…
                  </div>
                ) : generalHistory.length === 0 ? (
                  <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                    No se han registrado cierres contables generales aún.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr
                          style={{
                            borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                            textAlign: "left",
                            background: "rgba(255, 255, 255, 0.02)",
                          }}
                        >
                          <th style={{ padding: "8px 12px" }}>Código</th>
                          <th style={{ padding: "8px 12px" }}>Sede</th>
                          <th style={{ padding: "8px 12px" }}>Rango de Fechas</th>
                          <th style={{ padding: "8px 12px", textAlign: "right" }}>Ventas Totales</th>
                          <th style={{ padding: "8px 12px", textAlign: "right" }}>Efectivo Neto</th>
                          <th style={{ padding: "8px 12px", textAlign: "right" }}>Fondo en Sede</th>
                          <th style={{ padding: "8px 12px", textAlign: "right" }}>Retiro / Consignar</th>
                          <th style={{ padding: "8px 12px", textAlign: "center" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generalHistory.map((g) => (
                          <tr
                            key={g.id}
                            style={{
                              borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.05))",
                            }}
                          >
                            <td style={{ padding: "8px 12px", fontWeight: 700, color: "#38bdf8" }}>
                              {g.closureCode}
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              {g.warehouseName ? `${g.warehouseName} (${g.warehouseCode})` : "Consolidado"}
                            </td>
                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              {g.dateFrom} al {g.dateTo}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              {formatMoney(g.totalSales)}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "#38bdf8", fontWeight: 600 }}>
                              {formatMoney(g.totalNetCash)}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              {formatMoney(g.cashToKeep)}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "#10b981", fontWeight: 700 }}>
                              {formatMoney(g.cashToWithdraw)}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>
                              <button
                                type="button"
                                className="inv-btn inv-btn--ghost"
                                style={{ padding: "3px 8px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                                onClick={() => setViewingGeneralClosure(g)}
                                title="Ver e imprimir acta oficial"
                              >
                                <Printer size={14} /> Acta
                              </button>
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
        </>
      )}

      {/* Modal para Subir Soporte a una Operación */}
      {uploadItem && (
        <UploadReceiptModal
          token={token!}
          item={uploadItem}
          onClose={() => setUploadItem(null)}
          onSuccess={() => {
            setUploadItem(null);
            void loadWorksheet();
          }}
        />
      )}

      {/* Modal para Imprimir Acta de Cierre Diario */}
      {viewingClosure && (
        <PrintDailyClosureModal
          closure={viewingClosure}
          onClose={() => setViewingClosure(null)}
        />
      )}

      {/* Modal para Imprimir Acta de Cierre Contable General */}
      {viewingGeneralClosure && (
        <PrintGeneralClosureModal
          closure={viewingGeneralClosure}
          onClose={() => setViewingGeneralClosure(null)}
        />
      )}

      {/* Modal para Previsualizar Imagen de Comprobante */}
      {viewingReceiptUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setViewingReceiptUrl(null)}
        >
          <div
            style={{
              maxWidth: 700,
              maxHeight: "85vh",
              background: "#1e293b",
              borderRadius: 8,
              overflow: "hidden",
              padding: "1rem",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setViewingReceiptUrl(null)}
                style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>
            {viewingReceiptUrl.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={viewingReceiptUrl}
                title="Comprobante PDF"
                style={{ width: "100%", height: "70vh", border: "none" }}
              />
            ) : (
              <img
                src={viewingReceiptUrl}
                alt="Comprobante"
                style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: 4 }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
