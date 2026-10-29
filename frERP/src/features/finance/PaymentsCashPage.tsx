import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPaymentsCashSummary,
  type PaymentsCashSummary,
  type PaymentCashOperationItem,
  type PaymentCashDiscountItem,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import {
  getTodayBogotaYmd,
  getYesterdayBogotaYmd,
  getFirstDayOfMonthBogotaYmd,
  formatBogotaDateTimeShort,
} from "../../lib/dateUtils.js";
import {
  PiggyBank,
  RefreshCw,
  Wallet,
  CreditCard,
  CheckCircle2,
  Receipt,
  X,
  Search,
  Eye,
  Camera,
  ArrowUpRight,
  ArrowDownRight,
  Tag,
} from "lucide-react";
import { ViewReceiptPhotosModal } from "../../components/common/ViewReceiptPhotosModal.js";

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

const METHOD_STYLE: Record<
  string,
  { bg: string; border: string; color: string; icon: string; brandColor: string }
> = {
  efectivo: {
    bg: "rgba(5, 150, 105, 0.05)",
    border: "rgba(5, 150, 105, 0.22)",
    color: "#059669",
    brandColor: "#059669",
    icon: "💵",
  },
  bancolombia: {
    bg: "rgba(217, 119, 6, 0.05)",
    border: "rgba(217, 119, 6, 0.22)",
    color: "#d97706",
    brandColor: "#d97706",
    icon: "🟡",
  },
  davivienda: {
    bg: "rgba(225, 29, 72, 0.05)",
    border: "rgba(225, 29, 72, 0.22)",
    color: "#e11d48",
    brandColor: "#e11d48",
    icon: "🔴",
  },
  nequi: {
    bg: "rgba(124, 58, 237, 0.05)",
    border: "rgba(124, 58, 237, 0.22)",
    color: "#7c3aed",
    brandColor: "#7c3aed",
    icon: "🟣",
  },
  daviplata: {
    bg: "rgba(225, 29, 72, 0.05)",
    border: "rgba(225, 29, 72, 0.22)",
    color: "#e11d48",
    brandColor: "#e11d48",
    icon: "📱",
  },
  bold: {
    bg: "rgba(2, 132, 199, 0.05)",
    border: "rgba(2, 132, 199, 0.22)",
    color: "#0284c7",
    brandColor: "#0284c7",
    icon: "🔵",
  },
  addi: {
    bg: "rgba(13, 148, 136, 0.05)",
    border: "rgba(13, 148, 136, 0.22)",
    color: "#0d9488",
    brandColor: "#0d9488",
    icon: "🟢",
  },
  sistecredito: {
    bg: "rgba(2, 132, 199, 0.05)",
    border: "rgba(2, 132, 199, 0.22)",
    color: "#0284c7",
    brandColor: "#0284c7",
    icon: "💳",
  },
  saldo_a_favor: {
    bg: "rgba(79, 70, 229, 0.05)",
    border: "rgba(79, 70, 229, 0.22)",
    color: "#4f46e5",
    brandColor: "#4f46e5",
    icon: "💰",
  },
  otro: {
    bg: "rgba(100, 116, 139, 0.05)",
    border: "rgba(100, 116, 139, 0.2)",
    color: "#475569",
    brandColor: "#475569",
    icon: "🪙",
  },
};

type ModalScope =
  | { kind: "all_incomes"; title: string; subtitle: string; initialFilter?: string }
  | { kind: "cash_net"; title: string; subtitle: string; initialFilter?: string }
  | { kind: "digital"; title: string; subtitle: string; initialFilter?: string }
  | { kind: "method"; method: string; label: string; initialFilter?: string };

const SOURCE_BADGE_STYLE: Record<
  PaymentCashOperationItem["sourceType"],
  { bg: string; color: string; border: string }
> = {
  sale: {
    bg: "rgba(2, 132, 199, 0.1)",
    color: "#0284c7",
    border: "rgba(2, 132, 199, 0.25)",
  },
  credit_payment: {
    bg: "rgba(5, 150, 105, 0.1)",
    color: "#059669",
    border: "rgba(5, 150, 105, 0.25)",
  },
  layaway_payment: {
    bg: "rgba(124, 58, 237, 0.1)",
    color: "#7c3aed",
    border: "rgba(124, 58, 237, 0.25)",
  },
  cash_income: {
    bg: "rgba(13, 148, 136, 0.1)",
    color: "#0d9488",
    border: "rgba(13, 148, 136, 0.25)",
  },
  cash_outflow: {
    bg: "rgba(225, 29, 72, 0.1)",
    color: "#e11d48",
    border: "rgba(225, 29, 72, 0.25)",
  },
  cash_payroll: {
    bg: "rgba(217, 119, 6, 0.1)",
    color: "#d97706",
    border: "rgba(217, 119, 6, 0.25)",
  },
  transfer_in: {
    bg: "rgba(2, 132, 199, 0.1)",
    color: "#0284c7",
    border: "rgba(2, 132, 199, 0.25)",
  },
  transfer_out: {
    bg: "rgba(225, 29, 72, 0.1)",
    color: "#e11d48",
    border: "rgba(225, 29, 72, 0.25)",
  },
  transfer_returned: {
    bg: "rgba(5, 150, 105, 0.1)",
    color: "#059669",
    border: "rgba(5, 150, 105, 0.25)",
  },
};

