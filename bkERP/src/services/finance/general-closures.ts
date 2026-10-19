import type pg from "pg";

export interface MethodBreakdownItem {
  method: string;
  label: string;
  salesAmount: number;
  creditsAmount: number;
  totalAmount: number;
  count: number;
}

export interface GeneralClosureWorksheet {
  warehouseId: string | null;
  warehouseCode: string;
  warehouseName: string;
  dateFrom: string;
  dateTo: string;

  // Ventas
  totalSales: number;
  totalCashSales: number;
  totalBankSales: number;

  // Cartera y Apartados
  totalCreditPayments: number;
  totalLayawayPayments: number;

  // Salidas y Nómina
  totalOutflows: number;
  totalPayroll: number;
  totalCashPayroll: number;
  totalTransfersReceived: number;
  totalTransfersSent: number;

  // Efectivo Neto Acumulado en el Período
  totalNetCash: number;

  // Desglose por método
  paymentBreakdown: MethodBreakdownItem[];

  // Cierre existente si ya fue registrado
  isExisting: boolean;
  existingId: string | null;
  existingCode: string | null;
  existingCashToKeep: number | null;
  existingCashToWithdraw: number | null;
  existingNotes: string | null;
}

export interface GeneralClosureRecord {
  id: string;
  closureCode: string;
  warehouseId: string | null;
  warehouseCode?: string;
  warehouseName?: string;
  dateFrom: string;
  dateTo: string;
  totalSales: number;
  totalCashSales: number;
  totalBankSales: number;
  totalCreditPayments: number;
  totalLayawayPayments: number;
  totalOutflows: number;
  totalPayroll: number;
  totalNetCash: number;
  cashToKeep: number;
  cashToWithdraw: number;
  paymentBreakdown: MethodBreakdownItem[];
  status: string;
  notes: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string;
}

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  bancolombia: "Bancolombia",
  davivienda: "Davivienda",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bold: "Bold",
  addi: "Addi",
  sistecredito: "Sistecrédito",
  saldo_a_favor: "Saldo a favor",
  transferencia: "Transferencia Bancaria",
  otro: "Otro",
};

/**
 * Consecutivo de cierre contable general: CG-{WH}-{YYYYMMDD}-{YYYYMMDD}
 */
