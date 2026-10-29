import type pg from "pg";

export interface ReceiptAuditItem {
  id: string;
  type: "sale" | "credit_payment" | "layaway_payment" | "outflow" | "payable_payment" | "transfer_sent" | "transfer_received" | "payroll" | "other_income" | "cash_income";
  typeLabel: string;
  reference: string;
  concept: string;
  amount: number;
  paymentMethod: string;
  receiptUrl: string | null;
  receiptUrls?: string[];
  receiptFilename: string | null;
  isMissing: boolean;
  createdAt: string;
}

function parseReceiptUrls(raw: any, singleFallback: string | null): string[] {
  if (Array.isArray(raw)) {
    const list = raw.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    if (list.length > 0) return list;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
        if (list.length > 0) return list;
      }
    } catch {}
  }
  return singleFallback ? [singleFallback] : [];
}

export interface DailyClosureWorksheet {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  closureDate: string;
  shiftNumber: number;
  startedAt: string | null;
  closedAt: string | null;
  openingCash: number;
  suggestedOpeningCash: number;
  hasPreviousClosure: boolean;
  isExistingClosure: boolean;
  existingClosureId: string | null;
  existingStatus: string | null;
  existingVoucherNumber: string | null;
  existingCountedCash: number | null;
  existingNotes: string | null;
  existingCashierName: string | null;

  // Entradas de Efectivo
  cashSales: number;
  cashCreditPayments: number;
  cashLayawayPayments: number;
  cashTransfersReceived: number;
  cashTransfersReturned?: number;
  cashOtherIncomes: number;
  totalCashIn: number;

  // Salidas de Efectivo
  cashOutflows: number;
  cashPayroll: number;
  cashTransfersSent: number;
  totalCashOut: number;

  // Saldos de Efectivo
  expectedCash: number;

  // Cuentas Bancarias / Medios Digitales
  bankPaymentsTotal: number;
  bankMethods: {
    method: string;
    label: string;
    amount: number;
    count: number;
  }[];

  // Auditoría de comprobantes
  receiptAuditList: ReceiptAuditItem[];
  pendingReceiptsCount: number;
  existingBankBreakdown?: Record<string, number>;
  dayShifts?: {
    id: string;
    voucherNumber: string;
    shiftNumber: number;
    closedAt: string;
    countedCash: number;
    cashierName?: string | null;
  }[];
}

export interface DailyClosureRecord {
  id: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  closureDate: string;
  shiftNumber?: number;
  startedAt?: string | null;
  closedAt?: string | null;
  status: string;
  closingVoucherNumber: string;
  openingCash: number;
  cashSales: number;
  cashCreditPayments: number;
  cashLayawayPayments: number;
  cashTransfersReceived: number;
  cashTransfersReturned?: number;
  cashOtherIncomes: number;
  cashTransfersSent: number;
  cashOutflows: number;
  cashPayroll: number;
  expectedCash: number;
  countedCash: number;
  cashDifference: number;
  bankPaymentsTotal: number;
  pendingReceiptsCount: number;
  cashierName: string | null;
  notes: string | null;
  paymentBreakdown?: { method: string; label: string; amount: number }[];
  createdBy: string | null;
  createdByName?: string | null;
  submittedAt: string | null;
  createdAt: string;
}

/**
 * Consecutivo de cierre diario: CD-{PREFIX}-{YYYYMMDD}-{SHIFT}
 */
export async function nextClosureVoucherNumber(
  _pool: pg.Pool,
  warehouseCode: string,
  date: string,
  shiftNumber: number = 1
): Promise<string> {
  const prefix = warehouseCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "MAIN";
  const cleanDate = date.replace(/[^0-9]/g, "");
  const shiftStr = String(shiftNumber).padStart(2, "0");
  return `CD-${prefix}-${cleanDate}-${shiftStr}`;
}

/**
 * Obtener comprobantes y soportes bancarios en un intervalo de tiempo exacto.
 */