export function PaymentsCashPage() {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses, loading: whLoading } = useWarehouse();
  const canSeeAll = isAllWarehouses;

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? "" : warehouseId || ""
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouseId(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);

  const effectiveWarehouseId = isAllWarehouses ? selectedWarehouseId : (warehouseId || "");
  const [dateFrom, setDateFrom] = useState(localTodayYmd);
  const [dateTo, setDateTo] = useState(localTodayYmd);
  const [data, setData] = useState<PaymentsCashSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal de operaciones detalladas
  const [modalScope, setModalScope] = useState<ModalScope | null>(null);
  const [opCategoryFilter, setOpCategoryFilter] = useState<string>("all");
  const [opSearch, setOpSearch] = useState<string>("");
  const [viewingReceiptUrls, setViewingReceiptUrls] = useState<string[] | null>(null);
  const [viewingReceiptRef, setViewingReceiptRef] = useState<string>("");

  // Modal de control de descuentos en facturas
  const [openDiscountsModal, setOpenDiscountsModal] = useState<boolean>(false);
  const [discountSearch, setDiscountSearch] = useState<string>("");

  const openScopeModal = (scope: ModalScope) => {
    setModalScope(scope);
    setOpCategoryFilter(scope.initialFilter || "all");
    setOpSearch("");
  };

  const load = useCallback(async () => {
    if (!token || whLoading) return;
    if (!isAllWarehouses && !warehouseId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetchPaymentsCashSummary(token, {
        warehouseId: effectiveWarehouseId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Error al cargar arqueo de pagos");
    } finally {
      setLoading(false);
    }
  }, [token, whLoading, isAllWarehouses, warehouseId, effectiveWarehouseId, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // Atajos rápidos de fecha
  function setPeriod(type: "today" | "yesterday" | "month") {
    if (type === "today") {
      const t = getTodayBogotaYmd();
      setDateFrom(t);
      setDateTo(t);
    } else if (type === "yesterday") {
      const y = getYesterdayBogotaYmd();
      setDateFrom(y);
      setDateTo(y);
    } else if (type === "month") {
      setDateFrom(getFirstDayOfMonthBogotaYmd());
      setDateTo(getTodayBogotaYmd());
    }
  }

  // Cálculos derivados
  const digitalCollected = data
    ? data.methods
        .filter((m) => m.method !== "efectivo")
        .reduce((sum, m) => sum + m.totalAmount, 0)
    : 0;

  const totalTransactions = data
    ? data.methods.reduce((sum, m) => sum + m.transactionCount, 0)
    : 0;

  const periodLabel = dateFrom === dateTo ? `Día: ${dateFrom}` : `Del ${dateFrom} al ${dateTo}`;

  // Operaciones base según el alcance seleccionado en el modal
  const scopedOperations = useMemo<PaymentCashOperationItem[]>(() => {
    if (!data?.operations || !modalScope) return [];
    const allOps = data.operations;

    if (modalScope.kind === "all_incomes") {
      return allOps.filter(
        (op) =>
          op.direction === "in" &&
          op.sourceType !== "transfer_in" &&
          op.sourceType !== "transfer_returned"
      );
    }
    if (modalScope.kind === "cash_net") {
      return allOps.filter((op) => op.paymentMethod === "efectivo");
    }
    if (modalScope.kind === "digital") {
      return allOps.filter((op) => op.direction === "in" && op.paymentMethod !== "efectivo");
    }
    if (modalScope.kind === "method") {
      if (modalScope.method === "efectivo") {
        return allOps.filter((op) => op.paymentMethod === "efectivo");
      }
      return allOps.filter(
        (op) => op.paymentMethod === modalScope.method && op.direction === "in"
      );
    }
    return [];
  }, [data?.operations, modalScope]);

  // Operaciones filtradas por pestaña de tipo y buscador dentro del modal
  const filteredModalOperations = useMemo<PaymentCashOperationItem[]>(() => {
    let list = scopedOperations;

    if (opCategoryFilter === "in") {
      list = list.filter((op) => op.direction === "in");
    } else if (opCategoryFilter === "out") {
      list = list.filter((op) => op.direction === "out");
    } else if (opCategoryFilter === "sale") {
      list = list.filter((op) => op.sourceType === "sale");
    } else if (opCategoryFilter === "credits") {
      list = list.filter(
        (op) =>
          op.sourceType === "credit_payment" ||
          op.sourceType === "layaway_payment" ||
          op.sourceType === "cash_income"
      );
    } else if (opCategoryFilter === "credit_payment") {
      list = list.filter((op) => op.sourceType === "credit_payment");
    } else if (opCategoryFilter === "layaway_payment") {
      list = list.filter((op) => op.sourceType === "layaway_payment");
    } else if (opCategoryFilter === "cash_income") {
      list = list.filter((op) => op.sourceType === "cash_income");
    }

    if (opSearch.trim()) {
      const q = opSearch.trim().toLowerCase();
      list = list.filter(
        (op) =>
          op.reference.toLowerCase().includes(q) ||
          (op.relatedReference && op.relatedReference.toLowerCase().includes(q)) ||
          (op.thirdPartyName && op.thirdPartyName.toLowerCase().includes(q)) ||
          (op.concept && op.concept.toLowerCase().includes(q)) ||
          (op.itemsSummary && op.itemsSummary.toLowerCase().includes(q)) ||
          op.sourceLabel.toLowerCase().includes(q) ||
          op.paymentMethodLabel.toLowerCase().includes(q) ||
          (op.warehouseName && op.warehouseName.toLowerCase().includes(q)) ||
          (op.createdByName && op.createdByName.toLowerCase().includes(q))
      );
    }

    return list;
  }, [scopedOperations, opCategoryFilter, opSearch]);

  const modalStats = useMemo(() => {
    const inOps = scopedOperations.filter((op) => op.direction === "in");
    const outOps = scopedOperations.filter((op) => op.direction === "out");
    const salesOps = inOps.filter((op) => op.sourceType === "sale");
    const creditOps = inOps.filter((op) => op.sourceType !== "sale");

    const totalIn = inOps.reduce((s, op) => s + op.amount, 0);
    const totalOut = outOps.reduce((s, op) => s + op.amount, 0);
    const salesTotal = salesOps.reduce((s, op) => s + op.amount, 0);
    const creditsTotal = creditOps.reduce((s, op) => s + op.amount, 0);

    return {
      inCount: inOps.length,
      outCount: outOps.length,
      salesCount: salesOps.length,
      creditsCount: creditOps.length,
      totalIn,
      totalOut,
      netAmount: totalIn - totalOut,
      salesTotal,
      creditsTotal,
      hasOutflows: outOps.length > 0,
    };
  }, [scopedOperations]);

  const isCashScope =
    modalScope?.kind === "cash_net" ||
    (modalScope?.kind === "method" && modalScope.method === "efectivo");

  const filteredDiscounts = useMemo<PaymentCashDiscountItem[]>(() => {
    const list = data?.discounts ?? [];
    if (!discountSearch.trim()) return list;
    const q = discountSearch.trim().toLowerCase();
    return list.filter(
      (d) =>
        d.invoiceNumber.toLowerCase().includes(q) ||
        d.customerName.toLowerCase().includes(q) ||
        (d.discountReason && d.discountReason.toLowerCase().includes(q)) ||
        (d.itemsSummary && d.itemsSummary.toLowerCase().includes(q)) ||
        (d.createdByName && d.createdByName.toLowerCase().includes(q)) ||
        (d.warehouseName && d.warehouseName.toLowerCase().includes(q))
    );
  }, [data?.discounts, discountSearch]);

  return (
    <div className="fin-page">
      {/* Encabezado */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge">
              <PiggyBank size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">Caja y Medios de Pago · Arqueo</h1>
              <p className="fin-header__subtitle">
                Arqueo consolidado de cobros, recaudos en efectivo, transferencias bancarias, datáfonos y créditos. Haz clic en cualquier tarjeta para ver el detalle de operaciones.
              </p>
            </div>
          </div>
        </div>

        {/* Atajos Rápidos de Período */}
        <div className="fin-header__actions">
          <div className="fin-period-group">
            <button
              type="button"
              className="fin-period-btn"
              onClick={() => setPeriod("today")}
            >
              Hoy
            </button>
            <button
              type="button"
              className="fin-period-btn"
              onClick={() => setPeriod("yesterday")}
            >
              Ayer
            </button>
            <button
              type="button"
              className="fin-period-btn"
              onClick={() => setPeriod("month")}
            >
              Este Mes
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="fin-filter-card">
        {canSeeAll ? (
          <div className="fin-filter-field" style={{ minWidth: 200 }}>
            <span>Sede</span>
            <select
              className="fin-select"
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
            >
              <option value="">Todas las Sedes</option>
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
          <span>Desde</span>
          <input
            className="fin-input"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="fin-filter-field" style={{ minWidth: 150 }}>
          <span>Hasta</span>
          <input
            className="fin-input"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="fin-filter-field fin-filter-field--fixed">
          <button
            type="button"
            className="fin-btn fin-btn--ghost"
            onClick={() => void load()}
            title="Actualizar datos de caja"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            <span>Refrescar</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {data && (
        <div
          className="fin-kpi-grid fin-kpi-grid--4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}
        >
          {/* 1. Total Recaudado Global */}
          <div
            className="fin-kpi-card fin-kpi-card--emerald"
            style={{ cursor: "pointer" }}
            title="Clic para ver todas las operaciones que conforman el Total Recaudado"
            onClick={() =>
              openScopeModal({
                kind: "all_incomes",
                title: "Operaciones del Total Recaudado",
                subtitle: `${periodLabel} · Todos los medios de pago`,
              })
            }
          >
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Total Recaudado</span>
              <div className="fin-kpi-icon fin-kpi-icon--emerald">
                <Receipt size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--emerald">
              {formatMoney(data.totalCollected)}
            </div>
            <div className="fin-kpi-sub" style={{ justifyContent: "space-between" }}>
              <span>{dateFrom === dateTo ? `Día: ${dateFrom}` : `${dateFrom} al ${dateTo}`}</span>
              <span style={{ fontSize: "0.73rem", fontWeight: 700, color: "#059669", display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Eye size={13} /> Ver operaciones
              </span>
            </div>
          </div>

          {/* 2. Efectivo Neto en Caja */}
          <div
            className="fin-kpi-card fin-kpi-card--amber"
            style={{ cursor: "pointer" }}
            title="Clic para ver los ingresos y egresos en efectivo"
            onClick={() =>
              openScopeModal({
                kind: "cash_net",
                title: "Efectivo Físico en Caja · Operaciones",
                subtitle: `${periodLabel} · Entradas y salidas en efectivo`,
              })
            }
          >
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Efectivo Físico en Caja</span>
              <div className="fin-kpi-icon fin-kpi-icon--amber">
                <Wallet size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--amber">
              {formatMoney(data.netCashInDrawer ?? data.cashCollected ?? 0)}
            </div>
            <div className="fin-kpi-sub" style={{ justifyContent: "space-between" }}>
              <span>Neto tras nómina y egresos</span>
              <span style={{ fontSize: "0.73rem", fontWeight: 700, color: "#d97706", display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Eye size={13} /> Ver desglose
              </span>
            </div>
          </div>

          {/* 3. Medios Digitales y Bancos */}
          <div
            className="fin-kpi-card fin-kpi-card--indigo"
            style={{ cursor: "pointer" }}
            title="Clic para ver las operaciones por bancos, billeteras y datáfonos"
            onClick={() =>
              openScopeModal({
                kind: "digital",
                title: "Bancos y Medios Digitales · Operaciones",
                subtitle: `${periodLabel} · Billeteras, Bold, Addi y transferencias`,
              })
            }
          >
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Bancos y Digitales</span>
              <div className="fin-kpi-icon fin-kpi-icon--indigo">
                <CreditCard size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--indigo">
              {formatMoney(digitalCollected)}
            </div>
            <div className="fin-kpi-sub" style={{ justifyContent: "space-between" }}>
              <span>Billeteras, Bold, Addi y transf.</span>
              <span style={{ fontSize: "0.73rem", fontWeight: 700, color: "#4f46e5", display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Eye size={13} /> Ver operaciones
              </span>
            </div>
          </div>

          {/* 4. Transacciones Realizadas */}
          <div
            className="fin-kpi-card fin-kpi-card--teal"
            style={{ cursor: "pointer" }}
            title="Clic para ver el listado completo de movimientos"
            onClick={() =>
              openScopeModal({
                kind: "all_incomes",
                title: "Listado General de Movimientos",
                subtitle: `${periodLabel} · ${totalTransactions} movimientos registrados`,
              })
            }
          >
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Movimientos y Medios</span>
              <div className="fin-kpi-icon fin-kpi-icon--teal">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--teal">
              {totalTransactions}
            </div>
            <div className="fin-kpi-sub" style={{ justifyContent: "space-between" }}>
              <span>
                {data.methods.filter((m) => m.totalAmount > 0).length} de {data.methods.length} medios con recaudo
              </span>
              <span style={{ fontSize: "0.73rem", fontWeight: 700, color: "#0d9488", display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Eye size={13} /> Ver todos
              </span>
            </div>
          </div>

          {/* 5. Control de Descuentos en Facturas de Venta */}
          <div
            className="fin-kpi-card fin-kpi-card--rose"
            style={{ cursor: "pointer" }}
            title="Clic para auditar los descuentos otorgados en facturas de venta"
            onClick={() => {
              setDiscountSearch("");
              setOpenDiscountsModal(true);
            }}
          >
            <div className="fin-kpi-top">
              <span className="fin-kpi-label">Descuentos en Facturas</span>
              <div className="fin-kpi-icon fin-kpi-icon--rose">
                <Tag size={18} />
              </div>
            </div>
            <div className="fin-kpi-val fin-kpi-val--rose">
              {(data.totalDiscountsAmount ?? 0) > 0
                ? `- ${formatMoney(data.totalDiscountsAmount ?? 0)}`
                : formatMoney(0)}
            </div>
            <div className="fin-kpi-sub" style={{ justifyContent: "space-between" }}>
              <span>
                {data.discountsCount ?? 0}{" "}
                {(data.discountsCount ?? 0) === 1 ? "factura con descuento" : "facturas con descuento"}
              </span>
              <span style={{ fontSize: "0.73rem", fontWeight: 700, color: "#e11d48", display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Eye size={13} /> Ver control
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Alerta de Error */}
      {error && (
        <div className="fin-alert fin-alert--danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Contenido Principal */}
      {loading ? (
        <div className="fin-empty">
          <div className="fin-empty__icon">
            <RefreshCw size={24} className="spin" />
          </div>
          <h3 className="fin-empty__title">Cargando arqueo de caja</h3>
          <p className="fin-empty__desc">Consultando transacciones y recaudos del período seleccionado…</p>
        </div>
      ) : data ? (
        <>
          {/* Desglose por Tarjetas de Medios de Pago */}
          <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
              Desglose por Medio de Pago
            </h2>
            <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
              Haz clic en cualquier medio de pago para ver sus operaciones ({formatMoney(data.totalCollected)})
            </span>
          </div>

          <div className="fin-methods-grid">
            {data.methods.map((m) => {
              const style = METHOD_STYLE[m.method] || METHOD_STYLE.otro;
              const percent = data.totalCollected > 0
                ? Math.round((m.totalAmount / data.totalCollected) * 100)
                : 0;

              return (
                <div
                  key={m.method}
                  className="fin-method-card"
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  title={`Clic para ver las operaciones de ${m.label}`}
                  onClick={() =>
                    openScopeModal({
                      kind: "method",
                      method: m.method,
                      label: m.label,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openScopeModal({
                        kind: "method",
                        method: m.method,
                        label: m.label,
                      });
                    }
                  }}
                >
                  <div>
                    <div className="fin-method-card__top">
                      <div className="fin-method-card__brand">
                        <div className="fin-method-card__icon-wrap">
                          <span>{style.icon}</span>
                        </div>
                        <span className="fin-method-card__name">{m.label}</span>
                      </div>
                      <span
                        className="fin-method-card__count-badge"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: m.transactionCount > 0 ? style.bg : undefined,
                          color: m.transactionCount > 0 ? style.color : undefined,
                          border: m.transactionCount > 0 ? `1px solid ${style.border}` : undefined,
                        }}
                      >
                        <Eye size={12} />
                        {m.transactionCount} {m.transactionCount === 1 ? "mov" : "movs"}
                      </span>
                    </div>

                    <div className="fin-method-card__amount" style={{ color: style.color }}>
                      {formatMoney(m.totalAmount)}
                    </div>

                    {/* Barra de progreso / participación */}
                    <div className="fin-method-card__bar-wrap">
                      <div
                        className="fin-method-card__bar-fill"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: style.brandColor,
                        }}
                      />
                    </div>
                    <div className="fin-method-card__footer">
                      <span>{percent}% del total</span>
                      <span style={{ color: style.color, fontWeight: 600 }}>
                        Ver {m.transactionCount} {m.transactionCount === 1 ? "operación" : "operaciones"} →
                      </span>
                    </div>
                  </div>

                  {/* Detalle interno */}
                  <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(15, 23, 42, 0.07)", fontSize: "0.78rem" }}>
                    {m.method === "efectivo" && (
                      data.cashPayrollAmount ||
                      data.cashOutflowsAmount ||
                      data.cashTransfersReceivedAmount ||
                      data.cashTransfersReturnedAmount ||
                      data.cashTransfersSentAmount
                    ) ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        <div
                          style={{ display: "flex", justifyContent: "space-between", color: "#64748b", borderRadius: 4, padding: "2px 4px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openScopeModal({
                              kind: "method",
                              method: "efectivo",
                              label: m.label,
                              initialFilter: "in",
                            });
                          }}
                          title="Ver entradas brutas en efectivo"
                        >
                          <span>Recaudo bruto:</span>
                          <span style={{ fontWeight: 600 }}>{formatMoney(m.totalAmount)}</span>
                        </div>
                        {Boolean(data.cashTransfersReceivedAmount) && (
                          <div
                            style={{ display: "flex", justifyContent: "space-between", color: "#0284c7", borderRadius: 4, padding: "2px 4px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScopeModal({
                                kind: "method",
                                method: "efectivo",
                                label: m.label,
                                initialFilter: "in",
                              });
                            }}
                            title="Ver traslados de dinero recibidos en efectivo"
                          >
                            <span>(+) Traslados recibidos:</span>
                            <span style={{ fontWeight: 600 }}>+ {formatMoney(data.cashTransfersReceivedAmount!)}</span>
                          </div>
                        )}
                        {Boolean(data.cashTransfersReturnedAmount) && (
                          <div
                            style={{ display: "flex", justifyContent: "space-between", color: "#059669", borderRadius: 4, padding: "2px 4px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScopeModal({
                                kind: "method",
                                method: "efectivo",
                                label: m.label,
                                initialFilter: "in",
                              });
                            }}
                            title="Ver retorno de traslados rechazados"
                          >
                            <span>(+) Retorno traslados rechazados:</span>
                            <span style={{ fontWeight: 600 }}>+ {formatMoney(data.cashTransfersReturnedAmount!)}</span>
                          </div>
                        )}
                        {Boolean(data.cashPayrollAmount) && (
                          <div
                            style={{ display: "flex", justifyContent: "space-between", color: "#e11d48", borderRadius: 4, padding: "2px 4px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScopeModal({
                                kind: "method",
                                method: "efectivo",
                                label: m.label,
                                initialFilter: "out",
                              });
                            }}
                            title="Ver pagos de nómina en efectivo"
                          >
                            <span>(-) Nómina en efectivo:</span>
                            <span style={{ fontWeight: 600 }}>- {formatMoney(data.cashPayrollAmount!)}</span>
                          </div>
                        )}
                        {Boolean(data.cashOutflowsAmount) && (
                          <div
                            style={{ display: "flex", justifyContent: "space-between", color: "#e11d48", borderRadius: 4, padding: "2px 4px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScopeModal({
                                kind: "method",
                                method: "efectivo",
                                label: m.label,
                                initialFilter: "out",
                              });
                            }}
                            title="Ver egresos de caja en efectivo"
                          >
                            <span>(-) Egresos de caja:</span>
                            <span style={{ fontWeight: 600 }}>- {formatMoney(data.cashOutflowsAmount!)}</span>
                          </div>
                        )}
                        {Boolean(data.cashTransfersSentAmount) && (
                          <div
                            style={{ display: "flex", justifyContent: "space-between", color: "#e11d48", borderRadius: 4, padding: "2px 4px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScopeModal({
                                kind: "method",
                                method: "efectivo",
                                label: m.label,
                                initialFilter: "out",
                              });
                            }}
                            title="Ver traslados de dinero enviados"
                          >
                            <span>(-) Traslados enviados:</span>
                            <span style={{ fontWeight: 600 }}>- {formatMoney(data.cashTransfersSentAmount!)}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#059669", fontWeight: 700, borderTop: "1px dashed rgba(15, 23, 42, 0.1)", paddingTop: "0.35rem", marginTop: "0.2rem", paddingLeft: 4, paddingRight: 4 }}>
                          <span>Neto en Caja:</span>
                          <span>{formatMoney(data.netCashInDrawer ?? m.totalAmount)}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            openScopeModal({
                              kind: "method",
                              method: m.method,
                              label: m.label,
                              initialFilter: "sale",
                            });
                          }}
                          title={`Ver ventas con ${m.label}`}
                        >
                          Ventas: <strong style={{ color: "#0f172a" }}>{formatMoney(m.salesAmount)}</strong>
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            openScopeModal({
                              kind: "method",
                              method: m.method,
                              label: m.label,
                              initialFilter: "credits",
                            });
                          }}
                          title={`Ver abonos con ${m.label}`}
                        >
                          Abonos: <strong style={{ color: "#059669" }}>{formatMoney(m.creditsAmount)}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabla Consolidada de Caja */}
          <div className="fin-table-card">
            <div className="fin-table-header">
              <h3 className="fin-table-title">
                <Receipt size={18} color="var(--accent)" />
                <span>Resumen Consolidado de Ingresos por Medio de Pago</span>
              </h3>
              <span className="fin-badge fin-badge--neutral">
                {data.methods.length} canales configurados
              </span>
            </div>

            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Medio de Pago</th>
                    <th style={{ textAlign: "right" }}>Ventas Mostrador</th>
                    <th style={{ textAlign: "right" }}>Abonos de Cartera</th>
                    <th style={{ textAlign: "center" }}>Movimientos</th>
                    <th style={{ textAlign: "right" }}>Total Recaudado</th>
                    <th style={{ textAlign: "center" }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {data.methods.map((m) => {
                    const style = METHOD_STYLE[m.method] || METHOD_STYLE.otro;
                    return (
                      <tr
                        key={m.method}
                        style={{ cursor: "pointer" }}
                        onClick={() =>
                          openScopeModal({
                            kind: "method",
                            method: m.method,
                            label: m.label,
                          })
                        }
                        title={`Clic para ver las operaciones de ${m.label}`}
                      >
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <span>{style.icon}</span>
                            <strong style={{ color: "#0f172a" }}>{m.label}</strong>
                          </div>
                        </td>
                        <td className="fin-table-num">
                          {formatMoney(m.salesAmount)}
                        </td>
                        <td className="fin-table-num" style={{ color: "#059669" }}>
                          {formatMoney(m.creditsAmount)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="fin-badge fin-badge--neutral">{m.transactionCount}</span>
                        </td>
                        <td className="fin-table-num" style={{ color: style.color, fontWeight: 800 }}>
                          {formatMoney(m.totalAmount)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="fin-btn fin-btn--ghost"
                            style={{ padding: "4px 10px", fontSize: "0.76rem" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScopeModal({
                                kind: "method",
                                method: m.method,
                                label: m.label,
                              });
                            }}
                          >
                            <Eye size={14} />
                            <span>Ver</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      openScopeModal({
                        kind: "all_incomes",
                        title: "Operaciones del Total Consolidado",
                        subtitle: `${periodLabel} · Todos los canales`,
                      })
                    }
                  >
                    <td>TOTAL CONSOLIDADO</td>
                    <td className="fin-table-num">
                      {formatMoney(data.methods.reduce((s, m) => s + m.salesAmount, 0))}
                    </td>
                    <td className="fin-table-num" style={{ color: "#059669" }}>
                      {formatMoney(data.methods.reduce((s, m) => s + m.creditsAmount, 0))}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="fin-badge fin-badge--teal">{totalTransactions}</span>
                    </td>
                    <td className="fin-table-num" style={{ color: "#059669", fontSize: "1.05rem" }}>
                      {formatMoney(data.totalCollected)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#0d9488", fontWeight: 700 }}>
                        Ver todo →
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Card / Tabla de Control de Descuentos en Facturas de Venta */}
          <div className="fin-table-card" style={{ marginTop: "1.25rem" }}>
            <div className="fin-table-header">
              <h3 className="fin-table-title">
                <Tag size={18} color="#e11d48" />
                <span>Control de Descuentos Otorgados en Facturas de Venta</span>
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <span className="fin-badge fin-badge--danger">
                  {data.discountsCount ?? 0}{" "}
                  {(data.discountsCount ?? 0) === 1 ? "factura" : "facturas"} · Total descontado:{" "}
                  {formatMoney(data.totalDiscountsAmount ?? 0)}
                </span>
                {(data.discounts?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost"
                    style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                    onClick={() => {
                      setDiscountSearch("");
                      setOpenDiscountsModal(true);
                    }}
                  >
                    <Eye size={14} />
                    <span>Ampliar / Buscar</span>
                  </button>
                )}
              </div>
            </div>

            {!data.discounts || data.discounts.length === 0 ? (
              <div style={{ padding: "1.75rem 1.25rem", textAlign: "center", color: "#64748b", fontSize: "0.86rem" }}>
                No se registraron descuentos en facturas de venta durante este período ({periodLabel}).
              </div>
            ) : (
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Fecha / Hora</th>
                      <th>Factura</th>
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Productos</th>
                      <th>Motivo del Descuento</th>
                      <th>Vendedor / Sede</th>
                      <th style={{ textAlign: "right" }}>Subtotal</th>
                      <th style={{ textAlign: "right" }}>Descuento</th>
                      <th style={{ textAlign: "right" }}>Total Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.discounts.map((d) => (
                      <tr key={d.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: "0.78rem", color: "#475569" }}>
                          {formatBogotaDateTimeShort(d.createdAt)}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <strong style={{ color: "#0f172a" }}>{d.invoiceNumber}</strong>
                        </td>
                        <td>
                          <span
                            className={`fin-badge ${
                              d.exitKind === "credit" ? "fin-badge--warning" : "fin-badge--info"
                            }`}
                          >
                            {d.exitKind === "credit" ? "Crédito" : "Contado"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: "#0f172a" }}>{d.customerName}</td>
                        <td style={{ maxWidth: 230, fontSize: "0.8rem", color: "#334155" }}>
                          {d.itemsSummary || "—"}
                        </td>
                        <td style={{ maxWidth: 210, fontSize: "0.8rem", color: "#be123c", fontWeight: 600 }}>
                          {d.discountReason || "Sin motivo especificado"}
                        </td>
                        <td style={{ fontSize: "0.78rem", color: "#64748b" }}>
                          <div>{d.createdByName || "—"}</div>
                          {d.warehouseCode && (
                            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                              Sede: {d.warehouseCode}
                            </div>
                          )}
                        </td>
                        <td className="fin-table-num" style={{ color: "#64748b" }}>
                          {formatMoney(d.subtotalAmount)}
                        </td>
                        <td className="fin-table-num" style={{ color: "#e11d48", fontWeight: 800 }}>
                          - {formatMoney(d.discountAmount)}
                        </td>
                        <td className="fin-table-num" style={{ color: "#059669", fontWeight: 800 }}>
                          {formatMoney(d.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={7}>
                        TOTAL DESCUENTOS OTORGADOS ({data.discounts.length}{" "}
                        {data.discounts.length === 1 ? "factura" : "facturas"})
                      </td>
                      <td className="fin-table-num">
                        {formatMoney(data.discounts.reduce((s, d) => s + d.subtotalAmount, 0))}
                      </td>
                      <td className="fin-table-num" style={{ color: "#e11d48", fontWeight: 900 }}>
                        - {formatMoney(data.totalDiscountsAmount ?? 0)}
                      </td>
                      <td className="fin-table-num" style={{ color: "#059669", fontWeight: 800 }}>
                        {formatMoney(data.discounts.reduce((s, d) => s + d.totalAmount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Modal de Operaciones Detalladas */}
      {modalScope && data && (
        <div
          className="inv-modal-backdrop"
          role="presentation"
          onClick={() => setModalScope(null)}
        >
          <div
            className="inv-modal inv-modal--checkout"
            style={{
              maxWidth: 960,
              width: "96vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
            }}
            role="dialog"
            aria-labelledby="cash-ops-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Modal */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                paddingBottom: "0.85rem",
                borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
                marginBottom: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.4rem",
                    background:
                      modalScope.kind === "method"
                        ? (METHOD_STYLE[modalScope.method] || METHOD_STYLE.otro).bg
                        : "rgba(13, 148, 136, 0.1)",
                    border:
                      modalScope.kind === "method"
                        ? `1px solid ${(METHOD_STYLE[modalScope.method] || METHOD_STYLE.otro).border}`
                        : "1px solid rgba(13, 148, 136, 0.25)",
                  }}
                >
                  {modalScope.kind === "method" ? (
                    <span>{(METHOD_STYLE[modalScope.method] || METHOD_STYLE.otro).icon}</span>
                  ) : (
                    <Receipt size={22} color="#0d9488" />
                  )}
                </div>
                <div>
                  <h2
                    id="cash-ops-modal-title"
                    style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}
                  >
                    {modalScope.kind === "method"
                      ? `Operaciones en ${modalScope.label}`
                      : modalScope.title}
                  </h2>
                  <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 2 }}>
                    {modalScope.kind === "method"
                      ? `${periodLabel} · Desglose de movimientos que dieron este saldo`
                      : modalScope.subtitle}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="fin-btn fin-btn--ghost"
                style={{ padding: "6px 10px" }}
                onClick={() => setModalScope(null)}
              >
                <X size={18} />
                <span>Cerrar</span>
              </button>
            </div>

            {/* Tarjetas de Resumen Rápido del Modal */}
            {isCashScope && modalStats.hasOutflows ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    background: "rgba(5, 150, 105, 0.05)",
                    border: "1px solid rgba(5, 150, 105, 0.2)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                  }}
                >
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#059669" }}>
                    (+) Recaudo Bruto ({modalStats.inCount} movs)
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#059669", marginTop: 2 }}>
                    {formatMoney(modalStats.totalIn)}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 2 }}>
                    Ventas: {formatMoney(modalStats.salesTotal)} · Abonos: {formatMoney(modalStats.creditsTotal)}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(225, 29, 72, 0.05)",
                    border: "1px solid rgba(225, 29, 72, 0.2)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                  }}
                >
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#e11d48" }}>
                    (-) Egresos y Nómina ({modalStats.outCount} movs)
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#e11d48", marginTop: 2 }}>
                    - {formatMoney(modalStats.totalOut)}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 2 }}>
                    Salidas descontadas de caja física
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(217, 119, 6, 0.07)",
                    border: "1px solid rgba(217, 119, 6, 0.28)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                  }}
                >
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#d97706" }}>
                    (=) Efectivo Neto en Caja
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#b45309", marginTop: 2 }}>
                    {formatMoney(modalStats.netAmount)}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 2 }}>
                    Saldo físico resultante
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                  }}
                >
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
                    Ventas Mostrador ({modalStats.salesCount})
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                    {formatMoney(modalStats.salesTotal)}
                  </div>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                  }}
                >
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
                    Abonos y Otros Ingresos ({modalStats.creditsCount})
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#059669", marginTop: 2 }}>
                    {formatMoney(modalStats.creditsTotal)}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(5, 150, 105, 0.06)",
                    border: "1px solid rgba(5, 150, 105, 0.22)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                  }}
                >
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#059669" }}>
                    Total Recaudado ({modalStats.inCount} operaciones)
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#059669", marginTop: 2 }}>
                    {formatMoney(modalStats.totalIn)}
                  </div>
                </div>
              </div>
            )}

            {/* Barra de Filtros Internos y Búsqueda */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginBottom: "0.85rem",
              }}
            >
              <div className="fin-tabs">
                <button
                  type="button"
                  className={`fin-tab ${opCategoryFilter === "all" ? "is-active" : ""}`}
                  onClick={() => setOpCategoryFilter("all")}
                >
                  Todos
                  <span className="fin-tab__badge">{scopedOperations.length}</span>
                </button>
                <button
                  type="button"
                  className={`fin-tab ${opCategoryFilter === "sale" ? "is-active" : ""}`}
                  onClick={() => setOpCategoryFilter("sale")}
                >
                  Ventas
                  <span className="fin-tab__badge">{modalStats.salesCount}</span>
                </button>
                <button
                  type="button"
                  className={`fin-tab ${opCategoryFilter === "credits" ? "is-active" : ""}`}
                  onClick={() => setOpCategoryFilter("credits")}
                >
                  Abonos / Otros
                  <span className="fin-tab__badge">{modalStats.creditsCount}</span>
                </button>
                {modalStats.hasOutflows && (
                  <>
                    <button
                      type="button"
                      className={`fin-tab ${opCategoryFilter === "in" ? "is-active" : ""}`}
                      onClick={() => setOpCategoryFilter("in")}
                    >
                      Solo Entradas (+)
                      <span className="fin-tab__badge">{modalStats.inCount}</span>
                    </button>
                    <button
                      type="button"
                      className={`fin-tab ${opCategoryFilter === "out" ? "is-active" : ""}`}
                      onClick={() => setOpCategoryFilter("out")}
                    >
                      Egresos / Nómina (-)
                      <span className="fin-tab__badge">{modalStats.outCount}</span>
                    </button>
                  </>
                )}
              </div>

              <div className="fin-search-wrap" style={{ maxWidth: 300, flex: "1 1 220px" }}>
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  type="text"
                  className="fin-input"
                  style={{ height: 36, fontSize: "0.82rem" }}
                  placeholder="Buscar factura, cliente, producto..."
                  value={opSearch}
                  onChange={(e) => setOpSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Tabla de Operaciones */}
            <div style={{ overflowY: "auto", flex: 1, border: "1px solid rgba(15, 23, 42, 0.08)", borderRadius: 12 }}>
              {filteredModalOperations.length === 0 ? (
                <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#64748b" }}>
                  <Receipt size={32} style={{ opacity: 0.35, marginBottom: "0.5rem" }} />
                  <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "0.25rem" }}>
                    No se encontraron operaciones
                  </div>
                  <div style={{ fontSize: "0.84rem" }}>
                    No hay movimientos registrados para este filtro en el período seleccionado.
                  </div>
                </div>
              ) : (
                <table className="fin-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Fecha / Hora</th>
                      <th>Tipo</th>
                      <th>Referencia</th>
                      <th>Cliente / Tercero</th>
                      <th>Detalle / Productos / Concepto</th>
                      {modalScope.kind !== "method" && <th>Medio</th>}
                      <th style={{ textAlign: "center" }}>Soporte</th>
                      <th style={{ textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModalOperations.map((op) => {
                      const badge = SOURCE_BADGE_STYLE[op.sourceType];
                      const mStyle = METHOD_STYLE[op.paymentMethod] || METHOD_STYLE.otro;
                      const isOut = op.direction === "out";

                      return (
                        <tr key={op.id}>
                          <td style={{ whiteSpace: "nowrap", fontSize: "0.78rem", color: "#475569" }}>
                            <div>{formatBogotaDateTimeShort(op.createdAt)}</div>
                            {op.warehouseCode && (
                              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                                Sede: {op.warehouseCode}
                                {op.createdByName ? ` · ${op.createdByName}` : ""}
                              </div>
                            )}
                          </td>

                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: "0.73rem",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isOut ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                              {op.sourceLabel}
                            </span>
                          </td>

                          <td style={{ whiteSpace: "nowrap" }}>
                            <strong style={{ color: "#0f172a", fontSize: "0.84rem" }}>
                              {op.reference}
                            </strong>
                            {op.relatedReference && (
                              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                {op.relatedReference}
                              </div>
                            )}
                          </td>

                          <td>
                            <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.84rem" }}>
                              {op.thirdPartyName || "—"}
                            </div>
                          </td>

                          <td style={{ maxWidth: 280 }}>
                            {op.itemsSummary && (
                              <div style={{ fontSize: "0.8rem", color: "#0f172a", fontWeight: 500 }}>
                                {op.itemsSummary}
                              </div>
                            )}
                            {op.concept && (
                              <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                                {op.concept}
                              </div>
                            )}
                            {(op.discountAmount ?? 0) > 0 && (
                              <div
                                style={{
                                  marginTop: 3,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "1px 7px",
                                  borderRadius: 999,
                                  fontSize: "0.71rem",
                                  fontWeight: 700,
                                  background: "rgba(225, 29, 72, 0.1)",
                                  color: "#be123c",
                                  border: "1px solid rgba(225, 29, 72, 0.25)",
                                }}
                              >
                                <Tag size={11} />
                                <span>
                                  Descuento factura: - {formatMoney(op.discountAmount!)}
                                  {op.discountReason ? ` (${op.discountReason})` : ""}
                                </span>
                              </div>
                            )}
                            {!op.itemsSummary && !op.concept && !(op.discountAmount && op.discountAmount > 0) && (
                              <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>—</span>
                            )}
                          </td>

                          {modalScope.kind !== "method" && (
                            <td style={{ whiteSpace: "nowrap" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  fontSize: "0.78rem",
                                  fontWeight: 600,
                                  color: mStyle.color,
                                }}
                              >
                                <span>{mStyle.icon}</span>
                                <span>{op.paymentMethodLabel}</span>
                              </span>
                            </td>
                          )}

                          <td style={{ textAlign: "center" }}>
                            {op.receiptUrls && op.receiptUrls.length > 0 ? (
                              <button
                                type="button"
                                className="fin-btn fin-btn--ghost"
                                style={{ padding: "3px 8px", fontSize: "0.74rem", color: "#0284c7" }}
                                onClick={() => {
                                  setViewingReceiptUrls(op.receiptUrls);
                                  setViewingReceiptRef(`${op.sourceLabel} · ${op.reference}`);
                                }}
                              >
                                <Camera size={13} />
                                <span>{op.receiptUrls.length > 1 ? `Ver (${op.receiptUrls.length})` : "Ver"}</span>
                              </button>
                            ) : (
                              <span style={{ fontSize: "0.72rem", color: "#cbd5e1" }}>—</span>
                            )}
                          </td>

                          <td
                            className="fin-table-num"
                            style={{
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                              color: isOut ? "#e11d48" : "#059669",
                            }}
                          >
                            {isOut ? "- " : "+ "}
                            {formatMoney(op.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={modalScope.kind !== "method" ? 7 : 6}>
                        TOTAL ({filteredModalOperations.length}{" "}
                        {filteredModalOperations.length === 1 ? "operación mostrada" : "operaciones mostradas"})
                      </td>
                      <td
                        className="fin-table-num"
                        style={{
                          fontWeight: 800,
                          fontSize: "1rem",
                          color:
                            filteredModalOperations.reduce(
                              (s, op) => s + (op.direction === "out" ? -op.amount : op.amount),
                              0
                            ) < 0
                              ? "#e11d48"
                              : "#059669",
                        }}
                      >
                        {formatMoney(
                          filteredModalOperations.reduce(
                            (s, op) => s + (op.direction === "out" ? -op.amount : op.amount),
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Control de Descuentos en Facturas */}
      {openDiscountsModal && data && (
        <div
          className="inv-modal-backdrop"
          role="presentation"
          onClick={() => setOpenDiscountsModal(false)}
        >
          <div
            className="inv-modal inv-modal--checkout"
            style={{
              maxWidth: 980,
              width: "96vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
            }}
            role="dialog"
            aria-labelledby="discounts-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                paddingBottom: "0.85rem",
                borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
                marginBottom: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(225, 29, 72, 0.1)",
                    border: "1px solid rgba(225, 29, 72, 0.25)",
                  }}
                >
                  <Tag size={22} color="#e11d48" />
                </div>
                <div>
                  <h2
                    id="discounts-modal-title"
                    style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}
                  >
                    Control de Descuentos en Facturas de Venta
                  </h2>
                  <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 2 }}>
                    {periodLabel} · Auditoría detallada de descuentos aplicados en ventas y créditos
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="fin-btn fin-btn--ghost"
                style={{ padding: "6px 10px" }}
                onClick={() => setOpenDiscountsModal(false)}
              >
                <X size={18} />
                <span>Cerrar</span>
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                  borderRadius: 12,
                  padding: "0.75rem 1rem",
                }}
              >
                <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
                  Facturas con Descuento
                </div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                  {filteredDiscounts.length}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(225, 29, 72, 0.06)",
                  border: "1px solid rgba(225, 29, 72, 0.22)",
                  borderRadius: 12,
                  padding: "0.75rem 1rem",
                }}
              >
                <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#e11d48" }}>
                  Total Descontado
                </div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#e11d48", marginTop: 2 }}>
                  - {formatMoney(filteredDiscounts.reduce((s, d) => s + d.discountAmount, 0))}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(5, 150, 105, 0.06)",
                  border: "1px solid rgba(5, 150, 105, 0.22)",
                  borderRadius: 12,
                  padding: "0.75rem 1rem",
                }}
              >
                <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#059669" }}>
                  Total Neto Facturado
                </div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#059669", marginTop: 2 }}>
                  {formatMoney(filteredDiscounts.reduce((s, d) => s + d.totalAmount, 0))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.85rem" }}>
              <div className="fin-search-wrap" style={{ maxWidth: 340, width: "100%" }}>
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  type="text"
                  className="fin-input"
                  style={{ height: 36, fontSize: "0.82rem" }}
                  placeholder="Buscar por factura, cliente, motivo, vendedor..."
                  value={discountSearch}
                  onChange={(e) => setDiscountSearch(e.target.value)}
                />
              </div>
            </div>

            <div style={{ overflowY: "auto", flex: 1, border: "1px solid rgba(15, 23, 42, 0.08)", borderRadius: 12 }}>
              {filteredDiscounts.length === 0 ? (
                <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#64748b" }}>
                  <Tag size={32} style={{ opacity: 0.35, marginBottom: "0.5rem" }} />
                  <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "0.25rem" }}>
                    Sin descuentos registrados
                  </div>
                  <div style={{ fontSize: "0.84rem" }}>
                    No se encontraron facturas de venta con descuento para el filtro seleccionado.
                  </div>
                </div>
              ) : (
                <table className="fin-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Fecha / Hora</th>
                      <th>Factura</th>
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Productos</th>
                      <th>Motivo del Descuento</th>
                      <th>Vendedor / Sede</th>
                      <th style={{ textAlign: "right" }}>Subtotal</th>
                      <th style={{ textAlign: "right" }}>Descuento</th>
                      <th style={{ textAlign: "right" }}>Total Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDiscounts.map((d) => (
                      <tr key={d.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: "0.78rem", color: "#475569" }}>
                          {formatBogotaDateTimeShort(d.createdAt)}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <strong style={{ color: "#0f172a" }}>{d.invoiceNumber}</strong>
                        </td>
                        <td>
                          <span
                            className={`fin-badge ${
                              d.exitKind === "credit" ? "fin-badge--warning" : "fin-badge--info"
                            }`}
                          >
                            {d.exitKind === "credit" ? "Crédito" : "Contado"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: "#0f172a" }}>{d.customerName}</td>
                        <td style={{ maxWidth: 230, fontSize: "0.8rem", color: "#334155" }}>
                          {d.itemsSummary || "—"}
                        </td>
                        <td style={{ maxWidth: 210, fontSize: "0.8rem", color: "#be123c", fontWeight: 600 }}>
                          {d.discountReason || "Sin motivo especificado"}
                        </td>
                        <td style={{ fontSize: "0.78rem", color: "#64748b" }}>
                          <div>{d.createdByName || "—"}</div>
                          {d.warehouseCode && (
                            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                              Sede: {d.warehouseCode}
                            </div>
                          )}
                        </td>
                        <td className="fin-table-num" style={{ color: "#64748b" }}>
                          {formatMoney(d.subtotalAmount)}
                        </td>
                        <td className="fin-table-num" style={{ color: "#e11d48", fontWeight: 800 }}>
                          - {formatMoney(d.discountAmount)}
                        </td>
                        <td className="fin-table-num" style={{ color: "#059669", fontWeight: 800 }}>
                          {formatMoney(d.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visor de Fotos de Comprobantes */}
      <ViewReceiptPhotosModal
        open={Boolean(viewingReceiptUrls && viewingReceiptUrls.length > 0)}
        onClose={() => setViewingReceiptUrls(null)}
        urls={viewingReceiptUrls || []}
        title="Soporte de Operación"
        reference={viewingReceiptRef}
      />
    </div>
  );
}
