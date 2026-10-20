import type pg from "pg";

export interface ReceiptAuditItem {
  id: string;
  type: "sale" | "credit_payment" | "layaway_payment" | "outflow" | "transfer_sent" | "transfer_received" | "payroll";
  typeLabel: string;
  reference: string;
  concept: string;
  amount: number;
  paymentMethod: string;
  receiptUrl: string | null;
  receiptFilename: string | null;
  isMissing: boolean;
  createdAt: string;
}

export interface DailyClosureWorksheet {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  closureDate: string;
  openingCash: number;
  suggestedOpeningCash: number;
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
}

export interface DailyClosureRecord {
  id: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  closureDate: string;
  status: string;
  closingVoucherNumber: string;
  openingCash: number;
  cashSales: number;
  cashCreditPayments: number;
  cashLayawayPayments: number;
  cashTransfersReceived: number;
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
  createdBy: string | null;
  createdByName?: string | null;
  submittedAt: string | null;
  createdAt: string;
}

/**
 * Consecutivo de cierre diario: CD-{PREFIX}-{YYYYMMDD}
 */
export async function nextClosureVoucherNumber(pool: pg.Pool, warehouseCode: string, date: string): Promise<string> {
  const prefix = warehouseCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "MAIN";
  const cleanDate = date.replace(/[^0-9]/g, "");
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM daily_closures WHERE warehouse_id IN (
      SELECT id FROM warehouses WHERE UPPER(code) = UPPER($1)
    ) AND closure_date = $2::date`,
    [warehouseCode, date]
  );
  const seq = Number(rows[0]?.count ?? "0") + 1;
  return `CD-${prefix}-${cleanDate}${seq > 1 ? `-${seq}` : ""}`;
}

/**
 * Obtener hoja de trabajo de cierre diario para una sede y fecha.
 */
export async function getDailyClosureData(
  pool: pg.Pool,
  warehouseId: string,
  date: string
): Promise<DailyClosureWorksheet> {
  // 1. Obtener almacén
  const { rows: whRows } = await pool.query<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM warehouses WHERE id = $1::uuid`,
    [warehouseId]
  );
  if (!whRows[0]) throw new Error("warehouse_not_found");
  const wh = whRows[0];

  // 2. Verificar si ya existe un cierre para esa fecha
  const { rows: existingRows } = await pool.query<any>(
    `SELECT * FROM daily_closures WHERE warehouse_id = $1::uuid AND closure_date = $2::date AND status <> 'voided' LIMIT 1`,
    [warehouseId, date]
  );
  const existing = existingRows[0] || null;

  // 3. Saldo de arranque (base inicial de caja) sugerido:
  // Viene del efectivo contado en el cierre anterior más reciente o del fondo en caja (cash_to_keep) del cierre general
  let suggestedOpening = 0;
  const { rows: prevRows } = await pool.query<{ counted_cash: string; expected_cash: string; closure_date: string }>(
    `SELECT counted_cash, expected_cash, closure_date::text FROM daily_closures
     WHERE warehouse_id = $1::uuid AND closure_date < $2::date AND status <> 'voided'
     ORDER BY closure_date DESC LIMIT 1`,
    [warehouseId, date]
  );

  const { rows: prevGenRows } = await pool.query<{ cash_to_keep: string; date_to: string }>(
    `SELECT cash_to_keep, date_to::text FROM global_closures
     WHERE warehouse_id = $1::uuid AND date_to < $2::date
     ORDER BY date_to DESC, created_at DESC LIMIT 1`,
    [warehouseId, date]
  );

  if (prevRows[0] && prevGenRows[0]) {
    if (prevRows[0].closure_date >= prevGenRows[0].date_to) {
      suggestedOpening = Number(prevRows[0].counted_cash || prevRows[0].expected_cash || 0);
    } else {
      suggestedOpening = Number(prevGenRows[0].cash_to_keep || 0);
    }
  } else if (prevRows[0]) {
    suggestedOpening = Number(prevRows[0].counted_cash || prevRows[0].expected_cash || 0);
  } else if (prevGenRows[0]) {
    suggestedOpening = Number(prevGenRows[0].cash_to_keep || 0);
  }

  const openingCash = existing ? Number(existing.opening_cash) : suggestedOpening;

  // 4. Entradas de efectivo en el día
  // 4a. Ventas en efectivo desde inventory_documents
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
      AND COALESCE(d.completed_at, d.created_at)::date = $2::date
      AND LOWER(TRIM(p->>'method')) = 'efectivo'
    `,
    [warehouseId, date]
  );
  const cashSales = Number(salesRows[0]?.amount || 0);

  // 4b. Abonos de cartera en efectivo
  const { rows: creditPayRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM receivable_payments
    WHERE warehouse_id = $1::uuid
      AND created_at::date = $2::date
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId, date]
  );
  const cashCreditPayments = Number(creditPayRows[0]?.amount || 0);

  // 4c. Abonos de apartados (separe) en efectivo
  const { rows: layawayPayRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM layaway_payments
    WHERE warehouse_id = $1::uuid
      AND created_at::date = $2::date
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId, date]
  );
  const cashLayawayPayments = Number(layawayPayRows[0]?.amount || 0);

  // 4d. Remesas / Traslados de dinero recibidos y aprobados en efectivo
  const { rows: transferInRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM cash_transfers
    WHERE destination_warehouse_id = $1::uuid
      AND status = 'approved'
      AND approved_at::date = $2::date
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId, date]
  );
  const cashTransfersReceived = Number(transferInRows[0]?.amount || 0);

  const totalCashIn = cashSales + cashCreditPayments + cashLayawayPayments + cashTransfersReceived;

  // 5. Salidas de efectivo en el día
  // 5a. Comprobantes de egreso en efectivo
  const { rows: egressRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM cash_outflows
    WHERE warehouse_id = $1::uuid
      AND created_at::date = $2::date
      AND LOWER(TRIM(payment_method)) = 'efectivo'
    `,
    [warehouseId, date]
  );
  const cashOutflows = Number(egressRows[0]?.amount || 0);

  // 5b. Nómina pagada en efectivo
  const { rows: payrollRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(net_amount), 0)::text AS amount
    FROM payroll_payments
    WHERE warehouse_id = $1::uuid
      AND payment_date = $2::date
      AND LOWER(TRIM(payment_method)) = 'efectivo'
      AND deducted_from_cash_register = true
    `,
    [warehouseId, date]
  );
  const cashPayroll = Number(payrollRows[0]?.amount || 0);

  // 5c. Remesas / Traslados de dinero enviados desde esta sede en efectivo
  const { rows: transferOutRows } = await pool.query<{ amount: string }>(
    `
    SELECT COALESCE(SUM(amount), 0)::text AS amount
    FROM cash_transfers
    WHERE origin_warehouse_id = $1::uuid
      AND created_at::date = $2::date
      AND LOWER(TRIM(payment_method)) = 'efectivo'
      AND status <> 'rejected'
    `,
    [warehouseId, date]
  );
  const cashTransfersSent = Number(transferOutRows[0]?.amount || 0);

  const totalCashOut = cashOutflows + cashPayroll + cashTransfersSent;

  // 6. Efectivo Neto Esperado
  const expectedCash = openingCash + totalCashIn - totalCashOut;

  // 7. Cuentas Bancarias / Medios Digitales
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
      AND COALESCE(d.completed_at, d.created_at)::date = $2::date
      AND LOWER(TRIM(p->>'method')) NOT IN ('efectivo', 'saldo_a_favor')
    GROUP BY LOWER(TRIM(p->>'method'))
    `,
    [warehouseId, date]
  );

  const { rows: bankCreditRows } = await pool.query<{ method: string; amount: string; count: number }>(
    `
    SELECT
      LOWER(TRIM(payment_method)) AS method,
      COALESCE(SUM(amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM receivable_payments
    WHERE warehouse_id = $1::uuid
      AND created_at::date = $2::date
      AND LOWER(TRIM(payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    GROUP BY LOWER(TRIM(payment_method))
    `,
    [warehouseId, date]
  );

  const { rows: bankLayRows } = await pool.query<{ method: string; amount: string; count: number }>(
    `
    SELECT
      LOWER(TRIM(payment_method)) AS method,
      COALESCE(SUM(amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM layaway_payments
    WHERE warehouse_id = $1::uuid
      AND created_at::date = $2::date
      AND LOWER(TRIM(payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    GROUP BY LOWER(TRIM(payment_method))
    `,
    [warehouseId, date]
  );

  const bankMap = new Map<string, { amount: number; count: number }>();
  for (const r of [...bankSalesRows, ...bankCreditRows, ...bankLayRows]) {
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

  // 8. Auditoría de Comprobantes del Día (Ventas por banco, egresos, traslados, nóminas)
  const auditList: ReceiptAuditItem[] = [];

  // 8a. Ventas por banco
  const { rows: saleDocs } = await pool.query<any>(
    `
    SELECT
      d.id,
      COALESCE(d.invoice_number, d.id::text) AS "docNumber",
      d.receipt_url AS "receiptUrl",
      d.receipt_filename AS "receiptFilename",
      d.created_at AS "createdAt",
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
      AND COALESCE(d.completed_at, d.created_at)::date = $2::date
      AND LOWER(TRIM(p->>'method')) NOT IN ('efectivo', 'saldo_a_favor')
    `,
    [warehouseId, date]
  );
  for (const s of saleDocs) {
    auditList.push({
      id: s.id,
      type: "sale",
      typeLabel: "Venta por Banco",
      reference: s.docNumber,
      concept: `Venta facturada por ${s.method.toUpperCase()}`,
      amount: Number(s.amount),
      paymentMethod: s.method,
      receiptUrl: s.receiptUrl || null,
      receiptFilename: s.receiptFilename || null,
      isMissing: !s.receiptUrl,
      createdAt: s.createdAt,
    });
  }

  // 8b. Abonos de cartera por banco
  const { rows: creditPayDocs } = await pool.query<any>(
    `
    SELECT
      rp.id,
      rp.receipt_number AS "receiptNumber",
      rp.amount::float AS "amount",
      rp.payment_method AS "paymentMethod",
      rp.receipt_url AS "receiptUrl",
      rp.receipt_filename AS "receiptFilename",
      rp.created_at AS "createdAt",
      c.display_name AS "customerName"
    FROM receivable_payments rp
    LEFT JOIN customers c ON c.id = rp.customer_id
    WHERE rp.warehouse_id = $1::uuid
      AND rp.created_at::date = $2::date
      AND LOWER(TRIM(rp.payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    `,
    [warehouseId, date]
  );
  for (const cp of creditPayDocs) {
    auditList.push({
      id: cp.id,
      type: "credit_payment",
      typeLabel: "Abono Cartera por Banco",
      reference: cp.receiptNumber,
      concept: `Abono de cliente ${cp.customerName ?? ""}`,
      amount: Number(cp.amount),
      paymentMethod: cp.paymentMethod,
      receiptUrl: cp.receiptUrl || null,
      receiptFilename: cp.receiptFilename || null,
      isMissing: !cp.receiptUrl,
      createdAt: cp.createdAt,
    });
  }

  // 8c. Abonos de apartados por banco
  const { rows: layPayDocs } = await pool.query<any>(
    `
    SELECT
      lp.id,
      lp.receipt_number AS "receiptNumber",
      lp.amount::float AS "amount",
      lp.payment_method AS "paymentMethod",
      lp.receipt_url AS "receiptUrl",
      lp.receipt_filename AS "receiptFilename",
      lp.created_at AS "createdAt",
      c.display_name AS "customerName"
    FROM layaway_payments lp
    LEFT JOIN layaways l ON l.id = lp.layaway_id
    LEFT JOIN customers c ON c.id = l.customer_id
    WHERE lp.warehouse_id = $1::uuid
      AND lp.created_at::date = $2::date
      AND LOWER(TRIM(lp.payment_method)) NOT IN ('efectivo', 'saldo_a_favor')
    `,
    [warehouseId, date]
  );
  for (const lp of layPayDocs) {
    auditList.push({
      id: lp.id,
      type: "layaway_payment",
      typeLabel: "Abono Apartado por Banco",
      reference: lp.receiptNumber,
      concept: `Abono separe cliente ${lp.customerName ?? ""}`,
      amount: Number(lp.amount),
      paymentMethod: lp.paymentMethod,
      receiptUrl: lp.receiptUrl || null,
      receiptFilename: lp.receiptFilename || null,
      isMissing: !lp.receiptUrl,
      createdAt: lp.createdAt,
    });
  }

  // 8d. Salidas de dinero (Egresos)
  const { rows: outflowDocs } = await pool.query<any>(
    `
    SELECT
      id,
      voucher_number AS "voucherNumber",
      concept,
      beneficiary_name AS "beneficiaryName",
      amount::float AS "amount",
      payment_method AS "paymentMethod",
      receipt_url AS "receiptUrl",
      receipt_filename AS "receiptFilename",
      created_at AS "createdAt"
    FROM cash_outflows
    WHERE warehouse_id = $1::uuid
      AND created_at::date = $2::date
    `,
    [warehouseId, date]
  );
  for (const o of outflowDocs) {
    auditList.push({
      id: o.id,
      type: "outflow",
      typeLabel: "Comprobante de Egreso",
      reference: o.voucherNumber,
      concept: `${o.concept} (${o.beneficiaryName})`,
      amount: Number(o.amount),
      paymentMethod: o.paymentMethod,
      receiptUrl: o.receiptUrl || null,
      receiptFilename: o.receiptFilename || null,
      isMissing: !o.receiptUrl,
      createdAt: o.createdAt,
    });
  }

  // 8e. Traslados enviados
  const { rows: sentTransferDocs } = await pool.query<any>(
    `
    SELECT
      ct.id,
      ct.code,
      ct.amount::float AS "amount",
      ct.carrier_name AS "carrierName",
      ct.sender_receipt_url AS "receiptUrl",
      ct.sender_receipt_filename AS "receiptFilename",
      ct.payment_method AS "paymentMethod",
      ct.created_at AS "createdAt",
      dw.name AS "destName"
    FROM cash_transfers ct
    JOIN warehouses dw ON dw.id = ct.destination_warehouse_id
    WHERE ct.origin_warehouse_id = $1::uuid
      AND ct.created_at::date = $2::date
      AND ct.status <> 'rejected'
    `,
    [warehouseId, date]
  );
  for (const st of sentTransferDocs) {
    auditList.push({
      id: st.id,
      type: "transfer_sent",
      typeLabel: "Traslado Enviado",
      reference: st.code,
      concept: `Remesa a ${st.destName} (Mensajero: ${st.carrierName})`,
      amount: Number(st.amount),
      paymentMethod: st.paymentMethod,
      receiptUrl: st.receiptUrl || null,
      receiptFilename: st.receiptFilename || null,
      isMissing: !st.receiptUrl,
      createdAt: st.createdAt,
    });
  }

  // 8f. Traslados recibidos
  const { rows: recvTransferDocs } = await pool.query<any>(
    `
    SELECT
      ct.id,
      ct.code,
      ct.amount::float AS "amount",
      ct.carrier_name AS "carrierName",
      ct.receiver_receipt_url AS "receiptUrl",
      ct.receiver_receipt_filename AS "receiptFilename",
      ct.payment_method AS "paymentMethod",
      ct.approved_at AS "createdAt",
      ow.name AS "originName"
    FROM cash_transfers ct
    JOIN warehouses ow ON ow.id = ct.origin_warehouse_id
    WHERE ct.destination_warehouse_id = $1::uuid
      AND ct.status = 'approved'
      AND ct.approved_at::date = $2::date
    `,
    [warehouseId, date]
  );
  for (const rt of recvTransferDocs) {
    auditList.push({
      id: rt.id,
      type: "transfer_received",
      typeLabel: "Traslado Recibido",
      reference: rt.code,
      concept: `Remesa recibida de ${rt.originName} (Mensajero: ${rt.carrierName})`,
      amount: Number(rt.amount),
      paymentMethod: rt.paymentMethod,
      receiptUrl: rt.receiptUrl || null,
      receiptFilename: rt.receiptFilename || null,
      isMissing: !rt.receiptUrl,
      createdAt: rt.createdAt,
    });
  }

  // 8g. Nóminas del día
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
      p.created_at AS "createdAt"
    FROM payroll_payments p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.warehouse_id = $1::uuid
      AND p.payment_date = $2::date
      AND LOWER(TRIM(p.payment_method)) <> 'efectivo'
    `,
    [warehouseId, date]
  );
  for (const pr of payRollDocs) {
    auditList.push({
      id: pr.id,
      type: "payroll",
      typeLabel: "Nómina Bancaria",
      reference: pr.voucherNumber,
      concept: `Pago a ${pr.employeeName} por ${pr.paymentMethod.toUpperCase()}`,
      amount: Number(pr.amount),
      paymentMethod: pr.paymentMethod,
      receiptUrl: pr.receiptUrl || null,
      receiptFilename: pr.receiptFilename || null,
      isMissing: !pr.receiptUrl,
      createdAt: pr.createdAt,
    });
  }

  const pendingReceiptsCount = auditList.filter((a) => a.isMissing).length;

  return {
    warehouseId: wh.id,
    warehouseCode: wh.code,
    warehouseName: wh.name,
    closureDate: date,
    openingCash,
    suggestedOpeningCash: suggestedOpening,
    isExistingClosure: Boolean(existing),
    existingClosureId: existing?.id || null,
    existingStatus: existing?.status || null,
    existingVoucherNumber: existing?.closing_voucher_number || null,
    existingCountedCash: existing ? Number(existing.counted_cash) : null,
    existingNotes: existing?.notes || null,
    existingCashierName: existing?.cashier_name || null,

    cashSales,
    cashCreditPayments,
    cashLayawayPayments,
    cashTransfersReceived,
    totalCashIn,

    cashOutflows,
    cashPayroll,
    cashTransfersSent,
    totalCashOut,

    expectedCash,

    bankPaymentsTotal,
    bankMethods,

    receiptAuditList: auditList,
    pendingReceiptsCount,
  };
}

/**
 * Guardar o enviar el Cierre Diario oficial.
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
  },
  userId?: string | null
): Promise<DailyClosureRecord> {
  const ws = await getDailyClosureData(pool, data.warehouseId, data.closureDate);

  const openingCash = Math.max(0, data.openingCash);
  const countedCash = Math.max(0, data.countedCash);
  const expectedCash = openingCash + ws.totalCashIn - ws.totalCashOut;
  const cashDifference = countedCash - expectedCash;
  const status = data.status || "submitted";

  let voucherNumber = ws.existingVoucherNumber;
  if (!voucherNumber) {
    voucherNumber = await nextClosureVoucherNumber(pool, ws.warehouseCode, data.closureDate);
  }

  const cashierName = data.cashierName?.trim() || null;
  const notes = data.notes?.trim() || null;

  let closureId: string;

  if (ws.existingClosureId) {
    closureId = ws.existingClosureId;
    await pool.query(
      `
      UPDATE daily_closures
      SET
        opening_cash = $1,
        cash_sales = $2,
        cash_credit_payments = $3,
        cash_layaway_payments = $4,
        cash_transfers_received = $5,
        cash_transfers_sent = $6,
        cash_outflows = $7,
        cash_payroll = $8,
        expected_cash = $9,
        counted_cash = $10,
        cash_difference = $11,
        bank_payments_total = $12,
        pending_receipts_count = $13,
        cashier_name = $14,
        notes = $15,
        status = $16,
        submitted_at = now()
      WHERE id = $17::uuid
      `,
      [
        openingCash,
        ws.cashSales,
        ws.cashCreditPayments,
        ws.cashLayawayPayments,
        ws.cashTransfersReceived,
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
        status,
        closureId,
      ]
    );
  } else {
    const { rows } = await pool.query<{ id: string }>(
      `
      INSERT INTO daily_closures (
        warehouse_id,
        closure_date,
        status,
        closing_voucher_number,
        opening_cash,
        cash_sales,
        cash_credit_payments,
        cash_layaway_payments,
        cash_transfers_received,
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
        submitted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now()
      )
      RETURNING id
      `,
      [
        data.warehouseId,
        data.closureDate,
        status,
        voucherNumber,
        openingCash,
        ws.cashSales,
        ws.cashCreditPayments,
        ws.cashLayawayPayments,
        ws.cashTransfersReceived,
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
    closureId = rows[0]!.id;
  }

  // Guardar desglose por método en closure_payment_breakdown
  await pool.query(
    `DELETE FROM closure_payment_breakdown WHERE daily_closure_id = $1::uuid`,
    [closureId]
  );
  for (const bm of ws.bankMethods) {
    await pool.query(
      `
      INSERT INTO closure_payment_breakdown (daily_closure_id, method_code, amount)
      VALUES ($1::uuid, $2, $3)
      ON CONFLICT (daily_closure_id, method_code) DO UPDATE SET amount = EXCLUDED.amount
      `,
      [closureId, bm.method, bm.amount]
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
      dc.status,
      dc.closing_voucher_number AS "closingVoucherNumber",
      dc.opening_cash::float AS "openingCash",
      dc.cash_sales::float AS "cashSales",
      dc.cash_credit_payments::float AS "cashCreditPayments",
      dc.cash_layaway_payments::float AS "cashLayawayPayments",
      dc.cash_transfers_received::float AS "cashTransfersReceived",
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
  return rows[0] || null;
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
      dc.status,
      dc.closing_voucher_number AS "closingVoucherNumber",
      dc.opening_cash::float AS "openingCash",
      dc.cash_sales::float AS "cashSales",
      dc.cash_credit_payments::float AS "cashCreditPayments",
      dc.cash_layaway_payments::float AS "cashLayawayPayments",
      dc.cash_transfers_received::float AS "cashTransfersReceived",
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
    ORDER BY dc.closure_date DESC, dc.created_at DESC
    `,
    params
  );
  return rows;
}

