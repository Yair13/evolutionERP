import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileText,
  Receipt,
  X,
  Building2,
  Calendar,
} from "lucide-react";
import type {
  CustomerCreditProfile,
  CustomerInvoiceItem,
  ReceivablePaymentItem,
} from "../../api/finance.js";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";

const LOGO_SRC = "/logo-evolution.png?v=4";

function formatMoney(n: number | null | undefined): string {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const hasDecimals = Math.abs(val % 1) > 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(val);
}

function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    efectivo: "Efectivo",
    nequi: "Nequi",
    bancolombia: "Bancolombia",
    davivienda: "Davivienda",
    daviplata: "Daviplata",
    addi: "Addi",
    sistecredito: "Sistecrédito",
    bold: "Bold",
    saldo_a_favor: "Saldo a favor",
    apartado: "Apartado / Plan Separe",
    otro: "Transferencia / Otro",
  };
  return labels[method?.toLowerCase()] ?? (method || "Efectivo");
}

function toBogotaDateYmd(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function formatShortDateDmy(ymdOrIso: string | null | undefined): string {
  if (!ymdOrIso) return "—";
  const ymd =
    ymdOrIso.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(ymdOrIso)
      ? ymdOrIso
      : toBogotaDateYmd(ymdOrIso);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export interface StatementInvoiceItem {
  key: string;
  dateYmd: string;
  dateDisplay: string;
  invoiceNumber: string;
  warehouseCode: string;
  warehouseName: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  isInitial: boolean;
  statusLabel: string;
}

export interface StatementPaymentItem {
  key: string;
  dateYmd: string;
  dateDisplay: string;
  receiptNumber: string;
  invoiceRefs: string[];
  paymentMethod: string;
  notes: string;
  warehouseCode: string;
  amount: number;
  isInitial: boolean;
}

export interface StatementTimelineItem {
  key: string;
  dateYmd: string;
  dateDisplay: string;
  type: "prior_balance" | "invoice" | "payment";
  typeLabel: string;
  reference: string;
  description: string;
  subDescription: string;
  warehouseCode: string;
  chargeAmount: number;
  paymentAmount: number;
  runningBalance: number;
}

type Props = {
  open: boolean;
  profile: CustomerCreditProfile;
  selectedWarehouseId?: string;
  warehouses?: { id: string; code: string; name: string }[];
  onClose: () => void;
};

export function CustomerAccountStatementModal({
  open,
  profile,
  selectedWarehouseId = "",
  warehouses = [],
  onClose,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [format, setFormat] = useState<"letter" | "voucher">("letter");
  const [viewMode, setViewMode] = useState<"by_type" | "timeline">("by_type");
  const [warehouseFilter, setWarehouseFilter] = useState<string>(selectedWarehouseId);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showProductDetails, setShowProductDetails] = useState<boolean>(true);
  const [includeCashSales, setIncludeCashSales] = useState<boolean>(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (open) {
      setWarehouseFilter(selectedWarehouseId || "");
    }
  }, [open, selectedWarehouseId]);

  useEffect(() => {
    function clearPrintClasses() {
      document.body.classList.remove(
        "inv-print-customer-statement-letter",
        "inv-print-customer-statement-voucher"
      );
      document.getElementById("inv-print-statement-page-size")?.remove();
    }
    window.addEventListener("afterprint", clearPrintClasses);
    return () => {
      window.removeEventListener("afterprint", clearPrintClasses);
      clearPrintClasses();
    };
  }, []);

  if (!open || !profile) return null;

  function triggerPrint() {
    let pageStyle = document.getElementById("inv-print-statement-page-size");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "inv-print-statement-page-size";
      document.head.appendChild(pageStyle);
    }

    if (format === "voucher") {
      document.body.classList.remove("inv-print-customer-statement-letter");
      document.body.classList.add("inv-print-customer-statement-voucher");
      pageStyle.textContent = "@page { size: auto; margin: 0mm; }";
    } else {
      document.body.classList.remove("inv-print-customer-statement-voucher");
      document.body.classList.add("inv-print-customer-statement-letter");
      pageStyle.textContent = "@page { size: letter portrait; margin: 8mm 10mm; }";
    }

    const oldTitle = document.title;
    const cleanName = (profile.customer.displayName || "Cliente")
      .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s_-]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    const todayYmd = toBogotaDateYmd(new Date().toISOString());
    document.title = `Estado_de_Cuenta_${cleanName}_${todayYmd}`;

    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.title = oldTitle;
      }, 1200);
    }, 80);
  }

  const statementData = useMemo(() => {
    // 1. Obtener facturas / cargos filtrados por sede
    const allInvoices: CustomerInvoiceItem[] = (profile.invoices ?? []).filter((inv) => {
      if (inv.status === "cancelled") return false;
      if (warehouseFilter && inv.warehouseId !== warehouseFilter) return false;
      if (
        !includeCashSales &&
        inv.exitKind !== "credit" &&
        inv.docType !== "manual_credit" &&
        !inv.receivableId
      ) {
        return false;
      }
      return true;
    });

    const includedRecIds = new Set(
      allInvoices.map((i) => i.receivableId).filter(Boolean) as string[]
    );
    for (const r of profile.receivables ?? []) {
      if (r.status === "cancelled") continue;
      if (warehouseFilter && r.warehouseId !== warehouseFilter) continue;
      if (!includedRecIds.has(r.id)) {
        allInvoices.push({
          documentId: r.documentId,
          receivableId: r.id,
          invoiceNumber: r.invoiceNumber,
          docType: r.documentId ? "exit" : "manual_credit",
          exitKind: "credit",
          status: "completed",
          warehouseId: r.warehouseId,
          warehouseCode: r.warehouseCode,
          warehouseName: r.warehouseName,
          subtotalAmount: r.totalAmount,
          discountAmount: 0,
          totalAmount: r.totalAmount,
          paidAmount: r.paidAmount,
          balanceAmount: r.balanceAmount,
          creditBalanceUsed: 0,
          excessToFavour: Number(r.excessPaidTotal ?? 0),
          paymentBreakdown: [],
          itemsSummary: r.notes || "Saldo inicial / Factura a crédito",
          linesCount: 0,
          notes: r.notes,
          createdAt: r.createdAt,
          createdByName: r.createdByName,
        });
      }
    }

    // 2. Obtener abonos consolidados por receiptNumber
    const rawPayments: ReceivablePaymentItem[] = (profile.recentPayments ?? []).filter((p) => {
      if (warehouseFilter && p.warehouseId !== warehouseFilter) return false;
      return true;
    });

    interface ConsolidatedPayment {
      id: string;
      receiptNumber: string;
      createdAt: string;
      dateYmd: string;
      paymentMethod: string;
      amount: number;
      notes: string | null;
      invoiceNumbers: string[];
      warehouseCode: string;
      isInitial: boolean;
    }

    const payByReceipt = new Map<string, ConsolidatedPayment>();
    for (const p of rawPayments) {
      const key = p.receiptNumber || p.id;
      const existing = payByReceipt.get(key);
      if (existing) {
        existing.amount = Math.round((existing.amount + Number(p.amount || 0)) * 100) / 100;
        if (
          p.invoiceNumber &&
          !p.invoiceNumber.includes("Abono directo") &&
          !existing.invoiceNumbers.includes(p.invoiceNumber)
        ) {
          existing.invoiceNumbers.push(p.invoiceNumber);
        }
        if (p.notes && (!existing.notes || !existing.notes.includes(p.notes))) {
          existing.notes = existing.notes ? `${existing.notes} · ${p.notes}` : p.notes;
        }
      } else {
        payByReceipt.set(key, {
          id: p.id,
          receiptNumber: p.receiptNumber,
          createdAt: p.createdAt,
          dateYmd: toBogotaDateYmd(p.createdAt),
          paymentMethod: p.paymentMethod,
          amount: Math.round(Number(p.amount || 0) * 100) / 100,
          notes: p.notes,
          invoiceNumbers:
            p.invoiceNumber && !p.invoiceNumber.includes("Abono directo")
              ? [p.invoiceNumber]
              : [],
          warehouseCode: p.warehouseCode || "",
          isInitial: Boolean(p.isInitial),
        });
      }
    }

    const paymentsForReceivableSum = new Map<string, number>();
    for (const p of rawPayments) {
      if (p.receivableId) {
        paymentsForReceivableSum.set(
          p.receivableId,
          Math.round(
            ((paymentsForReceivableSum.get(p.receivableId) ?? 0) +
              Number(p.appliedToDebt || p.amount || 0)) *
              100
          ) / 100
        );
      }
    }

    for (const inv of allInvoices) {
      if (!inv.receivableId && inv.exitKind !== "credit" && inv.paidAmount > 0) {
        const methods =
          inv.paymentBreakdown && inv.paymentBreakdown.length > 0
            ? inv.paymentBreakdown.map((b) => paymentMethodLabel(b.method)).join(" / ")
            : "Contado";
        const key = `CASH-${inv.documentId || inv.invoiceNumber}`;
        payByReceipt.set(key, {
          id: key,
          receiptNumber: inv.invoiceNumber,
          createdAt: inv.createdAt,
          dateYmd: toBogotaDateYmd(inv.createdAt),
          paymentMethod: methods,
          amount: inv.paidAmount,
          notes: "Pago de contado",
          invoiceNumbers: [inv.invoiceNumber],
          warehouseCode: inv.warehouseCode,
          isInitial: false,
        });
      } else if (inv.receivableId) {
        const recordedPaid = paymentsForReceivableSum.get(inv.receivableId) ?? 0;
        const unrecordedPaid = Math.round((inv.paidAmount - recordedPaid) * 100) / 100;
        if (unrecordedPaid > 0.01) {
          const key = `PREV-${inv.receivableId}`;
          payByReceipt.set(key, {
            id: key,
            receiptNumber: "ABONO-PREVIO",
            createdAt: inv.createdAt,
            dateYmd: toBogotaDateYmd(inv.createdAt),
            paymentMethod: "Abono previo",
            amount: unrecordedPaid,
            notes: `Abonos anteriores a factura ${inv.invoiceNumber}`,
            invoiceNumbers: [inv.invoiceNumber],
            warehouseCode: inv.warehouseCode,
            isInitial: true,
          });
        }
      }
    }

    // Ordenar facturas cronológicamente (de más antigua a más reciente)
    const sortedInvoices = [...allInvoices].sort((a, b) => {
      const da = toBogotaDateYmd(a.createdAt);
      const db = toBogotaDateYmd(b.createdAt);
      if (da !== db) return da.localeCompare(db);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Ordenar pagos cronológicamente (de más antiguo a más reciente)
    const sortedPayments = Array.from(payByReceipt.values()).sort((a, b) => {
      if (a.dateYmd !== b.dateYmd) return a.dateYmd.localeCompare(b.dateYmd);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Aplicar filtro de fechas (dateFrom / dateTo)
    let priorCharges = 0;
    let priorAbonos = 0;

    const invoicesList: StatementInvoiceItem[] = [];
    const paymentsList: StatementPaymentItem[] = [];

    for (const inv of sortedInvoices) {
      const ymd = toBogotaDateYmd(inv.createdAt);
      if (dateFrom && ymd < dateFrom) {
        priorCharges = Math.round((priorCharges + Number(inv.totalAmount || 0)) * 100) / 100;
        continue;
      }
      if (dateTo && ymd > dateTo) continue;

      const isInitial =
        inv.docType === "manual_credit" ||
        /saldo\s*inicial|saldo\s*anterior/i.test(inv.invoiceNumber) ||
        /saldo\s*inicial|saldo\s*anterior/i.test(inv.notes || "");

      const desc = showProductDetails
        ? inv.itemsSummary || inv.notes || (isInitial ? "Saldo inicial / Factura anterior" : "Venta a crédito")
        : isInitial
        ? inv.notes || "Saldo inicial / Factura anterior"
        : `Factura de venta (${inv.linesCount || 1} ítem(s))`;

      const statusLabel =
        inv.balanceAmount <= 0.01
          ? "Pagada"
          : inv.paidAmount > 0
          ? "Abono parcial"
          : "Pendiente";

      invoicesList.push({
        key: `inv-${inv.documentId || inv.receivableId || inv.invoiceNumber}`,
        dateYmd: ymd,
        dateDisplay: formatShortDateDmy(ymd),
        invoiceNumber: inv.invoiceNumber,
        warehouseCode: inv.warehouseCode,
        warehouseName: inv.warehouseName,
        description: desc,
        totalAmount: Math.round(Number(inv.totalAmount || 0) * 100) / 100,
        paidAmount: Math.round(Number(inv.paidAmount || 0) * 100) / 100,
        balanceAmount: Math.round(Number(inv.balanceAmount || 0) * 100) / 100,
        isInitial,
        statusLabel,
      });
    }

    for (const p of sortedPayments) {
      if (dateFrom && p.dateYmd < dateFrom) {
        priorAbonos = Math.round((priorAbonos + p.amount) * 100) / 100;
        continue;
      }
      if (dateTo && p.dateYmd > dateTo) continue;

      let cleanNote = p.notes || "";
      cleanNote = cleanNote
        .replace(/\(Aplicado a [^)]+\)/gi, "")
        .replace(/Abono aplicado en cascada a .*/gi, "")
        .replace(/Abono inicial en venta a crédito(\s*\(con saldo a favor\))?/gi, "Abono inicial")
        .trim();

      paymentsList.push({
        key: `pay-${p.id}`,
        dateYmd: p.dateYmd,
        dateDisplay: formatShortDateDmy(p.dateYmd),
        receiptNumber: p.receiptNumber,
        invoiceRefs: p.invoiceNumbers,
        paymentMethod: paymentMethodLabel(p.paymentMethod),
        notes: cleanNote,
        warehouseCode: p.warehouseCode,
        amount: p.amount,
        isInitial: p.isInitial,
      });
    }

    // Si hay saldo anterior por filtro de fecha "Desde", agregarlo al inicio
    const priorNet = Math.round((priorCharges - priorAbonos) * 100) / 100;
    if (dateFrom && Math.abs(priorNet) > 0.01) {
      if (priorNet > 0) {
        invoicesList.unshift({
          key: "prior-balance-inv",
          dateYmd: dateFrom,
          dateDisplay: `Antes de ${formatShortDateDmy(dateFrom)}`,
          invoiceNumber: "SALDO ANTERIOR",
          warehouseCode: "",
          warehouseName: "",
          description: "Saldo acumulado del período anterior",
          totalAmount: priorNet,
          paidAmount: 0,
          balanceAmount: priorNet,
          isInitial: true,
          statusLabel: "Saldo anterior",
        });
      } else {
        paymentsList.unshift({
          key: "prior-balance-pay",
          dateYmd: dateFrom,
          dateDisplay: `Antes de ${formatShortDateDmy(dateFrom)}`,
          receiptNumber: "SALDO A FAVOR ANT.",
          invoiceRefs: [],
          paymentMethod: "Saldo a favor anterior",
          notes: "Saldo a favor acumulado antes del período",
          warehouseCode: "",
          amount: Math.abs(priorNet),
          isInitial: true,
        });
      }
    }

    // Construir también línea de tiempo unificada (por si el usuario alterna a vista cronológica)
    interface RawTimelineEv {
      key: string;
      dateYmd: string;
      dateDisplay: string;
      type: "prior_balance" | "invoice" | "payment";
      typeLabel: string;
      reference: string;
      description: string;
      subDescription: string;
      warehouseCode: string;
      chargeAmount: number;
      paymentAmount: number;
      sortOrder: number;
    }

    const rawTimeline: RawTimelineEv[] = [];
    for (const inv of invoicesList) {
      rawTimeline.push({
        key: inv.key,
        dateYmd: inv.dateYmd,
        dateDisplay: inv.dateDisplay,
        type: inv.key === "prior-balance-inv" ? "prior_balance" : "invoice",
        typeLabel: inv.isInitial ? "Saldo Inicial / Factura" : "Factura de Venta",
        reference: inv.invoiceNumber,
        description: inv.description,
        subDescription: inv.warehouseCode ? `Sede ${inv.warehouseCode}` : "",
        warehouseCode: inv.warehouseCode,
        chargeAmount: inv.totalAmount,
        paymentAmount: 0,
        sortOrder: inv.key === "prior-balance-inv" ? 0 : 1,
      });
    }

    for (const p of paymentsList) {
      rawTimeline.push({
        key: p.key,
        dateYmd: p.dateYmd,
        dateDisplay: p.dateDisplay,
        type: p.key === "prior-balance-pay" ? "prior_balance" : "payment",
        typeLabel: `Abono · ${p.paymentMethod}`,
        reference: p.receiptNumber,
        description: p.notes || `Pago registrado por ${p.paymentMethod}`,
        subDescription:
          p.invoiceRefs.length > 0 ? `Aplicado a Fac. ${p.invoiceRefs.join(", ")}` : "Abono a cartera",
        warehouseCode: p.warehouseCode,
        chargeAmount: 0,
        paymentAmount: p.amount,
        sortOrder: p.key === "prior-balance-pay" ? 0 : 2,
      });
    }

    rawTimeline.sort((a, b) => {
      if (a.sortOrder === 0 || b.sortOrder === 0) return a.sortOrder - b.sortOrder;
      if (a.dateYmd !== b.dateYmd) return a.dateYmd.localeCompare(b.dateYmd);
      return a.sortOrder - b.sortOrder;
    });

    let running = 0;
    const timeline: StatementTimelineItem[] = rawTimeline.map((item) => {
      running = Math.round((running + item.chargeAmount - item.paymentAmount) * 100) / 100;
      return {
        key: item.key,
        dateYmd: item.dateYmd,
        dateDisplay: item.dateDisplay,
        type: item.type,
        typeLabel: item.typeLabel,
        reference: item.reference,
        description: item.description,
        subDescription: item.subDescription,
        warehouseCode: item.warehouseCode,
        chargeAmount: item.chargeAmount,
        paymentAmount: item.paymentAmount,
        runningBalance: running,
      };
    });

    const totalCharges = invoicesList.reduce(
      (sum, i) => Math.round((sum + i.totalAmount) * 100) / 100,
      0
    );
    const totalAbonos = paymentsList.reduce(
      (sum, p) => Math.round((sum + p.amount) * 100) / 100,
      0
    );
    const netBalance = Math.round((totalCharges - totalAbonos) * 100) / 100;

    // Agrupar abonos por medio de pago para mostrar resumen ejecutivo
    const methodTotalsMap = new Map<string, { method: string; count: number; total: number }>();
    for (const p of paymentsList) {
      const m = p.paymentMethod || "Efectivo";
      const cur = methodTotalsMap.get(m) ?? { method: m, count: 0, total: 0 };
      cur.count += 1;
      cur.total = Math.round((cur.total + p.amount) * 100) / 100;
      methodTotalsMap.set(m, cur);
    }
    const methodBreakdown = Array.from(methodTotalsMap.values()).sort((a, b) => b.total - a.total);

    return {
      invoicesList,
      paymentsList,
      timeline,
      methodBreakdown,
      totalCharges,
      totalAbonos,
      netBalance,
    };
  }, [profile, warehouseFilter, dateFrom, dateTo, showProductDetails, includeCashSales]);

  const activeWarehouseObj = warehouses.find((w) => w.id === warehouseFilter);
  const scopeLabel = activeWarehouseObj
    ? `${activeWarehouseObj.name} (${activeWarehouseObj.code})`
    : "Consolidado General (Todas las Sedes)";

  const currentYear = new Date().getFullYear();
  const statementPeriodLabel =
    dateFrom || dateTo
      ? `${dateFrom ? formatShortDateDmy(dateFrom) : "Inicio"} al ${
          dateTo ? formatShortDateDmy(dateTo) : "Hoy"
        }`
      : `Año ${currentYear} · Historial Completo`;

  const currentDebtDisplay = Math.max(0, statementData.netBalance);
  const currentFavourDisplay =
    statementData.netBalance < 0
      ? Math.abs(statementData.netBalance)
      : warehouseFilter
      ? profile.warehouseBreakdown?.find((w) => w.warehouseId === warehouseFilter)?.creditBalance ??
        0
      : profile.customer.creditBalance ?? 0;

  // ─── RENDER 1: FORMATO HOJA CARTA / PDF EJECUTIVO (ORGANIZADO POR TIPO, SIN CORTES) ───
  const renderLetterStatement = () => (
    <div className="cust-stmt-sheet">
      {/* 1. Encabezado Corporativo */}
      <div className="cust-stmt-topbar">
        <div className="cust-stmt-brand">
          <img src={LOGO_SRC} alt="Evolution" className="cust-stmt-logo" width={48} height={48} />
          <div>
            <div className="cust-stmt-company">EVOLUTION COLCHONES S.A.S</div>
            <div className="cust-stmt-company-sub">
              Calidad, Confort y Respaldo · Control de Cartera y Facturación
            </div>
          </div>
        </div>

        <div className="cust-stmt-doc-box">
          <div className="cust-stmt-doc-tag">ESTADO DE CUENTA DE CLIENTE</div>
          <div className="cust-stmt-doc-date">
            Expedición: <strong>{formatBogotaDateTime(new Date().toISOString())}</strong>
          </div>
          <div className="cust-stmt-doc-scope">Sede: {scopeLabel}</div>
        </div>
      </div>

      {/* 2. Barra Horizontal de Datos del Cliente */}
      <div className="cust-stmt-client-banner">
        <div className="cust-stmt-client-banner__main">
          <span className="cust-stmt-card-eyebrow">CLIENTE TITULAR</span>
          <div className="cust-stmt-client-name">{profile.customer.displayName}</div>
        </div>
        <div className="cust-stmt-client-banner__details">
          <div className="cust-stmt-meta-pill">
            <span>C.C. / NIT</span>
            <strong>{profile.customer.taxId || "—"}</strong>
          </div>
          <div className="cust-stmt-meta-pill">
            <span>Teléfono</span>
            <strong>{profile.customer.phone || "—"}</strong>
          </div>
          <div className="cust-stmt-meta-pill">
            <span>Dirección / Ciudad</span>
            <strong>{profile.customer.address || "—"}</strong>
          </div>
          <div className="cust-stmt-meta-pill">
            <span>Período</span>
            <strong>{statementPeriodLabel}</strong>
          </div>
        </div>
      </div>

      {/* 3. Tarjetas KPI de Resumen Financiero (Ancho completo, números nunca se cortan) */}
      <div className="cust-stmt-kpis-row">
        <div className="cust-stmt-kpi cust-stmt-kpi--charges">
          <div className="cust-stmt-kpi__label">1. TOTAL FACTURADO / CARGOS</div>
          <div className="cust-stmt-kpi__val">{formatMoney(statementData.totalCharges)}</div>
          <div className="cust-stmt-kpi__sub">
            {statementData.invoicesList.length} factura(s) / cargo(s) registrados
          </div>
        </div>

        <div className="cust-stmt-kpi cust-stmt-kpi--abonos">
          <div className="cust-stmt-kpi__label">2. TOTAL ABONOS RECIBIDOS</div>
          <div className="cust-stmt-kpi__val">{formatMoney(statementData.totalAbonos)}</div>
          <div className="cust-stmt-kpi__sub">
            {statementData.paymentsList.length} pago(s) / comprobante(s) aplicados
          </div>
        </div>

        <div
          className={`cust-stmt-kpi ${
            currentDebtDisplay > 0 ? "cust-stmt-kpi--balance-debt" : "cust-stmt-kpi--balance-ok"
          }`}
        >
          <div className="cust-stmt-kpi__label">
            {currentDebtDisplay > 0
              ? "3. SALDO PENDIENTE POR PAGAR"
              : currentFavourDisplay > 0
              ? "3. SALDO A FAVOR DEL CLIENTE"
              : "3. ESTADO DE CARTERA"}
          </div>
          <div className="cust-stmt-kpi__val">
            {currentDebtDisplay > 0
              ? formatMoney(currentDebtDisplay)
              : currentFavourDisplay > 0
              ? formatMoney(currentFavourDisplay)
              : "$ 0 (AL DÍA)"}
          </div>
          <div className="cust-stmt-kpi__sub">
            {currentDebtDisplay > 0
              ? "Total cartera pendiente a la fecha"
              : currentFavourDisplay > 0
              ? "Disponible a favor para próximas compras"
              : "Cliente a paz y salvo con la empresa"}
          </div>
        </div>
      </div>

      {viewMode === "by_type" ? (
        <>
          {/* 4A. SECCIÓN 1: FACTURAS Y SALDOS INICIALES (CARGOS) */}
          <div className="cust-stmt-section">
            <div className="cust-stmt-section-header cust-stmt-section-header--charges">
              <div className="cust-stmt-section-header__left">
                <span className="cust-stmt-section-badge cust-stmt-section-badge--charges">
                  CARGOS Y FACTURAS
                </span>
                <span className="cust-stmt-section-title">
                  1. Detalle de Facturas Emitidas y Saldos Iniciales
                </span>
              </div>
              <span className="cust-stmt-section-count">
                Subtotal Cargos: <strong>{formatMoney(statementData.totalCharges)}</strong>
              </span>
            </div>

            <table className="cust-stmt-clean-table">
              <thead>
                <tr>
                  <th style={{ width: "88px" }}>Fecha</th>
                  <th style={{ width: "110px" }}>N° Factura</th>
                  <th>Concepto / Productos Facturados</th>
                  <th style={{ width: "95px", textAlign: "center" }}>Estado</th>
                  <th style={{ width: "135px", textAlign: "right" }}>Valor Factura</th>
                </tr>
              </thead>
              <tbody>
                {statementData.invoicesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "16px", color: "#64748b" }}>
                      No hay facturas ni saldos iniciales en este período.
                    </td>
                  </tr>
                ) : (
                  statementData.invoicesList.map((inv, idx) => (
                    <tr
                      key={inv.key}
                      className={
                        inv.isInitial
                          ? "cust-stmt-clean-row--initial"
                          : idx % 2 === 1
                          ? "cust-stmt-clean-row--alt"
                          : ""
                      }
                    >
                      <td className="cust-stmt-num">{inv.dateDisplay}</td>
                      <td>
                        <strong style={{ color: "#0f172a" }}>{inv.invoiceNumber}</strong>
                        {!warehouseFilter && inv.warehouseCode && (
                          <div style={{ fontSize: "9.5px", color: "#64748b" }}>
                            Sede {inv.warehouseCode}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "#1e293b", lineHeight: 1.3 }}>
                          {inv.description}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`cust-stmt-status-pill ${
                            inv.statusLabel === "Pagada"
                              ? "is-paid"
                              : inv.statusLabel === "Abono parcial"
                              ? "is-partial"
                              : "is-pending"
                          }`}
                        >
                          {inv.statusLabel}
                        </span>
                      </td>
                      <td className="cust-stmt-num" style={{ textAlign: "right", fontWeight: 800, color: "#0f172a" }}>
                        {formatMoney(inv.totalAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="cust-stmt-clean-tfoot cust-stmt-clean-tfoot--charges">
                  <td colSpan={4} style={{ textAlign: "right" }}>
                    TOTAL FACTURADO / CARGOS ({statementData.invoicesList.length})
                  </td>
                  <td className="cust-stmt-num" style={{ textAlign: "right" }}>
                    {formatMoney(statementData.totalCharges)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 4B. SECCIÓN 2: ABONOS, PAGOS Y TRANSFERENCIAS RECIBIDAS */}
          <div className="cust-stmt-section">
            <div className="cust-stmt-section-header cust-stmt-section-header--abonos">
              <div className="cust-stmt-section-header__left">
                <span className="cust-stmt-section-badge cust-stmt-section-badge--abonos">
                  ABONOS Y PAGOS
                </span>
                <span className="cust-stmt-section-title">
                  2. Detalle de Abonos, Transferencias y Comprobantes Recibidos
                </span>
              </div>
              <span className="cust-stmt-section-count">
                Subtotal Abonos: <strong>{formatMoney(statementData.totalAbonos)}</strong>
              </span>
            </div>

            <table className="cust-stmt-clean-table">
              <thead>
                <tr>
                  <th style={{ width: "88px" }}>Fecha</th>
                  <th style={{ width: "115px" }}>Comprobante</th>
                  <th style={{ width: "130px" }}>Medio de Pago / Banco</th>
                  <th>Detalle / Factura Aplicada</th>
                  <th style={{ width: "135px", textAlign: "right" }}>Valor Abonado</th>
                </tr>
              </thead>
              <tbody>
                {statementData.paymentsList.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "16px", color: "#64748b" }}>
                      No se registran abonos ni pagos en este período.
                    </td>
                  </tr>
                ) : (
                  statementData.paymentsList.map((p, idx) => (
                    <tr
                      key={p.key}
                      className={idx % 2 === 1 ? "cust-stmt-clean-row--alt" : ""}
                    >
                      <td className="cust-stmt-num">{p.dateDisplay}</td>
                      <td>
                        <strong style={{ color: "#0f172a" }}>{p.receiptNumber}</strong>
                        {!warehouseFilter && p.warehouseCode && (
                          <div style={{ fontSize: "9.5px", color: "#64748b" }}>
                            Sede {p.warehouseCode}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="cust-stmt-method-tag">{p.paymentMethod}</span>
                      </td>
                      <td>
                        <div style={{ color: "#1e293b", fontWeight: 500 }}>
                          {p.notes || `Abono recibido vía ${p.paymentMethod}`}
                        </div>
                        {p.invoiceRefs.length > 0 && (
                          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "1px" }}>
                            Aplicado a factura(s): <strong>{p.invoiceRefs.join(", ")}</strong>
                          </div>
                        )}
                      </td>
                      <td className="cust-stmt-num" style={{ textAlign: "right", fontWeight: 800, color: "#15803d" }}>
                        {formatMoney(p.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="cust-stmt-clean-tfoot cust-stmt-clean-tfoot--abonos">
                  <td colSpan={4} style={{ textAlign: "right" }}>
                    TOTAL ABONOS RECIBIDOS ({statementData.paymentsList.length})
                  </td>
                  <td className="cust-stmt-num" style={{ textAlign: "right" }}>
                    {formatMoney(statementData.totalAbonos)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Resumen compacto por Banco / Medio de Pago */}
            {statementData.methodBreakdown.length > 0 && (
              <div className="cust-stmt-methods-bar">
                <span className="cust-stmt-methods-bar__title">Abonos por medio de pago:</span>
                <div className="cust-stmt-methods-bar__list">
                  {statementData.methodBreakdown.map((m) => (
                    <span key={m.method} className="cust-stmt-methods-bar__item">
                      <strong>{m.method}</strong> ({m.count}): {formatMoney(m.total)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* 4C. VISTA ALTERNATIVA: HISTORIAL CRONOLÓGICO UNIFICADO (SIN CORTES) */
        <div className="cust-stmt-section">
          <div className="cust-stmt-section-header cust-stmt-section-header--timeline">
            <div className="cust-stmt-section-header__left">
              <span className="cust-stmt-section-badge cust-stmt-section-badge--timeline">
                CRONOLÓGICO
              </span>
              <span className="cust-stmt-section-title">
                Historial Cronológico de Movimientos (Facturas y Abonos)
              </span>
            </div>
            <span className="cust-stmt-section-count">
              {statementData.timeline.length} movimiento(s)
            </span>
          </div>

          <table className="cust-stmt-clean-table">
            <thead>
              <tr>
                <th style={{ width: "86px" }}>Fecha</th>
                <th style={{ width: "135px" }}>Tipo de Movimiento</th>
                <th style={{ width: "100px" }}>Documento</th>
                <th>Detalle / Productos / Medio de Pago</th>
                <th style={{ width: "115px", textAlign: "right" }}>Cargo (+)</th>
                <th style={{ width: "115px", textAlign: "right" }}>Abono (-)</th>
                <th style={{ width: "125px", textAlign: "right" }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {statementData.timeline.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "18px", color: "#64748b" }}>
                    No hay movimientos registrados en este período.
                  </td>
                </tr>
              ) : (
                statementData.timeline.map((item, idx) => (
                  <tr
                    key={item.key}
                    className={idx % 2 === 1 ? "cust-stmt-clean-row--alt" : ""}
                  >
                    <td className="cust-stmt-num">{item.dateDisplay}</td>
                    <td>
                      <span
                        className={`cust-stmt-status-pill ${
                          item.type === "payment" ? "is-paid" : "is-pending"
                        }`}
                      >
                        {item.typeLabel}
                      </span>
                    </td>
                    <td>
                      <strong>{item.reference}</strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "#1e293b" }}>{item.description}</div>
                      {item.subDescription && (
                        <div style={{ fontSize: "10px", color: "#64748b" }}>
                          {item.subDescription}
                        </div>
                      )}
                    </td>
                    <td className="cust-stmt-num" style={{ textAlign: "right", fontWeight: 700 }}>
                      {item.chargeAmount > 0 ? formatMoney(item.chargeAmount) : "—"}
                    </td>
                    <td
                      className="cust-stmt-num"
                      style={{ textAlign: "right", fontWeight: 700, color: "#15803d" }}
                    >
                      {item.paymentAmount > 0 ? formatMoney(item.paymentAmount) : "—"}
                    </td>
                    <td
                      className="cust-stmt-num"
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        color: item.runningBalance < 0 ? "#059669" : "#0f172a",
                      }}
                    >
                      {item.runningBalance < 0
                        ? `${formatMoney(Math.abs(item.runningBalance))} (A favor)`
                        : formatMoney(item.runningBalance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. LIQUIDACIÓN FINAL DEL ESTADO DE CUENTA */}
      <div className="cust-stmt-final-box">
        <div className="cust-stmt-final-box__formula">
          <div className="cust-stmt-final-item">
            <span>Total Facturas y Saldos (+)</span>
            <strong style={{ color: "#9f1239" }}>{formatMoney(statementData.totalCharges)}</strong>
          </div>
          <div className="cust-stmt-final-operator">−</div>
          <div className="cust-stmt-final-item">
            <span>Total Abonos Recibidos (−)</span>
            <strong style={{ color: "#166534" }}>{formatMoney(statementData.totalAbonos)}</strong>
          </div>
          <div className="cust-stmt-final-operator">=</div>
          <div
            className={`cust-stmt-final-result ${
              currentDebtDisplay > 0 ? "is-debt" : "is-clear"
            }`}
          >
            <span>
              {currentDebtDisplay > 0
                ? "SALDO TOTAL PENDIENTE POR PAGAR"
                : currentFavourDisplay > 0
                ? "SALDO A FAVOR DEL CLIENTE"
                : "SALDO FINAL A PAGAR"}
            </span>
            <strong>
              {currentDebtDisplay > 0
                ? formatMoney(currentDebtDisplay)
                : currentFavourDisplay > 0
                ? formatMoney(currentFavourDisplay)
                : "$ 0 (AL DÍA)"}
            </strong>
          </div>
        </div>
      </div>

      {/* 6. Nota Informativa */}
      <div className="cust-stmt-footer">
        <div className="cust-stmt-footer-note">
          <strong>Información importante:</strong> Este estado de cuenta detalla las facturas emitidas y los
          abonos registrados en nuestro sistema hasta la fecha y hora de expedición. Si realizó algún pago
          reciente pendiente de soporte, por favor envíe el comprobante para su respectiva aplicación.
        </div>
      </div>
    </div>
  );

  // ─── RENDER 2: FORMATO TIRILLA TÉRMICA POS (80 MM) ─────────────────────────
  const renderVoucherStatement = () => (
    <div
      className="sale-voucher-body"
      style={{ width: "72mm", maxWidth: "72mm", margin: "0 auto", padding: "3mm 2.5mm" }}
    >
      <div className="sale-voucher-header">
        <div className="sale-voucher-logo-row">
          <img src={LOGO_SRC} alt="Evolution" className="sale-voucher-logo" width={34} height={34} />
          <div className="sale-voucher-company">
            <strong>EVOLUTION</strong>
            <span>COLCHONES S.A.S</span>
          </div>
        </div>
        <div className="sale-voucher-doc-type" style={{ marginTop: 4 }}>
          ESTADO DE CUENTA CLIENTE
        </div>
        <div className="sale-voucher-warehouse">{scopeLabel}</div>
        <div className="sale-voucher-date">
          Expedición: {formatBogotaDateTime(new Date().toISOString())}
        </div>
      </div>

      <div className="sale-voucher-divider" />

      <div className="sale-voucher-section">
        <div className="sale-voucher-row">
          <span className="sale-voucher-label">Cliente:</span>
          <span className="sale-voucher-val sale-voucher-val--bold">
            {profile.customer.displayName}
          </span>
        </div>
        {profile.customer.taxId && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">C.C./NIT:</span>
            <span className="sale-voucher-val">{profile.customer.taxId}</span>
          </div>
        )}
        {profile.customer.phone && (
          <div className="sale-voucher-row">
            <span className="sale-voucher-label">Teléfono:</span>
            <span className="sale-voucher-val">{profile.customer.phone}</span>
          </div>
        )}
      </div>

      <div className="sale-voucher-divider" />

      {/* 1. Facturas en Tirilla */}
      <div style={{ marginBottom: 4 }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: "8.5px",
            borderBottom: "1px solid #000",
            paddingBottom: "2px",
            marginBottom: "3px",
          }}
        >
          1. FACTURAS Y CARGOS ({statementData.invoicesList.length})
        </div>
        {statementData.invoicesList.map((inv) => (
          <div
            key={inv.key}
            style={{
              borderBottom: "0.5px dotted #64748b",
              paddingBottom: "2px",
              marginBottom: "2px",
              fontSize: "8.5px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>
                {inv.dateDisplay} · Fac: {inv.invoiceNumber}
              </span>
              <strong>{formatMoney(inv.totalAmount)}</strong>
            </div>
            <div style={{ fontSize: "8px", color: "#334155" }}>{inv.description}</div>
          </div>
        ))}
      </div>

      <div className="sale-voucher-divider" />

      {/* 2. Abonos en Tirilla */}
      <div style={{ marginBottom: 4 }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: "8.5px",
            borderBottom: "1px solid #000",
            paddingBottom: "2px",
            marginBottom: "3px",
          }}
        >
          2. ABONOS RECIBIDOS ({statementData.paymentsList.length})
        </div>
        {statementData.paymentsList.map((p) => (
          <div
            key={p.key}
            style={{
              borderBottom: "0.5px dotted #64748b",
              paddingBottom: "2px",
              marginBottom: "2px",
              fontSize: "8.5px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>
                {p.dateDisplay} · {p.paymentMethod}
              </span>
              <strong>- {formatMoney(p.amount)}</strong>
            </div>
            <div style={{ fontSize: "8px", color: "#334155" }}>
              Comp: {p.receiptNumber}
              {p.invoiceRefs.length > 0 ? ` · Fac: ${p.invoiceRefs.join(",")}` : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="sale-voucher-divider" />

      <div className="sale-voucher-totals">
        <div className="sale-voucher-row">
          <span>Total Facturado / Cargos:</span>
          <strong>{formatMoney(statementData.totalCharges)}</strong>
        </div>
        <div className="sale-voucher-row">
          <span>Total Abonos Recibidos:</span>
          <strong>- {formatMoney(statementData.totalAbonos)}</strong>
        </div>
        <div className="sale-voucher-total-box" style={{ marginTop: 4 }}>
          <span className="sale-voucher-total-label">
            {currentDebtDisplay > 0 ? "SALDO A PAGAR:" : "SALDO ACTUAL:"}
          </span>
          <span className="sale-voucher-total-amount">
            {currentDebtDisplay > 0 ? formatMoney(currentDebtDisplay) : "$ 0"}
          </span>
        </div>
        {currentFavourDisplay > 0 && (
          <div className="sale-voucher-row" style={{ marginTop: 3 }}>
            <span>Saldo a Favor Disponible:</span>
            <strong>{formatMoney(currentFavourDisplay)}</strong>
          </div>
        )}
      </div>
    </div>
  );

  const modalContent = (
    <div
      className="inv-modal-backdrop no-print"
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(5px)",
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="inv-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Estado de Cuenta del Cliente"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: format === "voucher" ? 540 : 1040,
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#f1f5f9",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.35)",
        }}
      >
        {/* Barra Superior de Acciones y Descarga PDF */}
        <div
          style={{
            background: "#0f172a",
            color: "#ffffff",
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "rgba(20, 184, 166, 0.2)",
                color: "#2dd4bf",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#ffffff" }}>
                Estado de Cuenta · {profile.customer.displayName}
              </h2>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                Organizado y optimizado para guardar en PDF (enviar por WhatsApp) o imprimir
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* Selector de Organización: Por Tipo vs Cronológico */}
            {format === "letter" && (
              <div
                style={{
                  display: "inline-flex",
                  background: "#1e293b",
                  padding: "3px",
                  borderRadius: 10,
                  border: "1px solid #334155",
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode("by_type")}
                  style={{
                    padding: "6px 11px",
                    borderRadius: 7,
                    border: "none",
                    fontSize: "0.79rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: viewMode === "by_type" ? "#3b82f6" : "transparent",
                    color: viewMode === "by_type" ? "#ffffff" : "#cbd5e1",
                  }}
                >
                  Organizado por Tipo (Facturas / Abonos)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  style={{
                    padding: "6px 11px",
                    borderRadius: 7,
                    border: "none",
                    fontSize: "0.79rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: viewMode === "timeline" ? "#3b82f6" : "transparent",
                    color: viewMode === "timeline" ? "#ffffff" : "#cbd5e1",
                  }}
                >
                  Cronológico
                </button>
              </div>
            )}

            {/* Selector de Formato */}
            <div
              style={{
                display: "inline-flex",
                background: "#1e293b",
                padding: "3px",
                borderRadius: 10,
                border: "1px solid #334155",
              }}
            >
              <button
                type="button"
                onClick={() => setFormat("letter")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "none",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: format === "letter" ? "#0d9488" : "transparent",
                  color: format === "letter" ? "#ffffff" : "#cbd5e1",
                }}
              >
                <FileText size={15} />
                <span>Hoja PDF / Carta</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat("voucher")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "none",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: format === "voucher" ? "#0d9488" : "transparent",
                  color: format === "voucher" ? "#ffffff" : "#cbd5e1",
                }}
              >
                <Receipt size={15} />
                <span>Tirilla 80 mm</span>
              </button>
            </div>

            <button
              type="button"
              onClick={triggerPrint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "8px 16px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "0.86rem",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
              }}
            >
              <Download size={16} />
              <span>Descargar PDF / Imprimir</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#e2e8f0",
                borderRadius: 8,
                padding: "7px 10px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              <X size={17} />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div
          style={{
            background: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "0.82rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {warehouses.length > 1 && (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                <Building2 size={15} color="#0d9488" />
                <span>Sede:</span>
                <select
                  value={warehouseFilter}
                  onChange={(e) => setWarehouseFilter(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                  }}
                >
                  <option value="">Todas las Sedes (Consolidado)</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: "#334155",
                fontWeight: 600,
              }}
            >
              <Calendar size={15} color="#0d9488" />
              <span>Desde:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: "0.8rem",
                }}
              />
              <span>Hasta:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: "0.8rem",
                }}
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Ver Todo
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                color: "#334155",
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={showProductDetails}
                onChange={(e) => setShowProductDetails(e.target.checked)}
              />
              <span>Mostrar productos facturados</span>
            </label>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                color: "#334155",
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={includeCashSales}
                onChange={(e) => setIncludeCashSales(e.target.checked)}
              />
              <span>Incluir compras de contado</span>
            </label>
          </div>
        </div>

        {/* Vista Previa */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 16px",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          {format === "voucher" ? (
            <div
              style={{
                background: "#ffffff",
                padding: "12px",
                borderRadius: 8,
                boxShadow: "0 10px 25px rgba(15, 23, 42, 0.12)",
                border: "1px solid #cbd5e1",
              }}
            >
              {renderVoucherStatement()}
            </div>
          ) : (
            renderLetterStatement()
          )}
        </div>
      </div>
    </div>
  );

  return portalReady ? (
    <>
      {createPortal(modalContent, document.body)}
      {createPortal(
        <div id="inv-customer-statement-letter-print" aria-hidden="true">
          {renderLetterStatement()}
        </div>,
        document.body
      )}
      {createPortal(
        <div id="inv-customer-statement-voucher-print" aria-hidden="true">
          {renderVoucherStatement()}
        </div>,
        document.body
      )}
      <style>{`
        #inv-customer-statement-letter-print,
        #inv-customer-statement-voucher-print {
          display: none;
        }

        /* ─────────────────────────────────────────────────────────────────
           DISEÑO EJECUTIVO ORGANIZADO POR TIPO (100% AJUSTADO A HOJA CARTA)
           ───────────────────────────────────────────────────────────────── */
        .cust-stmt-sheet {
          width: 100%;
          max-width: 780px;
          background: #ffffff;
          color: #0f172a;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);
          padding: 24px 28px;
          box-sizing: border-box;
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .cust-stmt-topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding-bottom: 14px;
          border-bottom: 2.5px solid #0d9488;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }

        .cust-stmt-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cust-stmt-logo {
          width: 46px;
          height: 46px;
          object-fit: contain;
          border-radius: 8px;
        }

        .cust-stmt-company {
          font-size: 1.2rem;
          font-weight: 900;
          letter-spacing: 0.02em;
          color: #0f172a;
          line-height: 1.15;
        }

        .cust-stmt-company-sub {
          font-size: 0.76rem;
          font-weight: 600;
          color: #0f766e;
          margin-top: 2px;
        }

        .cust-stmt-doc-box {
          text-align: right;
        }

        .cust-stmt-doc-tag {
          display: inline-block;
          background: #0f172a;
          color: #ffffff;
          font-weight: 800;
          font-size: 0.76rem;
          letter-spacing: 0.05em;
          padding: 4px 10px;
          border-radius: 6px;
          margin-bottom: 4px;
        }

        .cust-stmt-doc-date {
          font-size: 0.74rem;
          color: #475569;
        }

        .cust-stmt-doc-scope {
          font-size: 0.74rem;
          font-weight: 700;
          color: #0f766e;
          margin-top: 1px;
        }

        /* Banner horizontal de datos del cliente */
        .cust-stmt-client-banner {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-left: 4px solid #0d9488;
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }

        .cust-stmt-card-eyebrow {
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #0f766e;
          text-transform: uppercase;
          display: block;
        }

        .cust-stmt-client-name {
          font-size: 1.15rem;
          font-weight: 900;
          color: #0f172a;
        }

        .cust-stmt-client-banner__details {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 16px;
        }

        .cust-stmt-meta-pill {
          display: flex;
          flex-direction: column;
          font-size: 0.75rem;
        }

        .cust-stmt-meta-pill span {
          font-size: 0.66rem;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 700;
        }

        .cust-stmt-meta-pill strong {
          color: #0f172a;
          font-weight: 700;
        }

        /* Fila de 3 Tarjetas KPI amplias */
        .cust-stmt-kpis-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }

        .cust-stmt-kpi {
          border-radius: 10px;
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          box-sizing: border-box;
        }

        .cust-stmt-kpi--charges {
          background: #fff1f2;
          border-color: #fecdd3;
        }

        .cust-stmt-kpi--abonos {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }

        .cust-stmt-kpi--balance-debt {
          background: #fef2f2;
          border: 2px solid #e11d48;
        }

        .cust-stmt-kpi--balance-ok {
          background: #ecfdf5;
          border: 2px solid #10b981;
        }

        .cust-stmt-kpi__label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: #475569;
        }

        .cust-stmt-kpi__val {
          font-size: 1.2rem;
          font-weight: 900;
          margin: 3px 0 2px;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .cust-stmt-kpi--charges .cust-stmt-kpi__val {
          color: #9f1239;
        }

        .cust-stmt-kpi--abonos .cust-stmt-kpi__val {
          color: #166534;
        }

        .cust-stmt-kpi--balance-debt .cust-stmt-kpi__val {
          color: #be123c;
        }

        .cust-stmt-kpi--balance-ok .cust-stmt-kpi__val {
          color: #047857;
        }

        .cust-stmt-kpi__sub {
          font-size: 0.7rem;
          color: #64748b;
        }

        /* Bloques por Tipo (1. Facturas / 2. Abonos) */
        .cust-stmt-section {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 14px;
          background: #ffffff;
        }

        .cust-stmt-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          border-bottom: 1px solid #cbd5e1;
          flex-wrap: wrap;
          gap: 8px;
        }

        .cust-stmt-section-header--charges {
          background: #fff1f2;
        }

        .cust-stmt-section-header--abonos {
          background: #f0fdf4;
        }

        .cust-stmt-section-header--timeline {
          background: #f1f5f9;
        }

        .cust-stmt-section-header__left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cust-stmt-section-badge {
          font-size: 0.65rem;
          font-weight: 900;
          padding: 2px 8px;
          border-radius: 999px;
          letter-spacing: 0.04em;
        }

        .cust-stmt-section-badge--charges {
          background: #be123c;
          color: #ffffff;
        }

        .cust-stmt-section-badge--abonos {
          background: #15803d;
          color: #ffffff;
        }

        .cust-stmt-section-badge--timeline {
          background: #0f172a;
          color: #ffffff;
        }

        .cust-stmt-section-title {
          font-size: 0.82rem;
          font-weight: 800;
          color: #0f172a;
        }

        .cust-stmt-section-count {
          font-size: 0.78rem;
          color: #334155;
        }

        .cust-stmt-clean-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.78rem;
          table-layout: fixed;
        }

        .cust-stmt-clean-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 7px 10px;
          border-bottom: 1px solid #cbd5e1;
          text-align: left;
        }

        .cust-stmt-clean-table td {
          padding: 7px 10px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        .cust-stmt-clean-row--alt {
          background: #f8fafc;
        }

        .cust-stmt-clean-row--initial {
          background: #fffbeb;
        }

        .cust-stmt-num {
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .cust-stmt-status-pill {
          display: inline-block;
          font-size: 0.68rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 999px;
          white-space: nowrap;
        }

        .cust-stmt-status-pill.is-paid {
          background: #dcfce7;
          color: #166534;
        }

        .cust-stmt-status-pill.is-partial {
          background: #fef3c7;
          color: #92400e;
        }

        .cust-stmt-status-pill.is-pending {
          background: #ffe4e6;
          color: #9f1239;
        }

        .cust-stmt-method-tag {
          display: inline-block;
          background: #e0f2fe;
          color: #0369a1;
          font-weight: 800;
          font-size: 0.72rem;
          padding: 2px 8px;
          border-radius: 6px;
        }

        .cust-stmt-clean-tfoot td {
          padding: 8px 10px;
          font-weight: 900;
          font-size: 0.82rem;
          border-top: 1.5px solid #94a3b8;
          border-bottom: none;
        }

        .cust-stmt-clean-tfoot--charges td {
          background: #fff1f2;
          color: #9f1239;
        }

        .cust-stmt-clean-tfoot--abonos td {
          background: #f0fdf4;
          color: #166534;
        }

        .cust-stmt-methods-bar {
          background: #f8fafc;
          border-top: 1px dashed #cbd5e1;
          padding: 6px 12px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px 14px;
          font-size: 0.73rem;
        }

        .cust-stmt-methods-bar__title {
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          font-size: 0.66rem;
        }

        .cust-stmt-methods-bar__list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 14px;
        }

        .cust-stmt-methods-bar__item {
          color: #1e293b;
        }

        /* Caja Final de Liquidación */
        .cust-stmt-final-box {
          background: #0f172a;
          color: #ffffff;
          border-radius: 10px;
          padding: 12px 16px;
          margin-top: 4px;
          margin-bottom: 12px;
        }

        .cust-stmt-final-box__formula {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        .cust-stmt-final-item {
          display: flex;
          flex-direction: column;
          background: #ffffff;
          color: #0f172a;
          padding: 7px 12px;
          border-radius: 8px;
          flex: 1 1 140px;
        }

        .cust-stmt-final-item span {
          font-size: 0.66rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }

        .cust-stmt-final-item strong {
          font-size: 1rem;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }

        .cust-stmt-final-operator {
          font-size: 1.2rem;
          font-weight: 900;
          color: #94a3b8;
          padding: 0 2px;
        }

        .cust-stmt-final-result {
          display: flex;
          flex-direction: column;
          padding: 8px 14px;
          border-radius: 8px;
          flex: 1.3 1 180px;
          text-align: right;
        }

        .cust-stmt-final-result.is-debt {
          background: #4ade80;
          color: #052e16;
        }

        .cust-stmt-final-result.is-clear {
          background: #bbf7d0;
          color: #065f46;
        }

        .cust-stmt-final-result span {
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .cust-stmt-final-result strong {
          font-size: 1.25rem;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }

        .cust-stmt-footer-note {
          font-size: 0.72rem;
          color: #475569;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 7px 11px;
          line-height: 1.35;
        }

        /* Reglas de Impresión / Exportación PDF */
        @media print {
          body.inv-print-customer-statement-letter {
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body.inv-print-customer-statement-letter > *:not(#inv-customer-statement-letter-print) {
            display: none !important;
          }

          body.inv-print-customer-statement-letter #inv-customer-statement-letter-print {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body.inv-print-customer-statement-letter .cust-stmt-sheet {
            max-width: 100% !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }

          body.inv-print-customer-statement-letter .cust-stmt-kpis-row {
            grid-template-columns: repeat(3, 1fr) !important;
          }

          body.inv-print-customer-statement-letter .cust-stmt-clean-table tr,
          body.inv-print-customer-statement-letter .cust-stmt-final-box {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          body.inv-print-customer-statement-voucher {
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: hidden !important;
          }

          body.inv-print-customer-statement-voucher > *:not(#inv-customer-statement-voucher-print) {
            display: none !important;
          }

          body.inv-print-customer-statement-voucher #inv-customer-statement-voucher-print {
            display: block !important;
            width: 72mm !important;
            max-width: 72mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
        }
      `}</style>
    </>
  ) : null;
}
