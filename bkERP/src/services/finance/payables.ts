import type pg from "pg";

export type PayableStatus = "open" | "partial" | "paid" | "cancelled";

export interface SupplierItem {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  contactName: string | null;
  bankName: string | null;
  bankAccountType: string | null;
  bankAccountNumber: string | null;
  creditBalance: number;
  notes: string | null;
  isActive: boolean;
  totalDebt: number;
  openPayablesCount: number;
  createdAt: string;
}

export interface PayableSummaryItem {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierTaxId: string | null;
  supplierPhone: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  billNumber: string | null;
  description: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: PayableStatus;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
  createdByName: string | null;
}

export interface PayablePaymentItem {
  id: string;
  payableId: string;
  supplierId: string;
  supplierName?: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  receiptNumber: string;
  billNumber?: string;
  paymentMethod: string;
  amount: number;
  appliedToDebt: number;
  excessToFavour: number;
  referenceCode: string | null;
  receiptUrl?: string | null;
  receiptUrls?: string[];
  receiptFilename?: string | null;
  notes: string | null;
  createdAt: string;
  createdByName?: string | null;
}

export interface PayableDetail extends PayableSummaryItem {
  payments: PayablePaymentItem[];
  supplierCreditBalance: number;
  supplierBankInfo?: {
    bankName: string | null;
    accountType: string | null;
    accountNumber: string | null;
  };
}

/**
 * Genera el número correlativo para el comprobante de egreso: CE-{SEDE}-{NUM}
 */
export async function nextPayableReceiptNumber(
  client: pg.PoolClient,
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
    FROM payable_payments
    WHERE warehouse_id = $1::uuid
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `CE-${prefix}-${num}`;
}

// ─── Proveedores ─────────────────────────────────────────────────────────────

export async function createSupplier(
  pool: pg.Pool,
  data: {
    name: string;
    taxId?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    contactName?: string | null;
    bankName?: string | null;
    bankAccountType?: string | null;
    bankAccountNumber?: string | null;
    notes?: string | null;
  }
): Promise<SupplierItem> {
  const {
    name,
    taxId,
    phone,
    email,
    address,
    city,
    contactName,
    bankName,
    bankAccountType,
    bankAccountNumber,
    notes,
  } = data;

  const { rows } = await pool.query<any>(
    `
    INSERT INTO suppliers (
      name, tax_id, phone, email, address, city, contact_name,
      bank_name, bank_account_type, bank_account_number, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING
      id::text,
      name,
      tax_id AS "taxId",
      phone,
      email,
      address,
      city,
      contact_name AS "contactName",
      bank_name AS "bankName",
      bank_account_type AS "bankAccountType",
      bank_account_number AS "bankAccountNumber",
      COALESCE(credit_balance, 0)::float AS "creditBalance",
      notes,
      is_active AS "isActive",
      created_at AS "createdAt"
    `,
    [
      name.trim(),
      taxId?.trim() || null,
      phone?.trim() || null,
      email?.trim() || null,
      address?.trim() || null,
      city?.trim() || null,
      contactName?.trim() || null,
      bankName?.trim() || null,
      bankAccountType?.trim() || null,
      bankAccountNumber?.trim() || null,
      notes?.trim() || null,
    ]
  );

  return {
    ...rows[0],
    totalDebt: 0,
    openPayablesCount: 0,
  };
}