/**
 * Adjuntar comprobante / soporte directamente a una operación específica
 * (venta, abono, egreso, remesa enviada, remesa recibida, nómina).
 */
export async function attachReceiptToOperation(
  pool: pg.Pool,
  data: {
    type: "sale" | "credit_payment" | "layaway_payment" | "outflow" | "transfer_sent" | "transfer_received" | "payroll";
    id: string;
    receiptUrl: string;
    receiptFilename: string;
  }
): Promise<void> {
  switch (data.type) {
    case "sale":
      await pool.query(
        `UPDATE inventory_documents SET receipt_url = $1, receipt_filename = $2 WHERE id = $3::uuid`,
        [data.receiptUrl, data.receiptFilename, data.id]
      );
      break;
    case "credit_payment":
      await pool.query(
        `UPDATE receivable_payments SET receipt_url = $1, receipt_filename = $2 WHERE id = $3::uuid`,
        [data.receiptUrl, data.receiptFilename, data.id]
      );
      break;
    case "layaway_payment":
      await pool.query(
        `UPDATE layaway_payments SET receipt_url = $1, receipt_filename = $2 WHERE id = $3::uuid`,
        [data.receiptUrl, data.receiptFilename, data.id]
      );
      break;
    case "outflow":
      await pool.query(
        `UPDATE cash_outflows SET receipt_url = $1, receipt_filename = $2 WHERE id = $3::uuid`,
        [data.receiptUrl, data.receiptFilename, data.id]
      );
      break;
    case "transfer_sent":
      await pool.query(
        `UPDATE cash_transfers SET sender_receipt_url = $1, sender_receipt_filename = $2 WHERE id = $3::uuid`,
        [data.receiptUrl, data.receiptFilename, data.id]
      );
      break;
    case "transfer_received":
      await pool.query(
        `UPDATE cash_transfers SET receiver_receipt_url = $1, receiver_receipt_filename = $2 WHERE id = $3::uuid`,
        [data.receiptUrl, data.receiptFilename, data.id]
      );
      break;
    case "payroll":
      await pool.query(
        `UPDATE payroll_payments SET transfer_receipt_url = $1, transfer_receipt_filename = $2 WHERE id = $3::uuid`,
        [data.receiptUrl, data.receiptFilename, data.id]
      );
      break;
    default:
      throw new Error("invalid_operation_type");
  }
}