async function getReceiptAuditItemsBetween(
  pool: pg.Pool,
  warehouseId: string,
  fromTime: string | null,
  toTime: string
): Promise<ReceiptAuditItem[]> {
  const auditList: ReceiptAuditItem[] = [];

  // 1. Ventas por banco
  const { rows: saleDocs } = await pool.query<any>(
    `
    SELECT
      d.id,
      COALESCE(d.invoice_number, d.id::text) AS "docNumber",
      d.receipt_url AS "receiptUrl",
      d.receipt_filename AS "receiptFilename",
      COALESCE(d.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      COALESCE(d.completed_at, d.created_at) AS "createdAt",
      p->>'method' AS "method",
      (p->>'amount')::float AS "amount"
    FROM inventory_documents d,
         jsonb_array_elements(
           CASE 
             WHEN jsonb_typeof(d.metadata->'paymentBreakdown') = 'array' 
             THEN d.metadata->'paymentBreakdown'
             ELSE '[]'::jsonb
           END
         ) AS p
    WHERE d.status = 'completed'
      AND d.doc_type IN ('exit', 'sale')
      AND d.warehouse_id = $1::uuid
      ${fromTime ? `AND COALESCE(d.completed_at, d.created_at) > '${fromTime}'::timestamptz` : ""}
      AND COALESCE(d.completed_at, d.created_at) <= '${toTime}'::timestamptz
      AND LOWER(TRIM(p->>'method')) NOT IN ('efectivo', 'saldo_a_favor')
    `,
    [warehouseId]
  );
  for (const s of saleDocs) {
    const urls = parseReceiptUrls(s.receiptUrls, s.receiptUrl || null);
    auditList.push({
      id: s.id,
      type: "sale",
      typeLabel: "Venta por Banco",
      reference: s.docNumber,
      concept: `Venta facturada por ${s.method.toUpperCase()}`,
      amount: Number(s.amount),
      paymentMethod: s.method,
      receiptUrl: urls[0] || s.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: s.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: s.createdAt,
    });
  }

  // 2. Abonos de cartera por banco
  const { rows: creditPayDocs } = await pool.query<any>(
    `
    SELECT
      rp.id,
      rp.receipt_number AS "receiptNumber",
      rp.amount::float AS "amount",
      rp.payment_method AS "paymentMethod",
      rp.receipt_url AS "receiptUrl",
      rp.receipt_filename AS "receiptFilename",
      COALESCE(rp.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      rp.created_at AS "createdAt",
      c.display_name AS "customerName"
    FROM receivable_payments rp
    LEFT JOIN customers c ON c.id = rp.customer_id
    WHERE rp.warehouse_id = $1::uuid
      ${fromTime ? `AND rp.created_at > '${fromTime}'::timestamptz` : ""}
      AND rp.created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(rp.payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    `,
    [warehouseId]
  );
  for (const cp of creditPayDocs) {
    const urls = parseReceiptUrls(cp.receiptUrls, cp.receiptUrl || null);
    auditList.push({
      id: cp.id,
      type: "credit_payment",
      typeLabel: "Abono Cartera por Banco",
      reference: cp.receiptNumber,
      concept: `Abono de ${cp.customerName ?? "Cliente"}`,
      amount: Number(cp.amount),
      paymentMethod: cp.paymentMethod,
      receiptUrl: urls[0] || cp.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: cp.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: cp.createdAt,
    });
  }

  // 3. Abonos de apartados por banco
  const { rows: layawayPayDocs } = await pool.query<any>(
    `
    SELECT
      lp.id,
      lp.receipt_number AS "receiptNumber",
      lp.amount::float AS "amount",
      lp.payment_method AS "paymentMethod",
      lp.receipt_url AS "receiptUrl",
      lp.receipt_filename AS "receiptFilename",
      COALESCE(lp.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      lp.created_at AS "createdAt",
      c.display_name AS "customerName"
    FROM layaway_payments lp
    JOIN layaways l ON l.id = lp.layaway_id
    LEFT JOIN customers c ON c.id = l.customer_id
    WHERE lp.warehouse_id = $1::uuid
      ${fromTime ? `AND lp.created_at > '${fromTime}'::timestamptz` : ""}
      AND lp.created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(lp.payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    `,
    [warehouseId]
  );
  for (const lp of layawayPayDocs) {
    const urls = parseReceiptUrls(lp.receiptUrls, lp.receiptUrl || null);
    auditList.push({
      id: lp.id,
      type: "layaway_payment",
      typeLabel: "Abono Apartado por Banco",
      reference: lp.receiptNumber,
      concept: `Abono plan separe de ${lp.customerName ?? "Cliente"}`,
      amount: Number(lp.amount),
      paymentMethod: lp.paymentMethod,
      receiptUrl: urls[0] || lp.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: lp.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: lp.createdAt,
    });
  }

  // 4. Egresos por banco
  const { rows: outflowDocs } = await pool.query<any>(
    `
    SELECT
      co.id,
      co.voucher_number AS "voucherNumber",
      co.amount::float AS "amount",
      co.payment_method AS "paymentMethod",
      co.receipt_url AS "receiptUrl",
      co.receipt_filename AS "receiptFilename",
      COALESCE(co.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      co.created_at AS "createdAt",
      co.concept AS "reason"
    FROM cash_outflows co
    WHERE co.warehouse_id = $1::uuid
      ${fromTime ? `AND co.created_at > '${fromTime}'::timestamptz` : ""}
      AND co.created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(co.payment_method)) <> 'efectivo'
    `,
    [warehouseId]
  );
  for (const co of outflowDocs) {
    const urls = parseReceiptUrls(co.receiptUrls, co.receiptUrl || null);
    auditList.push({
      id: co.id,
      type: "outflow",
      typeLabel: "Egreso por Banco",
      reference: co.voucherNumber,
      concept: co.reason || "Egreso / Gasto operativo",
      amount: Number(co.amount),
      paymentMethod: co.paymentMethod,
      receiptUrl: urls[0] || co.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: co.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: co.createdAt,
    });
  }

  // 5. Pagos a proveedores por banco
  const { rows: payablePayDocs } = await pool.query<any>(
    `
    SELECT
      pp.id,
      pp.receipt_number AS "receiptNumber",
      pp.amount::float AS "amount",
      pp.payment_method AS "paymentMethod",
      pp.receipt_url AS "receiptUrl",
      pp.receipt_filename AS "receiptFilename",
      COALESCE(pp.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      pp.created_at AS "createdAt",
      s.name AS "supplierName"
    FROM payable_payments pp
    LEFT JOIN suppliers s ON s.id = pp.supplier_id
    WHERE pp.warehouse_id = $1::uuid
      ${fromTime ? `AND pp.created_at > '${fromTime}'::timestamptz` : ""}
      AND pp.created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(pp.payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    `,
    [warehouseId]
  );
  for (const pp of payablePayDocs) {
    const urls = parseReceiptUrls(pp.receiptUrls, pp.receiptUrl || null);
    auditList.push({
      id: pp.id,
      type: "payable_payment",
      typeLabel: "Pago Proveedor por Banco",
      reference: pp.receiptNumber,
      concept: `Pago a proveedor ${pp.supplierName ?? ""}`,
      amount: Number(pp.amount),
      paymentMethod: pp.paymentMethod,
      receiptUrl: urls[0] || pp.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: pp.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: pp.createdAt,
    });
  }

  // 6. Traslados enviados
  const { rows: sentTransferDocs } = await pool.query<any>(
    `
    SELECT
      ct.id,
      ct.code,
      ct.amount::float AS "amount",
      ct.carrier_name AS "carrierName",
      ct.sender_receipt_url AS "receiptUrl",
      ct.sender_receipt_filename AS "receiptFilename",
      COALESCE(ct.sender_receipt_urls, '[]'::jsonb) AS "receiptUrls",
      ct.payment_method AS "paymentMethod",
      ct.created_at AS "createdAt",
      dw.name AS "destName"
    FROM cash_transfers ct
    JOIN warehouses dw ON dw.id = ct.destination_warehouse_id
    WHERE ct.origin_warehouse_id = $1::uuid
      ${fromTime ? `AND ct.created_at > '${fromTime}'::timestamptz` : ""}
      AND ct.created_at <= '${toTime}'::timestamptz
      AND ct.status <> 'rejected'
    `,
    [warehouseId]
  );
  for (const st of sentTransferDocs) {
    const urls = parseReceiptUrls(st.receiptUrls, st.receiptUrl || null);
    auditList.push({
      id: st.id,
      type: "transfer_sent",
      typeLabel: "Traslado Enviado",
      reference: st.code,
      concept: `Remesa a ${st.destName} (Mensajero: ${st.carrierName})`,
      amount: Number(st.amount),
      paymentMethod: st.paymentMethod,
      receiptUrl: urls[0] || st.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: st.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: st.createdAt,
    });
  }

  // 7. Traslados recibidos
  const { rows: recvTransferDocs } = await pool.query<any>(
    `
    SELECT
      ct.id,
      ct.code,
      ct.amount::float AS "amount",
      ct.carrier_name AS "carrierName",
      ct.receiver_receipt_url AS "receiptUrl",
      ct.receiver_receipt_filename AS "receiptFilename",
      COALESCE(ct.receiver_receipt_urls, '[]'::jsonb) AS "receiptUrls",
      ct.payment_method AS "paymentMethod",
      ct.approved_at AS "createdAt",
      ow.name AS "originName"
    FROM cash_transfers ct
    JOIN warehouses ow ON ow.id = ct.origin_warehouse_id
    WHERE ct.destination_warehouse_id = $1::uuid
      ${fromTime ? `AND ct.approved_at > '${fromTime}'::timestamptz` : ""}
      AND ct.approved_at <= '${toTime}'::timestamptz
      AND ct.status = 'approved'
    `,
    [warehouseId]
  );
  for (const rt of recvTransferDocs) {
    const urls = parseReceiptUrls(rt.receiptUrls, rt.receiptUrl || null);
    auditList.push({
      id: rt.id,
      type: "transfer_received",
      typeLabel: "Traslado Recibido",
      reference: rt.code,
      concept: `Remesa de ${rt.originName} (Mensajero: ${rt.carrierName})`,
      amount: Number(rt.amount),
      paymentMethod: rt.paymentMethod,
      receiptUrl: urls[0] || rt.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: rt.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: rt.createdAt,
    });
  }

  // 8. Nómina por banco
  const { rows: payRollDocs } = await pool.query<any>(
    `
    SELECT
      p.id,
      p.voucher_number AS "voucherNumber",
      e.full_name AS "employeeName",
      p.net_amount::float AS "amount",
      p.payment_method AS "paymentMethod",
      p.transfer_receipt_url AS "receiptUrl",
      p.transfer_receipt_filename AS "receiptFilename",
      COALESCE(p.transfer_receipt_urls, '[]'::jsonb) AS "receiptUrls",
      p.created_at AS "createdAt"
    FROM payroll_payments p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.warehouse_id = $1::uuid
      ${fromTime ? `AND p.created_at > '${fromTime}'::timestamptz` : ""}
      AND p.created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(p.payment_method)) <> 'efectivo'
    `,
    [warehouseId]
  );
  for (const pr of payRollDocs) {
    const urls = parseReceiptUrls(pr.receiptUrls, pr.receiptUrl || null);
    auditList.push({
      id: pr.id,
      type: "payroll",
      typeLabel: "Nómina Bancaria",
      reference: pr.voucherNumber,
      concept: `Pago a ${pr.employeeName} por ${pr.paymentMethod.toUpperCase()}`,
      amount: Number(pr.amount),
      paymentMethod: pr.paymentMethod,
      receiptUrl: urls[0] || pr.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: pr.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: pr.createdAt,
    });
  }

  // 9. Otros Ingresos por banco
  const { rows: otherIncomeDocs } = await pool.query<any>(
    `
    SELECT
      ci.id,
      ci.voucher_number AS "voucherNumber",
      ci.amount::float AS "amount",
      ci.payment_method AS "paymentMethod",
      ci.receipt_url AS "receiptUrl",
      ci.receipt_filename AS "receiptFilename",
      COALESCE(ci.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      ci.created_at AS "createdAt",
      ci.concept,
      ci.payer_name AS "payerName"
    FROM cash_incomes ci
    WHERE ci.warehouse_id = $1::uuid
      ${fromTime ? `AND ci.created_at > '${fromTime}'::timestamptz` : ""}
      AND ci.created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(ci.payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    `,
    [warehouseId]
  );
  for (const ci of otherIncomeDocs) {
    const urls = parseReceiptUrls(ci.receiptUrls, ci.receiptUrl || null);
    auditList.push({
      id: ci.id,
      type: "other_income",
      typeLabel: "Otro Ingreso por Banco",
      reference: ci.voucherNumber,
      concept: `${ci.payerName} - ${ci.concept}`,
      amount: Number(ci.amount),
      paymentMethod: ci.paymentMethod,
      receiptUrl: urls[0] || ci.receiptUrl || null,
      receiptUrls: urls,
      receiptFilename: ci.receiptFilename || null,
      isMissing: urls.length === 0,
      createdAt: ci.createdAt,
    });
  }

  return auditList;
}

