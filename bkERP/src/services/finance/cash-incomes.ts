import type pg from "pg";

export type CashIncomeCategory =
  | "driver_refund"
  | "scrap_sale"
  | "operational_refund"
  | "other";

export interface CashIncomeItem {
  id: string;
  voucherNumber: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  category: CashIncomeCategory;
  concept: string;
  payerName: string;
  payerDoc: string | null;
  payerPhone: string | null;
  amount: number;
  paymentMethod: string;
  referenceCode: string | null;
  receiptUrl: string | null;
  receiptUrls: string[];
  receiptFilename: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export function parseReceiptUrls(raw: any, singleFallback: string | null): string[] {
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

/**
 * Consecutivo correlativo para el recibo de caja / comprobante de ingreso:
 * RC-{WH_CODE}-{NUM}
 */
export async function nextIncomeVoucherNumber(
  client: pg.PoolClient | pg.Pool,
  warehouseId: string
): Promise<string> {
  const { rows: wh } = await client.query<{ code: string }>(
    `SELECT code FROM warehouses WHERE id = $1::uuid`,
    [warehouseId]
  );
  const prefix = (wh[0]?.code ?? "BOD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "BOD";
  const { rows: seq } = await client.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM cash_incomes
    WHERE warehouse_id = $1::uuid
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `RC-${prefix}-${num}`;
}

/**
 * Crear un nuevo Recibo de Caja / Entrada de Dinero (Otros Ingresos).
 */
export async function createCashIncome(
  pool: pg.Pool,
  params: {
    warehouseId: string;
    category?: CashIncomeCategory | string;
    concept: string;
    payerName: string;
    payerDoc?: string | null;
    payerPhone?: string | null;
    amount: number;
    paymentMethod: string;
    referenceCode?: string | null;
    notes?: string | null;
    userId?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
): Promise<CashIncomeItem> {
  const {
    warehouseId,
    category = "other",
    concept,
    payerName,
    payerDoc,
    payerPhone,
    amount,
    paymentMethod,
    referenceCode,
    notes,
    userId,
    receiptUrl,
    receiptUrls,
    receiptFilename,
  } = params;

  if (amount <= 0) {
    throw Object.assign(new Error("invalid_amount"), { code: "invalid_amount" });
  }

  if (!concept || !concept.trim()) {
    throw Object.assign(new Error("concept_required"), { code: "concept_required" });
  }

  if (!payerName || !payerName.trim()) {
    throw Object.assign(new Error("payer_required"), { code: "payer_required" });
  }

  if (!paymentMethod || !paymentMethod.trim()) {
    throw Object.assign(new Error("payment_method_required"), { code: "payment_method_required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validar sede
    const { rows: whRows } = await client.query<{ code: string; name: string }>(
      `SELECT code, name FROM warehouses WHERE id = $1::uuid`,
      [warehouseId]
    );

    if (!whRows[0]) {
      throw Object.assign(new Error("warehouse_not_found"), { code: "warehouse_not_found" });
    }

    const voucherNumber = await nextIncomeVoucherNumber(client, warehouseId);

    const finalUrls = (receiptUrls && receiptUrls.length > 0)
      ? receiptUrls
      : (receiptUrl ? [receiptUrl] : []);
    const primaryUrl = finalUrls[0] || receiptUrl || null;
    const jsonUrls = JSON.stringify(finalUrls);

    const validCategory = (["driver_refund", "scrap_sale", "operational_refund", "other"].includes(category)
      ? category
      : "other") as CashIncomeCategory;

    const { rows } = await client.query<{ id: string }>(
      `
      INSERT INTO cash_incomes (
        voucher_number, warehouse_id, category, concept, payer_name, payer_doc,
        payer_phone, amount, payment_method, reference_code, notes,
        created_by, receipt_url, receipt_filename, receipt_urls
      )
      VALUES (
        $1, $2::uuid, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12::uuid, $13, $14, $15::jsonb
      )
      RETURNING id::text
      `,
      [
        voucherNumber,
        warehouseId,
        validCategory,
        concept.trim(),
        payerName.trim(),
        payerDoc?.trim() || null,
        payerPhone?.trim() || null,
        amount,
        paymentMethod.trim().toLowerCase(),
        referenceCode?.trim() || null,
        notes?.trim() || null,
        userId || null,
        primaryUrl,
        receiptFilename || null,
        jsonUrls,
      ]
    );

    await client.query("COMMIT");

    const created = await getCashIncomeDetail(pool, rows[0]!.id);
    if (!created) throw new Error("income_creation_failed");
    return created;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Listar recibos de caja con filtros y paginación.
 */
export async function listCashIncomes(
  pool: pg.Pool,
  opts: {
    warehouseId?: string | null;
    allowedWarehouseIds?: string[] | null;
    paymentMethod?: string | null;
    category?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    search?: string | null;
    page?: number;
    limit?: number;
  }
): Promise<{
  items: CashIncomeItem[];
  total: number;
  page: number;
  limit: number;
  totalAmount: number;
  cashAmount: number;
  bankAmount: number;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let pIndex = 1;

  if (opts.warehouseId) {
    conditions.push(`ci.warehouse_id = $${pIndex++}::uuid`);
    params.push(opts.warehouseId);
  } else if (opts.allowedWarehouseIds && opts.allowedWarehouseIds.length > 0) {
    conditions.push(`ci.warehouse_id = ANY($${pIndex++}::uuid[])`);
    params.push(opts.allowedWarehouseIds);
  }

  if (opts.paymentMethod && opts.paymentMethod.trim()) {
    conditions.push(`LOWER(TRIM(ci.payment_method)) = LOWER(TRIM($${pIndex++}))`);
    params.push(opts.paymentMethod.trim());
  }

  if (opts.category && opts.category.trim()) {
    conditions.push(`ci.category = $${pIndex++}`);
    params.push(opts.category.trim());
  }

  if (opts.dateFrom) {
    conditions.push(`ci.created_at >= ($${pIndex++}::date)::timestamptz`);
    params.push(opts.dateFrom);
  }

  if (opts.dateTo) {
    conditions.push(`ci.created_at <= (($${pIndex++}::date + interval '1 day') - interval '1 millisecond')::timestamptz`);
    params.push(opts.dateTo);
  }

  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conditions.push(
      `(ci.voucher_number ILIKE $${pIndex} OR ci.concept ILIKE $${pIndex} OR ci.payer_name ILIKE $${pIndex} OR ci.payer_doc ILIKE $${pIndex} OR ci.reference_code ILIKE $${pIndex})`
    );
    params.push(s);
    pIndex++;
  }

  const whereClause = conditions.join(" AND ");

  // Totales
  const { rows: sumRows } = await pool.query<{
    count: string;
    total: string;
    cash_total: string;
    bank_total: string;
  }>(
    `
    SELECT
      COUNT(*)::text AS count,
      COALESCE(SUM(ci.amount), 0)::text AS total,
      COALESCE(SUM(CASE WHEN LOWER(TRIM(ci.payment_method)) = 'efectivo' THEN ci.amount ELSE 0 END), 0)::text AS cash_total,
      COALESCE(SUM(CASE WHEN LOWER(TRIM(ci.payment_method)) <> 'efectivo' THEN ci.amount ELSE 0 END), 0)::text AS bank_total
    FROM cash_incomes ci
    WHERE ${whereClause}
    `,
    params
  );

  const total = Number(sumRows[0]?.count ?? 0);
  const totalAmount = Number(sumRows[0]?.total ?? 0);
  const cashAmount = Number(sumRows[0]?.cash_total ?? 0);
  const bankAmount = Number(sumRows[0]?.bank_total ?? 0);

  // Consulta de registros
  const { rows } = await pool.query<any>(
    `
    SELECT
      ci.id,
      ci.voucher_number AS "voucherNumber",
      ci.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      ci.category,
      ci.concept,
      ci.payer_name AS "payerName",
      ci.payer_doc AS "payerDoc",
      ci.payer_phone AS "payerPhone",
      ci.amount::float AS "amount",
      ci.payment_method AS "paymentMethod",
      ci.reference_code AS "referenceCode",
      ci.receipt_url AS "receiptUrl",
      ci.receipt_filename AS "receiptFilename",
      ci.receipt_urls AS "receiptUrls",
      ci.notes,
      ci.created_by AS "createdBy",
      u.full_name AS "createdByName",
      ci.created_at AS "createdAt"
    FROM cash_incomes ci
    JOIN warehouses w ON w.id = ci.warehouse_id
    LEFT JOIN users u ON u.id = ci.created_by
    WHERE ${whereClause}
    ORDER BY ci.created_at DESC
    LIMIT $${pIndex++} OFFSET $${pIndex++}
    `,
    [...params, limit, offset]
  );

  const items: CashIncomeItem[] = rows.map((r: any) => ({
    id: r.id,
    voucherNumber: r.voucherNumber,
    warehouseId: r.warehouseId,
    warehouseCode: r.warehouseCode,
    warehouseName: r.warehouseName,
    category: r.category,
    concept: r.concept,
    payerName: r.payerName,
    payerDoc: r.payerDoc,
    payerPhone: r.payerPhone,
    amount: Number(r.amount),
    paymentMethod: r.paymentMethod,
    referenceCode: r.referenceCode,
    receiptUrl: r.receiptUrl,
    receiptUrls: parseReceiptUrls(r.receiptUrls, r.receiptUrl),
    receiptFilename: r.receiptFilename,
    notes: r.notes,
    createdBy: r.createdBy,
    createdByName: r.createdByName,
    createdAt: new Date(r.createdAt).toISOString(),
  }));

  return {
    items,
    total,
    page,
    limit,
    totalAmount,
    cashAmount,
    bankAmount,
  };
}

/**
 * Obtener detalle de un comprobante de ingreso por ID.
 */
export async function getCashIncomeDetail(
  pool: pg.Pool,
  id: string
): Promise<CashIncomeItem | null> {
  const { rows } = await pool.query<any>(
    `
    SELECT
      ci.id,
      ci.voucher_number AS "voucherNumber",
      ci.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      ci.category,
      ci.concept,
      ci.payer_name AS "payerName",
      ci.payer_doc AS "payerDoc",
      ci.payer_phone AS "payerPhone",
      ci.amount::float AS "amount",
      ci.payment_method AS "paymentMethod",
      ci.reference_code AS "referenceCode",
      ci.receipt_url AS "receiptUrl",
      ci.receipt_filename AS "receiptFilename",
      ci.receipt_urls AS "receiptUrls",
      ci.notes,
      ci.created_by AS "createdBy",
      u.full_name AS "createdByName",
      ci.created_at AS "createdAt"
    FROM cash_incomes ci
    JOIN warehouses w ON w.id = ci.warehouse_id
    LEFT JOIN users u ON u.id = ci.created_by
    WHERE ci.id = $1::uuid
    `,
    [id]
  );

  if (!rows[0]) return null;
  const r = rows[0];

  return {
    id: r.id,
    voucherNumber: r.voucherNumber,
    warehouseId: r.warehouseId,
    warehouseCode: r.warehouseCode,
    warehouseName: r.warehouseName,
    category: r.category,
    concept: r.concept,
    payerName: r.payerName,
    payerDoc: r.payerDoc,
    payerPhone: r.payerPhone,
    amount: Number(r.amount),
    paymentMethod: r.paymentMethod,
    referenceCode: r.referenceCode,
    receiptUrl: r.receiptUrl,
    receiptUrls: parseReceiptUrls(r.receiptUrls, r.receiptUrl),
    receiptFilename: r.receiptFilename,
    notes: r.notes,
    createdBy: r.createdBy,
    createdByName: r.createdByName,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}
