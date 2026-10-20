import type pg from "pg";
import { assertOutflowPaymentMethodAllowed } from "../../lib/outflow-policy.js";

export interface CashOutflowItem {
  id: string;
  voucherNumber: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  concept: string;
  beneficiaryName: string;
  beneficiaryDoc: string | null;
  amount: number;
  paymentMethod: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  payableId: string | null;
  billNumber: string | null;
  referenceCode: string | null;
  receiptUrl?: string | null;
  receiptUrls?: string[];
  receiptFilename?: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
}

export type TransferStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface CashTransferItem {
  id: string;
  code: string;
  originWarehouseId: string;
  originWarehouseCode: string;
  originWarehouseName: string;
  destinationWarehouseId: string;
  destinationWarehouseCode: string;
  destinationWarehouseName: string;
  amount: number;
  carrierName: string;
  carrierDoc: string | null;
  concept: string;
  paymentMethod: string;
  status: TransferStatus;
  rejectionReason: string | null;
  senderReceiptUrl?: string | null;
  senderReceiptUrls?: string[];
  senderReceiptFilename?: string | null;
  receiverReceiptUrl?: string | null;
  receiverReceiptUrls?: string[];
  receiverReceiptFilename?: string | null;
  createdAt: string;
  createdByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
}

/**
 * Genera el número correlativo para el comprobante de egreso: CE-{SEDE}-{NUM}
 */
export async function nextOutflowVoucherNumber(
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
    FROM cash_outflows
    WHERE warehouse_id = $1::uuid
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `CE-${prefix}-${num}`;
}

/**
 * Genera el correlativo para traslados de dinero: TR-{ORIGIN_CODE}-{NUM}
 */