/**
 * Calcular totales de movimientos entre dos momentos temporales para una sede.
 */
async function calculateMovementsBetween(
  pool: pg.Pool,
  warehouseId: string,
  startedAt: string | null,
  closedAt: string | null
): Promise<{
  cashSales: number;
  cashCreditPayments: number;
  cashLayawayPayments: number;
  cashTransfersReceived: number;
  cashTransfersReturned?: number;
  cashOtherIncomes: number;
  totalCashIn: number;
  cashOutflows: number;
  cashPayroll: number;
  cashTransfersSent: number;
  totalCashOut: number;
  bankPaymentsTotal: number;
  bankMethods: DailyClosureWorksheet["bankMethods"];
  receiptAuditList: ReceiptAuditItem[];
  pendingReceiptsCount: number;
}> {
  const fromTime = startedAt ? new Date(startedAt).toISOString() : null;
  const toTime = closedAt ? new Date(closedAt).toISOString() : new Date().toISOString();

  // 1. Ventas en efectivo
  const { rows: salesRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM((p->>'amount')::numeric), 0)::text AS amount
    FROM inventory_documents d,
         jsonb_array_elements(
           CASE 
             WHEN jsonb_typeof(d.metadata->'paymentBreakdown') = 'array' 
             THEN d.metadata->'paymentBreakdown'
             ELSE '[]'::jsonb
           END
         ) AS p
    WHERE d.status = 'completed'
      AND d.doc_type IN ('exit', 'sale')
      AND d.warehouse_id = $1::uuid
      ${fromTime ? `AND COALESCE(d.completed_at, d.created_at) > '${fromTime}'::timestamptz` : ""}
      AND COALESCE(d.completed_at, d.created_at) <= '${toTime}'::timestamptz
      AND LOWER(TRIM(p->>'method')) = 'efectivo'
    `,
    [warehouseId]
  );
  const cashSales = Number(salesRows[0]?.amount || 0);

  // 2. Abonos de cartera en efectivo
  const { rows: creditPayRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM receivable_payments
    WHERE warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId]
  );
  const cashCreditPayments = Number(creditPayRows[0]?.amount || 0);

  // 3. Abonos de apartados en efectivo
  const { rows: layawayPayRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM layaway_payments
    WHERE warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId]
  );
  const cashLayawayPayments = Number(layawayPayRows[0]?.amount || 0);

  // 4. Remesas recibidas en efectivo (aprobadas en sede destino)
  const { rows: transferInRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM cash_transfers
    WHERE destination_warehouse_id = $1::uuid
      AND status = 'approved'
      ${fromTime ? `AND approved_at > '${fromTime}'::timestamptz` : ""}
      AND approved_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId]
  );
  const cashTransfersReceived = Number(transferInRows[0]?.amount || 0);

  // 4a. Retorno de traslados rechazados en efectivo (devuelven el dinero a la sede origen donde se hizo el traslado)
  const { rows: transferRetRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM cash_transfers
    WHERE origin_warehouse_id = $1::uuid
      AND status = 'rejected'
      ${fromTime ? `AND COALESCE(approved_at, created_at) > '${fromTime}'::timestamptz` : ""}
      AND COALESCE(approved_at, created_at) <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId]
  );
  const cashTransfersReturned = Number(transferRetRows[0]?.amount || 0);

  // 4b. Otros ingresos en efectivo (devoluciones conductores, venta de rezagos/cuero, etc.)
  const { rows: otherIncomesRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM cash_incomes
    WHERE warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId]
  );
  const cashOtherIncomes = Number(otherIncomesRows[0]?.amount || 0);
  const totalCashIn =
    cashSales +
    cashCreditPayments +
    cashLayawayPayments +
    cashTransfersReceived +
    cashTransfersReturned +
    cashOtherIncomes;

  // 5. Salidas de efectivo
  // 5a. Egresos
  const { rows: egressRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM cash_outflows
    WHERE warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId]
  );
  const cashOutflows = Number(egressRows[0]?.amount || 0);

  // 5b. Nómina en efectivo
  const { rows: payrollRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(net_amount), 0)::text AS amount
    FROM payroll_payments
    WHERE warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) = 'efectivo'
      AND deducted_from_cash_register = true
    `,
    [warehouseId]
  );
  const cashPayroll = Number(payrollRows[0]?.amount || 0);

  // 5c. Remesas enviadas en efectivo (salen al crearse; si luego se rechazan, reingresan en cashTransfersReturned en la fecha/hora del rechazo)
  const { rows: transferOutRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM cash_transfers
    WHERE origin_warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId]
  );
  const cashTransfersSent = Number(transferOutRows[0]?.amount || 0);
  const totalCashOut = cashOutflows + cashPayroll + cashTransfersSent;

  // 6. Cuentas bancarias y medios electrónicos
  const { rows: bankSalesRows } = await pool.query<{ method: string; amount: string; count: number }>(
    `
    SELECT
      LOWER(TRIM(p->>'method')) AS method,
      COALESCE(SUM((p->>'amount')::numeric), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM inventory_documents d,
         jsonb_array_elements(
           CASE 
             WHEN jsonb_typeof(d.metadata->'paymentBreakdown') = 'array' 
             THEN d.metadata->'paymentBreakdown'
             ELSE '[]'::jsonb
           END
         ) AS p
    WHERE d.status = 'completed'
      AND d.doc_type IN ('exit', 'sale')
      AND d.warehouse_id = $1::uuid
      ${fromTime ? `AND COALESCE(d.completed_at, d.created_at) > '${fromTime}'::timestamptz` : ""}
      AND COALESCE(d.completed_at, d.created_at) <= '${toTime}'::timestamptz
      AND LOWER(TRIM(p->>'method')) NOT IN ('efectivo', 'saldo_a_favor')
    GROUP BY LOWER(TRIM(p->>'method'))
    `,
    [warehouseId]
  );

  const { rows: bankCreditRows } = await pool.query<{ method: string; amount: string; count: number }>(
    `
    SELECT
      LOWER(TRIM(payment_method)) AS method,
      COALESCE(SUM(amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM receivable_payments
    WHERE warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    GROUP BY LOWER(TRIM(payment_method))
    `,
    [warehouseId]
  );

  const { rows: bankLayRows } = await pool.query<{ method: string; amount: string; count: number }>(
    `
    SELECT
      LOWER(TRIM(payment_method)) AS method,
      COALESCE(SUM(amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM layaway_payments
    WHERE warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    GROUP BY LOWER(TRIM(payment_method))
    `,
    [warehouseId]
  );

  const { rows: bankOtherIncomeRows } = await pool.query<{ method: string; amount: string; count: number }>(
    `
    SELECT
      LOWER(TRIM(payment_method)) AS method,
      COALESCE(SUM(amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM cash_incomes
    WHERE warehouse_id = $1::uuid
      ${fromTime ? `AND created_at > '${fromTime}'::timestamptz` : ""}
      AND created_at <= '${toTime}'::timestamptz
      AND LOWER(TRIM(payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    GROUP BY LOWER(TRIM(payment_method))
    `,
    [warehouseId]
  );

  const bankMap = new Map<string, { amount: number; count: number }>();
  for (const r of [...bankSalesRows, ...bankCreditRows, ...bankLayRows, ...bankOtherIncomeRows]) {
    const cur = bankMap.get(r.method) ?? { amount: 0, count: 0 };
    cur.amount += Number(r.amount);
    cur.count += r.count;
    bankMap.set(r.method, cur);
  }

  const methodNames: Record<string, string> = {
    bancolombia: "Bancolombia",
    davivienda: "Davivienda",
    nequi: "Nequi",
    daviplata: "Daviplata",
    bold: "Bold",
    addi: "Addi",
    sistecredito: "Sistecrédito",
    transferencia: "Transferencia Bancaria",
  };

  const bankMethods = Array.from(bankMap.entries()).map(([method, d]) => ({
    method,
    label: methodNames[method] || method.toUpperCase(),
    amount: d.amount,
    count: d.count,
  }));
  const bankPaymentsTotal = bankMethods.reduce((s, b) => s + b.amount, 0);

  // 7. Auditoría de comprobantes
  const auditList = await getReceiptAuditItemsBetween(pool, warehouseId, fromTime, toTime);
  const pendingReceiptsCount = auditList.filter((a) => a.isMissing).length;

  return {
    cashSales,
    cashCreditPayments,
    cashLayawayPayments,
    cashTransfersReceived,
    cashTransfersReturned,
    cashOtherIncomes,
    totalCashIn,
    cashOutflows,
    cashPayroll,
    cashTransfersSent,
    totalCashOut,
    bankPaymentsTotal,
    bankMethods,
    receiptAuditList: auditList,
    pendingReceiptsCount,
  };
}