export async function updateSupplier(
  pool: pg.Pool,
  id: string,
  data: {
    name?: string;
    taxId?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    contactName?: string | null;
    bankName?: string | null;
    bankAccountType?: string | null;
    bankAccountNumber?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }
): Promise<SupplierItem> {
  const current = await pool.query<{ id: string }>(
    `SELECT id FROM suppliers WHERE id = $1::uuid`,
    [id]
  );
  if (!current.rows[0]) {
    throw Object.assign(new Error("supplier_not_found"), { code: "supplier_not_found" });
  }

  const setClauses: string[] = ["updated_at = now()"];
  const params: any[] = [];
  let pIdx = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${pIdx++}`);
    params.push(data.name.trim());
  }
  if (data.taxId !== undefined) {
    setClauses.push(`tax_id = $${pIdx++}`);
    params.push(data.taxId?.trim() || null);
  }
  if (data.phone !== undefined) {
    setClauses.push(`phone = $${pIdx++}`);
    params.push(data.phone?.trim() || null);
  }
  if (data.email !== undefined) {
    setClauses.push(`email = $${pIdx++}`);
    params.push(data.email?.trim() || null);
  }
  if (data.address !== undefined) {
    setClauses.push(`address = $${pIdx++}`);
    params.push(data.address?.trim() || null);
  }
  if (data.city !== undefined) {
    setClauses.push(`city = $${pIdx++}`);
    params.push(data.city?.trim() || null);
  }
  if (data.contactName !== undefined) {
    setClauses.push(`contact_name = $${pIdx++}`);
    params.push(data.contactName?.trim() || null);
  }
  if (data.bankName !== undefined) {
    setClauses.push(`bank_name = $${pIdx++}`);
    params.push(data.bankName?.trim() || null);
  }
  if (data.bankAccountType !== undefined) {
    setClauses.push(`bank_account_type = $${pIdx++}`);
    params.push(data.bankAccountType?.trim() || null);
  }
  if (data.bankAccountNumber !== undefined) {
    setClauses.push(`bank_account_number = $${pIdx++}`);
    params.push(data.bankAccountNumber?.trim() || null);
  }
  if (data.notes !== undefined) {
    setClauses.push(`notes = $${pIdx++}`);
    params.push(data.notes?.trim() || null);
  }
  if (data.isActive !== undefined) {
    setClauses.push(`is_active = $${pIdx++}`);
    params.push(Boolean(data.isActive));
  }

  params.push(id);
  const idIdx = pIdx;

  const { rows } = await pool.query<any>(
    `
    UPDATE suppliers
    SET ${setClauses.join(", ")}
    WHERE id = $${idIdx}::uuid
    RETURNING
      id::text,
      name,
      tax_id AS "taxId",
      phone,
      email,
      address,
      city,
      contact_name AS "contactName",
      bank_name AS "bankName",
      bank_account_type AS "bankAccountType",
      bank_account_number AS "bankAccountNumber",
      COALESCE(credit_balance, 0)::float AS "creditBalance",
      notes,
      is_active AS "isActive",
      created_at AS "createdAt"
    `,
    params
  );

  const { rows: debtRows } = await pool.query<{ totalDebt: string; count: string }>(
    `
    SELECT
      COALESCE(SUM(balance_amount), 0)::text AS "totalDebt",
      COUNT(*)::text AS count
    FROM accounts_payable
    WHERE supplier_id = $1::uuid AND status IN ('open', 'partial')
    `,
    [id]
  );

  return {
    ...rows[0],
    totalDebt: Number(debtRows[0]?.totalDebt ?? 0),
    openPayablesCount: Number(debtRows[0]?.count ?? 0),
  };
}

export async function listSuppliers(
  pool: pg.Pool,
  opts?: {
    q?: string | null;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ items: SupplierItem[]; total: number }> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.activeOnly) {
    conditions.push("s.is_active = true");
  }

  if (opts?.q?.trim()) {
    params.push(`%${opts.q.trim()}%`);
    const idx = params.length;
    conditions.push(`(
      s.name ILIKE $${idx}
      OR s.tax_id ILIKE $${idx}
      OR s.phone ILIKE $${idx}
      OR s.contact_name ILIKE $${idx}
    )`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM suppliers s WHERE ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.count ?? 0);

  const limit = opts?.limit ? Math.min(Math.max(1, opts.limit), 100) : 50;
  const offset = opts?.offset ? Math.max(0, opts.offset) : 0;

  const listParams = [...params, limit, offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;

  const { rows: items } = await pool.query<SupplierItem>(
    `
    SELECT
      s.id::text,
      s.name,
      s.tax_id AS "taxId",
      s.phone,
      s.email,
      s.address,
      s.city,
      s.contact_name AS "contactName",
      s.bank_name AS "bankName",
      s.bank_account_type AS "bankAccountType",
      s.bank_account_number AS "bankAccountNumber",
      COALESCE(s.credit_balance, 0)::float AS "creditBalance",
      s.notes,
      s.is_active AS "isActive",
      s.created_at AS "createdAt",
      COALESCE(SUM(ap.balance_amount) FILTER (WHERE ap.status IN ('open', 'partial')), 0)::float AS "totalDebt",
      COUNT(ap.id) FILTER (WHERE ap.status IN ('open', 'partial'))::int AS "openPayablesCount"
    FROM suppliers s
    LEFT JOIN accounts_payable ap ON ap.supplier_id = s.id
    WHERE ${whereSql}
    GROUP BY s.id
    ORDER BY s.name ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    listParams
  );

  return { items, total };
}

