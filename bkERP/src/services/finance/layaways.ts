import type pg from "pg";

export type LayawayStatus = "active" | "completed" | "cancelled";

export interface LayawayItem {
  productId?: string;
  name: string;
  referenceCode?: string;
  quantity: number;
  unitPrice: number;
}

export interface LayawaySummaryItem {
  id: string;
  code: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  customerPhone: string | null;
  targetAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: LayawayStatus;
  items: LayawayItem[];
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  resultingDocumentId: string | null;
  createdByName: string | null;
}

export interface LayawayPaymentItem {
  id: string;
  layawayId: string;
  customerId: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  receiptNumber: string;
  paymentMethod: string;
  amount: number;
  receiptUrl?: string | null;
  receiptUrls?: string[];
  receiptFilename?: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface LayawayDetail extends LayawaySummaryItem {
  payments: LayawayPaymentItem[];
  customerCreditBalance: number;
}

/**
 * Consecutivo para apartado: SEP-{SEDE}-{NUM}
 */
export async function nextLayawayCode(
  client: pg.PoolClient,
  warehouseId: string
): Promise<string> {
  const { rows: wh } = await client.query<{ code: string }>(
    `SELECT code FROM warehouses WHERE id = $1::uuid`,
    [warehouseId]
  );
  const prefix = (wh[0]?.code ?? "S").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "S";
  const { rows: seq } = await client.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM layaways
    WHERE warehouse_id = $1::uuid
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `SEP-${prefix}-${num}`;
}

/**
 * Consecutivo para recibo de abono a plan separe: RAP-{SEDE}-{NUM}
 */
export async function nextLayawayReceiptNumber(
  client: pg.PoolClient,
  warehouseId: string
): Promise<string> {
  const { rows: wh } = await client.query<{ code: string }>(
    `SELECT code FROM warehouses WHERE id = $1::uuid`,
    [warehouseId]
  );
  const prefix = (wh[0]?.code ?? "S").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "S";
  const { rows: seq } = await client.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM layaway_payments
    WHERE warehouse_id = $1::uuid
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `RAP-${prefix}-${num}`;
}

/**
 * Crear un nuevo apartado / plan separe.
 */
export async function createLayaway(
  pool: pg.Pool,
  params: {
    warehouseId: string;
    customerId: string;
    targetAmount: number;
    initialPayment?: number;
    paymentMethod?: string;
    items?: LayawayItem[];
    expiryDate?: string | null;
    notes?: string | null;
    userId?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
): Promise<LayawayDetail> {
  const {
    warehouseId,
    customerId,
    targetAmount,
    initialPayment = 0,
    paymentMethod = "efectivo",
    items = [],
    expiryDate,
    notes,
    userId,
    receiptUrl,
    receiptUrls,
    receiptFilename,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const code = await nextLayawayCode(client, warehouseId);
    const initialPaid = Math.max(0, Number(initialPayment) || 0);

    // Si el abono inicial usa saldo_a_favor
    const cleanMethod = (paymentMethod || "efectivo").trim().toLowerCase();
    if (initialPaid > 0 && cleanMethod === "saldo_a_favor") {
      const { rows: custRows } = await client.query<{ credit_balance: string }>(
        `SELECT credit_balance::text FROM customers WHERE id = $1::uuid FOR UPDATE`,
        [customerId]
      );
      const curBal = Number(custRows[0]?.credit_balance ?? 0);
      if (curBal < initialPaid) {
        throw Object.assign(new Error("insufficient_credit_balance"), {
          code: "insufficient_credit_balance",
          available: curBal,
          requested: initialPaid,
        });
      }
      await client.query(
        `UPDATE customers SET credit_balance = credit_balance - $1 WHERE id = $2::uuid`,
        [initialPaid, customerId]
      );
    }

    const { rows: layRows } = await client.query<{ id: string }>(
      `
      INSERT INTO layaways (
        code, warehouse_id, customer_id, target_amount, paid_amount,
        status, items, expiry_date, notes, created_by
      )
      VALUES ($1, $2::uuid, $3::uuid, $4, $5, 'active', $6::jsonb, $7, $8, $9::uuid)
      RETURNING id::text
      `,
      [
        code,
        warehouseId,
        customerId,
        Math.max(0, targetAmount),
        initialPaid,
        JSON.stringify(items),
        expiryDate || null,
        notes?.trim() || null,
        userId || null,
      ]
    );

    const layawayId = layRows[0]!.id;

    if (initialPaid > 0) {
      const receiptNumber = await nextLayawayReceiptNumber(client, warehouseId);
      const finalUrls = (receiptUrls && receiptUrls.length > 0)
        ? receiptUrls
        : (receiptUrl ? [receiptUrl] : []);
      const primaryUrl = finalUrls[0] || receiptUrl || null;
      const jsonUrls = JSON.stringify(finalUrls);

      await client.query(
        `
        INSERT INTO layaway_payments (
          layaway_id, customer_id, warehouse_id, receipt_number,
          payment_method, amount, notes, created_by,
          receipt_url, receipt_filename, receipt_urls
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9, $10, $11::jsonb)
        `,
        [
          layawayId,
          customerId,
          warehouseId,
          receiptNumber,
          cleanMethod,
          initialPaid,
          "Abono inicial de apertura de apartado",
          userId || null,
          primaryUrl,
          receiptFilename?.trim() || null,
          jsonUrls,
        ]
      );
    }

    await client.query("COMMIT");

    const detail = await getLayawayDetail(pool, layawayId);
    if (!detail) throw new Error("layaway_creation_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Consulta listado de apartados con filtros y totales.
 */
export async function listLayaways(
  pool: pg.Pool,
  opts: {
    warehouseId?: string | null;
    status?: "all" | "active" | "completed" | "cancelled";
    customerId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    query?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<{
  items: LayawaySummaryItem[];
  total: number;
  summary: {
    activeCount: number;
    totalTarget: number;
    totalCollected: number;
    totalRemaining: number;
  };
}> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];

  if (opts.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`l.warehouse_id = $${params.length}::uuid`);
  }

  if (opts.customerId) {
    params.push(opts.customerId);
    conditions.push(`l.customer_id = $${params.length}::uuid`);
  }

  if (opts.status && opts.status !== "all") {
    params.push(opts.status);
    conditions.push(`l.status = $${params.length}`);
  }

  if (opts.dateFrom) {
    params.push(opts.dateFrom);
    conditions.push(`l.created_at::date >= $${params.length}::date`);
  }

  if (opts.dateTo) {
    params.push(opts.dateTo);
    conditions.push(`l.created_at::date <= $${params.length}::date`);
  }

  if (opts.query?.trim()) {
    params.push(`%${opts.query.trim()}%`);
    const idx = params.length;
    conditions.push(`(
      l.code ILIKE $${idx}
      OR c.display_name ILIKE $${idx}
      OR c.tax_id ILIKE $${idx}
      OR c.phone ILIKE $${idx}
    )`);
  }

  const whereSql = conditions.join(" AND ");

  // Totales
  const summarySql = `
    SELECT
      COUNT(*)::text AS total_count,
      COUNT(*) FILTER (WHERE l.status = 'active')::text AS active_count,
      COALESCE(SUM(l.target_amount) FILTER (WHERE l.status = 'active'), 0)::text AS total_target,
      COALESCE(SUM(l.paid_amount) FILTER (WHERE l.status = 'active'), 0)::text AS total_collected
    FROM layaways l
    JOIN customers c ON c.id = l.customer_id
    WHERE ${whereSql}
  `;

  const { rows: sumRows } = await pool.query<{
    total_count: string;
    active_count: string;
    total_target: string;
    total_collected: string;
  }>(summarySql, params);

  const total = Number(sumRows[0]?.total_count ?? 0);
  const activeCount = Number(sumRows[0]?.active_count ?? 0);
  const totalTarget = Number(sumRows[0]?.total_target ?? 0);
  const totalCollected = Number(sumRows[0]?.total_collected ?? 0);
  const totalRemaining = Math.max(0, totalTarget - totalCollected);

  // Lista paginada
  const listParams = [...params, limit, offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;

  const listSql = `
    SELECT
      l.id::text,
      l.code,
      l.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      l.customer_id::text AS "customerId",
      c.display_name AS "customerName",
      c.tax_id AS "customerTaxId",
      c.phone AS "customerPhone",
      l.target_amount::float AS "targetAmount",
      l.paid_amount::float AS "paidAmount",
      GREATEST(0, (l.target_amount - l.paid_amount))::float AS "remainingAmount",
      l.status,
      l.items,
      l.expiry_date::text AS "expiryDate",
      l.notes,
      l.created_at AS "createdAt",
      l.completed_at AS "completedAt",
      l.resulting_document_id::text AS "resultingDocumentId",
      u.full_name AS "createdByName"
    FROM layaways l
    JOIN customers c ON c.id = l.customer_id
    JOIN warehouses w ON w.id = l.warehouse_id
    LEFT JOIN users u ON u.id = l.created_by
    WHERE ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows: items } = await pool.query<LayawaySummaryItem>(listSql, listParams);

  return {
    items,
    total,
    summary: {
      activeCount,
      totalTarget,
      totalCollected,
      totalRemaining,
    },
  };
}

/**
 * Consulta detalle de un apartado, sus abonos y saldo a favor del cliente.
 */
export async function getLayawayDetail(
  pool: pg.Pool,
  id: string
): Promise<LayawayDetail | null> {
  const { rows } = await pool.query<LayawaySummaryItem & { customerCreditBalance: number }>(
    `
    SELECT
      l.id::text,
      l.code,
      l.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      l.customer_id::text AS "customerId",
      c.display_name AS "customerName",
      c.tax_id AS "customerTaxId",
      c.phone AS "customerPhone",
      COALESCE(c.credit_balance, 0)::float AS "customerCreditBalance",
      l.target_amount::float AS "targetAmount",
      l.paid_amount::float AS "paidAmount",
      GREATEST(0, (l.target_amount - l.paid_amount))::float AS "remainingAmount",
      l.status,
      l.items,
      l.expiry_date::text AS "expiryDate",
      l.notes,
      l.created_at AS "createdAt",
      l.completed_at AS "completedAt",
      l.resulting_document_id::text AS "resultingDocumentId",
      u.full_name AS "createdByName"
    FROM layaways l
    JOIN customers c ON c.id = l.customer_id
    JOIN warehouses w ON w.id = l.warehouse_id
    LEFT JOIN users u ON u.id = l.created_by
    WHERE l.id = $1::uuid
    `,
    [id]
  );

  if (rows.length === 0) return null;
  const item = rows[0]!;

  const { rows: payments } = await pool.query<LayawayPaymentItem>(
    `
    SELECT
      lp.id::text,
      lp.layaway_id::text AS "layawayId",
      lp.customer_id::text AS "customerId",
      lp.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      lp.receipt_number AS "receiptNumber",
      lp.payment_method AS "paymentMethod",
      lp.amount::float,
      lp.receipt_url AS "receiptUrl",
      lp.receipt_filename AS "receiptFilename",
      COALESCE(lp.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      lp.notes,
      lp.created_at AS "createdAt",
      u.full_name AS "createdByName"
    FROM layaway_payments lp
    JOIN warehouses w ON w.id = lp.warehouse_id
    LEFT JOIN users u ON u.id = lp.created_by
    WHERE lp.layaway_id = $1::uuid
    ORDER BY lp.created_at ASC
    `,
    [id]
  );

  return {
    ...item,
    customerCreditBalance: Number(item.customerCreditBalance ?? 0),
    payments,
  };
}

/**
 * Registra un abono posterior a un apartado.
 */
export async function addLayawayPayment(
  pool: pg.Pool,
  params: {
    layawayId: string;
    warehouseId: string;
    paymentMethod: string;
    amount: number;
    notes?: string | null;
    userId?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
): Promise<{
  payment: LayawayPaymentItem;
  newPaidAmount: number;
  newRemainingAmount: number;
  customerCreditBalance: number;
}> {
  const {
    layawayId,
    warehouseId,
    paymentMethod,
    amount,
    notes,
    userId,
    receiptUrl,
    receiptUrls,
    receiptFilename,
  } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error("invalid_payment_amount"), { code: "invalid_payment_amount" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: lRows } = await client.query<{
      id: string;
      customer_id: string;
      target_amount: string;
      paid_amount: string;
      status: string;
    }>(
      `SELECT id::text, customer_id::text, target_amount::text, paid_amount::text, status
       FROM layaways WHERE id = $1::uuid FOR UPDATE`,
      [layawayId]
    );

    if (lRows.length === 0) {
      throw Object.assign(new Error("layaway_not_found"), { code: "layaway_not_found" });
    }

    const layaway = lRows[0]!;
    if (layaway.status !== "active") {
      throw Object.assign(new Error("layaway_not_active"), { code: "layaway_not_active" });
    }

    const customerId = layaway.customer_id;
    const cleanMethod = paymentMethod.trim().toLowerCase();
    const cleanAmount = Math.round(Number(amount) * 100) / 100;

    // Si usa saldo a favor
    if (cleanMethod === "saldo_a_favor") {
      const { rows: cRows } = await client.query<{ credit_balance: string }>(
        `SELECT credit_balance::text FROM customers WHERE id = $1::uuid FOR UPDATE`,
        [customerId]
      );
      const custBal = Number(cRows[0]?.credit_balance ?? 0);
      if (custBal + 0.001 < cleanAmount) {
        throw Object.assign(new Error("insufficient_credit_balance"), {
          code: "insufficient_credit_balance",
          available: custBal,
          requested: cleanAmount,
        });
      }
      await client.query(
        `UPDATE customers SET credit_balance = GREATEST(0, ROUND((credit_balance - $1)::numeric, 2)) WHERE id = $2::uuid`,
        [cleanAmount, customerId]
      );
    }

    const newPaid = Math.round((Number(layaway.paid_amount) + cleanAmount) * 100) / 100;
    const newRemaining = Math.max(0, Math.round((Number(layaway.target_amount) - newPaid) * 100) / 100);

    await client.query(
      `UPDATE layaways SET paid_amount = $1 WHERE id = $2::uuid`,
      [newPaid, layawayId]
    );

    const receiptNumber = await nextLayawayReceiptNumber(client, warehouseId);

    const finalUrls = (receiptUrls && receiptUrls.length > 0)
      ? receiptUrls
      : (receiptUrl ? [receiptUrl] : []);
    const primaryUrl = finalUrls[0] || receiptUrl || null;
    const jsonUrls = JSON.stringify(finalUrls);

    const { rows: payRows } = await client.query<LayawayPaymentItem>(
      `
      INSERT INTO layaway_payments (
        layaway_id, customer_id, warehouse_id, receipt_number,
        payment_method, amount, notes, created_by,
        receipt_url, receipt_filename, receipt_urls
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9, $10, $11::jsonb)
      RETURNING
        id::text,
        layaway_id::text AS "layawayId",
        customer_id::text AS "customerId",
        warehouse_id::text AS "warehouseId",
        receipt_number AS "receiptNumber",
        payment_method AS "paymentMethod",
        amount::float,
        receipt_url AS "receiptUrl",
        receipt_filename AS "receiptFilename",
        receipt_urls AS "receiptUrls",
        notes,
        created_at AS "createdAt"
      `,
      [
        layawayId,
        customerId,
        warehouseId,
        receiptNumber,
        cleanMethod,
        cleanAmount,
        notes?.trim() || null,
        userId || null,
        primaryUrl,
        receiptFilename?.trim() || null,
        jsonUrls,
      ]
    );

    const paymentId = payRows[0]!.id;

    const { rows: fullPayRows } = await client.query<LayawayPaymentItem>(
      `
      SELECT
        lp.id::text,
        lp.layaway_id::text AS "layawayId",
        lp.customer_id::text AS "customerId",
        lp.warehouse_id::text AS "warehouseId",
        w.code AS "warehouseCode",
        w.name AS "warehouseName",
        lp.receipt_number AS "receiptNumber",
        lp.payment_method AS "paymentMethod",
        lp.amount::float,
        lp.receipt_url AS "receiptUrl",
        lp.receipt_filename AS "receiptFilename",
        COALESCE(lp.receipt_urls, '[]'::jsonb) AS "receiptUrls",
        lp.notes,
        lp.created_at AS "createdAt",
        u.full_name AS "createdByName"
      FROM layaway_payments lp
      JOIN warehouses w ON w.id = lp.warehouse_id
      LEFT JOIN users u ON u.id = lp.created_by
      WHERE lp.id = $1::uuid
      `,
      [paymentId]
    );

    const { rows: custFinal } = await client.query<{ credit_balance: string }>(
      `SELECT credit_balance::text FROM customers WHERE id = $1::uuid`,
      [customerId]
    );

    await client.query("COMMIT");

    return {
      payment: fullPayRows[0] ?? payRows[0]!,
      newPaidAmount: newPaid,
      newRemainingAmount: newRemaining,
      customerCreditBalance: Number(custFinal[0]?.credit_balance ?? 0),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Consulta el apartado activo que tenga un cliente con fondos acumulados (para usar en el POS).
 */
export async function getActiveLayawayForCustomer(
  pool: pg.Pool,
  customerId: string
): Promise<LayawaySummaryItem | null> {
  const { rows } = await pool.query<LayawaySummaryItem>(
    `
    SELECT
      l.id::text,
      l.code,
      l.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      l.customer_id::text AS "customerId",
      c.display_name AS "customerName",
      c.tax_id AS "customerTaxId",
      c.phone AS "customerPhone",
      l.target_amount::float AS "targetAmount",
      l.paid_amount::float AS "paidAmount",
      GREATEST(0, (l.target_amount - l.paid_amount))::float AS "remainingAmount",
      l.status,
      l.items,
      l.expiry_date::text AS "expiryDate",
      l.notes,
      l.created_at AS "createdAt",
      l.completed_at AS "completedAt",
      l.resulting_document_id::text AS "resultingDocumentId",
      u.full_name AS "createdByName"
    FROM layaways l
    JOIN customers c ON c.id = l.customer_id
    JOIN warehouses w ON w.id = l.warehouse_id
    LEFT JOIN users u ON u.id = l.created_by
    WHERE l.customer_id = $1::uuid
      AND l.status = 'active'
      AND l.paid_amount > 0
    ORDER BY l.created_at DESC
    LIMIT 1
    `,
    [customerId]
  );

  return rows[0] ?? null;
}

/**
 * Redime el apartado al momento de confirmar la venta definitiva.
 * Si el cliente abonó más del total de la venta, el sobrante pasa a Saldo a Favor.
 */
export async function redeemLayawayInSale(
  client: pg.PoolClient,
  params: {
    layawayId: string;
    documentId: string;
    saleTotal: number;
    customerId: string;
  }
): Promise<{ usedFromLayaway: number; excessToFavour: number }> {
  const { layawayId, documentId, saleTotal, customerId } = params;

  const { rows: lRows } = await client.query<{ paid_amount: string; status: string }>(
    `SELECT paid_amount::text, status FROM layaways WHERE id = $1::uuid FOR UPDATE`,
    [layawayId]
  );

  if (lRows.length === 0) {
    throw Object.assign(new Error("layaway_not_found"), { code: "layaway_not_found" });
  }

  const layaway = lRows[0]!;
  if (layaway.status !== "active") {
    throw Object.assign(new Error("layaway_not_active"), { code: "layaway_not_active" });
  }

  const layawayPaid = Number(layaway.paid_amount);
  const usedFromLayaway = Math.min(layawayPaid, saleTotal);
  const excessToFavour = Math.max(0, Math.round((layawayPaid - saleTotal) * 100) / 100);

  // Marcar como completado
  await client.query(
    `
    UPDATE layaways
    SET status = 'completed',
        completed_at = now(),
        resulting_document_id = $1::uuid
    WHERE id = $2::uuid
    `,
    [documentId, layawayId]
  );

  // Si sobró dinero, acreditar al saldo a favor del cliente
  if (excessToFavour > 0) {
    await client.query(
      `UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2::uuid`,
      [excessToFavour, customerId]
    );
  }

  return { usedFromLayaway, excessToFavour };
}

/**
 * Cancelar un apartado (permite retornar el dinero a saldo a favor o anularlo).
 */
export async function cancelLayaway(
  pool: pg.Pool,
  id: string,
  opts?: { refundToCreditBalance?: boolean; notes?: string }
): Promise<{ success: boolean; refundedAmount: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ customer_id: string; paid_amount: string; status: string }>(
      `SELECT customer_id::text, paid_amount::text, status FROM layaways WHERE id = $1::uuid FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) throw new Error("layaway_not_found");
    const l = rows[0]!;
    if (l.status !== "active") throw new Error("layaway_not_active");

    const paid = Number(l.paid_amount);
    let refunded = 0;

    if (opts?.refundToCreditBalance && paid > 0) {
      await client.query(
        `UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2::uuid`,
        [paid, l.customer_id]
      );
      refunded = paid;
    }

    await client.query(
      `UPDATE layaways SET status = 'cancelled', notes = COALESCE(notes, '') || ' [Cancelado]' WHERE id = $1::uuid`,
      [id]
    );

    await client.query("COMMIT");
    return { success: true, refundedAmount: refunded };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
