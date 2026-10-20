import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  Wallet,
  TrendingDown,
  Clock,
  Info,
  CreditCard,
  Lock,
} from "lucide-react";
import {
  fetchDailyClosureWorksheet,
  saveDailyClosure,
  fetchDailyClosures,
  fetchGeneralClosureWorksheet,
  fetchLastGeneralClosure,
  fetchGeneralClosureDetail,
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
import { ViewReceiptPhotosModal } from "../../components/common/ViewReceiptPhotosModal.js";
import {
  getTodayBogotaYmd,
  getFirstDayOfMonthBogotaYmd,
  addDaysYmd,
  formatBogotaDateTime,
} from "../../lib/dateUtils.js";
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
  return getTodayBogotaYmd();
}

function localFirstDayOfMonth(): string {
  return getFirstDayOfMonthBogotaYmd();
}

export function DailyClosurePage({ defaultTab }: { defaultTab?: "current" | "history" | "general" } = {}) {
  const { token, user } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();
  const location = useLocation();
  const navigate = useNavigate();
  const canSeeAll = isAllWarehouses;

  const isGeneralRoute = location.pathname.includes("cierre-general");
  const isHistoryRoute = location.pathname.includes("cierre-diario/historial");
  const [activeTab, setActiveTab] = useState<"current" | "history" | "general">(
    defaultTab ?? (isGeneralRoute ? "general" : isHistoryRoute ? "history" : "current")
  );

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    } else if (location.pathname.includes("cierre-general")) {
      setActiveTab("general");
    } else if (location.pathname.includes("cierre-diario/historial")) {
      setActiveTab("history");
    } else {
      setActiveTab("current");
    }
  }, [defaultTab, location.pathname]);

  function handleTabChange(tab: "current" | "history" | "general") {
    setActiveTab(tab);
    setError(null);
    setSuccessMsg(null);
    if (tab === "general" && !location.pathname.includes("cierre-general")) {
      navigate("/app/finanzas/cierre-general");
    } else if (tab === "history" && !location.pathname.includes("cierre-diario/historial")) {
      navigate("/app/finanzas/cierre-diario/historial");
    } else if (tab === "current" && (location.pathname.includes("cierre-general") || location.pathname.includes("cierre-diario/historial"))) {
      navigate("/app/finanzas/cierre-diario");
    }
  }

  // Filtros principales Cierre Diario
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? (warehouses[0]?.id || "") : (warehouseId || "")
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouseId(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);
  const [closureDate, setClosureDate] = useState(localTodayYmd);

  // Hoja de trabajo de cierre diario actual
  const [worksheet, setWorksheet] = useState<DailyClosureWorksheet | null>(null);
  const [initialBaseInput, setInitialBaseInput] = useState<string>("0");
  const [countedCashInput, setCountedCashInput] = useState<string>("0");
  const [declaredBankInputs, setDeclaredBankInputs] = useState<Record<string, string>>({});
  const [cashierName, setCashierName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Historial Cierre Diario
  const [historyWarehouseId, setHistoryWarehouseId] = useState<string>(
    isAllWarehouses ? "" : (warehouseId || "")
  );
  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setHistoryWarehouseId(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);
  const [historyDateFrom, setHistoryDateFrom] = useState(localFirstDayOfMonth);
  const [historyDateTo, setHistoryDateTo] = useState(localTodayYmd);
  const [closuresHistory, setClosuresHistory] = useState<DailyClosureRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Cierre Contable General (Rango de fechas)
  const [generalWarehouseId, setGeneralWarehouseId] = useState<string>(
    isAllWarehouses ? "" : (warehouseId || "")
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setGeneralWarehouseId(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);
  const [generalDateFrom, setGeneralDateFrom] = useState(localFirstDayOfMonth);
  const [generalDateTo, setGeneralDateTo] = useState(localTodayYmd);
  const [hasPreviousGeneralClosure, setHasPreviousGeneralClosure] = useState<boolean>(false);
  const [lastGeneralClosureInfo, setLastGeneralClosureInfo] = useState<{
    id?: string;
    closureCode: string;
    dateFrom?: string;
    dateTo: string;
    createdAt?: string;
  } | null>(null);
  const [generalWorksheet, setGeneralWorksheet] = useState<GeneralClosureWorksheet | null>(null);
  const [generalOpeningCashInput, setGeneralOpeningCashInput] = useState<string>("0");
  const [generalCashToKeepInput, setGeneralCashToKeepInput] = useState<string>("0");
  const [generalNotes, setGeneralNotes] = useState<string>("");
  const [loadingGeneral, setLoadingGeneral] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generalHistory, setGeneralHistory] = useState<GeneralClosureRecord[]>([]);
  const [loadingGeneralHistory, setLoadingGeneralHistory] = useState(false);

  // Modales
  const [uploadItem, setUploadItem] = useState<ReceiptAuditItem | null>(null);
  const [viewingClosure, setViewingClosure] = useState<DailyClosureRecord | null>(null);
  const [viewingGeneralClosure, setViewingGeneralClosure] = useState<GeneralClosureRecord | null>(null);
  const [viewingPhotos, setViewingPhotos] = useState<{ title: string; urls: string[] } | null>(null);
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);

  // Cargar Hoja de Trabajo Cierre Diario
  const loadWorksheet = useCallback(async () => {
    if (!token || !selectedWarehouseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDailyClosureWorksheet(
        token,
        selectedWarehouseId,
        selectedClosureId ? { closureId: selectedClosureId } : closureDate
      );
      setWorksheet(res);
      setInitialBaseInput(String(res.openingCash ?? 0));
      setCountedCashInput(
        res.isExistingClosure && res.existingCountedCash !== null
          ? String(res.existingCountedCash)
          : String(res.expectedCash ?? 0)
      );
      const bMap: Record<string, string> = {};
      res.bankMethods.forEach((bm) => {
        const prev = res.existingBankBreakdown?.[bm.method];
        bMap[bm.method] = prev !== undefined ? String(prev) : String(bm.amount);
      });
      setDeclaredBankInputs(bMap);
      setCashierName(res.existingCashierName || user?.fullName || "");
      setNotes(res.existingNotes || "");
    } catch (err: any) {
      setError(err?.message || "Error al calcular arqueo de caja");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouseId, closureDate, selectedClosureId, user]);

  // Cargar Historial de Cierres Diarios
  const loadHistory = useCallback(async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetchDailyClosures(token, {
        warehouseId: historyWarehouseId || undefined,
        dateFrom: historyDateFrom || undefined,
        dateTo: historyDateTo || undefined,
      });
      setClosuresHistory(res.items);
    } catch (err: any) {
      setError(err?.message || "Error al cargar historial de cierres");
    } finally {
      setLoadingHistory(false);
    }
  }, [token, historyWarehouseId, historyDateFrom, historyDateTo]);

  // Obtener la fecha del último cierre general y fijar automáticamente la fecha de inicio
  const initGeneralDates = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await fetchLastGeneralClosure(token, generalWarehouseId || undefined);
      if (res.item) {
        setHasPreviousGeneralClosure(true);
        setLastGeneralClosureInfo({
          id: res.item.id,
          closureCode: res.item.closureCode,
          dateFrom: res.item.dateFrom,
          dateTo: res.item.dateTo,
          createdAt: res.item.createdAt,
        });
        const nextStart = addDaysYmd(res.item.dateTo, 1);
        setGeneralDateFrom(nextStart);
        setGeneralDateTo((curTo) => (curTo < nextStart ? nextStart : curTo));
        return nextStart;
      } else {
        setHasPreviousGeneralClosure(false);
        setLastGeneralClosureInfo(null);
        setGeneralDateFrom(localFirstDayOfMonth);
        return localFirstDayOfMonth();
      }
    } catch {
      return null;
    }
  }, [token, generalWarehouseId]);

  // Cargar Hoja de Trabajo Cierre General
  const loadGeneralWorksheet = useCallback(async (customDateFrom?: string) => {
    if (!token) return;
    setLoadingGeneral(true);
    setError(null);
    try {
      const from = customDateFrom ?? generalDateFrom;
      const res = await fetchGeneralClosureWorksheet(token, {
        warehouseId: generalWarehouseId || undefined,
        dateFrom: from,
        dateTo: generalDateTo,
      });
      setGeneralWorksheet(res);
      if (res.lastClosure) {
        setHasPreviousGeneralClosure(true);
        setLastGeneralClosureInfo({
          id: res.lastClosure.id,
          closureCode: res.lastClosure.closureCode,
          dateFrom: res.lastClosure.dateFrom,
          dateTo: res.lastClosure.dateTo,
          createdAt: res.lastClosure.createdAt,
        });
      }
      setGeneralOpeningCashInput(
        String(res.openingCash ?? res.suggestedOpeningCash ?? 0)
      );
      setGeneralCashToKeepInput(
        res.isExisting && res.existingCashToKeep !== null
          ? String(res.existingCashToKeep)
          : "0"
      );
      setGeneralNotes(res.existingNotes || "");
    } catch (err: any) {
      setError(err?.message || "Error al calcular balance general");
    } finally {
      setLoadingGeneral(false);
    }
  }, [token, generalWarehouseId, generalDateFrom, generalDateTo]);

  // Cargar Historial Cierres Generales
  const loadGeneralHistory = useCallback(async () => {
    if (!token) return;
    setLoadingGeneralHistory(true);
    try {
      const res = await fetchGeneralClosures(token, {
        warehouseId: generalWarehouseId || undefined,
      });
      setGeneralHistory(res.items);
    } catch (err: any) {
      setError(err?.message || "Error al cargar historial de cierres generales");
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
      void initGeneralDates().then((dateFrom) => {
        void loadGeneralWorksheet(dateFrom ?? undefined);
        void loadGeneralHistory();
      });
    }
  }, [activeTab, generalWarehouseId, loadWorksheet, loadHistory, loadGeneralWorksheet, loadGeneralHistory, initGeneralDates]);

  // Guardar Cierre Diario
  async function handleSaveClosure() {
    if (!token || !selectedWarehouseId || !worksheet) return;

    if (worksheet.isExistingClosure) {
      setError(
        `Este cierre diario (${worksheet.existingVoucherNumber || "Registrado"}) ya fue emitido oficialmente y se encuentra bloqueado. Por políticas operativas y contables, no se puede modificar.`
      );
      return;
    }

    if (worksheet.pendingReceiptsCount > 0) {
      setError(
        `No es posible efectuar el cierre diario: hay ${worksheet.pendingReceiptsCount} comprobante(s) de pago o soporte(s) bancario(s) pendiente(s) por adjuntar en la auditoría de soportes.`
      );
      return;
    }

    const countedCashNum = parseFloat(countedCashInput) || 0;

    if (countedCashNum < 0) {
      setError("El efectivo contado no puede ser un valor negativo.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const declaredMap: Record<string, number> = {};
      worksheet.bankMethods.forEach((bm) => {
        declaredMap[bm.method] = parseFloat(declaredBankInputs[bm.method] ?? String(bm.amount)) || 0;
      });

      const res = await saveDailyClosure(token, {
        warehouseId: selectedWarehouseId,
        closureDate,
        openingCash: effectiveOpeningCash,
        countedCash: countedCashNum,
        cashierName: cashierName.trim() || undefined,
        notes: notes.trim() || undefined,
        declaredBankMethods: declaredMap,
      });

      setSuccessMsg(`Cierre guardado exitosamente con comprobante: ${res.item.closingVoucherNumber}`);
      void loadWorksheet();
      void loadHistory();
    } catch (err: any) {
      setError(err?.message || "Error al guardar cierre diario");
    } finally {
      setSaving(false);
    }
  }

  // Guardar Cierre General
  async function handleSaveGeneralClosure() {
    if (!token || !generalWorksheet) return;

    if (generalDateTo < generalDateFrom) {
      setError("La fecha fin no puede ser anterior a la fecha de inicio.");
      return;
    }

    const openingCashVal = parseFloat(generalOpeningCashInput.replace(/[^0-9.]/g, "")) || 0;
    const cashToKeepVal = parseFloat(generalCashToKeepInput.replace(/[^0-9.]/g, "")) || 0;
    if (cashToKeepVal < 0) {
      setError("El valor que permanece en caja no puede ser negativo.");
      return;
    }

    setSavingGeneral(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await saveGeneralClosure(token, {
        warehouseId: generalWarehouseId || undefined,
        dateFrom: generalDateFrom,
        dateTo: generalDateTo,
        openingCash: openingCashVal,
        cashToKeep: cashToKeepVal,
        notes: generalNotes.trim() || undefined,
      });

      setSuccessMsg(`Cierre contable general emitido con código: ${res.item.closureCode}`);
      await initGeneralDates();
      void loadGeneralWorksheet();
      void loadGeneralHistory();
    } catch (err: any) {
      setError(err?.message || "Error al guardar cierre contable general");
    } finally {
      setSavingGeneral(false);
    }
  }

  // Cálculos dinámicos en vivo del arqueo diario
  // Saldo de arranque (base):
  // Si existe cierre anterior, se toma automáticamente de dicho cierre.
  // Si es el primer cierre del sistema (hasPreviousClosure === false), se toma la base inicial configurada (1 sola vez).
  const effectiveOpeningCash = worksheet?.hasPreviousClosure
    ? (worksheet.suggestedOpeningCash > 0 ? worksheet.suggestedOpeningCash : worksheet.openingCash)
    : (parseFloat(initialBaseInput) || 0);
  const openingCashNum = effectiveOpeningCash;
  const countedCashNum = parseFloat(countedCashInput) || 0;

  const totalCashIn = worksheet
    ? worksheet.cashSales +
      worksheet.cashCreditPayments +
      worksheet.cashLayawayPayments +
      worksheet.cashTransfersReceived
    : 0;

  const totalCashOut = worksheet
    ? worksheet.cashOutflows +
      worksheet.cashPayroll +
      worksheet.cashTransfersSent
    : 0;

  const dynamicExpectedCash = openingCashNum + totalCashIn - totalCashOut;
  const dynamicDifference = countedCashNum - dynamicExpectedCash;

  // Cálculos dinámicos de medios electrónicos y bancos
  const totalDeclaredBank = worksheet
    ? worksheet.bankMethods.reduce((sum, bm) => {
        const val = parseFloat(declaredBankInputs[bm.method] ?? String(bm.amount)) || 0;
        return sum + val;
      }, 0)
    : 0;

  const bankDifference = totalDeclaredBank - (worksheet?.bankPaymentsTotal ?? 0);
  const grandTotalCollected = countedCashNum + totalDeclaredBank;
  const grandTotalExpected = dynamicExpectedCash + (worksheet?.bankPaymentsTotal ?? 0);

  return (
    <div className="fin-page">
      {/* Encabezado */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge fin-header__icon-badge--emerald">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">
                {activeTab === "general" ? "Cierre Contable General (Rango)" : "Cierre Diario y Arqueo"}
              </h1>
              <p className="fin-header__subtitle">
                {activeTab === "general"
                  ? "Liquidación contable por rango de fechas (semanal, quincenal o mensual), fondo en sede y retiro de utilidades."
                  : "Cuadre de caja acumulativo día a día, auditoría de soportes bancarios y acta de cierre diario."}
              </p>
            </div>
          </div>
        </div>

        {/* Pestañas de Vista */}
        <div className="fin-header__actions">
          <div className="fin-tabs">
            <button
              type="button"
              className={`fin-tab ${activeTab === "current" ? "is-active" : ""}`}
              onClick={() => handleTabChange("current")}
            >
              <FileText size={16} />
              <span>Cierre del Día</span>
            </button>
            <button
              type="button"
              className={`fin-tab ${activeTab === "history" ? "is-active" : ""}`}
              onClick={() => handleTabChange("history")}
            >
              <History size={16} />
              <span>Historial Diario</span>
              {closuresHistory.length > 0 && (
                <span className="fin-tab__badge">{closuresHistory.length}</span>
              )}
            </button>
            <button
              type="button"
              className={`fin-tab ${activeTab === "general" ? "is-active" : ""}`}
              onClick={() => handleTabChange("general")}
            >
              <ShieldCheck size={16} />
              <span>Cierre Contable General</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      {activeTab === "general" ? (
        <div className="fin-filter-card">
          {canSeeAll ? (
            <div className="fin-filter-field" style={{ minWidth: 220 }}>
              <span>Sede de Cierre General</span>
              <select
                className="fin-select"
                value={generalWarehouseId}
                onChange={(e) => setGeneralWarehouseId(e.target.value)}
              >
                <option value="">Consolidado General (Todas las sedes)</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="fin-filter-field" style={{ minWidth: 160 }}>
              <span>SEDE</span>
              <div style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)", fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-primary)" }}>
                {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
              </div>
            </div>
          )}

          <div className="fin-filter-field" style={{ minWidth: 170 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Fecha Inicio</span>
              {hasPreviousGeneralClosure && (
                <span style={{ fontSize: "0.7rem", color: "#059669", fontWeight: 700 }}>
                  Automática
                </span>
              )}
            </div>
            <input
              className="fin-input"
              type="date"
              value={generalDateFrom}
              onChange={(e) => setGeneralDateFrom(e.target.value)}
              disabled={hasPreviousGeneralClosure}
              readOnly={hasPreviousGeneralClosure}
              title={
                hasPreviousGeneralClosure && lastGeneralClosureInfo
                  ? `Fijada automáticamente: día siguiente al último cierre general (${lastGeneralClosureInfo.closureCode} cerrado hasta ${lastGeneralClosureInfo.dateTo})`
                  : "Fecha inicial del período"
              }
              style={
                hasPreviousGeneralClosure
                  ? { background: "var(--inv-bg-field)", cursor: "not-allowed", opacity: 0.9 }
                  : {}
              }
            />
            {hasPreviousGeneralClosure && lastGeneralClosureInfo && (
              <span style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 2, display: "block" }}>
                Último cierre: {lastGeneralClosureInfo.dateTo} ({lastGeneralClosureInfo.closureCode})
              </span>
            )}
          </div>

          <div className="fin-filter-field" style={{ minWidth: 150 }}>
            <span>Fecha Fin</span>
            <input
              className="fin-input"
              type="date"
              value={generalDateTo}
              min={generalDateFrom}
              onChange={(e) => setGeneralDateTo(e.target.value)}
            />
          </div>

          <div className="fin-filter-field fin-filter-field--fixed">
            <button
              type="button"
              className="fin-btn fin-btn--primary"
              onClick={() => {
                void loadGeneralWorksheet();
                void loadGeneralHistory();
              }}
              disabled={loadingGeneral}
            >
              <RefreshCw size={16} className={loadingGeneral ? "spin" : ""} />
              <span>{loadingGeneral ? "Calculando…" : "Consultar Período"}</span>
            </button>
          </div>
        </div>
      ) : activeTab === "history" ? (
        <div className="fin-filter-card">
          {canSeeAll ? (
            <div className="fin-filter-field" style={{ minWidth: 200 }}>
              <span>Sede de Historial</span>
              <select
                className="fin-select"
                value={historyWarehouseId}
                onChange={(e) => setHistoryWarehouseId(e.target.value)}
              >
                <option value="">Consolidado (Todas las Sedes)</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="fin-filter-field" style={{ minWidth: 160 }}>
              <span>SEDE</span>
              <div style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)", fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-primary)" }}>
                {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
              </div>
            </div>
          )}

          <div className="fin-filter-field" style={{ minWidth: 150 }}>
            <span>Fecha Desde</span>
            <input
              className="fin-input"
              type="date"
              value={historyDateFrom}
              onChange={(e) => setHistoryDateFrom(e.target.value)}
            />
          </div>

          <div className="fin-filter-field" style={{ minWidth: 150 }}>
            <span>Fecha Hasta</span>
            <input
              className="fin-input"
              type="date"
              value={historyDateTo}
              onChange={(e) => setHistoryDateTo(e.target.value)}
            />
          </div>

          <div className="fin-filter-field fin-filter-field--fixed">
            <button
              type="button"
              className="fin-btn fin-btn--primary"
              onClick={() => void loadHistory()}
              title="Consultar historial de cierres en este rango de fechas"
              disabled={loadingHistory}
            >
              <RefreshCw size={16} className={loadingHistory ? "spin" : ""} />
              <span>{loadingHistory ? "Buscando…" : "Consultar Historial"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="fin-filter-card">
          {canSeeAll ? (
            <div className="fin-filter-field" style={{ minWidth: 200 }}>
              <span>Sede a Auditar / Cerrar</span>
              <select
                className="fin-select"
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="fin-filter-field" style={{ minWidth: 160 }}>
              <span>SEDE</span>
              <div style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)", fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-primary)" }}>
                {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
              </div>
            </div>
          )}

          <div className="fin-filter-field" style={{ minWidth: 160 }}>
            <span>Fecha de Operación / Cierre</span>
            <input
              className="fin-input"
              type="date"
              value={closureDate}
              onChange={(e) => setClosureDate(e.target.value)}
            />
          </div>

          <div className="fin-filter-field fin-filter-field--fixed">
            <button
              type="button"
              className="fin-btn fin-btn--ghost"
              onClick={() => void loadWorksheet()}
              title="Refrescar datos"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              <span>Actualizar</span>
            </button>
          </div>

          {/* Selector de Turnos / Jornadas de la fecha */}
          {activeTab === "current" && worksheet?.dayShifts && worksheet.dayShifts.length > 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                paddingTop: "0.85rem",
                borderTop: "1px dashed var(--border-color, #e2e8f0)",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#475569", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Clock size={15} color="#4f46e5" />
                <span>Turnos de esta fecha:</span>
              </span>

              {worksheet.dayShifts.map((shift) => {
                const isSelected = selectedClosureId === shift.id || (worksheet.isExistingClosure && worksheet.existingClosureId === shift.id);
                return (
                  <button
                    key={shift.id}
                    type="button"
                    onClick={() => setSelectedClosureId(shift.id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 8,
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      border: isSelected ? "2px solid #059669" : "1px solid #cbd5e1",
                      background: isSelected ? "#ecfdf5" : "#ffffff",
                      color: isSelected ? "#065f46" : "#334155",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      boxShadow: isSelected ? "0 0 0 2px rgba(16, 185, 129, 0.2)" : "none",
                    }}
                  >
                    <CheckCircle2 size={13} color="#059669" />
                    <span>
                      Turno {shift.shiftNumber} ({new Date(shift.closedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}) · {formatMoney(shift.countedCash)} · Cerrado
                    </span>
                  </button>
                );
              })}

              {closureDate === getTodayBogotaYmd() && (
                <button
                  type="button"
                  onClick={() => setSelectedClosureId(null)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: !selectedClosureId && !worksheet.isExistingClosure ? "2px solid #4f46e5" : "1px solid #c7d2fe",
                    background: !selectedClosureId && !worksheet.isExistingClosure ? "#eef2ff" : "#ffffff",
                    color: !selectedClosureId && !worksheet.isExistingClosure ? "#3730a3" : "#4f46e5",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    boxShadow: !selectedClosureId && !worksheet.isExistingClosure ? "0 0 0 2px rgba(99, 102, 241, 0.2)" : "none",
                  }}
                >
                  <Clock size={13} color="#4f46e5" />
                  <span>
                    ● Turno {worksheet.dayShifts.length + 1} (En curso / Activo)
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Alertas */}
      {error && (
        <div className="fin-alert fin-alert--danger">
          <AlertTriangle size={18} />
          <div>{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="fin-alert fin-alert--success">
          <CheckCircle2 size={18} />
          <div>{successMsg}</div>
        </div>
      )}

      {/* ─── PESTAÑA 1: ARQUEO Y CIERRE DEL DÍA ─────────────────────────────────── */}
      {activeTab === "current" && (
        <>
          {loading ? (
            <div className="fin-empty">
              <div className="fin-empty__icon">
                <RefreshCw size={24} className="spin" />
              </div>
              <h3 className="fin-empty__title">Calculando arqueo de caja</h3>
              <p className="fin-empty__desc">Recopilando ventas, abonos, egresos y movimientos de la jornada…</p>
            </div>
          ) : !worksheet ? null : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Banner de Estado del Cierre Si ya está registrado */}
              {worksheet.isExistingClosure ? (
                <div
                  style={{
                    background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
                    border: "1px solid #a7f3d0",
                    borderRadius: 14,
                    padding: "1.15rem 1.35rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, color: "#065f46", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Lock size={18} color="#059669" />
                      <span>Cierre Oficial Registrado: {worksheet.existingVoucherNumber}</span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          color: "#166534",
                          border: "1px solid #86efac",
                          textTransform: "uppercase",
                        }}
                      >
                        🔒 Bloqueado · No editable
                      </span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: 4 }}>
                      Turno: <strong>{worksheet.shiftNumber || 1}</strong> | Estado: <strong>{worksheet.existingStatus?.toUpperCase()}</strong> | Contado físico reportado: <strong>{formatMoney(worksheet.existingCountedCash ?? 0)}</strong>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 2 }}>
                      {worksheet.startedAt && worksheet.closedAt
                        ? `Horario del turno: ${formatBogotaDateTime(worksheet.startedAt)} → ${formatBogotaDateTime(worksheet.closedAt)}`
                        : "Este cierre ya fue generado y emitido de forma definitiva. Por integridad operativa y contable no se puede modificar."}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      className="fin-btn fin-btn--ghost fin-btn--sm"
                      onClick={() => handleTabChange("history")}
                      style={{ background: "#ffffff", borderColor: "#a7f3d0" }}
                      title="Ver listado completo de cierres diarios anteriores"
                    >
                      <History size={15} />
                      <span>Ver Historial de Cierres</span>
                    </button>

                    <button
                      type="button"
                      className="fin-btn fin-btn--primary fin-btn--sm"
                      onClick={() => {
                        if (worksheet.existingClosureId) {
                          setViewingClosure({
                            id: worksheet.existingClosureId,
                            warehouseId: worksheet.warehouseId,
                            warehouseCode: worksheet.warehouseCode,
                            warehouseName: worksheet.warehouseName,
                            closureDate: worksheet.closureDate,
                            shiftNumber: worksheet.shiftNumber || 1,
                            startedAt: worksheet.startedAt,
                            closedAt: worksheet.closedAt,
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
                      <Printer size={15} />
                      <span>Ver / Imprimir Acta Oficial</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                    border: "1px solid #cbd5e1",
                    borderRadius: 14,
                    padding: "1rem 1.35rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: "#e0e7ff",
                        color: "#4338ca",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: "1.05rem",
                      }}
                    >
                      {worksheet.shiftNumber || 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                        <span>Turno {worksheet.shiftNumber || 1} de la jornada · En curso</span>
                        <span className="fin-badge fin-badge--info">
                          ● Activo para arqueo y cierre
                        </span>
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 3 }}>
                        {worksheet.startedAt
                          ? `Acumulando movimientos desde: ${formatBogotaDateTime(worksheet.startedAt)} hasta ahora.`
                          : "Acumulando movimientos desde el inicio de operaciones hasta ahora."}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: "0.82rem", color: "#475569", fontWeight: 600 }}>
                    Base de inicio asignada: <strong style={{ color: "#059669" }}>{formatMoney(openingCashNum)}</strong>
                  </div>
                </div>
              )}

              {/* Tarjetas de Saldo de Arranque y Resumen de Efectivo */}
              <div className="fin-kpi-grid fin-kpi-grid--4">
                {/* 1. Saldo de Arranque */}
                {worksheet.hasPreviousClosure ? (
                  <div className="fin-kpi-card fin-kpi-card--teal">
                    <div className="fin-kpi-top">
                      <span className="fin-kpi-label">Saldo de Arranque (Base)</span>
                      <div className="fin-kpi-icon fin-kpi-icon--teal">
                        <Wallet size={18} />
                      </div>
                    </div>
                    <div className="fin-kpi-val fin-kpi-val--teal">
                      {formatMoney(openingCashNum)}
                    </div>
                    <div className="fin-kpi-sub">
                      {worksheet.suggestedOpeningCash > 0 ? (
                        <span>Tomado del cierre anterior: <strong>{formatMoney(worksheet.suggestedOpeningCash)}</strong></span>
                      ) : (
                        <span>Base automática del día: <strong>$ 0</strong></span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="fin-kpi-card fin-kpi-card--teal" style={{ border: "2px dashed #0d9488" }}>
                    <div className="fin-kpi-top">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span className="fin-kpi-label" style={{ color: "#0f766e", fontWeight: 700 }}>Base de Arranque</span>
                        <span className="fin-badge fin-badge--warning" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>Primer Cierre</span>
                      </div>
                      <div className="fin-kpi-icon fin-kpi-icon--teal">
                        <Wallet size={18} />
                      </div>
                    </div>
                    <div style={{ margin: "4px 0" }}>
                      <input
                        className="fin-input"
                        type="number"
                        min="0"
                        step="1000"
                        disabled={worksheet.isExistingClosure}
                        readOnly={worksheet.isExistingClosure}
                        value={initialBaseInput}
                        onChange={(e) => setInitialBaseInput(e.target.value)}
                        placeholder="0"
                        style={{
                          fontSize: "1.3rem",
                          fontWeight: 800,
                          height: 42,
                          borderColor: "#0d9488",
                          backgroundColor: worksheet.isExistingClosure ? "#f1f5f9" : undefined,
                          cursor: worksheet.isExistingClosure ? "not-allowed" : undefined,
                        }}
                      />
                    </div>
                    <div className="fin-kpi-sub" style={{ color: "#0f766e", lineHeight: 1.3 }}>
                      Configuración inicial (única vez). A partir de mañana se tomará sola del día anterior.
                    </div>
                  </div>
                )}

                {/* 2. Entradas de Efectivo (+) */}
                <div className="fin-kpi-card fin-kpi-card--emerald">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#059669" }}>Entradas Efectivo (+)</span>
                    <div className="fin-kpi-icon fin-kpi-icon--emerald">
                      <ArrowDownRight size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--emerald">
                    {formatMoney(totalCashIn)}
                  </div>
                  <div style={{ fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 3, color: "#64748b", marginTop: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Ventas:</span> <strong>{formatMoney(worksheet.cashSales)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Abonos cartera:</span> <strong>{formatMoney(worksheet.cashCreditPayments)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Apartados:</span> <strong>{formatMoney(worksheet.cashLayawayPayments)}</strong>
                    </div>
                    {worksheet.cashTransfersReceived > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#0284c7" }}>
                        <span>Remesas recibidas:</span> <strong>+ {formatMoney(worksheet.cashTransfersReceived)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Salidas de Efectivo (-) */}
                <div className="fin-kpi-card fin-kpi-card--rose">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#e11d48" }}>Salidas Efectivo (-)</span>
                    <div className="fin-kpi-icon fin-kpi-icon--rose">
                      <ArrowUpRight size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--rose">
                    - {formatMoney(totalCashOut)}
                  </div>
                  <div style={{ fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 3, color: "#64748b", marginTop: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Vales de egreso:</span> <strong style={{ color: "#e11d48" }}>- {formatMoney(worksheet.cashOutflows)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Nómina en efectivo:</span> <strong style={{ color: "#e11d48" }}>- {formatMoney(worksheet.cashPayroll)}</strong>
                    </div>
                    {worksheet.cashTransfersSent > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Remesas enviadas:</span> <strong style={{ color: "#e11d48" }}>- {formatMoney(worksheet.cashTransfersSent)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Efectivo Neto Esperado en Caja */}
                <div className="fin-kpi-card fin-kpi-card--indigo">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#4f46e5" }}>Efectivo Esperado</span>
                    <div className="fin-kpi-icon fin-kpi-icon--indigo">
                      <DollarSign size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--indigo">
                    {formatMoney(dynamicExpectedCash)}
                  </div>
                  <div className="fin-kpi-sub">
                    Arranque + Entradas − Salidas
                  </div>
                </div>
              </div>

              {/* Sección de Conteo Físico y Cuadre de Caja */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--border-color)",
                  borderRadius: 16,
                  padding: "1.5rem",
                  boxShadow: "var(--fin-shadow-sm)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
                  <DollarSign className="text-primary" size={22} />
                  <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                    Conteo Físico y Cuadre de Caja
                  </h2>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem", flexWrap: "wrap" }}>
                  {/* Inputs del Cajero */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div className="fin-filter-field">
                      <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a" }}>
                        Efectivo Físico Contado ($ COP) *
                      </span>
                      <input
                        className="fin-input"
                        type="number"
                        min="0"
                        step="1000"
                        required
                        disabled={worksheet.isExistingClosure}
                        readOnly={worksheet.isExistingClosure}
                        value={countedCashInput}
                        onChange={(e) => setCountedCashInput(e.target.value)}
                        placeholder="Ingresa el dinero físico en billetes y monedas"
                        style={{
                          height: 48,
                          fontSize: "1.35rem",
                          fontWeight: 800,
                          backgroundColor: worksheet.isExistingClosure ? "#f1f5f9" : undefined,
                          cursor: worksheet.isExistingClosure ? "not-allowed" : undefined,
                        }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div className="fin-filter-field">
                        <span>Cajero / Responsable</span>
                        <input
                          className="fin-input"
                          type="text"
                          disabled={worksheet.isExistingClosure}
                          readOnly={worksheet.isExistingClosure}
                          value={cashierName}
                          onChange={(e) => setCashierName(e.target.value)}
                          placeholder="Nombre de quien entrega caja"
                          style={{
                            backgroundColor: worksheet.isExistingClosure ? "#f1f5f9" : undefined,
                            cursor: worksheet.isExistingClosure ? "not-allowed" : undefined,
                          }}
                        />
                      </div>

                      <div className="fin-filter-field">
                        <span>Notas u Observaciones</span>
                        <input
                          className="fin-input"
                          type="text"
                          disabled={worksheet.isExistingClosure}
                          readOnly={worksheet.isExistingClosure}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Faltantes justificados, monedas..."
                          style={{
                            backgroundColor: worksheet.isExistingClosure ? "#f1f5f9" : undefined,
                            cursor: worksheet.isExistingClosure ? "not-allowed" : undefined,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Panel de Diferencia / Cuadre */}
                  <div
                    style={{
                      borderRadius: 14,
                      padding: "1.35rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      background:
                        dynamicDifference === 0
                          ? "var(--fin-emerald-bg)"
                          : dynamicDifference < 0
                          ? "var(--fin-rose-bg)"
                          : "var(--fin-amber-bg)",
                      border: `1px solid ${
                        dynamicDifference === 0
                          ? "var(--fin-emerald-border)"
                          : dynamicDifference < 0
                          ? "var(--fin-rose-border)"
                          : "var(--fin-amber-border)"
                      }`,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 700, color: "#64748b" }}>
                        Resultado del Cuadre
                      </span>
                      <div
                        style={{
                          fontSize: "1.7rem",
                          fontWeight: 900,
                          margin: "6px 0",
                          fontFamily: "var(--font-display, inherit)",
                          color:
                            dynamicDifference === 0
                              ? "#059669"
                              : dynamicDifference < 0
                              ? "#e11d48"
                              : "#d97706",
                        }}
                      >
                        {dynamicDifference === 0
                          ? "✓ CAJA CUADRADA"
                          : dynamicDifference < 0
                          ? `FALTANTE: - ${formatMoney(Math.abs(dynamicDifference))}`
                          : `SOBRANTE: + ${formatMoney(dynamicDifference)}`}
                      </div>
                    </div>

                    <div style={{ fontSize: "0.85rem", color: "#475569", display: "flex", flexDirection: "column", gap: "0.25rem", borderTop: "1px dashed rgba(15, 23, 42, 0.12)", paddingTop: "0.6rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Esperado en caja:</span> <strong>{formatMoney(dynamicExpectedCash)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Contado por cajero:</span> <strong>{formatMoney(countedCashNum)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Diferencia:</span> <strong style={{ color: dynamicDifference === 0 ? "#059669" : dynamicDifference < 0 ? "#e11d48" : "#d97706" }}>{formatMoney(dynamicDifference)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección de Arqueo y Declaración de Medios Electrónicos / Bancos */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--border-color)",
                  borderRadius: 16,
                  padding: "1.5rem",
                  boxShadow: "var(--fin-shadow-sm)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CreditCard className="text-primary" size={22} />
                    <div>
                      <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                        Arqueo y Cuadre de Medios Electrónicos y Bancos
                      </h2>
                      <p style={{ margin: "2px 0 0 0", color: "#64748b", fontSize: "0.82rem" }}>
                        Declara el valor recaudado en cada banco o pasarela y compáralo con lo facturado y los soportes adjuntos.
                      </p>
                    </div>
                  </div>

                  {worksheet.bankMethods.length > 0 && (
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span className={`fin-badge ${bankDifference === 0 ? "fin-badge--success" : "fin-badge--danger"}`}>
                        {bankDifference === 0 ? "✓ Bancos Cuadrados" : `Diferencia Bancos: ${formatMoney(bankDifference)}`}
                      </span>
                      <span className="fin-badge fin-badge--neutral">
                        {worksheet.bankMethods.length} medios con movimiento
                      </span>
                    </div>
                  )}
                </div>

                {worksheet.bankMethods.length === 0 ? (
                  <div className="fin-empty" style={{ padding: "1.75rem 1rem", background: "#f8fafc", borderRadius: 12 }}>
                    <p className="fin-empty__desc" style={{ margin: 0 }}>
                      No se registraron ventas ni cobros por entidades bancarias o pasarelas en esta fecha. La totalidad del recaudo fue en efectivo físico.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div className="fin-table-wrap">
                      <table className="fin-table">
                        <thead>
                          <tr>
                            <th>Medio / Entidad Bancaria</th>
                            <th style={{ textAlign: "center" }}>Operaciones</th>
                            <th style={{ textAlign: "right" }}>Esperado en Sistema</th>
                            <th style={{ textAlign: "center" }}>Soportes Adjuntos</th>
                            <th style={{ textAlign: "right", minWidth: 180 }}>Valor Recogido / Declarado ($ COP) *</th>
                            <th style={{ textAlign: "center" }}>Cuadre</th>
                          </tr>
                        </thead>
                        <tbody>
                          {worksheet.bankMethods.map((bm) => {
                            const declaredVal = parseFloat(declaredBankInputs[bm.method] ?? String(bm.amount)) || 0;
                            const diff = declaredVal - bm.amount;
                            const isMatched = diff === 0;

                            // Comprobantes de este medio
                            const methodAudits = worksheet.receiptAuditList.filter(
                              (a) => a.paymentMethod.toLowerCase() === bm.method.toLowerCase()
                            );
                            const missingMethodAudits = methodAudits.filter((a) => a.isMissing).length;

                            return (
                              <tr key={bm.method}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <span className="fin-badge fin-badge--neutral" style={{ textTransform: "uppercase", fontWeight: 700 }}>
                                      {bm.label}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  <span className="fin-badge fin-badge--info">{bm.count} ops</span>
                                </td>
                                <td className="fin-table-num" style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                                  {formatMoney(bm.amount)}
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  {methodAudits.length === 0 ? (
                                    <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>—</span>
                                  ) : missingMethodAudits === 0 ? (
                                    <span className="fin-badge fin-badge--success">
                                      ✓ {methodAudits.length} de {methodAudits.length}
                                    </span>
                                  ) : (
                                    <span className="fin-badge fin-badge--danger">
                                      ⚠️ {missingMethodAudits} faltante{missingMethodAudits > 1 ? "s" : ""}
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <input
                                    className="fin-input"
                                    type="number"
                                    min="0"
                                    step="1000"
                                    disabled={worksheet.isExistingClosure}
                                    readOnly={worksheet.isExistingClosure}
                                    value={declaredBankInputs[bm.method] ?? String(bm.amount)}
                                    onChange={(e) =>
                                      setDeclaredBankInputs((prev) => ({
                                        ...prev,
                                        [bm.method]: e.target.value,
                                      }))
                                    }
                                    style={{
                                      textAlign: "right",
                                      fontWeight: 800,
                                      height: 38,
                                      fontSize: "1rem",
                                      color: isMatched ? "#059669" : "#e11d48",
                                      borderColor: isMatched ? "#a7f3d0" : "#fca5a5",
                                      background: worksheet.isExistingClosure ? "#f1f5f9" : isMatched ? "#f0fdf4" : "#fff1f2",
                                      cursor: worksheet.isExistingClosure ? "not-allowed" : undefined,
                                    }}
                                  />
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  {isMatched ? (
                                    <span className="fin-badge fin-badge--success">✓ Cuadrado</span>
                                  ) : (
                                    <span className={`fin-badge ${diff < 0 ? "fin-badge--danger" : "fin-badge--warning"}`}>
                                      {diff < 0 ? `Faltante: - ${formatMoney(Math.abs(diff))}` : `Sobrante: + ${formatMoney(diff)}`}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Resumen Total de Medios Electrónicos */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: "0.85rem 1.25rem",
                        flexWrap: "wrap",
                        gap: "1rem",
                      }}
                    >
                      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.85rem", color: "#475569" }}>
                        <div>
                          <span>Total Esperado en Bancos: </span>
                          <strong style={{ color: "#0f172a" }}>{formatMoney(worksheet.bankPaymentsTotal)}</strong>
                        </div>
                        <div>
                          <span>Total Recogido / Declarado: </span>
                          <strong style={{ color: bankDifference === 0 ? "#059669" : "#e11d48" }}>{formatMoney(totalDeclaredBank)}</strong>
                        </div>
                        <div>
                          <span>Diferencia Digital: </span>
                          <strong style={{ color: bankDifference === 0 ? "#059669" : "#e11d48" }}>{formatMoney(bankDifference)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Gran Total Consolidado del Cierre (Efectivo + Medios Digitales) */}
              <div
                style={{
                  background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                  borderRadius: 16,
                  padding: "1.35rem 1.75rem",
                  color: "#ffffff",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1.25rem",
                  boxShadow: "0 4px 15px rgba(15, 23, 42, 0.15)",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", fontWeight: 700 }}>
                    Consolidado de Cuadre General de la Jornada
                  </span>
                  <div style={{ fontSize: "1.85rem", fontWeight: 900, color: "#38bdf8", marginTop: 4 }}>
                    {formatMoney(grandTotalCollected)}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#cbd5e1", marginTop: 3 }}>
                    Efectivo Físico: <strong>{formatMoney(countedCashNum)}</strong> + Medios Electrónicos: <strong>{formatMoney(totalDeclaredBank)}</strong> <span style={{ opacity: 0.75 }}>(Esperado General: {formatMoney(grandTotalExpected)})</span>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "6px 14px",
                      borderRadius: 999,
                      background:
                        dynamicDifference === 0 && bankDifference === 0 && worksheet.pendingReceiptsCount === 0
                          ? "rgba(16, 185, 129, 0.2)"
                          : "rgba(245, 158, 11, 0.2)",
                      border: `1px solid ${
                        dynamicDifference === 0 && bankDifference === 0 && worksheet.pendingReceiptsCount === 0
                          ? "#10b981"
                          : "#f59e0b"
                      }`,
                      color:
                        dynamicDifference === 0 && bankDifference === 0 && worksheet.pendingReceiptsCount === 0
                          ? "#34d399"
                          : "#fbbf24",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                    }}
                  >
                    {dynamicDifference === 0 && bankDifference === 0 && worksheet.pendingReceiptsCount === 0 ? (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Jornada Cuadrada y Auditada al 100%</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={16} />
                        <span>
                          {worksheet.pendingReceiptsCount > 0
                            ? `${worksheet.pendingReceiptsCount} comprobantes pendientes`
                            : "Descuadre en Efectivo o Bancos"}
                        </span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 4 }}>
                    Base inicial de caja: {formatMoney(effectiveOpeningCash)}
                  </div>
                </div>
              </div>

              {/* Auditoría de Comprobantes Digitales y Soportes */}
              <div className="fin-table-card">
                <div className="fin-table-header">
                  <div>
                    <h3 className="fin-table-title">
                      <FileText size={18} color="var(--accent)" />
                      <span>Auditoría de Comprobantes y Soportes del Día</span>
                    </h3>
                    <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.82rem" }}>
                      Comprobantes bancarios (Bancolombia, Nequi, etc.), vales de egreso, remesas y nómina
                    </p>
                  </div>

                  {worksheet.pendingReceiptsCount > 0 ? (
                    <span className="fin-badge fin-badge--warning">
                      <AlertTriangle size={15} />
                      {worksheet.pendingReceiptsCount} comprobantes pendientes por adjuntar
                    </span>
                  ) : (
                    <span className="fin-badge fin-badge--success">
                      <CheckCircle2 size={15} />
                      100% de Comprobantes Adjuntados
                    </span>
                  )}
                </div>

                {worksheet.receiptAuditList.length === 0 ? (
                  <div className="fin-empty" style={{ padding: "2.5rem 1rem" }}>
                    <p className="fin-empty__desc">
                      No hay operaciones por cuentas bancarias ni egresos que requieran comprobante en esta fecha.
                    </p>
                  </div>
                ) : (
                  <div className="fin-table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Tipo Operación</th>
                          <th>Referencia</th>
                          <th>Concepto</th>
                          <th>Medio</th>
                          <th style={{ textAlign: "right" }}>Valor</th>
                          <th style={{ textAlign: "center" }}>Soporte</th>
                          <th style={{ textAlign: "center" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {worksheet.receiptAuditList.map((item) => {
                          const urls = (item.receiptUrls && item.receiptUrls.length > 0)
                            ? item.receiptUrls
                            : (item.receiptUrl ? [item.receiptUrl] : []);

                          return (
                            <tr key={`${item.type}-${item.id}`}>
                              <td><strong style={{ color: "#0f172a" }}>{item.typeLabel}</strong></td>
                              <td><span className="fin-badge fin-badge--info">{item.reference}</span></td>
                              <td>{item.concept}</td>
                              <td><span className="fin-badge fin-badge--neutral" style={{ textTransform: "uppercase" }}>{item.paymentMethod}</span></td>
                              <td className="fin-table-num" style={{ fontWeight: 700 }}>{formatMoney(item.amount)}</td>
                              <td style={{ textAlign: "center" }}>
                                {item.isMissing ? (
                                  <span className="fin-badge fin-badge--danger">
                                    ⚠️ Pendiente
                                  </span>
                                ) : (
                                  <span className="fin-badge fin-badge--success">
                                    ✓ {urls.length > 1 ? `${urls.length} fotos` : "Adjuntado"}
                                  </span>
                                )}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                                  {urls.length > 0 && (
                                    <button
                                      type="button"
                                      className="fin-btn fin-btn--ghost fin-btn--sm"
                                      style={{ padding: "0 8px" }}
                                      onClick={() =>
                                        setViewingPhotos({
                                          title: `Soporte ${item.typeLabel} - ${item.reference}`,
                                          urls,
                                        })
                                      }
                                      title="Ver fotos / soporte"
                                    >
                                      <Eye size={14} />
                                    </button>
                                  )}
                                  {!worksheet.isExistingClosure && (
                                    <button
                                      type="button"
                                      className={`fin-btn fin-btn--sm ${item.isMissing ? "fin-btn--primary" : "fin-btn--ghost"}`}
                                      onClick={() => setUploadItem(item)}
                                      title={item.isMissing ? "Subir soporte obligatorio" : "Reemplazar o agregar fotos de soporte"}
                                    >
                                      <Upload size={13} />
                                      <span>{item.isMissing ? "Subir" : "Cambiar"}</span>
                                    </button>
                                  )}
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

              {/* Botón Principal para Cerrar el Día o Estado Bloqueado */}
              {worksheet.isExistingClosure ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                    border: "1px solid #86efac",
                    borderRadius: 16,
                    padding: "1.25rem 1.5rem",
                    boxShadow: "var(--fin-shadow-sm)",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#166534", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Lock size={19} color="#16a34a" />
                      <span>Jornada Cerrada y Bloqueada ({worksheet.existingVoucherNumber})</span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#ffffff",
                          color: "#166534",
                          border: "1px solid #86efac",
                          textTransform: "uppercase",
                        }}
                      >
                        Definitivo · No editable
                      </span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#15803d", marginTop: 4 }}>
                      Este cierre diario ya fue generado y sellado formalmente. No admite modificaciones para garantizar la integridad y seguridad operativa.
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      className="fin-btn fin-btn--ghost"
                      onClick={() => handleTabChange("history")}
                      style={{ background: "#ffffff", borderColor: "#86efac", color: "#166534" }}
                    >
                      <History size={16} />
                      <span>Ver Historial de Cierres</span>
                    </button>
                    <button
                      type="button"
                      className="fin-btn fin-btn--primary"
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
                      style={{ background: "#16a34a", borderColor: "#16a34a", color: "#ffffff" }}
                    >
                      <Printer size={16} />
                      <span>Ver / Imprimir Acta Oficial</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#ffffff",
                    border: "1px solid var(--border-color)",
                    borderRadius: 16,
                    padding: "1.25rem 1.5rem",
                    boxShadow: "var(--fin-shadow-sm)",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>
                      Confirmar Cierre Diario de la Sede
                    </div>
                    <div style={{ fontSize: "0.84rem", color: "#64748b" }}>
                      Al guardar, se emitirá el Acta Oficial definitiva con número consecutivo y sello de auditoría. Una vez emitido, no podrá ser editado.
                    </div>
                    {worksheet.pendingReceiptsCount > 0 && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          padding: "5px 12px",
                          borderRadius: 8,
                          background: "var(--fin-rose-bg)",
                          border: "1px solid var(--fin-rose-border)",
                          color: "#be123c",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                        }}
                      >
                        <AlertTriangle size={15} />
                        <span>
                          Bloqueado: Debes adjuntar todos los soportes bancarios ({worksheet.pendingReceiptsCount} pendientes) antes de efectuar el cierre.
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="fin-btn fin-btn--primary"
                    disabled={saving || worksheet.pendingReceiptsCount > 0}
                    onClick={() => void handleSaveClosure()}
                    style={{
                      height: 44,
                      padding: "0 1.5rem",
                      opacity: worksheet.pendingReceiptsCount > 0 ? 0.65 : 1,
                      cursor: worksheet.pendingReceiptsCount > 0 ? "not-allowed" : "pointer",
                    }}
                    title={
                      worksheet.pendingReceiptsCount > 0
                        ? `No puedes cerrar la jornada: faltan ${worksheet.pendingReceiptsCount} comprobantes por adjuntar`
                        : undefined
                    }
                  >
                    <ShieldCheck size={18} />
                    <span>
                      {saving
                        ? "Procesando Cierre…"
                        : worksheet.pendingReceiptsCount > 0
                        ? `Bloqueado (${worksheet.pendingReceiptsCount} comprobantes pendientes)`
                        : `Efectuar y Guardar Cierre Diario (Turno ${worksheet.shiftNumber || 1})`}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── PESTAÑA 2: HISTORIAL DE CIERRES DIARIOS ───────────────────────────── */}
      {activeTab === "history" && (
        <>
          {loadingHistory ? (
            <div className="fin-empty">
              <div className="fin-empty__icon">
                <RefreshCw size={24} className="spin" />
              </div>
              <h3 className="fin-empty__title">Cargando historial de cierres diarios</h3>
            </div>
          ) : closuresHistory.length === 0 ? (
            <div className="fin-empty">
              <div className="fin-empty__icon">
                <History size={26} />
              </div>
              <h3 className="fin-empty__title">No hay cierres diarios registrados</h3>
              <p className="fin-empty__desc">Efectúa el primer cierre desde la pestaña "Cierre del Día".</p>
            </div>
          ) : (
            <div className="fin-table-card">
              <div className="fin-table-header">
                <h3 className="fin-table-title">
                  <History size={18} color="var(--accent)" />
                  <span>Historial de Cierres Oficiales</span>
                </h3>
                <span className="fin-badge fin-badge--neutral">
                  {closuresHistory.length} actas emitidas
                </span>
              </div>

              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Acta #</th>
                      <th>Fecha / Turno</th>
                      <th>Horario</th>
                      <th>Sede</th>
                      <th style={{ textAlign: "right" }}>Arranque</th>
                      <th style={{ textAlign: "right" }}>Esperado</th>
                      <th style={{ textAlign: "right" }}>Contado</th>
                      <th style={{ textAlign: "center" }}>Cuadre / Dif.</th>
                      <th>Cajero</th>
                      <th style={{ textAlign: "center" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closuresHistory.map((c) => {
                      const isBalanced = c.cashDifference === 0;
                      const isShort = c.cashDifference < 0;

                      return (
                        <tr key={c.id}>
                          <td>
                            <button
                              type="button"
                              onClick={() => setViewingClosure(c)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--accent)",
                                fontWeight: 700,
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              {c.closingVoucherNumber}
                            </button>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <div><strong>{c.closureDate}</strong></div>
                            {c.shiftNumber ? (
                              <span className="fin-badge fin-badge--neutral" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>
                                Turno {c.shiftNumber}
                              </span>
                            ) : null}
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "#64748b", whiteSpace: "nowrap" }}>
                            {c.startedAt && c.closedAt ? (
                              `${new Date(c.startedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} → ${new Date(c.closedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
                            ) : c.submittedAt ? (
                              new Date(c.submittedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <span className="fin-badge fin-badge--neutral">
                              {c.warehouseCode ?? "MAIN"}
                            </span>
                          </td>
                          <td className="fin-table-num">{formatMoney(c.openingCash)}</td>
                          <td className="fin-table-num" style={{ fontWeight: 600 }}>{formatMoney(c.expectedCash)}</td>
                          <td className="fin-table-num" style={{ fontWeight: 700, color: "#059669" }}>{formatMoney(c.countedCash)}</td>
                          <td style={{ textAlign: "center" }}>
                            <span
                              className={`fin-badge ${
                                isBalanced
                                  ? "fin-badge--success"
                                  : isShort
                                  ? "fin-badge--danger"
                                  : "fin-badge--warning"
                              }`}
                            >
                              {isBalanced ? "✓ Exacto" : formatMoney(c.cashDifference)}
                            </span>
                          </td>
                          <td style={{ color: "#64748b" }}>
                            {c.cashierName ?? c.createdByName ?? "—"}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                              <button
                                type="button"
                                className="fin-btn fin-btn--ghost fin-btn--sm"
                                onClick={() => {
                                  setSelectedWarehouseId(c.warehouseId);
                                  setClosureDate(c.closureDate);
                                  setSelectedClosureId(c.id);
                                  handleTabChange("current");
                                }}
                                title="Cargar este turno en la pantalla de Cierre del Día"
                              >
                                <Eye size={14} />
                                <span>Ver Cuadre</span>
                              </button>
                              <button
                                type="button"
                                className="fin-btn fin-btn--ghost fin-btn--sm"
                                onClick={() => setViewingClosure(c)}
                                title="Ver e imprimir acta oficial de cierre"
                              >
                                <Printer size={14} />
                                <span>Acta</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── PESTAÑA 3: CIERRE CONTABLE GENERAL (RANGO DE FECHAS) ─────────────── */}
      {activeTab === "general" && (
        <>
          {/* Banner Informativo Permanente: Cuándo fue el último cierre general */}
          <div style={{ marginBottom: "1.25rem" }}>
            {hasPreviousGeneralClosure && lastGeneralClosureInfo ? (
              <div
                style={{
                  background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
                  border: "1px solid #6ee7b7",
                  borderRadius: 14,
                  padding: "0.95rem 1.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.85rem",
                  boxShadow: "0 1px 3px rgba(16, 185, 129, 0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: "#d1fae5",
                      color: "#059669",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Clock size={20} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#047857",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span>Último Cierre General Registrado</span>
                      <span className="fin-badge fin-badge--success" style={{ fontSize: "0.68rem", padding: "1px 7px" }}>
                        Cierre Previo Oficial
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.92rem",
                        color: "#1e293b",
                        marginTop: 3,
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "0.45rem",
                      }}
                    >
                      <span>
                        Comprobante: <strong style={{ color: "#0284c7" }}>{lastGeneralClosureInfo.closureCode}</strong>
                      </span>
                      <span style={{ color: "#94a3b8" }}>•</span>
                      <span>
                        Período cerrado:{" "}
                        <strong style={{ color: "#0f172a" }}>
                          {lastGeneralClosureInfo.dateFrom ? `${lastGeneralClosureInfo.dateFrom} al ` : ""}
                          {lastGeneralClosureInfo.dateTo}
                        </strong>
                      </span>
                      {lastGeneralClosureInfo.createdAt && (
                        <>
                          <span style={{ color: "#94a3b8" }}>•</span>
                          <span>
                            Efectuado el:{" "}
                            <strong style={{ color: "#334155" }}>
                              {formatBogotaDateTime(lastGeneralClosureInfo.createdAt)}
                            </strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {lastGeneralClosureInfo.id && (
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    onClick={() => {
                      const item = generalHistory.find((h) => h.id === lastGeneralClosureInfo.id);
                      if (item) {
                        setViewingGeneralClosure(item);
                      } else {
                        void fetchGeneralClosureDetail(token!, lastGeneralClosureInfo.id!).then((res) => {
                          if (res.item) setViewingGeneralClosure(res.item);
                        });
                      }
                    }}
                    title="Ver acta oficial del último cierre registrado"
                    style={{ background: "#ffffff", borderColor: "#a7f3d0" }}
                  >
                    <Printer size={14} />
                    <span>Ver Acta Cierre Anterior</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 12,
                  padding: "0.85rem 1.25rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  color: "#64748b",
                  fontSize: "0.86rem",
                }}
              >
                <Info size={16} color="#64748b" />
                <span>
                  <strong>Sin cierres generales previos:</strong> Esta sede aún no cuenta con cierres contables emitidos. La fecha de inicio está libre para definir el punto de arranque inicial.
                </span>
              </div>
            )}
          </div>
          {loadingGeneral ? (
            <div className="fin-empty">
              <div className="fin-empty__icon">
                <RefreshCw size={24} className="spin" />
              </div>
              <h3 className="fin-empty__title">Calculando balance general</h3>
              <p className="fin-empty__desc">Consolidando medios de pago y operaciones del período…</p>
            </div>
          ) : !generalWorksheet ? (
            <div className="fin-empty">
              <div className="fin-empty__icon">
                <ShieldCheck size={26} />
              </div>
              <h3 className="fin-empty__title">Consulta de Balance General</h3>
              <p className="fin-empty__desc">Selecciona una sede o consolidado y haz clic en "Consultar Período".</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Banner si ya existe cierre */}
              {generalWorksheet.isExisting && (
                <div
                  style={{
                    background: "var(--fin-emerald-bg)",
                    border: "1px solid var(--fin-emerald-border)",
                    borderRadius: 14,
                    padding: "1.15rem 1.35rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, color: "#059669", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <CheckCircle2 size={20} />
                      <span>Cierre Contable Emitido: {generalWorksheet.existingCode}</span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 3 }}>
                      Base inicial: <strong>{formatMoney(generalWorksheet.openingCash ?? 0)}</strong> |{" "}
                      Total en caja: <strong>{formatMoney((generalWorksheet.openingCash ?? 0) + generalWorksheet.totalNetCash)}</strong> |{" "}
                      Fondo dejado en sede: <strong>{formatMoney(generalWorksheet.existingCashToKeep ?? 0)}</strong> |{" "}
                      Efectivo a retirar/consignar: <strong>{formatMoney(generalWorksheet.existingCashToWithdraw ?? 0)}</strong>
                    </div>
                  </div>

                  {generalHistory.find((h) => h.id === generalWorksheet.existingId) && (
                    <button
                      type="button"
                      className="fin-btn fin-btn--primary fin-btn--sm"
                      onClick={() => {
                        const item = generalHistory.find((h) => h.id === generalWorksheet.existingId);
                        if (item) setViewingGeneralClosure(item);
                      }}
                    >
                      <Printer size={16} />
                      <span>Imprimir Acta Oficial</span>
                    </button>
                  )}
                </div>
              )}

              {/* Tarjetas KPI de Resumen */}
              <div className="fin-kpi-grid fin-kpi-grid--4">
                {/* Ventas Totales */}
                <div className="fin-kpi-card fin-kpi-card--emerald">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Ventas Totales</span>
                    <div className="fin-kpi-icon fin-kpi-icon--emerald">
                      <DollarSign size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--emerald">
                    {formatMoney(generalWorksheet.totalSales)}
                  </div>
                  <div className="fin-kpi-sub">
                    Efectivo: {formatMoney(generalWorksheet.totalCashSales)} | Digital: {formatMoney(generalWorksheet.totalBankSales)}
                  </div>
                </div>

                {/* Recaudos Cartera y Apartados */}
                <div className="fin-kpi-card fin-kpi-card--indigo">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Cartera y Apartados</span>
                    <div className="fin-kpi-icon fin-kpi-icon--indigo">
                      <Wallet size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--indigo">
                    {formatMoney(generalWorksheet.totalCreditPayments + generalWorksheet.totalLayawayPayments)}
                  </div>
                  <div className="fin-kpi-sub">
                    Cartera: {formatMoney(generalWorksheet.totalCreditPayments)} | Separe: {formatMoney(generalWorksheet.totalLayawayPayments)}
                  </div>
                </div>

                {/* Salidas y Nómina */}
                <div className="fin-kpi-card fin-kpi-card--rose">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Egresos y Nómina</span>
                    <div className="fin-kpi-icon fin-kpi-icon--rose">
                      <TrendingDown size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--rose">
                    - {formatMoney(generalWorksheet.totalOutflows + generalWorksheet.totalPayroll)}
                  </div>
                  <div className="fin-kpi-sub">
                    Egresos: {formatMoney(generalWorksheet.totalOutflows)} | Nómina: {formatMoney(generalWorksheet.totalPayroll)}
                  </div>
                </div>

                {/* Efectivo Neto del Período */}
                <div className="fin-kpi-card fin-kpi-card--teal">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Efectivo Neto Operativo</span>
                    <div className="fin-kpi-icon fin-kpi-icon--teal">
                      <Clock size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--teal">
                    {formatMoney(generalWorksheet.totalNetCash)}
                  </div>
                  <div className="fin-kpi-sub">
                    Remesas: +{formatMoney(generalWorksheet.totalTransfersReceived)} / -{formatMoney(generalWorksheet.totalTransfersSent)}
                  </div>
                </div>
              </div>

              {/* Tabla de Desglose por Medio de Pago */}
              <div className="fin-table-card">
                <div className="fin-table-header">
                  <h3 className="fin-table-title">
                    <DollarSign size={18} color="var(--accent)" />
                    <span>Desglose de Ventas y Recaudos por Medio de Pago</span>
                  </h3>
                  <span className="fin-badge fin-badge--neutral">
                    {generalWorksheet.paymentBreakdown.length} métodos
                  </span>
                </div>

                <div className="fin-table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Medio de Pago / Banco</th>
                        <th style={{ textAlign: "right" }}>Ventas del Período</th>
                        <th style={{ textAlign: "right" }}>Cartera / Apartados</th>
                        <th style={{ textAlign: "right" }}>Total Recaudado</th>
                        <th style={{ textAlign: "center" }}>Operaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generalWorksheet.paymentBreakdown.length > 0 ? (
                        generalWorksheet.paymentBreakdown.map((item) => (
                          <tr key={item.method}>
                            <td>
                              <strong style={{ color: "#0f172a" }}>{item.label}</strong>
                            </td>
                            <td className="fin-table-num">
                              {formatMoney(item.salesAmount)}
                            </td>
                            <td className="fin-table-num" style={{ color: "#059669" }}>
                              {formatMoney(item.creditsAmount)}
                            </td>
                            <td className="fin-table-num" style={{ fontWeight: 800, color: "#0f172a" }}>
                              {formatMoney(item.totalAmount)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className="fin-badge fin-badge--neutral">{item.count}</span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                            No hay operaciones registradas para este rango de fechas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Liquidación: Fondo en caja que se va a dejar y Efectivo a retirar */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--border-color)",
                  borderRadius: 16,
                  padding: "1.5rem",
                  boxShadow: "var(--fin-shadow-sm)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 0.35rem 0", fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
                    Fondo en Caja para la Sede y Efectivo a Retirar / Consignar
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                    Al efectuar el cierre general, define el valor que permanecerá en la caja de la sede física. El remanente calculado será el valor oficial a retirar o consignar a la cuenta de la empresa y la base para el próximo ciclo.
                  </p>
                </div>

                {(() => {
                  const openingCashVal = parseFloat(generalOpeningCashInput.replace(/[^0-9.]/g, "")) || 0;
                  const totalCashAvailable = openingCashVal + generalWorksheet.totalNetCash;
                  const cashToKeepVal = parseFloat(generalCashToKeepInput.replace(/[^0-9.]/g, "")) || 0;
                  const cashToWithdrawVal = Math.max(0, totalCashAvailable - cashToKeepVal);

                  return (
                    <>
                      <div className="fin-kpi-grid fin-kpi-grid--4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                        {/* 1. Base Inicial / Saldo de Arranque */}
                        <div className="fin-kpi-card fin-kpi-card--teal">
                          <div className="fin-filter-field">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 700, color: "var(--accent)" }}>Base Inicial (Arranque) ($ COP)</span>
                              {hasPreviousGeneralClosure && (
                                <span style={{ fontSize: "0.7rem", color: "#059669", fontWeight: 700 }}>
                                  Del cierre previo
                                </span>
                              )}
                            </div>
                            <input
                              className="fin-input"
                              type="number"
                              min="0"
                              step="1000"
                              value={generalOpeningCashInput}
                              onChange={(e) => setGeneralOpeningCashInput(e.target.value)}
                              style={{ fontSize: "1.1rem", fontWeight: 700 }}
                              placeholder="0"
                            />
                            <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 3 }}>
                              {hasPreviousGeneralClosure
                                ? "Fondo dejado en el último cierre general"
                                : "Fondo con el que inició operaciones la sede"}
                            </div>
                          </div>
                        </div>

                        {/* 2. Efectivo Neto Operativo del Período */}
                        <div className="fin-kpi-card fin-kpi-card--indigo">
                          <span className="fin-kpi-label">Efectivo Neto Operativo</span>
                          <div className="fin-kpi-val fin-kpi-val--indigo">
                            {formatMoney(generalWorksheet.totalNetCash)}
                          </div>
                          <div className="fin-kpi-sub">
                            (Ventas + Abonos − Egresos − Nómina)
                          </div>
                        </div>

                        {/* 3. Total Efectivo en Caja Disponible */}
                        <div className="fin-kpi-card fin-kpi-card--emerald" style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                          <span className="fin-kpi-label" style={{ color: "#047857", fontWeight: 700 }}>Total Efectivo en Caja</span>
                          <div className="fin-kpi-val" style={{ color: "#047857" }}>
                            {formatMoney(totalCashAvailable)}
                          </div>
                          <div className="fin-kpi-sub" style={{ color: "#065f46" }}>
                            (Base Inicial + Efectivo Operativo)
                          </div>
                        </div>

                        {/* 4. Fondo que se deja en sede */}
                        <div className="fin-kpi-card fin-kpi-card--teal">
                          <div className="fin-filter-field">
                            <span style={{ fontWeight: 700, color: "#0f766e" }}>Fondo a dejar en sede ($ COP) *</span>
                            <input
                              className="fin-input"
                              type="number"
                              min="0"
                              step="1000"
                              value={generalCashToKeepInput}
                              onChange={(e) => setGeneralCashToKeepInput(e.target.value)}
                              style={{ fontSize: "1.1rem", fontWeight: 700, borderColor: "#0f766e" }}
                              placeholder="0"
                            />
                            <div style={{ fontSize: "0.74rem", color: "#0f766e", marginTop: 3 }}>
                              Base de arranque para el próximo ciclo
                            </div>
                          </div>
                        </div>

                        {/* 5. Efectivo Oficial a Retirar / Consignar */}
                        <div className="fin-kpi-card fin-kpi-card--emerald" style={{ background: "linear-gradient(135deg, rgba(5, 150, 105, 0.08) 0%, rgba(16, 185, 129, 0.15) 100%)", border: "2px solid #059669" }}>
                          <span className="fin-kpi-label" style={{ color: "#065f46", fontWeight: 800 }}>Efectivo a Retirar / Consignar</span>
                          <div className="fin-kpi-val" style={{ color: "#059669", fontSize: "1.75rem" }}>
                            {formatMoney(cashToWithdrawVal)}
                          </div>
                          <div className="fin-kpi-sub" style={{ color: "#065f46" }}>
                            (Total en Caja − Fondo Dejado)
                          </div>
                        </div>
                      </div>

                      <div className="fin-filter-field">
                        <span>Observaciones / Notas del Cierre General</span>
                        <input
                          className="fin-input"
                          type="text"
                          value={generalNotes}
                          onChange={(e) => setGeneralNotes(e.target.value)}
                          placeholder="Ej: Cierre contable mensual, consignación realizada..."
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="fin-btn fin-btn--primary"
                          disabled={savingGeneral}
                          onClick={() => void handleSaveGeneralClosure()}
                          style={{ height: 44, padding: "0 1.5rem" }}
                        >
                          <ShieldCheck size={18} />
                          <span>{savingGeneral ? "Guardando Cierre…" : generalWorksheet.isExisting ? "Actualizar Cierre Contable General" : "Emitir y Guardar Cierre Contable General"}</span>
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Historial de Cierres Contables Generales Registrados */}
              <div className="fin-table-card">
                <div className="fin-table-header">
                  <h3 className="fin-table-title">
                    <History size={18} color="var(--accent)" />
                    <span>Historial de Cierres Contables Generales Emitidos</span>
                  </h3>
                  <span className="fin-badge fin-badge--neutral">
                    {generalHistory.length} cierres registrados
                  </span>
                </div>

                {loadingGeneralHistory ? (
                  <div className="fin-empty">
                    <RefreshCw size={24} className="spin" />
                  </div>
                ) : generalHistory.length === 0 ? (
                  <div className="fin-empty" style={{ padding: "2.5rem 1rem" }}>
                    <p className="fin-empty__desc">No se han registrado cierres contables generales aún.</p>
                  </div>
                ) : (
                  <div className="fin-table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Sede</th>
                          <th>Rango de Fechas</th>
                          <th style={{ textAlign: "right" }}>Base Inicial</th>
                          <th style={{ textAlign: "right" }}>Ventas Totales</th>
                          <th style={{ textAlign: "right" }}>Efectivo Neto</th>
                          <th style={{ textAlign: "right" }}>Total en Caja</th>
                          <th style={{ textAlign: "right" }}>Fondo en Sede</th>
                          <th style={{ textAlign: "right" }}>Retiro / Consignar</th>
                          <th style={{ textAlign: "center" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generalHistory.map((g) => {
                          const opening = g.openingCash ?? 0;
                          const totalAvailable = opening + g.totalNetCash;
                          return (
                            <tr key={g.id}>
                              <td>
                                <span className="fin-badge fin-badge--teal">{g.closureCode}</span>
                              </td>
                              <td>
                                {g.warehouseName ? `${g.warehouseName} (${g.warehouseCode})` : "Consolidado"}
                              </td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                {g.dateFrom} al {g.dateTo}
                              </td>
                              <td className="fin-table-num" style={{ color: "#0f766e" }}>
                                {formatMoney(opening)}
                              </td>
                              <td className="fin-table-num">
                                {formatMoney(g.totalSales)}
                              </td>
                              <td className="fin-table-num" style={{ color: "#0284c7", fontWeight: 600 }}>
                                {formatMoney(g.totalNetCash)}
                              </td>
                              <td className="fin-table-num" style={{ fontWeight: 700, color: "#0f172a" }}>
                                {formatMoney(totalAvailable)}
                              </td>
                              <td className="fin-table-num">
                                {formatMoney(g.cashToKeep)}
                              </td>
                              <td className="fin-table-num" style={{ color: "#059669", fontWeight: 800 }}>
                                {formatMoney(g.cashToWithdraw)}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <button
                                  type="button"
                                  className="fin-btn fin-btn--ghost fin-btn--sm"
                                  onClick={() => setViewingGeneralClosure(g)}
                                  title="Ver e imprimir acta oficial"
                                >
                                  <Printer size={14} />
                                  <span>Acta</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
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

      {/* Modal para Visualizar Fotos / Comprobante */}
      {viewingPhotos && (
        <ViewReceiptPhotosModal
          open={Boolean(viewingPhotos)}
          onClose={() => setViewingPhotos(null)}
          title={viewingPhotos.title}
          urls={viewingPhotos.urls}
        />
      )}
    </div>
  );
}