export interface SupplierWarehouseBreakdown {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  totalBilled: number;
  totalPaid: number;
  currentDebt: number;
  openPayablesCount: number;
}

export async function getSupplierProfile(
  pool: pg.Pool,
  supplierId: string
): Promise<{
  supplier: SupplierItem;
  stats: {
    totalBilled: number;
    totalPaid: number;
    currentDebt: number;
    creditBalance: number;
  };
  payables: PayableSummaryItem[];
  recentPayments: PayablePaymentItem[];
  warehouseBreakdown: SupplierWarehouseBreakdown[];
} | null> {
  const { rows: sRows } = await pool.query<SupplierItem>(
    `
    SELECT
      s.id::text,
      s.name,
      s.tax_id AS "taxId",
      s.phone,
      s.email,
      s.address,
      s.city,
      s.contact_name AS "contactName",
      s.bank_name AS "bankName",
      s.bank_account_type AS "bankAccountType",
      s.bank_account_number AS "bankAccountNumber",
      COALESCE(s.credit_balance, 0)::float AS "creditBalance",
      s.notes,
      s.is_active AS "isActive",
      s.created_at AS "createdAt",
      0::float AS "totalDebt",
      0::int AS "openPayablesCount"
    FROM suppliers s
    WHERE s.id = $1::uuid
    `,
    [supplierId]
  );

  if (!sRows[0]) return null;
  const supplier = sRows[0];

  // Deudas del proveedor
  const { rows: payables } = await pool.query<PayableSummaryItem>(
    `
    SELECT
      ap.id::text,
      ap.supplier_id::text AS "supplierId",
      s.name AS "supplierName",
      s.tax_id AS "supplierTaxId",
      s.phone AS "supplierPhone",
      ap.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      ap.bill_number AS "billNumber",
      ap.description,
      ap.total_amount::float AS "totalAmount",
      ap.paid_amount::float AS "paidAmount",
      ap.balance_amount::float AS "balanceAmount",
      ap.status,
      ap.issue_date::text AS "issueDate",
      ap.due_date::text AS "dueDate",
      ap.notes,
      ap.created_at AS "createdAt",
      ap.paid_at AS "paidAt",
      u.full_name AS "createdByName"
    FROM accounts_payable ap
    JOIN suppliers s ON s.id = ap.supplier_id
    JOIN warehouses w ON w.id = ap.warehouse_id
    LEFT JOIN users u ON u.id = ap.created_by
    WHERE ap.supplier_id = $1::uuid
    ORDER BY ap.created_at DESC
    `,
    [supplierId]
  );

  // Pagos recientes
  const { rows: recentPayments } = await pool.query<PayablePaymentItem>(
    `
    SELECT
      pp.id::text,
      pp.payable_id::text AS "payableId",
      pp.supplier_id::text AS "supplierId",
      s.name AS "supplierName",
      pp.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      pp.receipt_number AS "receiptNumber",
      ap.bill_number AS "billNumber",
      pp.payment_method AS "paymentMethod",
      pp.amount::float,
      pp.applied_to_debt::float AS "appliedToDebt",
      pp.excess_to_favour::float AS "excessToFavour",
      pp.reference_code AS "referenceCode",
      pp.receipt_url AS "receiptUrl",
      pp.receipt_filename AS "receiptFilename",
      COALESCE(pp.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      pp.notes,
      pp.created_at AS "createdAt",
      u.full_name AS "createdByName"
    FROM payable_payments pp
    JOIN suppliers s ON s.id = pp.supplier_id
    JOIN warehouses w ON w.id = pp.warehouse_id
    JOIN accounts_payable ap ON ap.id = pp.payable_id
    LEFT JOIN users u ON u.id = pp.created_by
    WHERE pp.supplier_id = $1::uuid
    ORDER BY pp.created_at DESC
    LIMIT 30
    `,
    [supplierId]
  );

  const totalBilled = payables.reduce((s, p) => s + p.totalAmount, 0);
  const totalPaid = payables.reduce((s, p) => s + p.paidAmount, 0);
  const currentDebt = payables
    .filter((p) => p.status === "open" || p.status === "partial")
    .reduce((s, p) => s + p.balanceAmount, 0);

  // Desglose por sede/bodega
  const { rows: warehouseBreakdown } = await pool.query<SupplierWarehouseBreakdown>(
    `
    SELECT
      w.id::text AS "warehouseId",
      w.name AS "warehouseName",
      w.code AS "warehouseCode",
      COALESCE(SUM(ap.total_amount), 0)::float AS "totalBilled",
      COALESCE(SUM(ap.paid_amount), 0)::float AS "totalPaid",
      COALESCE(SUM(ap.balance_amount) FILTER (WHERE ap.status IN ('open', 'partial')), 0)::float AS "currentDebt",
      COUNT(ap.id) FILTER (WHERE ap.status IN ('open', 'partial'))::int AS "openPayablesCount"
    FROM warehouses w
    JOIN accounts_payable ap ON ap.warehouse_id = w.id AND ap.supplier_id = $1::uuid
    GROUP BY w.id, w.name, w.code
    ORDER BY w.name ASC
    `,
    [supplierId]
  );

  return {
    supplier: {
      ...supplier,
      totalDebt: currentDebt,
      openPayablesCount: payables.filter((p) => p.status === "open" || p.status === "partial").length,
    },
    stats: {
      totalBilled,
      totalPaid,
      currentDebt,
      creditBalance: supplier.creditBalance,
    },
    payables,
    recentPayments,
    warehouseBreakdown,
  };
}

