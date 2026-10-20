import type pg from "pg";
import { getTodayBogotaYmd } from "../../lib/date-utils.js";

export type ReceivableStatus = "open" | "partial" | "paid" | "cancelled";

export type PaymentMethod =
  | "efectivo"
  | "davivienda"
  | "bancolombia"
  | "bold"
  | "addi"
  | "nequi"
  | "daviplata"
  | "sistecredito"
  | "saldo_a_favor"
  | "otro";

export interface ReceivableSummaryItem {
  id: string;
  documentId: string | null;
  invoiceNumber: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  customerPhone: string | null;
  totalAmount: number;
  initialPayment: number;
  paidAmount: number;
  balanceAmount: number;
  status: ReceivableStatus;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
  createdByName: string | null;
}

export interface ReceivablePaymentItem {
  id: string;
  receivableId: string;
  customerId: string;
  customerName?: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  receiptNumber: string;
  invoiceNumber?: string;
  paymentMethod: string;
  amount: number;
  appliedToDebt: number;
  excessToFavour: number;
  receiptUrl?: string | null;
  receiptUrls?: string[];
  receiptFilename?: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface ReceivableDetail extends ReceivableSummaryItem {
  payments: ReceivablePaymentItem[];
  customerCreditBalance: number;
  documentLines?: {
    productName: string;
    referenceCode: string;
    quantity: number;
    unitSalePrice: number;
  }[];
}

export interface CustomerCreditProfile {
  customer: {
    id: string;
    displayName: string;
    taxId: string | null;
    phone: string | null;
    address: string | null;
    creditBalance: number;
  };
  stats: {
    totalCreditsCount: number;
    activeCreditsCount: number;
    totalAmountBorrowed: number;
    totalAmountPaid: number;
    totalCurrentDebt: number;
  };
  receivables: ReceivableSummaryItem[];
  recentPayments: ReceivablePaymentItem[];
}

export interface PaymentBreakdownInput {
  method: string;
  amount: number;
}

/**
 * Consecutivo de recibo de caja / abono: RC-{SEDE}-{NUM}
 */
export async function nextReceiptNumber(
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
    FROM receivable_payments
    WHERE warehouse_id = $1::uuid
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `RC-${prefix}-${num}`;
}

/**
 * Registra el crédito y los abonos iniciales durante la confirmación de una salida tipo 'credit'.
 */
export async function recordCreditFromExitDocument(
  client: pg.PoolClient,
  params: {
    documentId: string;
    invoiceNumber: string;
    warehouseId: string;
    customerId: string;
    totalAmount: number;
    initialPayments?: PaymentBreakdownInput[] | null;
    notes?: string | null;
    userId?: string | null;
  }
): Promise<{ receivableId: string; balanceAmount: number }> {
  const {
    documentId,
    invoiceNumber,
    warehouseId,
    customerId,
    totalAmount,
    initialPayments,
    notes,
    userId,
  } = params;

  let initialPaidTotal = 0;
  if (initialPayments && initialPayments.length > 0) {
    for (const p of initialPayments) {
      if (p.method === "saldo_a_favor") {
        // Descontar del saldo a favor del cliente
        const { rows: custRows } = await client.query<{ credit_balance: string }>(
          `SELECT credit_balance::text FROM customers WHERE id = $1::uuid FOR UPDATE`,
          [customerId]
        );
        const currentBalance = Number(custRows[0]?.credit_balance ?? 0);
        if (currentBalance < p.amount) {
          throw Object.assign(new Error("insufficient_credit_balance"), {
            code: "insufficient_credit_balance",
            available: currentBalance,
            requested: p.amount,
          });
        }
        await client.query(
          `UPDATE customers SET credit_balance = credit_balance - $1 WHERE id = $2::uuid`,
          [p.amount, customerId]
        );
      }
      initialPaidTotal += Number(p.amount) || 0;
    }
  }

  const balanceAmount = Math.max(0, Math.round((totalAmount - initialPaidTotal) * 100) / 100);
  const status: ReceivableStatus =
    balanceAmount === 0 ? "paid" : initialPaidTotal > 0 ? "partial" : "open";
  const paidAt = balanceAmount === 0 ? new Date() : null;

  const { rows: arRows } = await client.query<{ id: string }>(
    `
    INSERT INTO accounts_receivable (
      document_id, invoice_number, warehouse_id, customer_id,
      total_amount, initial_payment, paid_amount, balance_amount,
      status, notes, created_by, paid_at
    )
    VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11::uuid, $12)
    RETURNING id::text
    `,
    [
      documentId,
      invoiceNumber,
      warehouseId,
      customerId,
      totalAmount,
      initialPaidTotal,
      initialPaidTotal,
      balanceAmount,
      status,
      notes?.trim() || null,
      userId || null,
      paidAt,
    ]
  );

  const receivableId = arRows[0]!.id;

  // Registrar cada pago inicial en receivable_payments
  if (initialPayments && initialPayments.length > 0) {
    for (const p of initialPayments) {
      const receiptNo = await nextReceiptNumber(client, warehouseId);
      await client.query(
        `
        INSERT INTO receivable_payments (
          receivable_id, customer_id, warehouse_id, receipt_number,
          payment_method, amount, applied_to_debt, excess_to_favour,
          notes, created_by
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, 0, $8, $9::uuid)
        `,
        [
          receivableId,
          customerId,
          warehouseId,
          receiptNo,
          p.method.trim().toLowerCase(),
          p.amount,
          p.amount,
          "Abono inicial en venta a crédito",
          userId || null,
        ]
      );
    }
  }

  return { receivableId, balanceAmount };
}

/**
 * Consulta la lista de cuentas por cobrar con filtros y totales.
 */
export async function listAccountsReceivable(
  pool: pg.Pool,
  opts: {
    warehouseId?: string | null;
    status?: "all" | "pending" | "open" | "partial" | "paid" | "cancelled";
    customerId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    query?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<{
  items: ReceivableSummaryItem[];
  total: number;
  summary: {
    totalAmount: number;
    totalPaid: number;
    totalBalance: number;
    countPending: number;
    countPaid: number;
  };
}> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];

  if (opts.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`ar.warehouse_id = $${params.length}::uuid`);
  }

