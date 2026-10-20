import type pg from "pg";

export interface EmployeeRecord {
  id: string;
  code: string;
  fullName: string;
  documentType: string;
  documentNumber: string;
  phone: string | null;
  email: string | null;
  position: string;
  warehouseId: string | null;
  warehouseCode?: string | null;
  warehouseName?: string | null;
  baseSalary: number;
  paymentFrequency: string;
  bankName: string | null;
  bankAccountType: string | null;
  bankAccountNumber: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollPaymentRecord {
  id: string;
  voucherNumber: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  employeeDocType?: string;
  employeeDocNumber?: string;
  employeePosition?: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  periodStart: string;
  periodEnd: string;
  periodConcept: string;
  baseSalary: number;
  bonuses: number;
  deductions: number;
  netAmount: number;
  paymentMethod: string;
  paymentDate: string;
  transferReceiptUrl: string | null;
  transferReceiptUrls?: string[];
  transferReceiptFilename: string | null;
  referenceCode: string | null;
  deductedFromCashRegister: boolean;
  notes: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string;
}

/**
 * Genera el siguiente código de empleado: EMP-001, EMP-002...
 */
export async function nextEmployeeCode(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM employees`
  );
  const nextNum = Number(rows[0]?.count ?? "0") + 1;
  return `EMP-${String(nextNum).padStart(3, "0")}`;
}

/**
 * Genera el consecutivo del voucher de nómina: NOM-{PREFIX}-{NUM}
 */
export async function nextPayrollVoucherNumber(pool: pg.Pool, warehouseCode?: string): Promise<string> {
  const prefix = warehouseCode ? warehouseCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) : "GEN";
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM payroll_payments WHERE warehouse_id IN (
      SELECT id FROM warehouses WHERE UPPER(code) = UPPER($1)
    )`,
    [prefix]
  );
  const nextNum = Number(rows[0]?.count ?? "0") + 1;
  return `NOM-${prefix}-${String(nextNum).padStart(6, "0")}`;
}

/**
 * Listar empleados con filtros opcionales.
 */
export async function listEmployees(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
    search?: string | null;
    isActive?: boolean | null;
  }
): Promise<EmployeeRecord[]> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`e.warehouse_id = $${params.length}::uuid`);
  }

  if (opts?.isActive !== undefined && opts?.isActive !== null) {
    params.push(opts.isActive);
    conditions.push(`e.is_active = $${params.length}`);
  }

  if (opts?.search && opts.search.trim()) {
    params.push(`%${opts.search.trim().toLowerCase()}%`);
    const idx = params.length;
    conditions.push(`(
      LOWER(e.full_name) LIKE $${idx} OR
      LOWER(e.document_number) LIKE $${idx} OR
      LOWER(e.code) LIKE $${idx} OR
      LOWER(e.position) LIKE $${idx}
    )`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows } = await pool.query<any>(
    `
    SELECT
      e.id,
      e.code,
      e.full_name AS "fullName",
      e.document_type AS "documentType",
      e.document_number AS "documentNumber",
      e.phone,
      e.email,
      e.position,
      e.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      e.base_salary::float AS "baseSalary",
      e.payment_frequency AS "paymentFrequency",
      e.bank_name AS "bankName",
      e.bank_account_type AS "bankAccountType",
      e.bank_account_number AS "bankAccountNumber",
      e.is_active AS "isActive",
      e.notes,
      e.created_at AS "createdAt",
      e.updated_at AS "updatedAt"
    FROM employees e
    LEFT JOIN warehouses w ON w.id = e.warehouse_id
    WHERE ${whereSql}
    ORDER BY e.is_active DESC, e.full_name ASC
    `,
    params
  );

  return rows;
}

/**
 * Obtener empleado por ID.
 */
export async function getEmployeeById(pool: pg.Pool, id: string): Promise<EmployeeRecord | null> {
  const { rows } = await pool.query<any>(
    `
    SELECT
      e.id,
      e.code,
      e.full_name AS "fullName",
      e.document_type AS "documentType",
      e.document_number AS "documentNumber",
      e.phone,
      e.email,
      e.position,
      e.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      e.base_salary::float AS "baseSalary",
      e.payment_frequency AS "paymentFrequency",
      e.bank_name AS "bankName",
      e.bank_account_type AS "bankAccountType",
      e.bank_account_number AS "bankAccountNumber",
      e.is_active AS "isActive",
      e.notes,
      e.created_at AS "createdAt",
      e.updated_at AS "updatedAt"
    FROM employees e
    LEFT JOIN warehouses w ON w.id = e.warehouse_id
    WHERE e.id = $1::uuid
    `,
    [id]
  );
  return rows[0] || null;
}