/**
 * Auto-repara cierres ya cerrados en los que un traslado enviado en un turno anterior
 * (created_at <= started_at) fue rechazado durante ese turno (approved_at > started_at AND approved_at <= closed_at),
 * pero por el comportamiento anterior no había retornado el dinero al saldo esperado/contado de la sede origen.
 */
async function repairMissedRejectedTransferReturns(
  pool: pg.Pool,
  warehouseId: string
): Promise<void> {
  try {
    const { rows: missedRows } = await pool.query<{
      id: string;
      closed_time: string;
      missing_return: string;
    }>(
      `
      SELECT
        dc.id,
        COALESCE(dc.closed_at, dc.created_at)::text AS closed_time,
        (
          COALESCE((
            SELECT SUM(ct.amount)
            FROM cash_transfers ct
            WHERE ct.destination_warehouse_id = dc.warehouse_id
              AND ct.status = 'approved'
              AND LOWER(TRIM(ct.payment_method)) = 'efectivo'
              AND ct.approved_at > dc.started_at
              AND ct.approved_at <= COALESCE(dc.closed_at, dc.created_at)
          ), 0)
          +
          COALESCE((
            SELECT SUM(ct.amount)
            FROM cash_transfers ct
            WHERE ct.origin_warehouse_id = dc.warehouse_id
              AND ct.status = 'rejected'
              AND LOWER(TRIM(ct.payment_method)) = 'efectivo'
              AND ct.created_at <= dc.started_at
              AND COALESCE(ct.approved_at, ct.created_at) > dc.started_at
              AND COALESCE(ct.approved_at, ct.created_at) <= COALESCE(dc.closed_at, dc.created_at)
          ), 0)
          - dc.cash_transfers_received
        )::text AS missing_return
      FROM daily_closures dc
      WHERE dc.warehouse_id = $1::uuid
        AND dc.status <> 'voided'
        AND dc.started_at IS NOT NULL
      ORDER BY COALESCE(dc.closed_at, dc.created_at) ASC, dc.id ASC
      `,
      [warehouseId]
    );

    for (const r of missedRows) {
      const missingReturn = Number(r.missing_return || 0);
      if (missingReturn > 0.009) {
        await pool.query(
          `
          UPDATE daily_closures
          SET cash_transfers_received = cash_transfers_received + $2::numeric,
              expected_cash = expected_cash + $2::numeric,
              counted_cash = counted_cash + $2::numeric
          WHERE id = $1::uuid
          `,
          [r.id, missingReturn]
        );
        await pool.query(
          `
          UPDATE daily_closures
          SET opening_cash = opening_cash + $3::numeric,
              expected_cash = expected_cash + $3::numeric,
              counted_cash = counted_cash + $3::numeric
          WHERE warehouse_id = $1::uuid
            AND status <> 'voided'
            AND id <> $2::uuid
            AND COALESCE(closed_at, created_at) > $4::timestamptz
          `,
          [warehouseId, r.id, missingReturn, r.closed_time]
        );
      }
    }
  } catch (e) {
    console.warn("[daily-closures] repairMissedRejectedTransferReturns warning:", e);
  }
}