export async function nextTransferCode(
  client: pg.PoolClient,
  originWarehouseId: string
): Promise<string> {
  const { rows: wh } = await client.query<{ code: string }>(
    `SELECT code FROM warehouses WHERE id = $1::uuid`,
    [originWarehouseId]
  );
  const prefix = (wh[0]?.code ?? "SED").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "SED";
  const { rows: seq } = await client.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM cash_transfers
    WHERE origin_warehouse_id = $1::uuid
    `,
    [originWarehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `TR-${prefix}-${num}`;
}

// ─── Comprobantes de Egreso (Salidas de Dinero) ─────────────────────────────

export async function createCashOutflow(
  pool: pg.Pool,
  params: {
    warehouseId: string;
    concept: string;
    beneficiaryName: string;
    beneficiaryDoc?: string | null;
    amount: number;
    paymentMethod: string;
    supplierId?: string | null;
    payableId?: string | null;
    referenceCode?: string | null;
    notes?: string | null;
    userId?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
    /** true si la operación se hace desde la Sede Administrativa (permite pagar con cuentas). */
    fromAdminSession?: boolean;
  }
): Promise<CashOutflowItem> {
  const {
    warehouseId,
    concept,
    beneficiaryName,
    beneficiaryDoc,
    amount,
    paymentMethod,
    supplierId,
    payableId,
    referenceCode,
    notes,
    userId,
    receiptUrl,
    receiptUrls,
    receiptFilename,
    fromAdminSession,
  } = params;

  if (amount <= 0) {
    throw Object.assign(new Error("invalid_amount"), { code: "invalid_amount" });
  }

  if (!concept.trim()) {
    throw Object.assign(new Error("concept_required"), { code: "concept_required" });
  }

  if (!beneficiaryName.trim()) {
    throw Object.assign(new Error("beneficiary_required"), { code: "beneficiary_required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verificar que la sede exista
    const { rows: whRows } = await client.query<{ code: string; name: string }>(
      `SELECT code, name FROM warehouses WHERE id = $1::uuid`,
      [warehouseId]
    );

    if (!whRows[0]) {
      throw Object.assign(new Error("warehouse_not_found"), { code: "warehouse_not_found" });
    }

    // REGLA: Las sedes físicas solo sacan dinero en efectivo; las cuentas solo desde la Sede Administrativa
    assertOutflowPaymentMethodAllowed(paymentMethod, fromAdminSession === true);

    const voucherNumber = await nextOutflowVoucherNumber(client, warehouseId);

    const finalUrls = (receiptUrls && receiptUrls.length > 0)
      ? receiptUrls
      : (receiptUrl ? [receiptUrl] : []);
    const primaryUrl = finalUrls[0] || receiptUrl || null;
    const jsonUrls = JSON.stringify(finalUrls);

    const { rows } = await client.query<{ id: string }>(
      `
      INSERT INTO cash_outflows (
        voucher_number, warehouse_id, concept, beneficiary_name, beneficiary_doc,
        amount, payment_method, supplier_id, payable_id, reference_code,
        notes, created_by, receipt_url, receipt_filename, receipt_urls
      )
      VALUES (
        $1, $2::uuid, $3, $4, $5,
        $6, $7, $8::uuid, $9::uuid, $10,
        $11, $12::uuid, $13, $14, $15::jsonb
      )
      RETURNING id::text
      `,
      [
        voucherNumber,
        warehouseId,
        concept.trim(),
        beneficiaryName.trim(),
        beneficiaryDoc?.trim() || null,
        amount,
        paymentMethod,
        supplierId || null,
        payableId || null,
        referenceCode?.trim() || null,
        notes?.trim() || null,
        userId || null,
        primaryUrl,
        receiptFilename?.trim() || null,
        jsonUrls,
      ]
    );

    // Si el egreso está enlazado a una cuenta por pagar / factura de proveedor,
    // aplicar automáticamente el abono a la deuda y registrar el pago en payable_payments
    if (payableId) {
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

      if (pRows[0] && pRows[0].status !== "paid" && pRows[0].status !== "cancelled") {
        const payable = pRows[0];
        const currentBalance = Number(payable.balance_amount);
        const appliedToDebt = Math.min(amount, currentBalance);
        const excessToFavour = Math.max(0, Math.round((amount - currentBalance) * 100) / 100);
        const newBalance = Math.max(0, Math.round((currentBalance - appliedToDebt) * 100) / 100);
        const newPaid = Math.round((Number(payable.paid_amount) + appliedToDebt) * 100) / 100;
        const newStatus = newBalance === 0 ? "paid" : "partial";

        if (excessToFavour > 0) {
          await client.query(
            `UPDATE suppliers SET credit_balance = credit_balance + $1 WHERE id = $2::uuid`,
            [excessToFavour, payable.supplier_id]
          );
        }

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

        await client.query(
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
          `,
          [
            payableId,
            payable.supplier_id,
            warehouseId,
            voucherNumber,
            paymentMethod,
            amount,
            appliedToDebt,
            excessToFavour,
            referenceCode?.trim() || null,
            notes?.trim() || `Egreso de caja ${voucherNumber}`,
            userId || null,
            primaryUrl,
            receiptFilename?.trim() || null,
            jsonUrls,
          ]
        );
      }
    }

    await client.query("COMMIT");

    const detail = await getCashOutflowDetail(pool, rows[0]!.id);
    if (!detail) throw new Error("outflow_detail_not_found");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listCashOutflows(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
    supplierId?: string | null;
    paymentMethod?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    query?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<{
  items: CashOutflowItem[];
  total: number;
  totalAmount: number;
}> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    conditions.push(`co.warehouse_id = $${params.length}::uuid`);
  }

  if (opts?.supplierId) {
    params.push(opts.supplierId);
    conditions.push(`co.supplier_id = $${params.length}::uuid`);
  }

  if (opts?.paymentMethod) {
    params.push(opts.paymentMethod);
    conditions.push(`co.payment_method = $${params.length}`);
  }

  if (opts?.dateFrom) {
    params.push(opts.dateFrom);
    conditions.push(`co.created_at::date >= $${params.length}::date`);
  }

  if (opts?.dateTo) {
    params.push(opts.dateTo);
    conditions.push(`co.created_at::date <= $${params.length}::date`);
  }

  if (opts?.query?.trim()) {
    params.push(`%${opts.query.trim()}%`);
    const idx = params.length;
    conditions.push(`(
      co.voucher_number ILIKE $${idx}
      OR co.concept ILIKE $${idx}
      OR co.beneficiary_name ILIKE $${idx}
      OR co.beneficiary_doc ILIKE $${idx}
      OR s.name ILIKE $${idx}
    )`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows: sumRows } = await pool.query<{ count: string; total_amount: string }>(
    `
    SELECT
      COUNT(*)::text AS count,
      COALESCE(SUM(co.amount), 0)::text AS total_amount
    FROM cash_outflows co
    LEFT JOIN suppliers s ON s.id = co.supplier_id
    WHERE ${whereSql}
    `,
    params
  );

  const total = Number(sumRows[0]?.count ?? 0);
  const totalAmount = Number(sumRows[0]?.total_amount ?? 0);

  const limit = opts?.limit ? Math.min(Math.max(1, opts.limit), 100) : 50;
  const offset = opts?.offset ? Math.max(0, opts.offset) : 0;

  const listParams = [...params, limit, offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;

  const { rows: items } = await pool.query<CashOutflowItem>(
    `
    SELECT
      co.id::text,
      co.voucher_number AS "voucherNumber",
      co.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      co.concept,
      co.beneficiary_name AS "beneficiaryName",
      co.beneficiary_doc AS "beneficiaryDoc",
      co.amount::float,
      co.payment_method AS "paymentMethod",
      co.supplier_id::text AS "supplierId",
      s.name AS "supplierName",
      s.tax_id AS "supplierTaxId",
      co.payable_id::text AS "payableId",
      ap.bill_number AS "billNumber",
      co.reference_code AS "referenceCode",
      co.receipt_url AS "receiptUrl",
      co.receipt_filename AS "receiptFilename",
      COALESCE(co.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      co.notes,
      co.created_at AS "createdAt",
      u.full_name AS "createdByName"
    FROM cash_outflows co
    JOIN warehouses w ON w.id = co.warehouse_id
    LEFT JOIN suppliers s ON s.id = co.supplier_id
    LEFT JOIN accounts_payable ap ON ap.id = co.payable_id
    LEFT JOIN users u ON u.id = co.created_by
    WHERE ${whereSql}
    ORDER BY co.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    listParams
  );

  return { items, total, totalAmount };
}

export async function getCashOutflowDetail(
  pool: pg.Pool,
  id: string
): Promise<CashOutflowItem | null> {
  const { rows } = await pool.query<CashOutflowItem>(
    `
    SELECT
      co.id::text,
      co.voucher_number AS "voucherNumber",
      co.warehouse_id::text AS "warehouseId",
      w.code AS "warehouseCode",
      w.name AS "warehouseName",
      co.concept,
      co.beneficiary_name AS "beneficiaryName",
      co.beneficiary_doc AS "beneficiaryDoc",
      co.amount::float,
      co.payment_method AS "paymentMethod",
      co.supplier_id::text AS "supplierId",
      s.name AS "supplierName",
      s.tax_id AS "supplierTaxId",
      co.payable_id::text AS "payableId",
      ap.bill_number AS "billNumber",
      co.reference_code AS "referenceCode",
      co.receipt_url AS "receiptUrl",
      co.receipt_filename AS "receiptFilename",
      COALESCE(co.receipt_urls, '[]'::jsonb) AS "receiptUrls",
      co.notes,
      co.created_at AS "createdAt",
      u.full_name AS "createdByName"
    FROM cash_outflows co
    JOIN warehouses w ON w.id = co.warehouse_id
    LEFT JOIN suppliers s ON s.id = co.supplier_id
    LEFT JOIN accounts_payable ap ON ap.id = co.payable_id
    LEFT JOIN users u ON u.id = co.created_by
    WHERE co.id = $1::uuid
    `,
    [id]
  );

  return rows[0] || null;
}

// ─── Traslados de Dinero entre Sedes ─────────────────────────────────────────

export async function createCashTransfer(
  pool: pg.Pool,
  params: {
    originWarehouseId: string;
    destinationWarehouseId: string;
    amount: number;
    carrierName: string;
    carrierDoc?: string | null;
    concept: string;
    paymentMethod?: string;
    userId?: string | null;
    senderReceiptUrl?: string | null;
    senderReceiptUrls?: string[] | null;
    senderReceiptFilename?: string | null;
    /** true si la operación se hace desde la Sede Administrativa (permite traslado bancario). */
    fromAdminSession?: boolean;
  }
): Promise<CashTransferItem> {
  const {
    originWarehouseId,
    destinationWarehouseId,
    amount,
    carrierName,
    carrierDoc,
    concept,
    paymentMethod = "efectivo",
    userId,
    senderReceiptUrl,
    senderReceiptUrls,
    senderReceiptFilename,
    fromAdminSession,
  } = params;

  if (amount <= 0) {
    throw Object.assign(new Error("invalid_amount"), { code: "invalid_amount" });
  }

  if (originWarehouseId === destinationWarehouseId) {
    throw Object.assign(new Error("origin_destination_same"), {
      code: "origin_destination_same",
      message: "La sede de destino no puede ser la misma de origen.",
    });
  }

  if (!carrierName.trim()) {
    throw Object.assign(new Error("carrier_required"), {
      code: "carrier_required",
      message: "Indica el nombre de la persona o mensajero que transporta el dinero.",
    });
  }

  if (!concept.trim()) {
    throw Object.assign(new Error("concept_required"), { code: "concept_required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verificar sedes
    const { rows: origWh } = await client.query<{ name: string; code: string }>(
      `SELECT name, code FROM warehouses WHERE id = $1::uuid`,
      [originWarehouseId]
    );
    const { rows: destWh } = await client.query<{ name: string }>(
      `SELECT name FROM warehouses WHERE id = $1::uuid`,
      [destinationWarehouseId]
    );

    if (!origWh[0] || !destWh[0]) {
      throw Object.assign(new Error("warehouse_not_found"), { code: "warehouse_not_found" });
    }

    // REGLA: desde sedes físicas el traslado solo es en efectivo; bancario solo desde la Sede Administrativa
    assertOutflowPaymentMethodAllowed(paymentMethod, fromAdminSession === true);

    const code = await nextTransferCode(client, originWarehouseId);

    const finalUrls = (senderReceiptUrls && senderReceiptUrls.length > 0)
      ? senderReceiptUrls
      : (senderReceiptUrl ? [senderReceiptUrl] : []);
    const primaryUrl = finalUrls[0] || senderReceiptUrl || null;
    const jsonUrls = JSON.stringify(finalUrls);

    const { rows } = await client.query<{ id: string }>(
      `
      INSERT INTO cash_transfers (
        code, origin_warehouse_id, destination_warehouse_id, amount,
        carrier_name, carrier_doc, concept, payment_method, status, created_by,
        sender_receipt_url, sender_receipt_filename, sender_receipt_urls
      )
      VALUES (
        $1, $2::uuid, $3::uuid, $4,
        $5, $6, $7, $8, 'pending', $9::uuid,
        $10, $11, $12::jsonb
      )
      RETURNING id::text
      `,
      [
        code,
        originWarehouseId,
        destinationWarehouseId,
        amount,
        carrierName.trim(),
        carrierDoc?.trim() || null,
        concept.trim(),
        paymentMethod,
        userId || null,
        primaryUrl,
        senderReceiptFilename?.trim() || null,
        jsonUrls,
      ]
    );

    const transferId = rows[0]!.id;

    // Disparar Notificaciones para los usuarios de la sede destino y administradores
    const { rows: destUsers } = await client.query<{ id: string }>(
      `
      SELECT DISTINCT u.id::text
      FROM users u
      LEFT JOIN user_warehouse uw ON uw.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.is_active = true
        AND (
          uw.warehouse_id = $1::uuid
          OR r.name IN ('admin', 'super_admin', 'gerencia')
        )
      `,
      [destinationWarehouseId]
    );

    const amountFormatted = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);

    for (const u of destUsers) {
      await client.query(
        `
        INSERT INTO notifications (user_id, type, title, body, payload)
        VALUES ($1::uuid, 'cash_transfer', $2, $3, $4::jsonb)
        `,
        [
          u.id,
          `💸 Traslado de dinero recibido pendiente de aprobación (${code})`,
          `La sede ${origWh[0].name} envió ${amountFormatted} con ${carrierName.trim()}. Confirma la recepción del dinero para ingresarlo a caja.`,
          JSON.stringify({
            transferId,
            code,
            amount,
            originWarehouseName: origWh[0].name,
            carrierName: carrierName.trim(),
          }),
        ]
      );
    }

    await client.query("COMMIT");

    const detail = await getCashTransferDetail(pool, transferId);
    if (!detail) throw new Error("transfer_detail_not_found");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function approveCashTransfer(
  pool: pg.Pool,
  transferId: string,
  userId: string,
  receiptData?: {
    receiverReceiptUrl?: string | null;
    receiverReceiptUrls?: string[] | null;
    receiverReceiptFilename?: string | null;
  }
): Promise<CashTransferItem> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: tRows } = await client.query<{
      status: string;
      code: string;
      amount: string;
      origin_warehouse_id: string;
      created_by: string | null;
    }>(
      `SELECT status, code, amount::text, origin_warehouse_id::text, created_by::text
       FROM cash_transfers WHERE id = $1::uuid FOR UPDATE`,
      [transferId]
    );

    if (!tRows[0]) {
      throw Object.assign(new Error("transfer_not_found"), { code: "transfer_not_found" });
    }

    const t = tRows[0];
    if (t.status !== "pending") {
      throw Object.assign(new Error("transfer_already_processed"), {
        code: "transfer_already_processed",
        message: "Este traslado ya fue procesado previamente.",
      });
    }

    const finalUrls = (receiptData?.receiverReceiptUrls && receiptData.receiverReceiptUrls.length > 0)
      ? receiptData.receiverReceiptUrls
      : (receiptData?.receiverReceiptUrl ? [receiptData.receiverReceiptUrl] : []);
    const primaryUrl = finalUrls[0] || receiptData?.receiverReceiptUrl || null;
    const jsonUrls = JSON.stringify(finalUrls);

    await client.query(
      `
      UPDATE cash_transfers
      SET status = 'approved',
          approved_by = $1::uuid,
          approved_at = now(),
          receiver_receipt_url = COALESCE($3, receiver_receipt_url),
          receiver_receipt_filename = COALESCE($4, receiver_receipt_filename),
          receiver_receipt_urls = CASE WHEN $5::jsonb <> '[]'::jsonb THEN $5::jsonb ELSE receiver_receipt_urls END
      WHERE id = $2::uuid
      `,
      [userId, transferId, primaryUrl, receiptData?.receiverReceiptFilename?.trim() || null, jsonUrls]
    );

    // Notificar al usuario emisor si existe
    if (t.created_by) {
      await client.query(
        `
        INSERT INTO notifications (user_id, type, title, body, payload)
        VALUES ($1::uuid, 'cash_transfer_approved', $2, $3, $4::jsonb)
        `,
        [
          t.created_by,
          `✅ Traslado de dinero ${t.code} recibido con éxito`,
          `La sede de destino confirmó la recepción y el dinero ya fue ingresado a caja.`,
          JSON.stringify({ transferId, code: t.code }),
        ]
      );
    }

    await client.query("COMMIT");

    const detail = await getCashTransferDetail(pool, transferId);
    if (!detail) throw new Error("transfer_detail_not_found");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectCashTransfer(
  pool: pg.Pool,
  transferId: string,
  reason: string,
  userId: string
): Promise<CashTransferItem> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: tRows } = await client.query<{
      status: string;
      code: string;
      created_by: string | null;
    }>(
      `SELECT status, code, created_by::text FROM cash_transfers WHERE id = $1::uuid FOR UPDATE`,
      [transferId]
    );

    if (!tRows[0]) {
      throw Object.assign(new Error("transfer_not_found"), { code: "transfer_not_found" });
    }

    if (tRows[0].status !== "pending") {
      throw Object.assign(new Error("transfer_already_processed"), {
        code: "transfer_already_processed",
        message: "Este traslado ya fue procesado.",
      });
    }

    await client.query(
      `
      UPDATE cash_transfers
      SET status = 'rejected',
          rejection_reason = $1,
          approved_by = $2::uuid,
          approved_at = now()
      WHERE id = $3::uuid
      `,
      [reason.trim() || "Rechazado por inconsistencia", userId, transferId]
    );

    if (tRows[0].created_by) {
      await client.query(
        `
        INSERT INTO notifications (user_id, type, title, body, payload)
        VALUES ($1::uuid, 'cash_transfer_rejected', $2, $3, $4::jsonb)
        `,
        [
          tRows[0].created_by,
          `❌ Traslado de dinero ${tRows[0].code} rechazado`,
          `La sede destino rechazó el traslado. Motivo: ${reason.trim()}`,
          JSON.stringify({ transferId, code: tRows[0].code, reason }),
        ]
      );
    }

    await client.query("COMMIT");

    const detail = await getCashTransferDetail(pool, transferId);
    if (!detail) throw new Error("transfer_detail_not_found");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listCashTransfers(
  pool: pg.Pool,
  opts?: {
    warehouseId?: string | null;
    role?: "origin" | "destination" | "either";
    status?: TransferStatus | null;
    limit?: number;
    offset?: number;
  }
): Promise<{
  items: CashTransferItem[];
  total: number;
  pendingCount: number;
}> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (opts?.warehouseId) {
    params.push(opts.warehouseId);
    const idx = params.length;
    if (opts.role === "origin") {
      conditions.push(`ct.origin_warehouse_id = $${idx}::uuid`);
    } else if (opts.role === "destination") {
      conditions.push(`ct.destination_warehouse_id = $${idx}::uuid`);
    } else {
      conditions.push(`(ct.origin_warehouse_id = $${idx}::uuid OR ct.destination_warehouse_id = $${idx}::uuid)`);
    }
  }

  if (opts?.status) {
    params.push(opts.status);
    conditions.push(`ct.status = $${params.length}`);
  }

  const whereSql = conditions.join(" AND ");

  const { rows: sumRows } = await pool.query<{ count: string; pending_count: string }>(
    `
    SELECT
      COUNT(*)::text AS count,
      COUNT(*) FILTER (WHERE ct.status = 'pending')::text AS pending_count
    FROM cash_transfers ct
    WHERE ${whereSql}
    `,
    params
  );

  const total = Number(sumRows[0]?.count ?? 0);
  const pendingCount = Number(sumRows[0]?.pending_count ?? 0);

  const limit = opts?.limit ? Math.min(Math.max(1, opts.limit), 100) : 50;
  const offset = opts?.offset ? Math.max(0, opts.offset) : 0;

  const listParams = [...params, limit, offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;

  const { rows: items } = await pool.query<CashTransferItem>(
    `
    SELECT
      ct.id::text,
      ct.code,
      ct.origin_warehouse_id::text AS "originWarehouseId",
      ow.code AS "originWarehouseCode",
      ow.name AS "originWarehouseName",
      ct.destination_warehouse_id::text AS "destinationWarehouseId",
      dw.code AS "destinationWarehouseCode",
      dw.name AS "destinationWarehouseName",
      ct.amount::float,
      ct.carrier_name AS "carrierName",
      ct.carrier_doc AS "carrierDoc",
      ct.concept,
      ct.payment_method AS "paymentMethod",
      ct.status,
      ct.rejection_reason AS "rejectionReason",
      ct.sender_receipt_url AS "senderReceiptUrl",
      ct.sender_receipt_filename AS "senderReceiptFilename",
      COALESCE(ct.sender_receipt_urls, '[]'::jsonb) AS "senderReceiptUrls",
      ct.receiver_receipt_url AS "receiverReceiptUrl",
      ct.receiver_receipt_filename AS "receiverReceiptFilename",
      COALESCE(ct.receiver_receipt_urls, '[]'::jsonb) AS "receiverReceiptUrls",
      ct.created_at AS "createdAt",
      u1.full_name AS "createdByName",
      ct.approved_at AS "approvedAt",
      u2.full_name AS "approvedByName"
    FROM cash_transfers ct
    JOIN warehouses ow ON ow.id = ct.origin_warehouse_id
    JOIN warehouses dw ON dw.id = ct.destination_warehouse_id
    LEFT JOIN users u1 ON u1.id = ct.created_by
    LEFT JOIN users u2 ON u2.id = ct.approved_by
    WHERE ${whereSql}
    ORDER BY
      CASE WHEN ct.status = 'pending' THEN 0 ELSE 1 END,
      ct.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    listParams
  );

  return { items, total, pendingCount };
}

export async function getCashTransferDetail(
  pool: pg.Pool,
  id: string
): Promise<CashTransferItem | null> {
  const { rows } = await pool.query<CashTransferItem>(
    `
    SELECT
      ct.id::text,
      ct.code,
      ct.origin_warehouse_id::text AS "originWarehouseId",
      ow.code AS "originWarehouseCode",
      ow.name AS "originWarehouseName",
      ct.destination_warehouse_id::text AS "destinationWarehouseId",
      dw.code AS "destinationWarehouseCode",
      dw.name AS "destinationWarehouseName",
      ct.amount::float,
      ct.carrier_name AS "carrierName",
      ct.carrier_doc AS "carrierDoc",
      ct.concept,
      ct.payment_method AS "paymentMethod",
      ct.status,
      ct.rejection_reason AS "rejectionReason",
      ct.sender_receipt_url AS "senderReceiptUrl",
      ct.sender_receipt_filename AS "senderReceiptFilename",
      COALESCE(ct.sender_receipt_urls, '[]'::jsonb) AS "senderReceiptUrls",
      ct.receiver_receipt_url AS "receiverReceiptUrl",
      ct.receiver_receipt_filename AS "receiverReceiptFilename",
      COALESCE(ct.receiver_receipt_urls, '[]'::jsonb) AS "receiverReceiptUrls",
      ct.created_at AS "createdAt",
      u1.full_name AS "createdByName",
      ct.approved_at AS "approvedAt",
      u2.full_name AS "approvedByName"
    FROM cash_transfers ct
    JOIN warehouses ow ON ow.id = ct.origin_warehouse_id
    JOIN warehouses dw ON dw.id = ct.destination_warehouse_id
    LEFT JOIN users u1 ON u1.id = ct.created_by
    LEFT JOIN users u2 ON u2.id = ct.approved_by
    WHERE ct.id = $1::uuid
    `,
    [id]
  );

  return rows[0] || null;
}