/**
 * Crear un nuevo empleado.
 */
export async function createEmployee(
  pool: pg.Pool,
  data: {
    code?: string;
    fullName: string;
    documentType?: string;
    documentNumber: string;
    phone?: string | null;
    email?: string | null;
    position: string;
    warehouseId?: string | null;
    baseSalary?: number;
    paymentFrequency?: string;
    bankName?: string | null;
    bankAccountType?: string | null;
    bankAccountNumber?: string | null;
    notes?: string | null;
  }
): Promise<EmployeeRecord> {
  let code = data.code?.trim();
  if (!code) {
    code = await nextEmployeeCode(pool);
  }

  const { rows } = await pool.query<any>(
    `
    INSERT INTO employees (
      code,
      full_name,
      document_type,
      document_number,
      phone,
      email,
      position,
      warehouse_id,
      base_salary,
      payment_frequency,
      bank_name,
      bank_account_type,
      bank_account_number,
      is_active,
      notes
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14
    )
    RETURNING
      id,
      code,
      full_name AS "fullName",
      document_type AS "documentType",
      document_number AS "documentNumber",
      phone,
      email,
      position,
      warehouse_id AS "warehouseId",
      base_salary::float AS "baseSalary",
      payment_frequency AS "paymentFrequency",
      bank_name AS "bankName",
      bank_account_type AS "bankAccountType",
      bank_account_number AS "bankAccountNumber",
      is_active AS "isActive",
      notes,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    `,
    [
      code,
      data.fullName.trim(),
      data.documentType || "CC",
      data.documentNumber.trim(),
      data.phone?.trim() || null,
      data.email?.trim() || null,
      data.position.trim(),
      data.warehouseId || null,
      Math.max(0, data.baseSalary ?? 0),
      data.paymentFrequency || "quincenal",
      data.bankName?.trim() || null,
      data.bankAccountType?.trim() || null,
      data.bankAccountNumber?.trim() || null,
      data.notes?.trim() || null,
    ]
  );

  return rows[0];
}

/**
 * Actualizar datos de un empleado.
 */
export async function updateEmployee(
  pool: pg.Pool,
  id: string,
  data: {
    fullName?: string;
    documentType?: string;
    documentNumber?: string;
    phone?: string | null;
    email?: string | null;
    position?: string;
    warehouseId?: string | null;
    baseSalary?: number;
    paymentFrequency?: string;
    bankName?: string | null;
    bankAccountType?: string | null;
    bankAccountNumber?: string | null;
    isActive?: boolean;
    notes?: string | null;
  }
): Promise<EmployeeRecord> {
  const updates: string[] = ["updated_at = now()"];
  const params: any[] = [id];

  if (data.fullName !== undefined) {
    params.push(data.fullName.trim());
    updates.push(`full_name = $${params.length}`);
  }
  if (data.documentType !== undefined) {
    params.push(data.documentType);
    updates.push(`document_type = $${params.length}`);
  }
  if (data.documentNumber !== undefined) {
    params.push(data.documentNumber.trim());
    updates.push(`document_number = $${params.length}`);
  }
  if (data.phone !== undefined) {
    params.push(data.phone?.trim() || null);
    updates.push(`phone = $${params.length}`);
  }
  if (data.email !== undefined) {
    params.push(data.email?.trim() || null);
    updates.push(`email = $${params.length}`);
  }
  if (data.position !== undefined) {
    params.push(data.position.trim());
    updates.push(`position = $${params.length}`);
  }
  if (data.warehouseId !== undefined) {
    params.push(data.warehouseId || null);
    updates.push(`warehouse_id = $${params.length}`);
  }
  if (data.baseSalary !== undefined) {
    params.push(Math.max(0, data.baseSalary));
    updates.push(`base_salary = $${params.length}`);
  }
  if (data.paymentFrequency !== undefined) {
    params.push(data.paymentFrequency);
    updates.push(`payment_frequency = $${params.length}`);
  }
  if (data.bankName !== undefined) {
    params.push(data.bankName?.trim() || null);
    updates.push(`bank_name = $${params.length}`);
  }
  if (data.bankAccountType !== undefined) {
    params.push(data.bankAccountType?.trim() || null);
    updates.push(`bank_account_type = $${params.length}`);
  }
  if (data.bankAccountNumber !== undefined) {
    params.push(data.bankAccountNumber?.trim() || null);
    updates.push(`bank_account_number = $${params.length}`);
  }
  if (data.isActive !== undefined) {
    params.push(data.isActive);
    updates.push(`is_active = $${params.length}`);
  }
  if (data.notes !== undefined) {
    params.push(data.notes?.trim() || null);
    updates.push(`notes = $${params.length}`);
  }

  const { rows } = await pool.query<any>(
    `
    UPDATE employees
    SET ${updates.join(", ")}
    WHERE id = $1::uuid
    RETURNING
      id,
      code,
      full_name AS "fullName",
      document_type AS "documentType",
      document_number AS "documentNumber",
      phone,
      email,
      position,
      warehouse_id AS "warehouseId",
      base_salary::float AS "baseSalary",
      payment_frequency AS "paymentFrequency",
      bank_name AS "bankName",
      bank_account_type AS "bankAccountType",
      bank_account_number AS "bankAccountNumber",
      is_active AS "isActive",
      notes,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    `,
    params
  );

  return rows[0];
}