/**
 * Obtener hoja de trabajo de cierre diario continuo (basado en horas y fechas entre cierres).
 */
export async function getDailyClosureData(
  pool: pg.Pool,
  warehouseId: string,
  dateOrOptions?: string | { date?: string; closureId?: string }
): Promise<DailyClosureWorksheet> {
  const date = typeof dateOrOptions === "string" ? dateOrOptions : (dateOrOptions?.date || new Date().toISOString().slice(0, 10));
  const requestedClosureId = typeof dateOrOptions === "object" ? dateOrOptions?.closureId : undefined;

  await repairMissedRejectedTransferReturns(pool, warehouseId);

  // 1. Obtener almacén
  const { rows: whRows } = await pool.query<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM warehouses WHERE id = $1::uuid`,
    [warehouseId]
  );
  if (!whRows[0]) throw new Error("warehouse_not_found");
  const wh = whRows[0];

  // Si se solicita un cierre específico por ID (modo consulta de cierre cerrado e inmutable)
  if (requestedClosureId) {
    const { rows: reqRows } = await pool.query<any>(
      `SELECT * FROM daily_closures WHERE id = $1::uuid`,
      [requestedClosureId]
    );
    const existing = reqRows[0];
    if (existing) {
      const shiftNumber = Number(existing.shift_number || 1);
      const startedAt = existing.started_at ? new Date(existing.started_at).toISOString() : null;
      const closedAt = existing.closed_at ? new Date(existing.closed_at).toISOString() : new Date(existing.created_at).toISOString();

      const existingBankBreakdown: Record<string, number> = {};
      const { rows: exBdRows } = await pool.query<{ method_code: string; amount: string }>(
        `SELECT method_code, amount::float FROM closure_payment_breakdown WHERE daily_closure_id = $1::uuid`,
        [existing.id]
      );
      for (const r of exBdRows) {
        existingBankBreakdown[r.method_code] = Number(r.amount);
      }

      const methodNames: Record<string, string> = {
        bancolombia: "Bancolombia",
        davivienda: "Davivienda",
        nequi: "Nequi",
        daviplata: "Daviplata",
        bold: "Bold",
        addi: "Addi",
        sistecredito: "Sistecrédito",
        transferencia: "Transferencia Bancaria",
      };

      const bankMethods: DailyClosureWorksheet["bankMethods"] = Object.entries(existingBankBreakdown).map(([m, amt]) => ({
        method: m,
        label: methodNames[m] || m.toUpperCase(),
        amount: amt,
        count: 1,
      }));

      const auditList = await getReceiptAuditItemsBetween(pool, warehouseId, startedAt, closedAt);
      const pendingReceiptsCount = auditList.filter((a) => a.isMissing).length;

      const { rows: retRows } = await pool.query<{ amount: string }>(
        `
        SELECT COALESCE(SUM(amount), 0)::text AS amount
        FROM cash_transfers
        WHERE origin_warehouse_id = $1::uuid
          AND status = 'rejected'
          ${startedAt ? `AND COALESCE(approved_at, created_at) > '${startedAt}'::timestamptz` : ""}
          AND COALESCE(approved_at, created_at) <= '${closedAt}'::timestamptz
          AND LOWER(TRIM(payment_method)) = 'efectivo'
        `,
        [warehouseId]
      );
      const rawReturned = Number(retRows[0]?.amount || 0);
      const rawPersistedReceived = Number(existing.cash_transfers_received || 0);
      const existingTransfersReturned = Math.min(rawPersistedReceived, rawReturned);
      const existingTransfersReceived = Math.max(0, rawPersistedReceived - existingTransfersReturned);

      const dateStr = existing.closure_date instanceof Date
        ? existing.closure_date.toISOString().slice(0, 10)
        : String(existing.closure_date);

      // Turnos de ese día
      const { rows: dayShiftRows } = await pool.query<any>(
        `SELECT
           id,
           closing_voucher_number AS "voucherNumber",
           shift_number AS "shiftNumber",
           COALESCE(closed_at, created_at) AS "closedAt",
           counted_cash::float AS "countedCash",
           cashier_name AS "cashierName"
         FROM daily_closures
         WHERE warehouse_id = $1::uuid
           AND closure_date = $2::date
           AND status <> 'voided'
         ORDER BY shift_number ASC, created_at ASC`,
        [warehouseId, dateStr]
      );
      const dayShifts = dayShiftRows.map((r: any) => ({
        id: r.id,
        voucherNumber: r.voucherNumber,
        shiftNumber: Number(r.shiftNumber || 1),
        closedAt: new Date(r.closedAt).toISOString(),
        countedCash: Number(r.countedCash || 0),
        cashierName: r.cashierName || null,
      }));

      return {
        warehouseId: wh.id,
        warehouseCode: wh.code,
        warehouseName: wh.name,
        closureDate: dateStr,
        shiftNumber,
        startedAt,
        closedAt,
        openingCash: Number(existing.opening_cash),
        suggestedOpeningCash: Number(existing.opening_cash),
        hasPreviousClosure: true,
        isExistingClosure: true,
        existingClosureId: existing.id,
        existingStatus: existing.status,
        existingVoucherNumber: existing.closing_voucher_number,
        existingCountedCash: Number(existing.counted_cash),
        existingNotes: existing.notes,
        existingCashierName: existing.cashier_name,

        cashSales: Number(existing.cash_sales),
        cashCreditPayments: Number(existing.cash_credit_payments),
        cashLayawayPayments: Number(existing.cash_layaway_payments),
        cashTransfersReceived: existingTransfersReceived,
        cashTransfersReturned: existingTransfersReturned,
        cashOtherIncomes: Number(existing.cash_other_incomes || 0),
        totalCashIn: Number(existing.cash_sales) + Number(existing.cash_credit_payments) + Number(existing.cash_layaway_payments) + rawPersistedReceived + Number(existing.cash_other_incomes || 0),

        cashOutflows: Number(existing.cash_outflows),
        cashPayroll: Number(existing.cash_payroll),
        cashTransfersSent: Number(existing.cash_transfers_sent),
        totalCashOut: Number(existing.cash_outflows) + Number(existing.cash_payroll) + Number(existing.cash_transfers_sent),

        expectedCash: Number(existing.expected_cash),
        bankPaymentsTotal: Number(existing.bank_payments_total),
        bankMethods,
        receiptAuditList: auditList,
        pendingReceiptsCount,
        existingBankBreakdown,
        dayShifts,
      };
    }
  }

  // 2. Obtener turnos ya emitidos en esta fecha
  const { rows: dayShiftRows } = await pool.query<any>(
    `SELECT
       id,
       closing_voucher_number AS "voucherNumber",
       shift_number AS "shiftNumber",
       COALESCE(closed_at, created_at) AS "closedAt",
       counted_cash::float AS "countedCash",
       cashier_name AS "cashierName"
     FROM daily_closures
     WHERE warehouse_id = $1::uuid
       AND closure_date = $2::date
       AND status <> 'voided'
     ORDER BY shift_number ASC, created_at ASC`,
    [warehouseId, date]
  );
  const dayShifts = dayShiftRows.map((r: any) => ({
    id: r.id,
    voucherNumber: r.voucherNumber,
    shiftNumber: Number(r.shiftNumber || 1),
    closedAt: new Date(r.closedAt).toISOString(),
    countedCash: Number(r.countedCash || 0),
    cashierName: r.cashierName || null,
  }));

  // 3. Obtener el último cierre completado de esta sede (en cualquier fecha)
  const { rows: lastClosureRows } = await pool.query<any>(
    `SELECT * FROM daily_closures
     WHERE warehouse_id = $1::uuid AND status <> 'voided'
     ORDER BY COALESCE(closed_at, created_at) DESC, id DESC
     LIMIT 1`,
    [warehouseId]
  );
  const lastClosure = lastClosureRows[0] || null;

  // Si la fecha solicitada es anterior a hoy y ya tiene cierres, mostramos el último de esa fecha
  const todayBogota = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  if (date < todayBogota && dayShifts.length > 0) {
    const lastDayShift = dayShifts[dayShifts.length - 1];
    return getDailyClosureData(pool, warehouseId, { closureId: lastDayShift.id });
  }

  // 4. Determinar inicio del turno activo y saldo de arranque
  let startedAt: string | null = null;
  let suggestedOpening = 0;
  let hasPreviousClosure = false;
  let shiftNumber = 1;

  if (lastClosure) {
    const lastClosedAt = lastClosure.closed_at || lastClosure.created_at;
    startedAt = new Date(lastClosedAt).toISOString();
    suggestedOpening = Number(lastClosure.counted_cash ?? lastClosure.expected_cash ?? 0);
    hasPreviousClosure = true;

    const lastClosureDateStr = lastClosure.closure_date instanceof Date
      ? lastClosure.closure_date.toISOString().slice(0, 10)
      : String(lastClosure.closure_date);
    if (lastClosureDateStr === date) {
      shiftNumber = (Number(lastClosure.shift_number) || 1) + 1;
    } else {
      shiftNumber = 1;
    }
  } else {
    // Si no hay cierre previo, chequear si hay cierre general con fondo
    const { rows: prevGenRows } = await pool.query<{ cash_to_keep: string }>(
      `SELECT cash_to_keep FROM global_closures
       WHERE warehouse_id = $1::uuid
       ORDER BY date_to DESC, created_at DESC LIMIT 1`,
      [warehouseId]
    );
    if (prevGenRows[0]) {
      suggestedOpening = Number(prevGenRows[0].cash_to_keep || 0);
      hasPreviousClosure = true;
    }
  }

  const openingCash = hasPreviousClosure ? suggestedOpening : 0;
  const closedAt = new Date().toISOString();

  // 5. Calcular movimientos desde startedAt hasta closedAt (ahora)
  const mov = await calculateMovementsBetween(pool, warehouseId, startedAt, closedAt);
  const expectedCash = openingCash + mov.totalCashIn - mov.totalCashOut;

  return {
    warehouseId: wh.id,
    warehouseCode: wh.code,
    warehouseName: wh.name,
    closureDate: date,
    shiftNumber,
    startedAt,
    closedAt,
    openingCash,
    suggestedOpeningCash: suggestedOpening,
    hasPreviousClosure,
    isExistingClosure: false,
    existingClosureId: null,
    existingStatus: null,
    existingVoucherNumber: null,
    existingCountedCash: null,
    existingNotes: null,
    existingCashierName: null,

    cashSales: mov.cashSales,
    cashCreditPayments: mov.cashCreditPayments,
    cashLayawayPayments: mov.cashLayawayPayments,
    cashTransfersReceived: mov.cashTransfersReceived,
    cashTransfersReturned: mov.cashTransfersReturned,
    cashOtherIncomes: mov.cashOtherIncomes,
    totalCashIn: mov.totalCashIn,

    cashOutflows: mov.cashOutflows,
    cashPayroll: mov.cashPayroll,
    cashTransfersSent: mov.cashTransfersSent,
    totalCashOut: mov.totalCashOut,

    expectedCash,
    bankPaymentsTotal: mov.bankPaymentsTotal,
    bankMethods: mov.bankMethods,
    receiptAuditList: mov.receiptAuditList,
    pendingReceiptsCount: mov.pendingReceiptsCount,
    dayShifts,
  };
}

/**
 * Guardar o emitir el Cierre Diario oficial continuo.
 */
export async function saveDailyClosure(
  pool: pg.Pool,
  data: {
    warehouseId: string;
    closureDate: string;
    openingCash: number;
    countedCash: number;
    cashierName?: string | null;
    notes?: string | null;
    status?: "submitted" | "approved";
    declaredBankMethods?: Record<string, number>;
  },
  userId?: string | null
): Promise<DailyClosureRecord> {
  const ws = await getDailyClosureData(pool, data.warehouseId, data.closureDate);

  if (ws.isExistingClosure) {
    const err = new Error(
      `El cierre diario (${ws.existingVoucherNumber || "Registrado"}) ya fue emitido y se encuentra bloqueado. Para iniciar un nuevo turno, regresa al turno activo.`
    );
    (err as any).statusCode = 409;
    (err as any).code = "CLOSURE_ALREADY_EXISTS";
    throw err;
  }

  if (ws.pendingReceiptsCount > 0) {
    const err = new Error(
      `No se puede guardar el cierre diario: hay ${ws.pendingReceiptsCount} comprobante(s) de pago pendientes por adjuntar en la auditoría de soportes.`
    );
    (err as any).statusCode = 400;
    (err as any).code = "PENDING_RECEIPTS";
    throw err;
  }

  const openingCash = ws.hasPreviousClosure
    ? ws.suggestedOpeningCash
    : Math.max(0, data.openingCash || 0);
  const countedCash = Math.max(0, data.countedCash);
  const expectedCash = openingCash + ws.totalCashIn - ws.totalCashOut;
  const cashDifference = countedCash - expectedCash;
  const status = data.status || "approved";

  const shiftNumber = ws.shiftNumber || 1;
  const voucherNumber = await nextClosureVoucherNumber(pool, ws.warehouseCode, data.closureDate, shiftNumber);

  const startedAt = ws.startedAt ? new Date(ws.startedAt) : null;
  const closedAt = new Date();

  const cashierName = data.cashierName?.trim() || null;
  const notes = data.notes?.trim() || null;

  const { rows } = await pool.query<{ id: string }>(
    `
    INSERT INTO daily_closures (
      warehouse_id,
      closure_date,
      status,
      closing_voucher_number,
      shift_number,
      started_at,
      closed_at,
      opening_cash,
      cash_sales,
      cash_credit_payments,
      cash_layaway_payments,
      cash_transfers_received,
      cash_other_incomes,
      cash_transfers_sent,
      cash_outflows,
      cash_payroll,
      expected_cash,
      counted_cash,
      cash_difference,
      bank_payments_total,
      pending_receipts_count,
      cashier_name,
      notes,
      created_by,
      submitted_at,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $7, $7
    )
    RETURNING id
    `,
    [
      data.warehouseId,
      data.closureDate,
      status,
      voucherNumber,
      shiftNumber,
      startedAt,
      closedAt,
      openingCash,
      ws.cashSales,
      ws.cashCreditPayments,
      ws.cashLayawayPayments,
      ws.cashTransfersReceived + (ws.cashTransfersReturned || 0),
      ws.cashOtherIncomes,
      ws.cashTransfersSent,
      ws.cashOutflows,
      ws.cashPayroll,
      expectedCash,
      countedCash,
      cashDifference,
      ws.bankPaymentsTotal,
      ws.pendingReceiptsCount,
      cashierName,
      notes,
      userId || null,
    ]
  );
  const closureId = rows[0]!.id;

  // Guardar desglose por método en closure_payment_breakdown
  await pool.query(
    `DELETE FROM closure_payment_breakdown WHERE daily_closure_id = $1::uuid`,
    [closureId]
  );
  for (const bm of ws.bankMethods) {
    const declared = data.declaredBankMethods?.[bm.method] !== undefined
      ? Number(data.declaredBankMethods[bm.method])
      : bm.amount;
    await pool.query(
      `
      INSERT INTO closure_payment_breakdown (daily_closure_id, method_code, amount)
      VALUES ($1::uuid, $2, $3)
      ON CONFLICT (daily_closure_id, method_code)
      DO UPDATE SET amount = EXCLUDED.amount
      `,
      [closureId, bm.method, declared]
    );
  }

  const detail = await getDailyClosureDetail(pool, closureId);
  return detail!;
}

/**
 * Obtener detalle de un cierre diario.
 */
export async function getDailyClosureDetail(
  pool: pg.Pool,
  closureId: string
): Promise<DailyClosureRecord | null> {
  const { rows } = await pool.query<any>(
    `
    SELECT
      dc.id,
      dc.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      dc.closure_date AS "closureDate",
      dc.shift_number AS "shiftNumber",
      dc.started_at AS "startedAt",
      dc.closed_at AS "closedAt",
      dc.status,
      dc.closing_voucher_number AS "closingVoucherNumber",
      dc.opening_cash::float AS "openingCash",
      dc.cash_sales::float AS "cashSales",
      dc.cash_credit_payments::float AS "cashCreditPayments",
      dc.cash_layaway_payments::float AS "cashLayawayPayments",
      dc.cash_transfers_received::float AS "cashTransfersReceived",
      COALESCE(dc.cash_other_incomes, 0)::float AS "cashOtherIncomes",
      dc.cash_transfers_sent::float AS "cashTransfersSent",
      dc.cash_outflows::float AS "cashOutflows",
      dc.cash_payroll::float AS "cashPayroll",
      dc.expected_cash::float AS "expectedCash",
      dc.counted_cash::float AS "countedCash",
      dc.cash_difference::float AS "cashDifference",
      dc.bank_payments_total::float AS "bankPaymentsTotal",
      dc.pending_receipts_count AS "pendingReceiptsCount",
      dc.cashier_name AS "cashierName",
      dc.notes,
      dc.created_by AS "createdBy",
      u.full_name AS "createdByName",
      dc.submitted_at AS "submittedAt",
      dc.created_at AS "createdAt"
    FROM daily_closures dc
    JOIN warehouses w ON w.id = dc.warehouse_id
    LEFT JOIN users u ON u.id = dc.created_by
    WHERE dc.id = $1::uuid
    `,
    [closureId]
  );
  if (!rows[0]) return null;

  const { rows: bdRows } = await pool.query<{ method_code: string; amount: string }>(
    `SELECT method_code, amount::float FROM closure_payment_breakdown WHERE daily_closure_id = $1::uuid`,
    [closureId]
  );
  const methodNames: Record<string, string> = {
    bancolombia: "Bancolombia",
    davivienda: "Davivienda",
    nequi: "Nequi",
    daviplata: "Daviplata",
    bold: "Bold",
    addi: "Addi",
    sistecredito: "Sistecrédito",
    transferencia: "Transferencia Bancaria",
  };
  rows[0].paymentBreakdown = bdRows.map((r) => ({
    method: r.method_code,
    label: methodNames[r.method_code] || r.method_code.toUpperCase(),
    amount: Number(r.amount),
  }));

  return rows[0];
}

/**
 * Listar historial de cierres diarios.
 */
export async function listDailyClosures(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
): Promise<DailyClosureRecord[]> {
  const conditions: string[] = ["dc.status <> 'voided'"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`dc.warehouse_id = $${params.length}::uuid`);
  }
  if (opts?.dateFrom) {
    params.push(opts.dateFrom);
    conditions.push(`dc.closure_date >= $${params.length}::date`);
  }
  if (opts?.dateTo) {
    params.push(opts.dateTo);
    conditions.push(`dc.closure_date <= $${params.length}::date`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows } = await pool.query<any>(
    `
    SELECT
      dc.id,
      dc.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      dc.closure_date AS "closureDate",
      dc.shift_number AS "shiftNumber",
      dc.started_at AS "startedAt",
      dc.closed_at AS "closedAt",
      dc.status,
      dc.closing_voucher_number AS "closingVoucherNumber",
      dc.opening_cash::float AS "openingCash",
      dc.cash_sales::float AS "cashSales",
      dc.cash_credit_payments::float AS "cashCreditPayments",
      dc.cash_layaway_payments::float AS "cashLayawayPayments",
      dc.cash_transfers_received::float AS "cashTransfersReceived",
      COALESCE(dc.cash_other_incomes, 0)::float AS "cashOtherIncomes",
      dc.cash_transfers_sent::float AS "cashTransfersSent",
      dc.cash_outflows::float AS "cashOutflows",
      dc.cash_payroll::float AS "cashPayroll",
      dc.expected_cash::float AS "expectedCash",
      dc.counted_cash::float AS "countedCash",
      dc.cash_difference::float AS "cashDifference",
      dc.bank_payments_total::float AS "bankPaymentsTotal",
      dc.pending_receipts_count AS "pendingReceiptsCount",
      dc.cashier_name AS "cashierName",
      dc.notes,
      dc.created_by AS "createdBy",
      u.full_name AS "createdByName",
      dc.submitted_at AS "submittedAt",
      dc.created_at AS "createdAt"
    FROM daily_closures dc
    JOIN warehouses w ON w.id = dc.warehouse_id
    LEFT JOIN users u ON u.id = dc.created_by
    WHERE ${whereSql}
    ORDER BY dc.closure_date DESC, dc.shift_number DESC, dc.created_at DESC
    `,
    params
  );
  return rows;
}

/**
 * Adjuntar comprobante / soporte directamente a una operación específica.
 */
export async function attachReceiptToOperation(
  pool: pg.Pool,
  data: {
    type: "sale" | "credit_payment" | "layaway_payment" | "outflow" | "cash_outflow" | "payable_payment" | "transfer_sent" | "transfer_received" | "payroll" | "payroll_payment" | "other_income" | "cash_income";
    id: string;
    receiptUrl: string;
    receiptUrls?: string[];
    receiptFilename: string;
  }
): Promise<void> {
  const urls = (data.receiptUrls && data.receiptUrls.length > 0)
    ? data.receiptUrls
    : (data.receiptUrl ? [data.receiptUrl] : []);
  const primaryUrl = urls[0] || data.receiptUrl;
  const jsonUrls = JSON.stringify(urls);

  switch (data.type) {
    case "sale":
      await pool.query(
        `UPDATE inventory_documents SET receipt_url = $1, receipt_filename = $2, receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    case "credit_payment":
      await pool.query(
        `UPDATE receivable_payments SET receipt_url = $1, receipt_filename = $2, receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    case "layaway_payment":
      await pool.query(
        `UPDATE layaway_payments SET receipt_url = $1, receipt_filename = $2, receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    case "outflow":
    case "cash_outflow":
      await pool.query(
        `UPDATE cash_outflows SET receipt_url = $1, receipt_filename = $2, receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    case "payable_payment":
      await pool.query(
        `UPDATE payable_payments SET receipt_url = $1, receipt_filename = $2, receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    case "transfer_sent":
      await pool.query(
        `UPDATE cash_transfers SET sender_receipt_url = $1, sender_receipt_filename = $2, sender_receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    case "transfer_received":
      await pool.query(
        `UPDATE cash_transfers SET receiver_receipt_url = $1, receiver_receipt_filename = $2, receiver_receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    case "payroll":
    case "payroll_payment":
      await pool.query(
        `UPDATE payroll_payments SET transfer_receipt_url = $1, transfer_receipt_filename = $2, transfer_receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    case "other_income":
    case "cash_income":
      await pool.query(
        `UPDATE cash_incomes SET receipt_url = $1, receipt_filename = $2, receipt_urls = $4::jsonb WHERE id = $3::uuid`,
        [primaryUrl, data.receiptFilename, data.id, jsonUrls]
      );
      break;
    default:
      throw new Error("invalid_operation_type");
  }
}
