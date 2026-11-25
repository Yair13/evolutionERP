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
    // Convertir a YYYY-MM-DD en zona America/Bogota
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
  const ymd = ymdOrIso.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(ymdOrIso)
    ? ymdOrIso
    : toBogotaDateYmd(ymdOrIso);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export interface StatementLedgerRow {
  key: string;
  dateYmd: string;
  dateDisplay: string;
  invoiceNumbers: string[];
  chargeAmount: number;
  abonoAmount: number;
  paymentMethods: string[];
  vouchers: string[];
  detailsText: string;
  itemsSummary: string[];
  warehouseCodes: string[];
  runningBalance: number;
  isInitialRow?: boolean;
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
  const [warehouseFilter, setWarehouseFilter] = useState<string>(selectedWarehouseId);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [groupSameDay, setGroupSameDay] = useState<boolean>(true);
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
      pageStyle.textContent = "@page { size: letter portrait; margin: 10mm; }";
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

  // Construir libro mayor cronológico (Facturas / Saldos iniciales vs Abonos)
  const ledgerData = useMemo(() => {
    // 1. Obtener facturas/cargos filtrados por sede
    const allInvoices: CustomerInvoiceItem[] = (profile.invoices ?? []).filter((inv) => {
      if (inv.status === "cancelled") return false;
      if (warehouseFilter && inv.warehouseId !== warehouseFilter) return false;
      if (!includeCashSales && inv.exitKind !== "credit" && inv.docType !== "manual_credit" && !inv.receivableId) {
        return false;
      }
      return true;
    });

    // Asegurar que cualquier receivable que no esté en profile.invoices sea incluido
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

    // 2. Obtener abonos consolidados por receiptNumber para evitar duplicar filas cuando un recibo amortizó varias facturas en cascada
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
        if (p.invoiceNumber && !existing.invoiceNumbers.includes(p.invoiceNumber)) {
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
          invoiceNumbers: p.invoiceNumber ? [p.invoiceNumber] : [],
          warehouseCode: p.warehouseCode || "",
          isInitial: Boolean(p.isInitial),
        });
      }
    }

    // Si hay ventas de contado incluidas, o saldos iniciales manuales con abono previo que no tenían fila en receivable_payments, agregar su pago implícito para que el estado de cuenta cuadre
    const paymentsForReceivableSum = new Map<string, number>();
    for (const p of rawPayments) {
      if (p.receivableId) {
        paymentsForReceivableSum.set(
          p.receivableId,
          Math.round(((paymentsForReceivableSum.get(p.receivableId) ?? 0) + Number(p.appliedToDebt || p.amount || 0)) * 100) / 100
        );
      }
    }

    for (const inv of allInvoices) {
      if (!inv.receivableId && inv.exitKind !== "credit" && inv.paidAmount > 0) {
        // Venta de contado
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
        // Verificar si una factura manual tenía abono previo en sistema anterior (initialPayment > 0 sin fila en receivable_payments)
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
            notes: `Abonos anteriores a ${inv.invoiceNumber}`,
            invoiceNumbers: [inv.invoiceNumber],
            warehouseCode: inv.warehouseCode,
            isInitial: true,
          });
        }
      }
    }

    // 3. Crear lista unificada de eventos ordenados cronológicamente (ASC)
    interface RawEvent {
      id: string;
      kind: "charge" | "payment";
      createdAt: string;
      dateYmd: string;
      invoiceNumber: string;
      chargeAmount: number;
      abonoAmount: number;
      paymentMethod: string;
      voucher: string;
      notes: string;
      itemsSummary: string;
      warehouseCode: string;
      isInitial: boolean;
    }

    const events: RawEvent[] = [];

    for (const inv of allInvoices) {
      const isInitial =
        inv.docType === "manual_credit" ||
        /saldo\s*inicial|saldo\s*anterior/i.test(inv.invoiceNumber) ||
        /saldo\s*inicial|saldo\s*anterior/i.test(inv.notes || "");

      events.push({
        id: `inv-${inv.documentId || inv.receivableId || inv.invoiceNumber}`,
        kind: "charge",
        createdAt: inv.createdAt,
        dateYmd: toBogotaDateYmd(inv.createdAt),
        invoiceNumber: inv.invoiceNumber,
        chargeAmount: Math.round(Number(inv.totalAmount || 0) * 100) / 100,
        abonoAmount: 0,
        paymentMethod: "",
        voucher: "",
        notes: inv.notes || "",
        itemsSummary: inv.itemsSummary || "",
        warehouseCode: inv.warehouseCode || "",
        isInitial,
      });
    }

    for (const p of payByReceipt.values()) {
      // Extraer comprobante corto o referencia si está en las notas, o usar el número de recibo
      let cleanNote = p.notes || "";
      cleanNote = cleanNote
        .replace(/\(Aplicado a [^)]+\)/gi, "")
        .replace(/Abono aplicado en cascada a .*/gi, "")
        .replace(/Abono inicial en venta a crédito(\s*\(con saldo a favor\))?/gi, "Abono inicial")
        .trim();

      events.push({
        id: `pay-${p.id}`,
        kind: "payment",
        createdAt: p.createdAt,
        dateYmd: p.dateYmd,
        invoiceNumber: "",
        chargeAmount: 0,
        abonoAmount: p.amount,
        paymentMethod: paymentMethodLabel(p.paymentMethod),
        voucher: p.receiptNumber,
        notes: cleanNote,
        itemsSummary: "",
        warehouseCode: p.warehouseCode,
        isInitial: p.isInitial,
      });
    }

    events.sort((a, b) => {
      if (a.dateYmd !== b.dateYmd) return a.dateYmd.localeCompare(b.dateYmd);
      if (a.kind !== b.kind) return a.kind === "charge" ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // 4. Si hay filtro de fecha "Desde" (dateFrom), todo lo anterior a dateFrom se consolida en una fila de "SALDO ANTERIOR"
    let priorCharges = 0;
    let priorAbonos = 0;
    const inRangeEvents: RawEvent[] = [];

    for (const ev of events) {
      if (dateFrom && ev.dateYmd < dateFrom) {
        priorCharges = Math.round((priorCharges + ev.chargeAmount) * 100) / 100;
        priorAbonos = Math.round((priorAbonos + ev.abonoAmount) * 100) / 100;
      } else if (dateTo && ev.dateYmd > dateTo) {
        // Excluir posteriores a dateTo
        continue;
      } else {
        inRangeEvents.push(ev);
      }
    }

    const rows: StatementLedgerRow[] = [];
    let runningBalance = 0;
    let totalCharges = 0;
    let totalAbonos = 0;

    if (dateFrom && (priorCharges > 0 || priorAbonos > 0)) {
      const priorNet = Math.round((priorCharges - priorAbonos) * 100) / 100;
      const chargeCol = priorNet >= 0 ? priorNet : 0;
      const abonoCol = priorNet < 0 ? Math.abs(priorNet) : 0;
      runningBalance = priorNet;
      totalCharges = Math.round((totalCharges + chargeCol) * 100) / 100;
      totalAbonos = Math.round((totalAbonos + abonoCol) * 100) / 100;

      rows.push({
        key: "prior-balance-row",
        dateYmd: dateFrom,
        dateDisplay: `Antes de ${formatShortDateDmy(dateFrom)}`,
        invoiceNumbers: ["SALDO ANTERIOR"],
        chargeAmount: chargeCol,
        abonoAmount: abonoCol,
        paymentMethods: [],
        vouchers: ["—"],
        detailsText: "Saldo acumulado del período anterior",
        itemsSummary: [],
        warehouseCodes: [],
        runningBalance,
        isInitialRow: true,
      });
    }

    // 5. Construir filas (agrupando en la misma fecha si groupSameDay está activo, tal como en el Excel tradicional del usuario)
    for (const ev of inRangeEvents) {
      totalCharges = Math.round((totalCharges + ev.chargeAmount) * 100) / 100;
      totalAbonos = Math.round((totalAbonos + ev.abonoAmount) * 100) / 100;
      runningBalance = Math.round((runningBalance + ev.chargeAmount - ev.abonoAmount) * 100) / 100;

      const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;

      // Si groupSameDay está activo y la fila anterior es de la misma fecha (y no es la fila de saldo anterior acumulado)
      // podemos combinar una factura y un abono del mismo día en la misma fila estilo Excel:
      // Fecha | # Factura | Valor | Abonos | Detalles | Comprobante
      const canMergeWithLast =
        groupSameDay &&
        lastRow &&
        !lastRow.isInitialRow &&
        lastRow.dateYmd === ev.dateYmd &&
        ((ev.kind === "payment" && lastRow.abonoAmount === 0) ||
          (ev.kind === "charge" && lastRow.chargeAmount === 0));

      if (canMergeWithLast && lastRow) {
        lastRow.chargeAmount = Math.round((lastRow.chargeAmount + ev.chargeAmount) * 100) / 100;
        lastRow.abonoAmount = Math.round((lastRow.abonoAmount + ev.abonoAmount) * 100) / 100;
        if (ev.invoiceNumber && !lastRow.invoiceNumbers.includes(ev.invoiceNumber)) {
          lastRow.invoiceNumbers.push(ev.invoiceNumber);
        }
        if (ev.paymentMethod && !lastRow.paymentMethods.includes(ev.paymentMethod)) {
          lastRow.paymentMethods.push(ev.paymentMethod);
        }
        if (ev.voucher && !lastRow.vouchers.includes(ev.voucher)) {
          lastRow.vouchers.push(ev.voucher);
        }
        if (ev.itemsSummary && !lastRow.itemsSummary.includes(ev.itemsSummary)) {
          lastRow.itemsSummary.push(ev.itemsSummary);
        }
        if (ev.warehouseCode && !lastRow.warehouseCodes.includes(ev.warehouseCode)) {
          lastRow.warehouseCodes.push(ev.warehouseCode);
        }

        const detailParts: string[] = [...lastRow.paymentMethods];
        if (ev.notes && !detailParts.includes(ev.notes)) {
          detailParts.push(ev.notes);
        }
        lastRow.detailsText = detailParts.filter(Boolean).join(" · ");
        lastRow.runningBalance = runningBalance;
      } else {
        const paymentMethods = ev.paymentMethod ? [ev.paymentMethod] : [];
        const detailParts: string[] = [...paymentMethods];
        if (ev.notes && ev.notes !== ev.paymentMethod) {
          detailParts.push(ev.notes);
        }

        rows.push({
          key: ev.id,
          dateYmd: ev.dateYmd,
          dateDisplay: formatShortDateDmy(ev.dateYmd),
          invoiceNumbers: ev.invoiceNumber ? [ev.invoiceNumber] : [],
          chargeAmount: ev.chargeAmount,
          abonoAmount: ev.abonoAmount,
          paymentMethods,
          vouchers: ev.voucher ? [ev.voucher] : [],
          detailsText: detailParts.filter(Boolean).join(" · "),
          itemsSummary: ev.itemsSummary ? [ev.itemsSummary] : [],
          warehouseCodes: ev.warehouseCode ? [ev.warehouseCode] : [],
          runningBalance,
          isInitialRow: ev.isInitial && ev.kind === "charge" && rows.length === 0,
        });
      }
    }

    const netBalance = Math.round((totalCharges - totalAbonos) * 100) / 100;

    return {
      rows,
      totalCharges,
      totalAbonos,
      netBalance,
    };
  }, [profile, warehouseFilter, dateFrom, dateTo, groupSameDay, includeCashSales]);

  const activeWarehouseObj = warehouses.find((w) => w.id === warehouseFilter);
  const scopeLabel = activeWarehouseObj
    ? `${activeWarehouseObj.name} (${activeWarehouseObj.code})`
    : "Consolidado General (Todas las Sedes)";

  const currentYear = new Date().getFullYear();
  const statementPeriodLabel =
    dateFrom || dateTo
      ? `${dateFrom ? formatShortDateDmy(dateFrom) : "Inicio"} al ${dateTo ? formatShortDateDmy(dateTo) : "Hoy"}`
      : `Año ${currentYear} · Historial Completo`;

  const currentDebtDisplay = Math.max(0, ledgerData.netBalance);
  const currentFavourDisplay =
    ledgerData.netBalance < 0
      ? Math.abs(ledgerData.netBalance)
      : warehouseFilter
      ? profile.warehouseBreakdown?.find((w) => w.warehouseId === warehouseFilter)?.creditBalance ?? 0
      : profile.customer.creditBalance ?? 0;

  // ─── RENDER 1: FORMATO HOJA CARTA / PDF EJECUTIVO (ESTILO EXCEL MEJORADO) ───
  const renderLetterStatement = () => (
    <div className="cust-stmt-sheet">
      {/* Banda Superior Corporativa */}
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

      {/* Ficha del Cliente + Resumen Ejecutivo */}
      <div className="cust-stmt-info-grid">
        <div className="cust-stmt-client-card">
          <div className="cust-stmt-card-eyebrow">DATOS DEL CLIENTE</div>
          <div className="cust-stmt-client-name">{profile.customer.displayName}</div>
          <div className="cust-stmt-client-meta">
            <div>
              <span>C.C. / NIT:</span>{" "}
              <strong>{profile.customer.taxId || "No registrado"}</strong>
            </div>
            <div>
              <span>Teléfono:</span>{" "}
              <strong>{profile.customer.phone || "No registrado"}</strong>
            </div>
            {profile.customer.address && (
              <div style={{ gridColumn: "1 / -1" }}>
                <span>Dirección:</span> <strong>{profile.customer.address}</strong>
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <span>Período consultado:</span> <strong>{statementPeriodLabel}</strong>
            </div>
          </div>
        </div>

        {/* Tarjetas KPI de Totales del Estado de Cuenta */}
        <div className="cust-stmt-kpis">
          <div className="cust-stmt-kpi cust-stmt-kpi--charges">
            <span className="cust-stmt-kpi__label">TOTAL FACTURADO / CARGOS</span>
            <strong className="cust-stmt-kpi__val">{formatMoney(ledgerData.totalCharges)}</strong>
            <span className="cust-stmt-kpi__sub">Suma de facturas y saldos</span>
          </div>

          <div className="cust-stmt-kpi cust-stmt-kpi--abonos">
            <span className="cust-stmt-kpi__label">TOTAL ABONOS RECIBIDOS</span>
            <strong className="cust-stmt-kpi__val">{formatMoney(ledgerData.totalAbonos)}</strong>
            <span className="cust-stmt-kpi__sub">Pagos y transferencias</span>
          </div>

          <div
            className={`cust-stmt-kpi ${
              currentDebtDisplay > 0
                ? "cust-stmt-kpi--balance-debt"
                : "cust-stmt-kpi--balance-ok"
            }`}
          >
            <span className="cust-stmt-kpi__label">
              {currentDebtDisplay > 0
                ? "SALDO PENDIENTE POR PAGAR"
                : currentFavourDisplay > 0
                ? "SALDO A FAVOR DEL CLIENTE"
                : "ESTADO DE CARTERA"}
            </span>
            <strong className="cust-stmt-kpi__val">
              {currentDebtDisplay > 0
                ? formatMoney(currentDebtDisplay)
                : currentFavourDisplay > 0
                ? formatMoney(currentFavourDisplay)
                : "$ 0 (AL DÍA)"}
            </strong>
            <span className="cust-stmt-kpi__sub">
              {currentDebtDisplay > 0
                ? "Total cartera pendiente a la fecha"
                : currentFavourDisplay > 0
                ? "Disponible para próximas compras"
                : "Cliente a paz y salvo"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla Principal Estilo Estado de Cuenta (Inspirada en el Excel del usuario pero moderna) */}
      <div className="cust-stmt-table-section">
        <div className="cust-stmt-period-banner">
          <span className="cust-stmt-period-year">{currentYear}</span>
          <span className="cust-stmt-period-title">
            RELACIÓN CRONOLÓGICA DE FACTURAS, ABONOS Y COMPROBANTES
          </span>
          <span className="cust-stmt-period-count">
            {ledgerData.rows.length} movimiento(s)
          </span>
        </div>

        <table className="cust-stmt-table">
          <thead>
            <tr>
              <th style={{ width: "92px" }}>FECHA</th>
              <th style={{ width: "125px" }}># FACTURA</th>
              <th style={{ width: "125px", textAlign: "right" }}>VALOR</th>
              <th style={{ width: "125px", textAlign: "right" }}>ABONOS</th>
              <th>DETALLES / MEDIO DE PAGO</th>
              <th style={{ width: "115px", textAlign: "center" }}>COMPROBANTE</th>
              <th style={{ width: "125px", textAlign: "right" }}>SALDO</th>
            </tr>
          </thead>
          <tbody>
            {ledgerData.rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                  No se registran facturas a crédito ni abonos en el período seleccionado.
                </td>
              </tr>
            ) : (
              ledgerData.rows.map((row, idx) => {
                const invText =
                  row.invoiceNumbers.length > 0
                    ? row.invoiceNumbers.join(", ")
                    : row.isInitialRow
                    ? "Saldo anterior"
                    : "";

                return (
                  <tr
                    key={row.key}
                    className={
                      row.isInitialRow
                        ? "cust-stmt-row--initial"
                        : idx % 2 === 1
                        ? "cust-stmt-row--alt"
                        : ""
                    }
                  >
                    <td className="cust-stmt-cell-date">{row.dateDisplay}</td>
                    <td className="cust-stmt-cell-invoice">
                      {invText ? (
                        <strong>{invText}</strong>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                      {!warehouseFilter && row.warehouseCodes.length > 0 && (
                        <div style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                          Sede: {row.warehouseCodes.join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="cust-stmt-cell-charge">
                      {row.chargeAmount > 0 ? (
                        <strong>{formatMoney(row.chargeAmount)}</strong>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="cust-stmt-cell-abono">
                      {row.abonoAmount > 0 ? (
                        <strong>{formatMoney(row.abonoAmount)}</strong>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="cust-stmt-cell-details">
                      {row.detailsText ? (
                        <div className="cust-stmt-detail-main">{row.detailsText}</div>
                      ) : null}
                      {showProductDetails && row.itemsSummary.length > 0 && (
                        <div className="cust-stmt-detail-items">
                          {row.itemsSummary.join(" | ")}
                        </div>
                      )}
                      {!row.detailsText && (!showProductDetails || row.itemsSummary.length === 0) && (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                    <td className="cust-stmt-cell-voucher">
                      {row.vouchers.length > 0 ? (
                        <strong>{row.vouchers.join(", ")}</strong>
                      ) : (
                        ""
                      )}
                    </td>
                    <td
                      className="cust-stmt-cell-balance"
                      style={{
                        color:
                          row.runningBalance > 0
                            ? "#0f172a"
                            : row.runningBalance < 0
                            ? "#059669"
                            : "#64748b",
                      }}
                    >
                      <strong>
                        {row.runningBalance < 0
                          ? `${formatMoney(Math.abs(row.runningBalance))} (A favor)`
                          : formatMoney(row.runningBalance)}
                      </strong>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="cust-stmt-tfoot-row">
              <td colSpan={2} className="cust-stmt-tfoot-label">
                TOTALES DEL PERÍODO
              </td>
              <td className="cust-stmt-tfoot-charges">
                {formatMoney(ledgerData.totalCharges)}
              </td>
              <td className="cust-stmt-tfoot-abonos">
                {formatMoney(ledgerData.totalAbonos)}
              </td>
              <td colSpan={2} className="cust-stmt-tfoot-saldo-label">
                {currentDebtDisplay > 0
                  ? "SALDO TOTAL PENDIENTE"
                  : currentFavourDisplay > 0
                  ? "SALDO A FAVOR DISPONIBLE"
                  : "SALDO FINAL"}
              </td>
              <td
                className={`cust-stmt-tfoot-saldo-val ${
                  currentDebtDisplay > 0 ? "is-debt" : "is-clear"
                }`}
              >
                {currentDebtDisplay > 0
                  ? formatMoney(currentDebtDisplay)
                  : currentFavourDisplay > 0
                  ? formatMoney(currentFavourDisplay)
                  : "$ 0"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pie de Página y Firmas */}
      <div className="cust-stmt-footer">
        <div className="cust-stmt-footer-note">
          <strong>Información importante:</strong> Este estado de cuenta refleja las facturas emitidas y los
          abonos registrados en nuestro sistema hasta la fecha y hora de expedición. Si realizó algún pago
          reciente pendiente de soporte, por favor envíe el comprobante para su respectiva aplicación.
        </div>

        <div className="cust-stmt-signatures">
          <div className="cust-stmt-sign-box">
            <div className="cust-stmt-sign-line" />
            <div className="cust-stmt-sign-title">EXPEDIDO POR · EVOLUTION COLCHONES S.A.S</div>
            <div className="cust-stmt-sign-sub">Departamento de Cartera y Facturación</div>
          </div>
          <div className="cust-stmt-sign-box">
            <div className="cust-stmt-sign-line" />
            <div className="cust-stmt-sign-title">RECIBÍ CONFORME · CLIENTE</div>
            <div className="cust-stmt-sign-sub">
              {profile.customer.displayName}{" "}
              {profile.customer.taxId ? `· C.C./NIT ${profile.customer.taxId}` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── RENDER 2: FORMATO TIRILLA TÉRMICA POS (80 MM) ─────────────────────────
  const renderVoucherStatement = () => (
    <div className="sale-voucher-body" style={{ width: "72mm", maxWidth: "72mm", margin: "0 auto", padding: "3mm 2.5mm" }}>
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
          <span className="sale-voucher-val sale-voucher-val--bold">{profile.customer.displayName}</span>
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

      {/* Movimientos en tirilla */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 900,
            fontSize: "8.5px",
            borderBottom: "1px solid #000",
            paddingBottom: "2px",
          }}
        >
          <span>FECHA / DOC / DETALLE</span>
          <span>VALOR / ABONO</span>
        </div>

        {ledgerData.rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "6px 0", fontSize: "9px" }}>
            Sin movimientos registrados
          </div>
        ) : (
          ledgerData.rows.map((r) => (
            <div
              key={r.key}
              style={{
                borderBottom: "0.5px dotted #64748b",
                paddingBottom: "3px",
                fontSize: "8.5px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>
                  {r.dateDisplay}
                  {r.invoiceNumbers.length > 0 ? ` · Fac: ${r.invoiceNumbers.join(",")}` : ""}
                </span>
                <span>Saldo: {formatMoney(r.runningBalance)}</span>
              </div>
              {r.chargeAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>+ Cargo / Factura:</span>
                  <strong>{formatMoney(r.chargeAmount)}</strong>
                </div>
              )}
              {r.abonoAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    - Abono ({r.paymentMethods.join("/") || "Pago"}
                    {r.vouchers.length > 0 ? ` #${r.vouchers.join(",")}` : ""}):
                  </span>
                  <strong>- {formatMoney(r.abonoAmount)}</strong>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="sale-voucher-divider" />

      <div className="sale-voucher-totals">
        <div className="sale-voucher-row">
          <span>Total Cargos / Facturas:</span>
          <strong>{formatMoney(ledgerData.totalCharges)}</strong>
        </div>
        <div className="sale-voucher-row">
          <span>Total Abonos Recibidos:</span>
          <strong>{formatMoney(ledgerData.totalAbonos)}</strong>
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

      <div className="sale-voucher-signature" style={{ marginTop: 10 }}>
        <div className="sale-voucher-signature-line" />
        <div className="sale-voucher-signature-name">FIRMA CLIENTE / CONFORME</div>
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
          maxWidth: format === "voucher" ? 540 : 1120,
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
                Listo para guardar en PDF (enviar por WhatsApp) o imprimir en papel
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
              title="En la ventana de impresión elige 'Guardar como PDF' para descargarlo y enviarlo por WhatsApp, o elige tu impresora."
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

        {/* Barra de Filtros y Personalización del Estado de Cuenta */}
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
            {/* Filtro por sede si hay más de una */}
            {warehouses.length > 1 && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "#334155" }}>
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

            {/* Rango de fechas opcional (calcula Saldo Anterior automáticamente) */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#334155", fontWeight: 600 }}>
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
              title="Une en la misma fila la factura y el abono cuando ocurrieron el mismo día (como en tu formato de Excel)"
            >
              <input
                type="checkbox"
                checked={groupSameDay}
                onChange={(e) => setGroupSameDay(e.target.checked)}
              />
              <span>Unir factura y abono del mismo día</span>
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

        {/* Tip rápido para guardar PDF y enviar por WhatsApp */}
        <div
          style={{
            background: "#ecfdf5",
            borderBottom: "1px solid #a7f3d0",
            padding: "7px 20px",
            fontSize: "0.79rem",
            color: "#065f46",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <span>
            💡 <strong>Tip para enviar por WhatsApp o imprimir:</strong> Haz clic en{" "}
            <strong>"Descargar PDF / Imprimir"</strong>. En Destino puedes elegir{" "}
            <strong>"Guardar como PDF"</strong> para descargarlo al computador/celular y enviarlo por WhatsApp, o seleccionar tu impresora.
          </span>
        </div>

        {/* Área de Vista Previa del Documento */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 16px",
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

        /* Estilos del Estado de Cuenta Ejecutivo (Pantalla + Impresión PDF) */
        .cust-stmt-sheet {
          width: 100%;
          max-width: 960px;
          background: #ffffff;
          color: #0f172a;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);
          padding: 28px 32px;
          box-sizing: border-box;
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .cust-stmt-topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 3px solid #0d9488;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        .cust-stmt-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .cust-stmt-logo {
          width: 52px;
          height: 52px;
          object-fit: contain;
          border-radius: 10px;
        }

        .cust-stmt-company {
          font-size: 1.35rem;
          font-weight: 900;
          letter-spacing: 0.02em;
          color: #0f172a;
          line-height: 1.15;
        }

        .cust-stmt-company-sub {
          font-size: 0.8rem;
          font-weight: 600;
          color: #0f766e;
          margin-top: 3px;
        }

        .cust-stmt-doc-box {
          text-align: right;
        }

        .cust-stmt-doc-tag {
          display: inline-block;
          background: #0f172a;
          color: #ffffff;
          font-weight: 800;
          font-size: 0.82rem;
          letter-spacing: 0.05em;
          padding: 5px 12px;
          border-radius: 6px;
          margin-bottom: 5px;
        }

        .cust-stmt-doc-date {
          font-size: 0.78rem;
          color: #475569;
        }

        .cust-stmt-doc-scope {
          font-size: 0.78rem;
          font-weight: 700;
          color: #0f766e;
          margin-top: 2px;
        }

        .cust-stmt-info-grid {
          display: grid;
          grid-template-columns: 1.15fr 1.85fr;
          gap: 16px;
          margin-bottom: 20px;
          align-items: stretch;
        }

        @media (max-width: 780px) {
          .cust-stmt-info-grid {
            grid-template-columns: 1fr;
          }
        }

        .cust-stmt-client-card {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-left: 4px solid #0d9488;
          border-radius: 10px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .cust-stmt-card-eyebrow {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #0f766e;
          text-transform: uppercase;
          margin-bottom: 3px;
        }

        .cust-stmt-client-name {
          font-size: 1.2rem;
          font-weight: 900;
          color: #0f172a;
          margin-bottom: 6px;
        }

        .cust-stmt-client-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 12px;
          font-size: 0.8rem;
          color: #334155;
        }

        .cust-stmt-client-meta span {
          color: #64748b;
        }

        .cust-stmt-kpis {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        @media (max-width: 600px) {
          .cust-stmt-kpis {
            grid-template-columns: 1fr;
          }
        }

        .cust-stmt-kpi {
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border: 1px solid #cbd5e1;
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
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #475569;
        }

        .cust-stmt-kpi__val {
          font-size: 1.25rem;
          font-weight: 900;
          margin: 4px 0 2px;
          color: #0f172a;
        }

        .cust-stmt-kpi--charges .cust-stmt-kpi__val {
          color: #9f1239;
        }

        .cust-stmt-kpi--abonos .cust-stmt-kpi__val {
          color: #166534;
        }

        .cust-stmt-kpi--balance-debt .cust-stmt-kpi__val {
          color: #be123c;
          font-size: 1.35rem;
        }

        .cust-stmt-kpi--balance-ok .cust-stmt-kpi__val {
          color: #047857;
          font-size: 1.35rem;
        }

        .cust-stmt-kpi__sub {
          font-size: 0.72rem;
          color: #64748b;
        }

        /* Tabla estilo Excel mejorado */
        .cust-stmt-table-section {
          border: 1.5px solid #1e293b;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 18px;
        }

        .cust-stmt-period-banner {
          background: #0f172a;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 7px 14px;
          font-size: 0.8rem;
          font-weight: 800;
        }

        .cust-stmt-period-year {
          background: #06b6d4;
          color: #083344;
          font-weight: 900;
          padding: 2px 10px;
          border-radius: 4px;
          font-size: 0.85rem;
        }

        .cust-stmt-period-title {
          letter-spacing: 0.04em;
          font-size: 0.78rem;
        }

        .cust-stmt-period-count {
          color: #94a3b8;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .cust-stmt-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }

        .cust-stmt-table thead tr {
          background: #fef3c7;
          color: #1e293b;
          border-bottom: 1.5px solid #1e293b;
        }

        .cust-stmt-table th {
          padding: 8px 10px;
          font-size: 0.74rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-right: 1px solid #cbd5e1;
          text-align: left;
        }

        .cust-stmt-table th:last-child {
          border-right: none;
        }

        .cust-stmt-table td {
          padding: 7px 10px;
          border-bottom: 1px solid #cbd5e1;
          border-right: 1px solid #e2e8f0;
          vertical-align: middle;
        }

        .cust-stmt-table td:last-child {
          border-right: none;
        }

        .cust-stmt-row--alt {
          background: #f8fafc;
        }

        .cust-stmt-row--initial {
          background: #fffbeb;
        }

        .cust-stmt-cell-date {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          color: #334155;
          white-space: nowrap;
        }

        .cust-stmt-cell-invoice {
          text-align: center;
          color: #0f172a;
        }

        .cust-stmt-cell-charge {
          text-align: right;
          font-variant-numeric: tabular-nums;
          color: #0f172a;
        }

        .cust-stmt-cell-abono {
          text-align: right;
          font-variant-numeric: tabular-nums;
          color: #15803d;
        }

        .cust-stmt-cell-details {
          color: #1e293b;
        }

        .cust-stmt-detail-main {
          font-weight: 700;
          color: #0f172a;
        }

        .cust-stmt-detail-items {
          font-size: 0.74rem;
          color: #475569;
          margin-top: 2px;
        }

        .cust-stmt-cell-voucher {
          text-align: center;
          font-variant-numeric: tabular-nums;
          color: #0f172a;
        }

        .cust-stmt-cell-balance {
          text-align: right;
          font-variant-numeric: tabular-nums;
          background: rgba(241, 245, 249, 0.5);
        }

        /* Fila de Totales (Inspirada en la fila inferior del Excel con colores claros y saldo resaltado) */
        .cust-stmt-tfoot-row td {
          padding: 10px 10px;
          border-top: 2px solid #1e293b;
          border-bottom: none;
          font-weight: 900;
          font-size: 0.9rem;
        }

        .cust-stmt-tfoot-label {
          background: #f1f5f9;
          text-align: right;
          color: #0f172a;
          letter-spacing: 0.03em;
          font-size: 0.78rem !important;
        }

        .cust-stmt-tfoot-charges {
          background: #ffe4e6;
          color: #9f1239;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .cust-stmt-tfoot-abonos {
          background: #dcfce7;
          color: #166534;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .cust-stmt-tfoot-saldo-label {
          background: #22c55e;
          color: #052e16;
          text-align: right;
          letter-spacing: 0.04em;
          font-size: 0.8rem !important;
        }

        .cust-stmt-tfoot-saldo-val {
          text-align: right;
          font-variant-numeric: tabular-nums;
          font-size: 1rem !important;
        }

        .cust-stmt-tfoot-saldo-val.is-debt {
          background: #4ade80;
          color: #052e16;
        }

        .cust-stmt-tfoot-saldo-val.is-clear {
          background: #bbf7d0;
          color: #065f46;
        }

        .cust-stmt-footer {
          margin-top: 14px;
        }

        .cust-stmt-footer-note {
          font-size: 0.75rem;
          color: #475569;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px 12px;
          line-height: 1.4;
        }

        .cust-stmt-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 36px;
          margin-top: 28px;
          padding-top: 10px;
        }

        .cust-stmt-sign-box {
          text-align: center;
        }

        .cust-stmt-sign-line {
          border-bottom: 1.5px solid #334155;
          height: 22px;
          margin-bottom: 5px;
        }

        .cust-stmt-sign-title {
          font-size: 0.74rem;
          font-weight: 800;
          color: #0f172a;
        }

        .cust-stmt-sign-sub {
          font-size: 0.7rem;
          color: #64748b;
          margin-top: 1px;
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
            padding: 4mm 4mm !important;
            border-radius: 0 !important;
          }

          body.inv-print-customer-statement-letter .cust-stmt-info-grid {
            grid-template-columns: 1.15fr 1.85fr !important;
          }

          body.inv-print-customer-statement-letter .cust-stmt-kpis {
            grid-template-columns: repeat(3, 1fr) !important;
          }

          body.inv-print-customer-statement-letter .cust-stmt-table tr {
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