  if (opts.customerId) {
    params.push(opts.customerId);
    conditions.push(`ar.customer_id = $${params.length}::uuid`);
  }

  if (opts.status && opts.status !== "all") {
    if (opts.status === "pending") {
      conditions.push(`ar.status IN ('open', 'partial')`);
    } else {
      params.push(opts.status);
      conditions.push(`ar.status = $${params.length}`);
    }
  }

  if (opts.dateFrom) {
    params.push(opts.dateFrom);
    conditions.push(`ar.created_at::date >= $${params.length}::date`);
  }

  if (opts.dateTo) {
    params.push(opts.dateTo);
    conditions.push(`ar.created_at::date <= $${params.length}::date`);
  }

  if (opts.query?.trim()) {
    params.push(`%${opts.query.trim()}%`);
    const idx = params.length;
    conditions.push(`(
      ar.invoice_number ILIKE $${idx}
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
      COALESCE(SUM(ar.total_amount), 0)::text AS total_amount,
      COALESCE(SUM(ar.paid_amount), 0)::text AS total_paid,
      COALESCE(SUM(ar.balance_amount), 0)::text AS total_balance,
      COUNT(*) FILTER (WHERE ar.status IN ('open', 'partial'))::text AS count_pending,
      COUNT(*) FILTER (WHERE ar.status = 'paid')::text AS count_paid
    FROM accounts_receivable ar
    JOIN customers c ON c.id = ar.customer_id
    WHERE ${whereSql}
  `;

  const { rows: sumRows } = await pool.query<{
    total_count: string;
    total_amount: string;
    total_paid: string;
    total_balance: string;
    count_pending: string;
    count_paid: string;
  }>(summarySql, params);

  const total = Number(sumRows[0]?.total_count ?? 0);
  const summary = {
    totalAmount: Number(sumRows[0]?.total_amount ?? 0),
    totalPaid: Number(sumRows[0]?.total_paid ?? 0),
    totalBalance: Number(sumRows[0]?.total_balance ?? 0),
    countPending: Number(sumRows[0]?.count_pending ?? 0),
    countPaid: Number(sumRows[0]?.count_paid ?? 0),
  };

  // Lista paginada
  const listParams = [...params, limit, offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;

  const listSql = `
    SELECT
      ar.id::text,
      ar.document_id::text AS "documentId",
      ar.invoice_number AS "invoiceNumber",
      ar.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      ar.customer_id::text AS "customerId",
      c.display_name AS "customerName",
      c.tax_id AS "customerTaxId",
      c.phone AS "customerPhone",
      ar.total_amount::float AS "totalAmount",
      ar.initial_payment::float AS "initialPayment",
      ar.paid_amount::float AS "paidAmount",
      ar.balance_amount::float AS "balanceAmount",
      ar.status,
      ar.due_date::text AS "dueDate",
      ar.notes,
      ar.created_at AS "createdAt",
      ar.paid_at AS "paidAt",
      u.full_name AS "createdByName"
    FROM accounts_receivable ar
    JOIN customers c ON c.id = ar.customer_id
    JOIN warehouses w ON w.id = ar.warehouse_id
    LEFT JOIN users u ON u.id = ar.created_by
    WHERE ${whereSql}
    ORDER BY ar.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows: items } = await pool.query<ReceivableSummaryItem>(listSql, listParams);

  return { items, total, summary };
}

/**
 * Consulta el detalle completo de un crédito, sus abonos y las líneas de la venta.
 */
export async function getReceivableDetail(
  pool: pg.Pool,
  id: string
): Promise<ReceivableDetail | null> {
  const { rows } = await pool.query<ReceivableSummaryItem & { customerCreditBalance: number }>(
    `
    SELECT
      ar.id::text,
      ar.document_id::text AS "documentId",
      ar.invoice_number AS "invoiceNumber",
      ar.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      ar.customer_id::text AS "customerId",
      c.display_name AS "customerName",
      c.tax_id AS "customerTaxId",
      c.phone AS "customerPhone",
      COALESCE(c.credit_balance, 0)::float AS "customerCreditBalance",
      ar.total_amount::float AS "totalAmount",
      ar.initial_payment::float AS "initialPayment",
      ar.paid_amount::float AS "paidAmount",
      ar.balance_amount::float AS "balanceAmount",
      ar.status,
      ar.due_date::text AS "dueDate",
      ar.notes,
      ar.created_at AS "createdAt",
      ar.paid_at AS "paidAt",
      u.full_name AS "createdByName"
    FROM accounts_receivable ar
    JOIN customers c ON c.id = ar.customer_id
    JOIN warehouses w ON w.id = ar.warehouse_id
    LEFT JOIN users u ON u.id = ar.created_by
    WHERE ar.id = $1::uuid
    `,
    [id]
  );

  if (rows.length === 0) return null;
  const item = rows[0]!;

  // Pagos / Abonos
  const { rows: payments } = await pool.query<ReceivablePaymentItem>(
    `
    SELECT
      rp.id::text,
      rp.receivable_id::text AS "receivableId",
      rp.customer_id::text AS "customerId",
      rp.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      rp.receipt_number AS "receiptNumber",
      rp.payment_method AS "paymentMethod",
      rp.amount::float,
      rp.applied_to_debt::float AS "appliedToDebt",
      rp.excess_to_favour::float AS "excessToFavour",
      rp.receipt_url AS "receiptUrl",
      rp.receipt_filename AS "receiptFilename",
      COALESCE(rp.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      rp.notes,
      rp.created_at AS "createdAt",
      u.full_name AS "createdByName"
    FROM receivable_payments rp
    JOIN warehouses w ON w.id = rp.warehouse_id
    LEFT JOIN users u ON u.id = rp.created_by
    WHERE rp.receivable_id = $1::uuid
    ORDER BY rp.created_at ASC
    `,
    [id]
  );

  // Líneas del documento
  let documentLines: ReceivableDetail["documentLines"] = [];
  if (item.documentId) {
    const { rows: lineRows } = await pool.query<{
      name: string;
      reference_code: string;
      quantity: string;
      unit_sale_price: string;
    }>(
      `
      SELECT
        p.name,
        p.reference_code,
        idl.quantity::text,
        COALESCE(idl.unit_sale_price, 0)::text AS unit_sale_price
      FROM inventory_document_lines idl
      JOIN products p ON p.id = idl.product_id
      WHERE idl.document_id = $1::uuid
      `,
      [item.documentId]
    );
    documentLines = lineRows.map((l) => ({
      productName: l.name,
      referenceCode: l.reference_code,
      quantity: Number(l.quantity),
      unitSalePrice: Number(l.unit_sale_price),
    }));
  }

  return {
    ...item,
    customerCreditBalance: Number(item.customerCreditBalance ?? 0),
    payments,
    documentLines,
  };
}

/**
 * Registra un abono a un crédito.
 * Si el monto excede el saldo pendiente, el sobrante se asigna a saldo a favor del cliente.
 */
export async function addReceivablePayment(
  pool: pg.Pool,
  params: {
    receivableId: string;
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
  payment: ReceivablePaymentItem;
  appliedToDebt: number;
  excessToFavour: number;
  newBalanceAmount: number;
  newStatus: ReceivableStatus;
  customerCreditBalance: number;
}> {
  const {
    receivableId,
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

    const { rows: arRows } = await client.query<{
      id: string;
      customer_id: string;
      balance_amount: string;
      paid_amount: string;
      status: string;
      invoice_number: string;
    }>(
      `
      SELECT id::text, customer_id::text, balance_amount::text, paid_amount::text, status, invoice_number
      FROM accounts_receivable
      WHERE id = $1::uuid
      FOR UPDATE
      `,
      [receivableId]
    );

    if (arRows.length === 0) {
      throw Object.assign(new Error("receivable_not_found"), { code: "receivable_not_found" });
    }

    const ar = arRows[0]!;
    if (ar.status === "cancelled") {
      throw Object.assign(new Error("receivable_is_cancelled"), { code: "receivable_is_cancelled" });
    }

    const currentBalance = Number(ar.balance_amount);
    const customerId = ar.customer_id;
    const cleanMethod = paymentMethod.trim().toLowerCase();

    // Si paga con saldo a favor
    if (cleanMethod === "saldo_a_favor") {
      const { rows: cRows } = await client.query<{ credit_balance: string }>(
        `SELECT credit_balance::text FROM customers WHERE id = $1::uuid FOR UPDATE`,
        [customerId]
      );
      const custBalance = Number(cRows[0]?.credit_balance ?? 0);
      if (custBalance < amount) {
        throw Object.assign(new Error("insufficient_credit_balance"), {
          code: "insufficient_credit_balance",
          available: custBalance,
          requested: amount,
        });
      }
      await client.query(
        `UPDATE customers SET credit_balance = credit_balance - $1 WHERE id = $2::uuid`,
        [amount, customerId]
      );
    }

    // Amortización vs Excedente
    const appliedToDebt = Math.min(amount, currentBalance);
    const excessToFavour = Math.max(0, Math.round((amount - appliedToDebt) * 100) / 100);

    const newBalance = Math.max(0, Math.round((currentBalance - appliedToDebt) * 100) / 100);
    const newPaidAmount = Math.round((Number(ar.paid_amount) + appliedToDebt) * 100) / 100;
    const newStatus: ReceivableStatus = newBalance === 0 ? "paid" : "partial";
    const paidAt = newBalance === 0 ? new Date() : null;

    // Actualizar cuenta por cobrar
    await client.query(
      `
      UPDATE accounts_receivable
      SET balance_amount = $1,
          paid_amount = $2,
          status = $3,
          paid_at = COALESCE($4, paid_at)
      WHERE id = $5::uuid
      `,
      [newBalance, newPaidAmount, newStatus, paidAt, receivableId]
    );

    // Si hubo excedente, sumarlo al saldo a favor del cliente
    if (excessToFavour > 0 && cleanMethod !== "saldo_a_favor") {
      await client.query(
        `UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2::uuid`,
        [excessToFavour, customerId]
      );
    }

    // Generar recibo de caja
    const receiptNumber = await nextReceiptNumber(client, warehouseId);

    const finalUrls = (receiptUrls && receiptUrls.length > 0)
      ? receiptUrls
      : (receiptUrl ? [receiptUrl] : []);
    const primaryUrl = finalUrls[0] || receiptUrl || null;
    const jsonUrls = JSON.stringify(finalUrls);

    const { rows: payRows } = await client.query<ReceivablePaymentItem>(
      `
      INSERT INTO receivable_payments (
        receivable_id, customer_id, warehouse_id, receipt_number,
        payment_method, amount, applied_to_debt, excess_to_favour,
        notes, created_by, receipt_url, receipt_filename, receipt_urls
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::uuid, $11, $12, $13::jsonb)
      RETURNING
        id::text,
        receivable_id::text AS "receivableId",
        customer_id::text AS "customerId",
        warehouse_id::text AS "warehouseId",
        receipt_number AS "receiptNumber",
        payment_method AS "paymentMethod",
        amount::float,
        applied_to_debt::float AS "appliedToDebt",
        excess_to_favour::float AS "excessToFavour",
        receipt_url AS "receiptUrl",
        receipt_filename AS "receiptFilename",
        receipt_urls AS "receiptUrls",
        notes,
        created_at AS "createdAt"
      `,
      [
        receivableId,
        customerId,
        warehouseId,
        receiptNumber,
        cleanMethod,
        amount,
        appliedToDebt,
        excessToFavour,
        notes?.trim() || null,
        userId || null,
        primaryUrl,
        receiptFilename?.trim() || null,
        jsonUrls,
      ]
    );

    // Obtener nuevo saldo a favor del cliente
    const { rows: finalCust } = await client.query<{ credit_balance: string }>(
      `SELECT credit_balance::text FROM customers WHERE id = $1::uuid`,
      [customerId]
    );
    const finalCreditBalance = Number(finalCust[0]?.credit_balance ?? 0);

    await client.query("COMMIT");

    return {
      payment: payRows[0]!,
      appliedToDebt,
      excessToFavour,
      newBalanceAmount: newBalance,
      newStatus,
      customerCreditBalance: finalCreditBalance,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Consulta el estado de cuenta / ficha de crédito de un cliente.
 */
export async function getCustomerCreditProfile(
  pool: pg.Pool,
  customerId: string
): Promise<CustomerCreditProfile | null> {
  const { rows: custRows } = await pool.query<{
    id: string;
    display_name: string;
    tax_id: string | null;
    phone: string | null;
    address: string | null;
    credit_balance: string;
  }>(
    `
    SELECT
      id::text, display_name, tax_id, phone, address,
      COALESCE(credit_balance, 0)::text AS credit_balance
    FROM customers
    WHERE id = $1::uuid
    `,
    [customerId]
  );

  if (custRows.length === 0) return null;
  const c = custRows[0]!;

  const { rows: recRows } = await pool.query<ReceivableSummaryItem>(
    `
    SELECT
      ar.id::text,
      ar.document_id::text AS "documentId",
      ar.invoice_number AS "invoiceNumber",
      ar.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      ar.customer_id::text AS "customerId",
      $2 AS "customerName",
      $3 AS "customerTaxId",
      $4 AS "customerPhone",
      ar.total_amount::float AS "totalAmount",
      ar.initial_payment::float AS "initialPayment",
      ar.paid_amount::float AS "paidAmount",
      ar.balance_amount::float AS "balanceAmount",
      ar.status,
      ar.due_date::text AS "dueDate",
      ar.notes,
      ar.created_at AS "createdAt",
      ar.paid_at AS "paidAt",
      u.full_name AS "createdByName"
    FROM accounts_receivable ar
    JOIN warehouses w ON w.id = ar.warehouse_id
    LEFT JOIN users u ON u.id = ar.created_by
    WHERE ar.customer_id = $1::uuid
    ORDER BY ar.created_at DESC
    `,
    [customerId, c.display_name, c.tax_id, c.phone]
  );

  const { rows: payRows } = await pool.query<ReceivablePaymentItem>(
    `
    SELECT
      rp.id::text,
      rp.receivable_id::text AS "receivableId",
      rp.customer_id::text AS "customerId",
      rp.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      rp.receipt_number AS "receiptNumber",
      ar.invoice_number AS "invoiceNumber",
      rp.payment_method AS "paymentMethod",
      rp.amount::float,
      rp.applied_to_debt::float AS "appliedToDebt",
      rp.excess_to_favour::float AS "excessToFavour",
      rp.notes,
      rp.created_at AS "createdAt",
      u.full_name AS "createdByName"
    FROM receivable_payments rp
    JOIN accounts_receivable ar ON ar.id = rp.receivable_id
    JOIN warehouses w ON w.id = rp.warehouse_id
    LEFT JOIN users u ON u.id = rp.created_by
    WHERE rp.customer_id = $1::uuid
    ORDER BY rp.created_at DESC
    LIMIT 50
    `,
    [customerId]
  );

  const totalCreditsCount = recRows.length;
  const activeCreditsCount = recRows.filter((r) => r.status === "open" || r.status === "partial").length;
  const totalAmountBorrowed = recRows.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalAmountPaid = recRows.reduce((sum, r) => sum + r.paidAmount, 0);
  const totalCurrentDebt = recRows.reduce((sum, r) => sum + r.balanceAmount, 0);

  return {
    customer: {
      id: c.id,
      displayName: c.display_name,
      taxId: c.tax_id,
      phone: c.phone,
      address: c.address,
      creditBalance: Number(c.credit_balance),
    },
    stats: {
      totalCreditsCount,
      activeCreditsCount,
      totalAmountBorrowed,
      totalAmountPaid,
      totalCurrentDebt,
    },
    receivables: recRows,
    recentPayments: payRows,
  };
}

/**
 * Reporte consolidado de cartera y recaudos por sede.
 */
export async function getReceivablesByWarehouseReport(pool: pg.Pool): Promise<{
  warehouses: {
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    activeCreditsCount: number;
    totalBalance: number;
    collectedToday: number;
    collectedMonth: number;
  }[];
  totals: {
    activeCreditsCount: number;
    totalBalance: number;
    collectedToday: number;
    collectedMonth: number;
  };
}> {
  const { rows } = await pool.query<{
    warehouse_id: string;
    warehouse_code: string;
    warehouse_name: string;
    active_credits: string;
    total_balance: string;
    collected_today: string;
    collected_month: string;
  }>(`
    SELECT
      w.id::text AS warehouse_id,
      w.code AS warehouse_code,
      w.name AS warehouse_name,
      COUNT(ar.id) FILTER (WHERE ar.status IN ('open', 'partial'))::text AS active_credits,
      COALESCE(SUM(ar.balance_amount) FILTER (WHERE ar.status IN ('open', 'partial')), 0)::text AS total_balance,
      COALESCE(
        (SELECT SUM(rp.amount)
         FROM receivable_payments rp
         WHERE rp.warehouse_id = w.id
           AND rp.created_at::date = CURRENT_DATE),
        0
      )::text AS collected_today,
      COALESCE(
        (SELECT SUM(rp.amount)
         FROM receivable_payments rp
         WHERE rp.warehouse_id = w.id
           AND date_trunc('month', rp.created_at) = date_trunc('month', CURRENT_DATE)),
        0
      )::text AS collected_month
    FROM warehouses w
    LEFT JOIN accounts_receivable ar ON ar.warehouse_id = w.id
    WHERE w.is_active = true
    GROUP BY w.id, w.code, w.name
    ORDER BY w.name
  `);

  const list = rows.map((r) => ({
    warehouseId: r.warehouse_id,
    warehouseCode: r.warehouse_code,
    warehouseName: r.warehouse_name,
    activeCreditsCount: Number(r.active_credits),
    totalBalance: Number(r.total_balance),
    collectedToday: Number(r.collected_today),
    collectedMonth: Number(r.collected_month),
  }));

  const totals = list.reduce(
    (acc, cur) => ({
      activeCreditsCount: acc.activeCreditsCount + cur.activeCreditsCount,
      totalBalance: acc.totalBalance + cur.totalBalance,
      collectedToday: acc.collectedToday + cur.collectedToday,
      collectedMonth: acc.collectedMonth + cur.collectedMonth,
    }),
    { activeCreditsCount: 0, totalBalance: 0, collectedToday: 0, collectedMonth: 0 }
  );

  return { warehouses: list, totals };
}

/**
 * Resumen de ingresos por método de pago (ventas directas + abonos de créditos).
 */
export async function getPaymentsCashSummary(
  pool: pg.Pool,
  opts: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
): Promise<{
  dateFrom: string;
  dateTo: string;
  warehouseId: string | null;
  totalCollected: number;
  cashCollected: number;
  cashPayrollAmount: number;
  cashOutflowsAmount: number;
  netCashInDrawer: number;
  methods: {
    method: string;
    label: string;
    salesAmount: number;
    creditsAmount: number;
    totalAmount: number;
    transactionCount: number;
  }[];
}> {
  const params: unknown[] = [];
  const whDocFilter = opts.warehouseId
    ? `AND d.warehouse_id = $${params.push(opts.warehouseId)}::uuid`
    : "";
  const whRpFilter = opts.warehouseId
    ? `AND rp.warehouse_id = $${params.length}::uuid`
    : "";

  let dateDocFilter = "";
  let dateRpFilter = "";

  if (opts.dateFrom) {
    const idx = params.push(opts.dateFrom);
    dateDocFilter += ` AND COALESCE(d.completed_at, d.created_at)::date >= $${idx}::date`;
    dateRpFilter += ` AND rp.created_at::date >= $${idx}::date`;
  }
  if (opts.dateTo) {
    const idx = params.push(opts.dateTo);
    dateDocFilter += ` AND COALESCE(d.completed_at, d.created_at)::date <= $${idx}::date`;
    dateRpFilter += ` AND rp.created_at::date <= $${idx}::date`;
  }

  // 1. Desglose desde documentos de salida completados (ventas)
  // metadata->'paymentBreakdown' es un array de { method, amount }
  const salesQuery = `
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
      ${whDocFilter}
      ${dateDocFilter}
    GROUP BY LOWER(TRIM(p->>'method'))
  `;

  // 2. Desglose desde abonos a cartera (receivable_payments)
  const paymentsQuery = `
    SELECT
      LOWER(TRIM(rp.payment_method)) AS method,
      COALESCE(SUM(rp.amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM receivable_payments rp
    WHERE 1=1
      ${whRpFilter}
      ${dateRpFilter}
    GROUP BY LOWER(TRIM(rp.payment_method))
  `;

  const layawaysQuery = `
    SELECT
      LOWER(TRIM(lp.payment_method)) AS method,
      COALESCE(SUM(lp.amount), 0)::text AS amount,
      COUNT(*)::int AS count
    FROM layaway_payments lp
    WHERE 1=1
      ${whRpFilter.replace(/rp\./g, "lp.")}
      ${dateRpFilter.replace(/rp\./g, "lp.")}
    GROUP BY LOWER(TRIM(lp.payment_method))
  `;

  // 3. Deducciones de efectivo: Nómina en efectivo y Egresos de caja
  const payrollParams: unknown[] = [];
  const whPayrollFilter = opts.warehouseId
    ? `AND p.warehouse_id = $${payrollParams.push(opts.warehouseId)}::uuid`
    : "";
  let datePayrollFilter = "";
  if (opts.dateFrom) {
    const idx = payrollParams.push(opts.dateFrom);
    datePayrollFilter += ` AND p.payment_date >= $${idx}::date`;
  }
  if (opts.dateTo) {
    const idx = payrollParams.push(opts.dateTo);
    datePayrollFilter += ` AND p.payment_date <= $${idx}::date`;
  }

  const payrollQuery = `
    SELECT COALESCE(SUM(p.net_amount), 0)::text AS amount, COUNT(*)::int AS count
    FROM payroll_payments p
    WHERE p.payment_method = 'efectivo'
      AND p.deducted_from_cash_register = true
      ${whPayrollFilter}
      ${datePayrollFilter}
  `;

  const outflowParams: unknown[] = [];
  const whOutflowFilter = opts.warehouseId
    ? `AND o.warehouse_id = $${outflowParams.push(opts.warehouseId)}::uuid`
    : "";
  let dateOutflowFilter = "";
  if (opts.dateFrom) {
    const idx = outflowParams.push(opts.dateFrom);
    dateOutflowFilter += ` AND o.created_at::date >= $${idx}::date`;
  }
  if (opts.dateTo) {
    const idx = outflowParams.push(opts.dateTo);
    dateOutflowFilter += ` AND o.created_at::date <= $${idx}::date`;
  }

  const outflowQuery = `
    SELECT COALESCE(SUM(o.amount), 0)::text AS amount, COUNT(*)::int AS count
    FROM cash_outflows o
    WHERE o.payment_method = 'efectivo'
      ${whOutflowFilter}
      ${dateOutflowFilter}
  `;

  const [
    { rows: salesRows },
    { rows: payRows },
    { rows: layRows },
    { rows: payrollRows },
    { rows: outflowRows },
  ] = await Promise.all([
    pool.query<{ method: string; amount: string; count: number }>(salesQuery, params),
    pool.query<{ method: string; amount: string; count: number }>(paymentsQuery, params),
    pool.query<{ method: string; amount: string; count: number }>(layawaysQuery, params),
    pool.query<{ amount: string; count: number }>(payrollQuery, payrollParams),
    pool.query<{ amount: string; count: number }>(outflowQuery, outflowParams),
  ]);

  const map = new Map<
    string,
    { salesAmount: number; creditsAmount: number; count: number }
  >();

  const standardMethods = [
    { method: "efectivo", label: "Efectivo" },
    { method: "bancolombia", label: "Bancolombia" },
    { method: "davivienda", label: "Davivienda" },
    { method: "nequi", label: "Nequi" },
    { method: "daviplata", label: "Daviplata" },
    { method: "bold", label: "Bold" },
    { method: "addi", label: "Addi" },
    { method: "sistecredito", label: "Sistecrédito" },
    { method: "saldo_a_favor", label: "Saldo a favor" },
  ];

  for (const def of standardMethods) {
    map.set(def.method, { salesAmount: 0, creditsAmount: 0, count: 0 });
  }

  for (const r of salesRows) {
    const m = r.method || "otro";
    const cur = map.get(m) ?? { salesAmount: 0, creditsAmount: 0, count: 0 };
    cur.salesAmount += Number(r.amount);
    cur.count += r.count;
    map.set(m, cur);
  }

  for (const r of payRows) {
    const m = r.method || "otro";
    const cur = map.get(m) ?? { salesAmount: 0, creditsAmount: 0, count: 0 };
    cur.creditsAmount += Number(r.amount);
    cur.count += r.count;
    map.set(m, cur);
  }

  for (const r of layRows) {
    const m = r.method || "otro";
    const cur = map.get(m) ?? { salesAmount: 0, creditsAmount: 0, count: 0 };
    cur.creditsAmount += Number(r.amount);
    cur.count += r.count;
    map.set(m, cur);
  }

  const methodLabels: Record<string, string> = {
    efectivo: "Efectivo",
    davivienda: "Davivienda",
    bancolombia: "Bancolombia",
    bold: "Bold",
    addi: "Addi",
    nequi: "Nequi",
    daviplata: "Daviplata",
    sistecredito: "Sistecrédito",
    saldo_a_favor: "Saldo a favor",
    otro: "Otro",
  };

  let totalCollected = 0;
  const methods = Array.from(map.entries())
    .map(([method, data]) => {
      const totalAmount = data.salesAmount + data.creditsAmount;
      totalCollected += totalAmount;
      return {
        method,
        label: methodLabels[method] || method.toUpperCase(),
        salesAmount: data.salesAmount,
        creditsAmount: data.creditsAmount,
        totalAmount,
        transactionCount: data.count,
      };
    })
    .filter((m) => m.totalAmount > 0 || standardMethods.some((s) => s.method === m.method));

  const cashMethod = methods.find((m) => m.method === "efectivo");
  const cashCollected = cashMethod ? cashMethod.totalAmount : 0;
  const cashPayrollAmount = Number(payrollRows[0]?.amount || 0);
  const cashOutflowsAmount = Number(outflowRows[0]?.amount || 0);
  const netCashInDrawer = cashCollected - cashPayrollAmount - cashOutflowsAmount;

  return {
    dateFrom: opts.dateFrom || getTodayBogotaYmd(),
    dateTo: opts.dateTo || getTodayBogotaYmd(),
    warehouseId: opts.warehouseId || null,
    totalCollected,
    cashCollected,
    cashPayrollAmount,
    cashOutflowsAmount,
    netCashInDrawer,
    methods,
  };
}