/**
 * Crear un pago de nómina con comprobante (voucher).
 * Si el pago es en efectivo, se descuenta de la caja de esa sede (deducted_from_cash_register = true).
 * Si es por transferencia, almacena el soporte/comprobante bancario.
 */
export async function createPayrollPayment(
  pool: pg.Pool,
  data: {
    employeeId: string;
    warehouseId: string;
    periodStart: string;
    periodEnd: string;
    periodConcept: string;
    baseSalary: number;
    bonuses?: number;
    deductions?: number;
    paymentMethod: string;
    paymentDate?: string;
    transferReceiptUrl?: string | null;
    transferReceiptUrls?: string[] | null;
    transferReceiptFilename?: string | null;
    referenceCode?: string | null;
    notes?: string | null;
    userId?: string | null;
  }
): Promise<PayrollPaymentRecord> {
  const emp = await getEmployeeById(pool, data.employeeId);
  if (!emp) {
    throw new Error("employee_not_found");
  }

  const { rows: whRows } = await pool.query<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM warehouses WHERE id = $1::uuid`,
    [data.warehouseId]
  );
  if (!whRows[0]) {
    throw new Error("warehouse_not_found");
  }
  const wh = whRows[0];

  const baseSalary = Math.max(0, data.baseSalary);
  const bonuses = Math.max(0, data.bonuses ?? 0);
  const deductions = Math.max(0, data.deductions ?? 0);
  const netAmount = Math.max(0, baseSalary + bonuses - deductions);

  const voucherNumber = await nextPayrollVoucherNumber(pool, wh.code);

  const method = data.paymentMethod.trim().toLowerCase();
  const isCash = method === "efectivo";

  const finalUrls = (data.transferReceiptUrls && data.transferReceiptUrls.length > 0)
    ? data.transferReceiptUrls
    : (data.transferReceiptUrl ? [data.transferReceiptUrl] : []);
  const primaryUrl = finalUrls[0] || data.transferReceiptUrl || null;
  const jsonUrls = JSON.stringify(finalUrls);

  const { rows } = await pool.query<any>(
    `
    INSERT INTO payroll_payments (
      voucher_number,
      employee_id,
      warehouse_id,
      period_start,
      period_end,
      period_concept,
      base_salary,
      bonuses,
      deductions,
      net_amount,
      payment_method,
      payment_date,
      transfer_receipt_url,
      transfer_receipt_filename,
      transfer_receipt_urls,
      reference_code,
      deducted_from_cash_register,
      notes,
      created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::date, CURRENT_DATE), $13, $14, $15::jsonb, $16, $17, $18, $19
    )
    RETURNING
      id,
      voucher_number AS "voucherNumber",
      employee_id AS "employeeId",
      warehouse_id AS "warehouseId",
      period_start AS "periodStart",
      period_end AS "periodEnd",
      period_concept AS "periodConcept",
      base_salary::float AS "baseSalary",
      bonuses::float AS "bonuses",
      deductions::float AS "deductions",
      net_amount::float AS "netAmount",
      payment_method AS "paymentMethod",
      payment_date AS "paymentDate",
      transfer_receipt_url AS "transferReceiptUrl",
      transfer_receipt_filename AS "transferReceiptFilename",
      transfer_receipt_urls AS "transferReceiptUrls",
      reference_code AS "referenceCode",
      deducted_from_cash_register AS "deductedFromCashRegister",
      notes,
      created_by AS "createdBy",
      created_at AS "createdAt"
    `,
    [
      voucherNumber,
      emp.id,
      wh.id,
      data.periodStart,
      data.periodEnd,
      data.periodConcept.trim(),
      baseSalary,
      bonuses,
      deductions,
      netAmount,
      method,
      data.paymentDate || null,
      primaryUrl,
      data.transferReceiptFilename || null,
      jsonUrls,
      data.referenceCode?.trim() || null,
      isCash, // Se descuenta directamente de la caja si es efectivo
      data.notes?.trim() || null,
      data.userId || null,
    ]
  );

  const payment = rows[0];
  payment.employeeCode = emp.code;
  payment.employeeName = emp.fullName;
  payment.employeeDocType = emp.documentType;
  payment.employeeDocNumber = emp.documentNumber;
  payment.employeePosition = emp.position;
  payment.warehouseCode = wh.code;
  payment.warehouseName = wh.name;

  return payment;
}

/**
 * Listar pagos de nómina con filtros.
 */
export async function listPayrollPayments(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
    employeeId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    paymentMethod?: string | null;
    search?: string | null;
  }
): Promise<PayrollPaymentRecord[]> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`p.warehouse_id = $${params.length}::uuid`);
  }

  if (opts?.employeeId) {
    params.push(opts.employeeId);
    conditions.push(`p.employee_id = $${params.length}::uuid`);
  }

  if (opts?.paymentMethod) {
    params.push(opts.paymentMethod.toLowerCase());
    conditions.push(`LOWER(p.payment_method) = $${params.length}`);
  }

  if (opts?.dateFrom) {
    params.push(opts.dateFrom);
    conditions.push(`p.payment_date >= $${params.length}::date`);
  }

  if (opts?.dateTo) {
    params.push(opts.dateTo);
    conditions.push(`p.payment_date <= $${params.length}::date`);
  }

  if (opts?.search && opts.search.trim()) {
    params.push(`%${opts.search.trim().toLowerCase()}%`);
    const idx = params.length;
    conditions.push(`(
      LOWER(p.voucher_number) LIKE $${idx} OR
      LOWER(e.full_name) LIKE $${idx} OR
      LOWER(e.document_number) LIKE $${idx} OR
      LOWER(p.period_concept) LIKE $${idx} OR
      LOWER(COALESCE(p.reference_code, '')) LIKE $${idx}
    )`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows } = await pool.query<any>(
    `
    SELECT
      p.id,
      p.voucher_number AS "voucherNumber",
      p.employee_id AS "employeeId",
      e.code AS "employeeCode",
      e.full_name AS "employeeName",
      e.document_type AS "employeeDocType",
      e.document_number AS "employeeDocNumber",
      e.position AS "employeePosition",
      p.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      p.period_start AS "periodStart",
      p.period_end AS "periodEnd",
      p.period_concept AS "periodConcept",
      p.base_salary::float AS "baseSalary",
      p.bonuses::float AS "bonuses",
      p.deductions::float AS "deductions",
      p.net_amount::float AS "netAmount",
      p.payment_method AS "paymentMethod",
      p.payment_date AS "paymentDate",
      p.transfer_receipt_url AS "transferReceiptUrl",
      p.transfer_receipt_filename AS "transferReceiptFilename",
      COALESCE(p.transfer_receipt_urls, '[]'::jsonb) AS "transferReceiptUrls",
      p.reference_code AS "referenceCode",
      p.deducted_from_cash_register AS "deductedFromCashRegister",
      p.notes,
      p.created_by AS "createdBy",
      u.full_name AS "createdByName",
      p.created_at AS "createdAt"
    FROM payroll_payments p
    JOIN employees e ON e.id = p.employee_id
    JOIN warehouses w ON w.id = p.warehouse_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE ${whereSql}
    ORDER BY p.payment_date DESC, p.created_at DESC
    `,
    params
  );

  return rows;
}

/**
 * Obtener detalle completo de un pago de nómina.
 */
export async function getPayrollPaymentDetail(
  pool: pg.Pool,
  id: string
): Promise<PayrollPaymentRecord | null> {
  const { rows } = await pool.query<any>(
    `
    SELECT
      p.id,
      p.voucher_number AS "voucherNumber",
      p.employee_id AS "employeeId",
      e.code AS "employeeCode",
      e.full_name AS "employeeName",
      e.document_type AS "employeeDocType",
      e.document_number AS "employeeDocNumber",
      e.position AS "employeePosition",
      p.warehouse_id AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      p.period_start AS "periodStart",
      p.period_end AS "periodEnd",
      p.period_concept AS "periodConcept",
      p.base_salary::float AS "baseSalary",
      p.bonuses::float AS "bonuses",
      p.deductions::float AS "deductions",
      p.net_amount::float AS "netAmount",
      p.payment_method AS "paymentMethod",
      p.payment_date AS "paymentDate",
      p.transfer_receipt_url AS "transferReceiptUrl",
      p.transfer_receipt_filename AS "transferReceiptFilename",
      COALESCE(p.transfer_receipt_urls, '[]'::jsonb) AS "transferReceiptUrls",
      p.reference_code AS "referenceCode",
      p.deducted_from_cash_register AS "deductedFromCashRegister",
      p.notes,
      p.created_by AS "createdBy",
      u.full_name AS "createdByName",
      p.created_at AS "createdAt"
    FROM payroll_payments p
    JOIN employees e ON e.id = p.employee_id
    JOIN warehouses w ON w.id = p.warehouse_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.id = $1::uuid
    `,
    [id]
  );

  return rows[0] || null;
}

/**
 * Adjuntar comprobante de transferencia bancaria a un pago de nómina.
 */
export async function attachPayrollReceipt(
  pool: pg.Pool,
  paymentId: string,
  receipt: {
    url: string;
    urls?: string[];
    filename: string;
    referenceCode?: string;
  }
): Promise<PayrollPaymentRecord> {
  const finalUrls = (receipt.urls && receipt.urls.length > 0)
    ? receipt.urls
    : (receipt.url ? [receipt.url] : []);
  const primaryUrl = finalUrls[0] || receipt.url;
  const jsonUrls = JSON.stringify(finalUrls);

  const updates: string[] = [
    `transfer_receipt_url = $2`,
    `transfer_receipt_filename = $3`,
    `transfer_receipt_urls = $4::jsonb`,
  ];
  const params: any[] = [paymentId, primaryUrl, receipt.filename, jsonUrls];

  if (receipt.referenceCode) {
    params.push(receipt.referenceCode.trim());
    updates.push(`reference_code = $${params.length}`);
  }

  await pool.query(
    `
    UPDATE payroll_payments
    SET ${updates.join(", ")}
    WHERE id = $1::uuid
    `,
    params
  );

  const updated = await getPayrollPaymentDetail(pool, paymentId);
  if (!updated) {
    throw new Error("payroll_payment_not_found");
  }
  return updated;
}

/**
 * Resumen financiero de nómina: total pagado, en efectivo y por transferencia.
 */
export async function getPayrollSummary(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
): Promise<{
  totalPaid: number;
  cashTotal: number;
  transferTotal: number;
  paymentCount: number;
  employeesCount: number;
}> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`warehouse_id = $${params.length}::uuid`);
  }

  if (opts?.dateFrom) {
    params.push(opts.dateFrom);
    conditions.push(`payment_date >= $${params.length}::date`);
  }

  if (opts?.dateTo) {
    params.push(opts.dateTo);
    conditions.push(`payment_date <= $${params.length}::date`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows } = await pool.query<{
    total_paid: string;
    cash_total: string;
    transfer_total: string;
    payment_count: string;
    employees_count: string;
  }>(
    `
    SELECT
      COALESCE(SUM(net_amount), 0)::text AS total_paid,
      COALESCE(SUM(CASE WHEN payment_method = 'efectivo' THEN net_amount ELSE 0 END), 0)::text AS cash_total,
      COALESCE(SUM(CASE WHEN payment_method <> 'efectivo' THEN net_amount ELSE 0 END), 0)::text AS transfer_total,
      COUNT(*)::text AS payment_count,
      COUNT(DISTINCT employee_id)::text AS employees_count
    FROM payroll_payments
    WHERE ${whereSql}
    `,
    params
  );

  const r = rows[0];
  return {
    totalPaid: Number(r?.total_paid || 0),
    cashTotal: Number(r?.cash_total || 0),
    transferTotal: Number(r?.transfer_total || 0),
    paymentCount: Number(r?.payment_count || 0),
    employeesCount: Number(r?.employees_count || 0),
  };
}