// ─── Cuentas por Pagar (Accounts Payable) ───────────────────────────────────

export async function createAccountPayable(
  pool: pg.Pool,
  params: {
    supplierId: string;
    warehouseId: string;
    totalAmount: number;
    billNumber?: string | null;
    description?: string | null;
    dueDate?: string | null;
    issueDate?: string | null;
    notes?: string | null;
    initialPayment?: number;
    paymentMethod?: string;
    referenceCode?: string | null;
    userId?: string | null;
  }
): Promise<{ payable: PayableSummaryItem; payment?: PayablePaymentItem; excessToFavour: number }> {
  const {
    supplierId,
    warehouseId,
    totalAmount,
    billNumber,
    description,
    dueDate,
    issueDate,
    notes,
    initialPayment = 0,
    paymentMethod = "efectivo",
    referenceCode,
    userId,
  } = params;

  if (totalAmount <= 0) {
    throw Object.assign(new Error("invalid_total_amount"), { code: "invalid_total_amount" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verificar proveedor
    const { rows: sRows } = await client.query<{ id: string; name: string; credit_balance: string }>(
      `SELECT id::text, name, credit_balance::text FROM suppliers WHERE id = $1::uuid FOR UPDATE`,
      [supplierId]
    );
    if (!sRows[0]) {
      throw Object.assign(new Error("supplier_not_found"), { code: "supplier_not_found" });
    }

    const initAmount = Math.max(0, Number(initialPayment) || 0);

    // Si usa saldo a favor en el pago inicial
    if (initAmount > 0 && paymentMethod === "saldo_a_favor") {
      const currentCred = Number(sRows[0].credit_balance || 0);
      if (initAmount > currentCred) {
        throw Object.assign(new Error("insufficient_credit_balance"), {
          code: "insufficient_credit_balance",
          available: currentCred,
          requested: initAmount,
        });
      }
      await client.query(
        `UPDATE suppliers SET credit_balance = credit_balance - $1 WHERE id = $2::uuid`,
        [initAmount, supplierId]
      );
    }

    const appliedToDebt = Math.min(initAmount, totalAmount);
    const excessToFavour = Math.max(0, Math.round((initAmount - totalAmount) * 100) / 100);
    const balanceAmount = Math.max(0, Math.round((totalAmount - appliedToDebt) * 100) / 100);
    const status: PayableStatus = balanceAmount === 0 ? "paid" : appliedToDebt > 0 ? "partial" : "open";

    // Si abonó de más al crear, el exceso va a saldo a favor
    if (excessToFavour > 0 && paymentMethod !== "saldo_a_favor") {
      await client.query(
        `UPDATE suppliers SET credit_balance = credit_balance + $1 WHERE id = $2::uuid`,
        [excessToFavour, supplierId]
      );
    }

    const { rows: apRows } = await client.query<{ id: string }>(
      `
      INSERT INTO accounts_payable (
        supplier_id, warehouse_id, vendor_name, bill_number, description,
        total_amount, paid_amount, balance_amount, status, issue_date,
        due_date, notes, created_by, paid_at
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4, $5,
        $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE),
        $11::date, $12, $13::uuid, CASE WHEN $9 = 'paid' THEN now() ELSE NULL END
      )
      RETURNING id::text
      `,
      [
        supplierId,
        warehouseId,
        sRows[0].name,
        billNumber?.trim() || null,
        description?.trim() || null,
        totalAmount,
        appliedToDebt,
        balanceAmount,
        status,
        issueDate || null,
        dueDate || null,
        notes?.trim() || null,
        userId || null,
      ]
    );

    const payableId = apRows[0]!.id;
    let paymentItem: PayablePaymentItem | undefined;

    if (initAmount > 0) {
      const receiptNumber = await nextPayableReceiptNumber(client, warehouseId);
      const { rows: payRows } = await client.query<PayablePaymentItem>(
        `
        INSERT INTO payable_payments (
          payable_id, supplier_id, warehouse_id, receipt_number,
          payment_method, amount, applied_to_debt, excess_to_favour,
          reference_code, notes, created_by
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4,
          $5, $6, $7, $8,
          $9, $10, $11::uuid
        )
        RETURNING
          id::text,
          payable_id::text AS "payableId",
          supplier_id::text AS "supplierId",
          warehouse_id::text AS "warehouseId",
          receipt_number AS "receiptNumber",
          payment_method AS "paymentMethod",
          amount::float,
          applied_to_debt::float AS "appliedToDebt",
          excess_to_favour::float AS "excessToFavour",
          reference_code AS "referenceCode",
          notes,
          created_at AS "createdAt"
        `,
        [
          payableId,
          supplierId,
          warehouseId,
          receiptNumber,
          paymentMethod,
          initAmount,
          appliedToDebt,
          excessToFavour,
          referenceCode?.trim() || null,
          notes?.trim() || "Abono inicial",
          userId || null,
        ]
      );
      paymentItem = payRows[0];
    }

    await client.query("COMMIT");

    const detail = await getAccountPayableDetail(pool, payableId);
    if (!detail) throw new Error("payable_created_not_found");

    return {
      payable: detail,
      payment: paymentItem,
      excessToFavour,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listAccountsPayable(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
    supplierId?: string | null;
    status?: PayableStatus | null;
    dueDateFrom?: string | null;
    dueDateTo?: string | null;
    query?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<{
  items: PayableSummaryItem[];
  total: number;
  summary: {
    totalBilled: number;
    totalPaid: number;
    totalBalance: number;
    openCount: number;
    paidCount: number;
  };
}> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`ap.warehouse_id = $${params.length}::uuid`);
  }

  if (opts?.supplierId) {
    params.push(opts.supplierId);
    conditions.push(`ap.supplier_id = $${params.length}::uuid`);
  }

  if (opts?.status) {
    params.push(opts.status);
    conditions.push(`ap.status = $${params.length}`);
  }

  if (opts?.dueDateFrom) {
    params.push(opts.dueDateFrom);
    conditions.push(`ap.due_date >= $${params.length}::date`);
  }

  if (opts?.dueDateTo) {
    params.push(opts.dueDateTo);
    conditions.push(`ap.due_date <= $${params.length}::date`);
  }

  if (opts?.query?.trim()) {
    params.push(`%${opts.query.trim()}%`);
    const idx = params.length;
    conditions.push(`(
      ap.bill_number ILIKE $${idx}
      OR ap.description ILIKE $${idx}
      OR s.name ILIKE $${idx}
      OR s.tax_id ILIKE $${idx}
    )`);
  }

  const whereSql = conditions.join(" AND ");

  // Totales
  const summarySql = `
    SELECT
      COUNT(*)::text AS total_count,
      COUNT(*) FILTER (WHERE ap.status IN ('open', 'partial'))::text AS open_count,
      COUNT(*) FILTER (WHERE ap.status = 'paid')::text AS paid_count,
      COALESCE(SUM(ap.total_amount), 0)::text AS total_billed,
      COALESCE(SUM(ap.paid_amount), 0)::text AS total_paid,
      COALESCE(SUM(ap.balance_amount) FILTER (WHERE ap.status IN ('open', 'partial')), 0)::text AS total_balance
    FROM accounts_payable ap
    JOIN suppliers s ON s.id = ap.supplier_id
    WHERE ${whereSql}
  `;

  const { rows: sumRows } = await pool.query<{
    total_count: string;
    open_count: string;
    paid_count: string;
    total_billed: string;
    total_paid: string;
    total_balance: string;
  }>(summarySql, params);

  const total = Number(sumRows[0]?.total_count ?? 0);
  const openCount = Number(sumRows[0]?.open_count ?? 0);
  const paidCount = Number(sumRows[0]?.paid_count ?? 0);
  const totalBilled = Number(sumRows[0]?.total_billed ?? 0);
  const totalPaid = Number(sumRows[0]?.total_paid ?? 0);
  const totalBalance = Number(sumRows[0]?.total_balance ?? 0);

  const limit = opts?.limit ? Math.min(Math.max(1, opts.limit), 100) : 50;
  const offset = opts?.offset ? Math.max(0, opts.offset) : 0;

  const listParams = [...params, limit, offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;

  const listSql = `
    SELECT
      ap.id::text,
      ap.supplier_id::text AS "supplierId",
      s.name AS "supplierName",
      s.tax_id AS "supplierTaxId",
      s.phone AS "supplierPhone",
      ap.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      ap.bill_number AS "billNumber",
      ap.description,
      ap.total_amount::float AS "totalAmount",
      ap.paid_amount::float AS "paidAmount",
      ap.balance_amount::float AS "balanceAmount",
      ap.status,
      ap.issue_date::text AS "issueDate",
      ap.due_date::text AS "dueDate",
      ap.notes,
      ap.created_at AS "createdAt",
      ap.paid_at AS "paidAt",
      u.full_name AS "createdByName"
    FROM accounts_payable ap
    JOIN suppliers s ON s.id = ap.supplier_id
    JOIN warehouses w ON w.id = ap.warehouse_id
    LEFT JOIN users u ON u.id = ap.created_by
    WHERE ${whereSql}
    ORDER BY
      CASE WHEN ap.status IN ('open', 'partial') THEN 0 ELSE 1 END,
      ap.due_date ASC NULLS LAST,
      ap.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows: items } = await pool.query<PayableSummaryItem>(listSql, listParams);

  return {
    items,
    total,
    summary: {
      totalBilled,
      totalPaid,
      totalBalance,
      openCount,
      paidCount,
    },
  };
}

export async function getAccountPayableDetail(
  pool: pg.Pool,
  id: string
): Promise<PayableDetail | null> {
  const { rows: pRows } = await pool.query<any>(
    `
    SELECT
      ap.id::text,
      ap.supplier_id::text AS "supplierId",
      s.name AS "supplierName",
      s.tax_id AS "supplierTaxId",
      s.phone AS "supplierPhone",
      s.bank_name AS "bankName",
      s.bank_account_type AS "bankAccountType",
      s.bank_account_number AS "bankAccountNumber",
      COALESCE(s.credit_balance, 0)::float AS "supplierCreditBalance",
      ap.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      ap.bill_number AS "billNumber",
      ap.description,
      ap.total_amount::float AS "totalAmount",
      ap.paid_amount::float AS "paidAmount",
      ap.balance_amount::float AS "balanceAmount",
      ap.status,
      ap.issue_date::text AS "issueDate",
      ap.due_date::text AS "dueDate",
      ap.notes,
      ap.created_at AS "createdAt",
      ap.paid_at AS "paidAt",
      u.full_name AS "createdByName"
    FROM accounts_payable ap
    JOIN suppliers s ON s.id = ap.supplier_id
    JOIN warehouses w ON w.id = ap.warehouse_id
    LEFT JOIN users u ON u.id = ap.created_by
    WHERE ap.id = $1::uuid
    `,
    [id]
  );

  if (!pRows[0]) return null;
  const p = pRows[0];

  const { rows: payments } = await pool.query<PayablePaymentItem>(
    `
    SELECT
      pp.id::text,
      pp.payable_id::text AS "payableId",
      pp.supplier_id::text AS "supplierId",
      s.name AS "supplierName",
      pp.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      pp.receipt_number AS "receiptNumber",
      pp.payment_method AS "paymentMethod",
      pp.amount::float,
      pp.applied_to_debt::float AS "appliedToDebt",
      pp.excess_to_favour::float AS "excessToFavour",
      pp.reference_code AS "referenceCode",
      pp.receipt_url AS "receiptUrl",
      pp.receipt_filename AS "receiptFilename",
      COALESCE(pp.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      pp.notes,
      pp.created_at AS "createdAt",
      u.full_name AS "createdByName"
    FROM payable_payments pp
    JOIN suppliers s ON s.id = pp.supplier_id
    JOIN warehouses w ON w.id = pp.warehouse_id
    LEFT JOIN users u ON u.id = pp.created_by
    WHERE pp.payable_id = $1::uuid
    ORDER BY pp.created_at ASC
    `,
    [id]
  );

  return {
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplierName,
    supplierTaxId: p.supplierTaxId,
    supplierPhone: p.supplierPhone,
    warehouseId: p.warehouseId,
    warehouseCode: p.warehouseCode,
    warehouseName: p.warehouseName,
    billNumber: p.billNumber,
    description: p.description,
    totalAmount: p.totalAmount,
    paidAmount: p.paidAmount,
    balanceAmount: p.balanceAmount,
    status: p.status,
    issueDate: p.issueDate,
    dueDate: p.dueDate,
    notes: p.notes,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
    createdByName: p.createdByName,
    payments,
    supplierCreditBalance: p.supplierCreditBalance,
    supplierBankInfo: {
      bankName: p.bankName,
      accountType: p.bankAccountType,
      accountNumber: p.bankAccountNumber,
    },
  };
}

/**
 * Registra un abono/pago de salida de dinero a un proveedor.
 * Si el monto supera la deuda, el excedente se abona automáticamente a Saldo a Favor.
 */
export async function addPayablePayment(
  pool: pg.Pool,
  params: {
    payableId: string;
    warehouseId: string;
    paymentMethod: string;
    amount: number;
    referenceCode?: string | null;
    notes?: string | null;
    userId?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
): Promise<{
  payment: PayablePaymentItem;
  appliedToDebt: number;
  excessToFavour: number;
  newBalanceAmount: number;
  newStatus: PayableStatus;
  supplierCreditBalance: number;
}> {
  const {
    payableId,
    warehouseId,
    paymentMethod,
    amount,
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: pRows } = await client.query<{
      id: string;
      supplier_id: string;
      balance_amount: string;
      paid_amount: string;
      status: string;
    }>(
      `SELECT id::text, supplier_id::text, balance_amount::text, paid_amount::text, status
       FROM accounts_payable WHERE id = $1::uuid FOR UPDATE`,
      [payableId]
    );

    if (!pRows[0]) {
      throw Object.assign(new Error("payable_not_found"), { code: "payable_not_found" });
    }

    const payable = pRows[0];
    if (payable.status === "paid") {
      throw Object.assign(new Error("payable_already_paid"), { code: "payable_already_paid" });
    }
    if (payable.status === "cancelled") {
      throw Object.assign(new Error("payable_cancelled"), { code: "payable_cancelled" });
    }

    const supplierId = payable.supplier_id;
    const { rows: sRows } = await client.query<{ credit_balance: string }>(
      `SELECT credit_balance::text FROM suppliers WHERE id = $1::uuid FOR UPDATE`,
      [supplierId]
    );

    let suppCredit = Number(sRows[0]?.credit_balance ?? 0);
    const cleanAmount = Math.round(Number(amount) * 100) / 100;

    // Si se usa saldo a favor
    if (paymentMethod === "saldo_a_favor") {
      if (cleanAmount > suppCredit + 0.001) {
        throw Object.assign(new Error("insufficient_credit_balance"), {
          code: "insufficient_credit_balance",
          available: suppCredit,
          requested: cleanAmount,
        });
      }
      await client.query(
        `UPDATE suppliers SET credit_balance = GREATEST(0, ROUND((credit_balance - $1)::numeric, 2)) WHERE id = $2::uuid`,
        [cleanAmount, supplierId]
      );
      suppCredit = Math.max(0, Math.round((suppCredit - cleanAmount) * 100) / 100);
    }

    const currentBalance = Math.round(Number(payable.balance_amount) * 100) / 100;
    const appliedToDebt = Math.round(Math.min(cleanAmount, currentBalance) * 100) / 100;
    const excessToFavour = paymentMethod === "saldo_a_favor"
      ? 0
      : Math.max(0, Math.round((cleanAmount - currentBalance) * 100) / 100);

    const newBalance = Math.max(0, Math.round((currentBalance - appliedToDebt) * 100) / 100);
    const newPaid = Math.round((Number(payable.paid_amount) + appliedToDebt) * 100) / 100;
    const newStatus: PayableStatus = newBalance === 0 ? "paid" : "partial";

    // Si pagó de más con dinero real, el sobrante pasa a Saldo a Favor de la empresa con ese proveedor
    if (excessToFavour > 0) {
      await client.query(
        `UPDATE suppliers SET credit_balance = ROUND((credit_balance + $1)::numeric, 2) WHERE id = $2::uuid`,
        [excessToFavour, supplierId]
      );
      suppCredit = Math.round((suppCredit + excessToFavour) * 100) / 100;
    }

    // Actualizar cuenta por pagar
    await client.query(
      `
      UPDATE accounts_payable
      SET balance_amount = $1,
          paid_amount = $2,
          status = $3,
          paid_at = CASE WHEN $3 = 'paid' THEN now() ELSE NULL END
      WHERE id = $4::uuid
      `,
      [newBalance, newPaid, newStatus, payableId]
    );

    // Generar Comprobante de Egreso
    const receiptNumber = await nextPayableReceiptNumber(client, warehouseId);

    const finalUrls = (receiptUrls && receiptUrls.length > 0)
      ? receiptUrls
      : (receiptUrl ? [receiptUrl] : []);
    const primaryUrl = finalUrls[0] || receiptUrl || null;
    const jsonUrls = JSON.stringify(finalUrls);

    const { rows: payRows } = await client.query<PayablePaymentItem>(
      `
      INSERT INTO payable_payments (
        payable_id, supplier_id, warehouse_id, receipt_number,
        payment_method, amount, applied_to_debt, excess_to_favour,
        reference_code, notes, created_by,
        receipt_url, receipt_filename, receipt_urls
      )
      VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4,
        $5, $6, $7, $8,
        $9, $10, $11::uuid,
        $12, $13, $14::jsonb
      )
      RETURNING
        id::text,
        payable_id::text AS "payableId",
        supplier_id::text AS "supplierId",
        warehouse_id::text AS "warehouseId",
        receipt_number AS "receiptNumber",
        payment_method AS "paymentMethod",
        amount::float,
        applied_to_debt::float AS "appliedToDebt",
        excess_to_favour::float AS "excessToFavour",
        reference_code AS "referenceCode",
        receipt_url AS "receiptUrl",
        receipt_filename AS "receiptFilename",
        receipt_urls AS "receiptUrls",
        notes,
        created_at AS "createdAt"
      `,
      [
        payableId,
        supplierId,
        warehouseId,
        receiptNumber,
        paymentMethod,
        amount,
        appliedToDebt,
        excessToFavour,
        referenceCode?.trim() || null,
        notes?.trim() || null,
        userId || null,
        primaryUrl,
        receiptFilename?.trim() || null,
        jsonUrls,
      ]
    );

    await client.query("COMMIT");

    return {
      payment: payRows[0]!,
      appliedToDebt,
      excessToFavour,
      newBalanceAmount: newBalance,
      newStatus,
      supplierCreditBalance: suppCredit,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resumen de salidas de dinero / egresos por método de pago.
 */
export async function getEgressSummary(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
): Promise<{
  totalDisbursed: number;
  methods: { method: string; totalAmount: number; count: number }[];
}> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`pp.warehouse_id = $${params.length}::uuid`);
  }

  if (opts?.dateFrom) {
    params.push(opts.dateFrom);
    conditions.push(`pp.created_at::date >= $${params.length}::date`);
  }

  if (opts?.dateTo) {
    params.push(opts.dateTo);
    conditions.push(`pp.created_at::date <= $${params.length}::date`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows } = await pool.query<{
    payment_method: string;
    total_amount: string;
    count: string;
  }>(
    `
    SELECT
      pp.payment_method,
      COALESCE(SUM(pp.amount), 0)::text AS total_amount,
      COUNT(*)::text AS count
    FROM payable_payments pp
    WHERE ${whereSql}
    GROUP BY pp.payment_method
    ORDER BY total_amount DESC
    `,
    params
  );

  const methods = rows.map((r) => ({
    method: r.payment_method,
    totalAmount: Number(r.total_amount),
    count: Number(r.count),
  }));

  const totalDisbursed = methods.reduce((s, m) => s + m.totalAmount, 0);

  return { totalDisbursed, methods };
}