export async function nextGeneralClosureCode(
  pool: pg.Pool,
  warehouseCode: string,
  dateFrom: string,
  dateTo: string
): Promise<string> {
  const prefix = warehouseCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "GEN";
  const d1 = dateFrom.replace(/[^0-9]/g, "");
  const d2 = dateTo.replace(/[^0-9]/g, "");
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM global_closures WHERE closure_code LIKE $1`,
    [`CG-${prefix}-${d1}-${d2}%`]
  );
  const seq = Number(rows[0]?.count ?? "0") + 1;
  return `CG-${prefix}-${d1}-${d2}${seq > 1 ? `-${seq}` : ""}`;
}

/**
 * Obtener hoja de trabajo de Cierre Contable General por rango de fechas.
 */
export async function getGeneralClosureData(
  pool: pg.Pool,
  opts: {
    warehouseId?: string | null;
    dateFrom: string;
    dateTo: string;
  }
): Promise<GeneralClosureWorksheet> {
  let warehouseCode = "TODAS";
  let warehouseName = "Consolidado Todas las Sedes";

  if (opts.warehouseId) {
    const { rows: whRows } = await pool.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM warehouses WHERE id = $1::uuid`,
      [opts.warehouseId]
    );
    if (whRows[0]) {
      warehouseCode = whRows[0].code;
      warehouseName = whRows[0].name;
    }
  }

  const whFilterDoc = opts.warehouseId ? `AND d.warehouse_id = '${opts.warehouseId}'::uuid` : "";
  const whFilterRp = opts.warehouseId ? `AND rp.warehouse_id = '${opts.warehouseId}'::uuid` : "";
  const whFilterLp = opts.warehouseId ? `AND lp.warehouse_id = '${opts.warehouseId}'::uuid` : "";
  const whFilterCo = opts.warehouseId ? `AND co.warehouse_id = '${opts.warehouseId}'::uuid` : "";
  const whFilterPp = opts.warehouseId ? `AND pp.warehouse_id = '${opts.warehouseId}'::uuid` : "";
  const whFilterDestCt = opts.warehouseId ? `AND ct.destination_warehouse_id = '${opts.warehouseId}'::uuid` : "";
  const whFilterOrigCt = opts.warehouseId ? `AND ct.origin_warehouse_id = '${opts.warehouseId}'::uuid` : "";

  // 1. Ventas por método de pago en el rango
  const { rows: salesRows } = await pool.query<{ method: string; amount: string; count: number }>(
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
      ${whFilterDoc}
      AND COALESCE(d.completed_at, d.created_at)::date >= $1::date
      AND COALESCE(d.completed_at, d.created_at)::date <= $2::date
    GROUP BY LOWER(TRIM(p->>'method'))
    `,
    [opts.dateFrom, opts.dateTo]
  );

  // 2. Abonos de cartera
  const { rows: creditRows } = await pool.query<{ method: string; amount: string; count: number }>(
    `
    SELECT
      LOWER(TRIM(rp.payment_method)) AS method,
      COALESCE(SUM(rp.amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM receivable_payments rp
    WHERE 1=1
      ${whFilterRp}
      AND rp.created_at::date >= $1::date
      AND rp.created_at::date <= $2::date
    GROUP BY LOWER(TRIM(rp.payment_method))
    `,
    [opts.dateFrom, opts.dateTo]
  );

  // 3. Abonos de apartados
  const { rows: layawayRows } = await pool.query<{ method: string; amount: string; count: number }>(
    `
    SELECT
      LOWER(TRIM(lp.payment_method)) AS method,
      COALESCE(SUM(lp.amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM layaway_payments lp
    WHERE 1=1
      ${whFilterLp}
      AND lp.created_at::date >= $1::date
      AND lp.created_at::date <= $2::date
    GROUP BY LOWER(TRIM(lp.payment_method))
    `,
    [opts.dateFrom, opts.dateTo]
  );

  // 4. Egresos
  const { rows: outflowRows } = await pool.query<{ total: string; cash_total: string }>(
    `
    SELECT
      COALESCE(SUM(amount), 0)::text AS total,
      COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'efectivo' THEN amount ELSE 0 END), 0)::text AS cash_total
    FROM cash_outflows co
    WHERE 1=1
      ${whFilterCo}
      AND co.created_at::date >= $1::date
      AND co.created_at::date <= $2::date
    `,
    [opts.dateFrom, opts.dateTo]
  );
  const totalOutflows = Number(outflowRows[0]?.total || 0);
  const totalCashOutflows = Number(outflowRows[0]?.cash_total || 0);

  // 5. Nómina
  const { rows: payrollRows } = await pool.query<{ total: string; cash_total: string }>(
    `
    SELECT
      COALESCE(SUM(net_amount), 0)::text AS total,
      COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'efectivo' THEN net_amount ELSE 0 END), 0)::text AS cash_total
    FROM payroll_payments pp
    WHERE 1=1
      ${whFilterPp}
      AND pp.payment_date >= $1::date
      AND pp.payment_date <= $2::date
    `,
    [opts.dateFrom, opts.dateTo]
  );
  const totalPayroll = Number(payrollRows[0]?.total || 0);
  const totalCashPayroll = Number(payrollRows[0]?.cash_total || 0);

  // 6. Remesas entre sedes
  let totalTransfersReceived = 0;
  let totalTransfersSent = 0;
  if (opts.warehouseId) {
    const { rows: trIn } = await pool.query<{ total: string }>(
      `
      SELECT COALESCE(SUM(amount), 0)::text AS total
      FROM cash_transfers ct
      WHERE ct.status = 'approved'
        ${whFilterDestCt}
        AND ct.approved_at::date >= $1::date
        AND ct.approved_at::date <= $2::date
        AND LOWER(ct.payment_method) = 'efectivo'
      `,
      [opts.dateFrom, opts.dateTo]
    );
    totalTransfersReceived = Number(trIn[0]?.total || 0);

    const { rows: trOut } = await pool.query<{ total: string }>(
      `
      SELECT COALESCE(SUM(amount), 0)::text AS total
      FROM cash_transfers ct
      WHERE ct.status <> 'rejected'
        ${whFilterOrigCt}
        AND ct.created_at::date >= $1::date
        AND ct.created_at::date <= $2::date
        AND LOWER(ct.payment_method) = 'efectivo'
      `,
      [opts.dateFrom, opts.dateTo]
    );
    totalTransfersSent = Number(trOut[0]?.total || 0);
  }

  // Mapa consolidado de métodos de pago
  const methodMap = new Map<string, { salesAmount: number; creditsAmount: number; count: number }>();

  for (const r of salesRows) {
    const m = r.method || "otro";
    const cur = methodMap.get(m) ?? { salesAmount: 0, creditsAmount: 0, count: 0 };
    cur.salesAmount += Number(r.amount);
    cur.count += r.count;
    methodMap.set(m, cur);
  }

  for (const r of creditRows) {
    const m = r.method || "otro";
    const cur = methodMap.get(m) ?? { salesAmount: 0, creditsAmount: 0, count: 0 };
    cur.creditsAmount += Number(r.amount);
    cur.count += r.count;
    methodMap.set(m, cur);
  }

  for (const r of layawayRows) {
    const m = r.method || "otro";
    const cur = methodMap.get(m) ?? { salesAmount: 0, creditsAmount: 0, count: 0 };
    cur.creditsAmount += Number(r.amount);
    cur.count += r.count;
    methodMap.set(m, cur);
  }

  const paymentBreakdown: MethodBreakdownItem[] = Array.from(methodMap.entries()).map(([m, d]) => ({
    method: m,
    label: METHOD_LABELS[m] || m.toUpperCase(),
    salesAmount: d.salesAmount,
    creditsAmount: d.creditsAmount,
    totalAmount: d.salesAmount + d.creditsAmount,
    count: d.count,
  }));

  const cashItem = paymentBreakdown.find((p) => p.method === "efectivo");
  const totalCashSales = cashItem ? cashItem.salesAmount : 0;
  const totalCashCredits = cashItem ? cashItem.creditsAmount : 0;
  const totalSales = paymentBreakdown.reduce((s, p) => s + p.salesAmount, 0);
  const totalBankSales = totalSales - totalCashSales;

  const totalCreditPayments = creditRows.reduce((s, r) => s + Number(r.amount), 0);
  const totalLayawayPayments = layawayRows.reduce((s, r) => s + Number(r.amount), 0);

  // Efectivo neto del período
  const totalNetCash =
    totalCashSales +
    totalCashCredits +
    totalTransfersReceived -
    totalCashOutflows -
    totalCashPayroll -
    totalTransfersSent;

  // Verificar si ya existe cierre general registrado para este rango y sede
  const whCondition = opts.warehouseId ? `warehouse_id = '${opts.warehouseId}'::uuid` : `warehouse_id IS NULL`;
  const { rows: existingRows } = await pool.query<any>(
    `SELECT * FROM global_closures WHERE ${whCondition} AND date_from = $1::date AND date_to = $2::date LIMIT 1`,
    [opts.dateFrom, opts.dateTo]
  );
  const existing = existingRows[0] || null;

  return {
    warehouseId: opts.warehouseId || null,
    warehouseCode,
    warehouseName,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    totalSales,
    totalCashSales,
    totalBankSales,
    totalCreditPayments,
    totalLayawayPayments,
    totalOutflows,
    totalPayroll,
    totalCashPayroll,
    totalTransfersReceived,
    totalTransfersSent,
    totalNetCash,
    paymentBreakdown,
    isExisting: Boolean(existing),
    existingId: existing?.id || null,
    existingCode: existing?.closure_code || null,
    existingCashToKeep: existing ? Number(existing.cash_to_keep) : null,
    existingCashToWithdraw: existing ? Number(existing.cash_to_withdraw) : null,
    existingNotes: existing?.notes || null,
  };
}

/**
 * Registrar / Emitir Cierre Contable General con fondo en caja para la sede.
 */
export async function saveGeneralClosure(
  pool: pg.Pool,
  data: {
    warehouseId?: string | null;
    dateFrom: string;
    dateTo: string;
    cashToKeep: number;
    notes?: string | null;
  },
  userId?: string | null
): Promise<GeneralClosureRecord> {
  const ws = await getGeneralClosureData(pool, {
    warehouseId: data.warehouseId,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
  });

  const cashToKeep = Math.max(0, data.cashToKeep);
  const cashToWithdraw = Math.max(0, ws.totalNetCash - cashToKeep);

  let closureCode = ws.existingCode;
  if (!closureCode) {
    closureCode = await nextGeneralClosureCode(pool, ws.warehouseCode, data.dateFrom, data.dateTo);
  }

  let closureId: string;

  if (ws.existingId) {
    closureId = ws.existingId;
    await pool.query(
      `
      UPDATE global_closures
      SET
        total_sales = $1,
        total_cash_sales = $2,
        total_bank_sales = $3,
        total_credit_payments = $4,
        total_layaway_payments = $5,
        total_outflows = $6,
        total_payroll = $7,
        total_net_cash = $8,
        cash_to_keep = $9,
        cash_to_withdraw = $10,
        payment_breakdown = $11::jsonb,
        notes = $12,
        status = 'approved'
      WHERE id = $13::uuid
      `,
      [
        ws.totalSales,
        ws.totalCashSales,
        ws.totalBankSales,
        ws.totalCreditPayments,
        ws.totalLayawayPayments,
        ws.totalOutflows,
        ws.totalPayroll,
        ws.totalNetCash,
        cashToKeep,
        cashToWithdraw,
        JSON.stringify(ws.paymentBreakdown),
        data.notes?.trim() || null,
        closureId,
      ]
    );
  } else {
    const { rows } = await pool.query<{ id: string }>(
      `
      INSERT INTO global_closures (
        warehouse_id,
        closure_code,
        period_date,
        date_from,
        date_to,
        total_sales,
        total_cash_sales,
        total_bank_sales,
        total_credit_payments,
        total_layaway_payments,
        total_outflows,
        total_payroll,
        total_net_cash,
        cash_to_keep,
        cash_to_withdraw,
        payment_breakdown,
        notes,
        created_by,
        status
      ) VALUES (
        $1, $2, $3::date, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, 'approved'
      )
      RETURNING id
      `,
      [
        data.warehouseId || null,
        closureCode,
        data.dateTo,
        data.dateFrom,
        data.dateTo,
        ws.totalSales,
        ws.totalCashSales,
        ws.totalBankSales,
        ws.totalCreditPayments,
        ws.totalLayawayPayments,
        ws.totalOutflows,
        ws.totalPayroll,
        ws.totalNetCash,
        cashToKeep,
        cashToWithdraw,
        JSON.stringify(ws.paymentBreakdown),
        data.notes?.trim() || null,
        userId || null,
      ]
    );
    closureId = rows[0]!.id;
  }

  const detail = await getGeneralClosureDetail(pool, closureId);
  return detail!;
}

/**
 * Obtener detalle de un Cierre Contable General.
 */
export async function getGeneralClosureDetail(
  pool: pg.Pool,
  id: string
): Promise<GeneralClosureRecord | null> {
  const { rows } = await pool.query<any>(
    `
    SELECT
      gc.id,
      gc.closure_code AS "closureCode",
      gc.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      gc.date_from::text AS "dateFrom",
      gc.date_to::text AS "dateTo",
      gc.total_sales::float AS "totalSales",
      gc.total_cash_sales::float AS "totalCashSales",
      gc.total_bank_sales::float AS "totalBankSales",
      gc.total_credit_payments::float AS "totalCreditPayments",
      gc.total_layaway_payments::float AS "totalLayawayPayments",
      gc.total_outflows::float AS "totalOutflows",
      gc.total_payroll::float AS "totalPayroll",
      gc.total_net_cash::float AS "totalNetCash",
      gc.cash_to_keep::float AS "cashToKeep",
      gc.cash_to_withdraw::float AS "cashToWithdraw",
      gc.payment_breakdown AS "paymentBreakdown",
      gc.status,
      gc.notes,
      gc.created_by AS "createdBy",
      u.full_name AS "createdByName",
      gc.created_at AS "createdAt"
    FROM global_closures gc
    LEFT JOIN warehouses w ON w.id = gc.warehouse_id
    LEFT JOIN users u ON u.id = gc.created_by
    WHERE gc.id = $1::uuid
    `,
    [id]
  );
  return rows[0] || null;
}

/**
 * Listar historial de Cierres Contables Generales.
 */
export async function listGeneralClosures(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
  }
): Promise<GeneralClosureRecord[]> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`gc.warehouse_id = $${params.length}::uuid`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows } = await pool.query<any>(
    `
    SELECT
      gc.id,
      gc.closure_code AS "closureCode",
      gc.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      gc.date_from::text AS "dateFrom",
      gc.date_to::text AS "dateTo",
      gc.total_sales::float AS "totalSales",
      gc.total_cash_sales::float AS "totalCashSales",
      gc.total_bank_sales::float AS "totalBankSales",
      gc.total_credit_payments::float AS "totalCreditPayments",
      gc.total_layaway_payments::float AS "totalLayawayPayments",
      gc.total_outflows::float AS "totalOutflows",
      gc.total_payroll::float AS "totalPayroll",
      gc.total_net_cash::float AS "totalNetCash",
      gc.cash_to_keep::float AS "cashToKeep",
      gc.cash_to_withdraw::float AS "cashToWithdraw",
      gc.payment_breakdown AS "paymentBreakdown",
      gc.status,
      gc.notes,
      gc.created_by AS "createdBy",
      u.full_name AS "createdByName",
      gc.created_at AS "createdAt"
    FROM global_closures gc
    LEFT JOIN warehouses w ON w.id = gc.warehouse_id
    LEFT JOIN users u ON u.id = gc.created_by
    WHERE ${whereSql}
    ORDER BY gc.date_to DESC, gc.created_at DESC
    `,
    params
  );
  return rows;
}
