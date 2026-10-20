import { Router } from "express";
import { getTodayBogotaYmd, getFirstDayOfMonthBogotaYmd } from "../lib/date-utils.js";
import { getPool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { isUuid } from "../lib/uuid.js";
import {
  addReceivablePayment,
  getCustomerCreditProfile,
  getPaymentsCashSummary,
  getReceivableDetail,
  getReceivablesByWarehouseReport,
  listAccountsReceivable,
} from "../services/finance/receivables.js";
import {
  addLayawayPayment,
  cancelLayaway,
  createLayaway,
  getActiveLayawayForCustomer,
  getLayawayDetail,
  listLayaways,
} from "../services/finance/layaways.js";
import {
  createSupplier,
  updateSupplier,
  listSuppliers,
  getSupplierProfile,
  createAccountPayable,
  listAccountsPayable,
  getAccountPayableDetail,
  addPayablePayment,
  getEgressSummary,
} from "../services/finance/payables.js";
import {
  createCashOutflow,
  listCashOutflows,
  getCashOutflowDetail,
  createCashTransfer,
  approveCashTransfer,
  rejectCashTransfer,
  listCashTransfers,
  getCashTransferDetail,
} from "../services/finance/transfers-egress.js";
import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  listPayrollPayments,
  getPayrollPaymentDetail,
  createPayrollPayment,
  attachPayrollReceipt,
  getPayrollSummary,
} from "../services/finance/payroll.js";
import {
  payrollReceiptUpload,
  savePayrollReceiptFile,
} from "../lib/payroll-uploads.js";
import {
  getDailyClosureData,
  saveDailyClosure,
  getDailyClosureDetail,
  listDailyClosures,
  attachReceiptToOperation,
} from "../services/finance/daily-closures.js";
import {
  closureReceiptUpload,
  closureReceiptsMultiUpload,
  saveClosureReceiptFile,
} from "../lib/closure-uploads.js";
import {
  getGeneralClosureData,
  saveGeneralClosure,
  getGeneralClosureDetail,
  listGeneralClosures,
} from "../services/finance/general-closures.js";

export function createFinanceRouter(): Router {
  const r = Router();

  /**
   * Listado de cuentas por cobrar con filtros y totales.
   */
  r.get("/receivables", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    let targetWh: string | null = null;
    const requestedWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (!auth.hasAdminAccess && (!auth.warehouseIds || !auth.warehouseIds.includes(requestedWh))) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      targetWh = requestedWh;
    } else if (!auth.hasAdminAccess) {
      if (!auth.warehouseIds || auth.warehouseIds.length === 0) {
        res.status(403).json({ error: "no_warehouse_assigned" });
        return;
      }
      targetWh = auth.warehouseIds[0]!;
    }

    const status = req.query.status as any;
    const customerId =
      typeof req.query.customerId === "string" && isUuid(req.query.customerId)
        ? req.query.customerId
        : null;
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : null;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    try {
      const result = await listAccountsReceivable(pool, {
        warehouseId: targetWh,
        status,
        customerId,
        dateFrom,
        dateTo,
        query: q,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Detalle de un crédito específico.
   */
  r.get("/receivables/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const detail = await getReceivableDetail(pool, id);
      if (!detail) {
        res.status(404).json({ error: "receivable_not_found" });
        return;
      }
      res.json({ item: detail });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Registrar un abono a un crédito.
   */
  r.post("/receivables/:id/payments", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const warehouseId =
      typeof req.body?.warehouseId === "string" && isUuid(req.body.warehouseId)
        ? req.body.warehouseId
        : null;
    if (!warehouseId) {
      res.status(400).json({ error: "warehouse_id_required" });
      return;
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }

    const paymentMethod =
      typeof req.body?.paymentMethod === "string" && req.body.paymentMethod.trim()
        ? req.body.paymentMethod.trim()
        : "efectivo";

    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const receiptUrl = typeof req.body?.receiptUrl === "string" ? req.body.receiptUrl : null;
    const receiptUrls = Array.isArray(req.body?.receiptUrls)
      ? req.body.receiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
      : null;
    const receiptFilename = typeof req.body?.receiptFilename === "string" ? req.body.receiptFilename : null;

    try {
      const result = await addReceivablePayment(pool, {
        receivableId: id,
        warehouseId,
        paymentMethod,
        amount,
        notes,
        userId: req.auth!.userId,
        receiptUrl,
        receiptUrls,
        receiptFilename,
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err.code === "insufficient_credit_balance") {
        res.status(400).json({
          error: "insufficient_credit_balance",
          message: "El cliente no tiene suficiente saldo a favor.",
          available: err.available,
          requested: err.requested,
        });
        return;
      }
      if (err.code === "receivable_not_found") {
        res.status(404).json({ error: "receivable_not_found" });
        return;
      }
      next(err);
    }
  });

  /**
   * Estado de cuenta y perfil de crédito de un cliente.
   */
  r.get("/customers/:customerId/credit-profile", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const customerId = String(req.params.customerId);
    if (!isUuid(customerId)) {
      res.status(400).json({ error: "invalid_customer_id" });
      return;
    }

    try {
      const profile = await getCustomerCreditProfile(pool, customerId);
      if (!profile) {
        res.status(404).json({ error: "customer_not_found" });
        return;
      }
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Reporte consolidado de cartera por sede.
   */
  r.get("/reports/warehouse-receivables", requireAuth, async (_req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    try {
      const report = await getReceivablesByWarehouseReport(pool);
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Resumen de caja y medios de pago (Ventas + Abonos).
   */
  r.get("/summary/payments-cash", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    let targetWh: string | null = null;
    const requestedWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (!auth.hasAdminAccess && (!auth.warehouseIds || !auth.warehouseIds.includes(requestedWh))) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      targetWh = requestedWh;
    } else if (!auth.hasAdminAccess) {
      if (!auth.warehouseIds || auth.warehouseIds.length === 0) {
        res.status(403).json({ error: "no_warehouse_assigned" });
        return;
      }
      targetWh = auth.warehouseIds[0]!;
    }

    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : null;

    try {
      const summary = await getPaymentsCashSummary(pool, {
        warehouseId: targetWh,
        dateFrom,
        dateTo,
      });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  /**
   * ─────────────────────────────────────────────────────────────────────────────
   * APARTADOS / PLAN SEPARE
   * ─────────────────────────────────────────────────────────────────────────────
   */

  /**
   * Listar apartados con filtros.
   */
  r.get("/layaways", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    let targetWh: string | null = null;
    const requestedWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (!auth.hasAdminAccess && (!auth.warehouseIds || !auth.warehouseIds.includes(requestedWh))) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      targetWh = requestedWh;
    } else if (!auth.hasAdminAccess) {
      if (!auth.warehouseIds || auth.warehouseIds.length === 0) {
        res.status(403).json({ error: "no_warehouse_assigned" });
        return;
      }
      targetWh = auth.warehouseIds[0]!;
    }

    const status = req.query.status as any;
    const customerId =
      typeof req.query.customerId === "string" && isUuid(req.query.customerId)
        ? req.query.customerId
        : null;
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : null;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    try {
      const result = await listLayaways(pool, {
        warehouseId: targetWh,
        status,
        customerId,
        dateFrom,
        dateTo,
        query: q,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Crear nuevo apartado.
   */
  r.post("/layaways", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const warehouseId =
      typeof req.body?.warehouseId === "string" && isUuid(req.body.warehouseId)
        ? req.body.warehouseId
        : null;
    if (!warehouseId) {
      res.status(400).json({ error: "warehouse_id_required" });
      return;
    }

    const customerId =
      typeof req.body?.customerId === "string" && isUuid(req.body.customerId)
        ? req.body.customerId
        : null;
    if (!customerId) {
      res.status(400).json({ error: "customer_id_required" });
      return;
    }

    const targetAmount = Number(req.body?.targetAmount) || 0;
    const initialPayment = Number(req.body?.initialPayment) || 0;
    const paymentMethod = typeof req.body?.paymentMethod === "string" ? req.body.paymentMethod : "efectivo";
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const expiryDate = typeof req.body?.expiryDate === "string" ? req.body.expiryDate : null;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const receiptUrl = typeof req.body?.receiptUrl === "string" ? req.body.receiptUrl : null;
    const receiptUrls = Array.isArray(req.body?.receiptUrls)
      ? req.body.receiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
      : null;
    const receiptFilename = typeof req.body?.receiptFilename === "string" ? req.body.receiptFilename : null;

    try {
      const layaway = await createLayaway(pool, {
        warehouseId,
        customerId,
        targetAmount,
        initialPayment,
        paymentMethod,
        items,
        expiryDate,
        notes,
        userId: req.auth!.userId,
        receiptUrl,
        receiptUrls,
        receiptFilename,
      });
      res.status(201).json({ item: layaway });
    } catch (err: any) {
      if (err.code === "insufficient_credit_balance") {
        res.status(400).json({
          error: "insufficient_credit_balance",
          message: "Saldo a favor insuficiente.",
        });
        return;
      }
      next(err);
    }
  });

  /**
   * Detalle de un apartado.
   */
  r.get("/layaways/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await getLayawayDetail(pool, id);
      if (!item) {
        res.status(404).json({ error: "layaway_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Registrar abono a un apartado.
   */
  r.post("/layaways/:id/payments", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const warehouseId =
      typeof req.body?.warehouseId === "string" && isUuid(req.body.warehouseId)
        ? req.body.warehouseId
        : null;
    if (!warehouseId) {
      res.status(400).json({ error: "warehouse_id_required" });
      return;
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }

    const paymentMethod = typeof req.body?.paymentMethod === "string" ? req.body.paymentMethod : "efectivo";
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const receiptUrl = typeof req.body?.receiptUrl === "string" ? req.body.receiptUrl : null;
    const receiptUrls = Array.isArray(req.body?.receiptUrls)
      ? req.body.receiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
      : null;
    const receiptFilename = typeof req.body?.receiptFilename === "string" ? req.body.receiptFilename : null;

    try {
      const result = await addLayawayPayment(pool, {
        layawayId: id,
        warehouseId,
        paymentMethod,
        amount,
        notes,
        userId: req.auth!.userId,
        receiptUrl,
        receiptUrls,
        receiptFilename,
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err.code === "insufficient_credit_balance") {
        res.status(400).json({ error: "insufficient_credit_balance", message: "Saldo a favor insuficiente." });
        return;
      }
      if (err.code === "layaway_not_found") {
        res.status(404).json({ error: "layaway_not_found" });
        return;
      }
      if (err.code === "layaway_not_active") {
        res.status(400).json({ error: "layaway_not_active", message: "El apartado no está activo." });
        return;
      }
      next(err);
    }
  });

  /**
   * Cancelar un apartado.
   */
  r.post("/layaways/:id/cancel", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const refundToCreditBalance = req.body?.refundToCreditBalance === true;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;

    try {
      const result = await cancelLayaway(pool, id, { refundToCreditBalance, notes });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Obtener apartado activo de un cliente (usado en POS).
   */
  r.get("/customers/:customerId/active-layaway", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const customerId = String(req.params.customerId);
    if (!isUuid(customerId)) {
      res.status(400).json({ error: "invalid_customer_id" });
      return;
    }

    try {
      const item = await getActiveLayawayForCustomer(pool, customerId);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  // ─── Proveedores ───────────────────────────────────────────────────────────

  /**
   * Listar proveedores con deuda activa y saldo a favor.
   */
  r.get("/suppliers", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim() : null;
    const activeOnly = req.query.activeOnly === "true" || req.query.activeOnly === "1";
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    try {
      const result = await listSuppliers(pool, { q, activeOnly, limit, offset });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Crear proveedor.
   */
  r.post("/suppliers", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "supplier_name_required" });
      return;
    }

    try {
      const item = await createSupplier(pool, {
        name,
        taxId: typeof req.body?.taxId === "string" ? req.body.taxId : null,
        phone: typeof req.body?.phone === "string" ? req.body.phone : null,
        email: typeof req.body?.email === "string" ? req.body.email : null,
        address: typeof req.body?.address === "string" ? req.body.address : null,
        city: typeof req.body?.city === "string" ? req.body.city : null,
        contactName: typeof req.body?.contactName === "string" ? req.body.contactName : null,
        bankName: typeof req.body?.bankName === "string" ? req.body.bankName : null,
        bankAccountType: typeof req.body?.bankAccountType === "string" ? req.body.bankAccountType : null,
        bankAccountNumber: typeof req.body?.bankAccountNumber === "string" ? req.body.bankAccountNumber : null,
        notes: typeof req.body?.notes === "string" ? req.body.notes : null,
      });
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Obtener perfil / estado de cuenta del proveedor.
   */
  r.get("/suppliers/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const profile = await getSupplierProfile(pool, id);
      if (!profile) {
        res.status(404).json({ error: "supplier_not_found" });
        return;
      }
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Actualizar proveedor.
   */
  r.put("/suppliers/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await updateSupplier(pool, id, req.body || {});
      res.json({ item });
    } catch (err: any) {
      if (err.code === "supplier_not_found") {
        res.status(404).json({ error: "supplier_not_found" });
        return;
      }
      next(err);
    }
  });

  // ─── Cuentas por Pagar (Accounts Payable) ───────────────────────────────────

  /**
   * Listar cuentas por pagar / deudas a proveedores.
   */
  r.get("/payables", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    let targetWh: string | null = null;
    const requestedWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      if (!auth.hasAdminAccess && (!auth.warehouseIds || !auth.warehouseIds.includes(requestedWh))) {
        res.status(403).json({ error: "warehouse_forbidden" });
        return;
      }
      targetWh = requestedWh;
    } else if (!auth.hasAdminAccess) {
      if (!auth.warehouseIds || auth.warehouseIds.length === 0) {
        res.status(403).json({ error: "no_warehouse_assigned" });
        return;
      }
      targetWh = auth.warehouseIds[0]!;
    }

    const supplierId =
      typeof req.query.supplierId === "string" && isUuid(req.query.supplierId)
        ? req.query.supplierId
        : null;
    const status = req.query.status as any;
    const dueDateFrom = typeof req.query.dueDateFrom === "string" ? req.query.dueDateFrom.trim() : null;
    const dueDateTo = typeof req.query.dueDateTo === "string" ? req.query.dueDateTo.trim() : null;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    try {
      const result = await listAccountsPayable(pool, {
        warehouseId: targetWh,
        supplierId,
        status,
        dueDateFrom,
        dueDateTo,
        query: q,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Crear nueva cuenta por pagar / registrar factura de proveedor.
   */
  r.post("/payables", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const supplierId =
      typeof req.body?.supplierId === "string" && isUuid(req.body.supplierId)
        ? req.body.supplierId
        : null;
    if (!supplierId) {
      res.status(400).json({ error: "supplier_id_required" });
      return;
    }

    const warehouseId =
      typeof req.body?.warehouseId === "string" && isUuid(req.body.warehouseId)
        ? req.body.warehouseId
        : null;
    if (!warehouseId) {
      res.status(400).json({ error: "warehouse_id_required" });
      return;
    }

    const totalAmount = Number(req.body?.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      res.status(400).json({ error: "invalid_total_amount" });
      return;
    }

    const billNumber = typeof req.body?.billNumber === "string" ? req.body.billNumber : null;
    const description = typeof req.body?.description === "string" ? req.body.description : null;
    const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate : null;
    const issueDate = typeof req.body?.issueDate === "string" ? req.body.issueDate : null;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const initialPayment = Number(req.body?.initialPayment) || 0;
    const paymentMethod = typeof req.body?.paymentMethod === "string" ? req.body.paymentMethod : "efectivo";
    const referenceCode = typeof req.body?.referenceCode === "string" ? req.body.referenceCode : null;

    try {
      const result = await createAccountPayable(pool, {
        supplierId,
        warehouseId,
        totalAmount,
        billNumber,
        description,
        dueDate,
        issueDate,
        notes,
        initialPayment,
        paymentMethod,
        referenceCode,
        userId: req.auth!.userId,
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err.code === "insufficient_credit_balance") {
        res.status(400).json({
          error: "insufficient_credit_balance",
          message: "Saldo a favor con el proveedor insuficiente.",
          available: err.available,
          requested: err.requested,
        });
        return;
      }
      if (err.code === "supplier_not_found") {
        res.status(404).json({ error: "supplier_not_found" });
        return;
      }
      next(err);
    }
  });

  /**
   * Detalle de una cuenta por pagar.
   */
  r.get("/payables/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await getAccountPayableDetail(pool, id);
      if (!item) {
        res.status(404).json({ error: "payable_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Registrar pago / abono a una cuenta por pagar (emite Comprobante de Egreso).
   */
  r.post("/payables/:id/payments", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const warehouseId =
      typeof req.body?.warehouseId === "string" && isUuid(req.body.warehouseId)
        ? req.body.warehouseId
        : null;
    if (!warehouseId) {
      res.status(400).json({ error: "warehouse_id_required" });
      return;
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }

    const paymentMethod = typeof req.body?.paymentMethod === "string" ? req.body.paymentMethod : "efectivo";
    const referenceCode = typeof req.body?.referenceCode === "string" ? req.body.referenceCode : null;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const receiptUrl = typeof req.body?.receiptUrl === "string" ? req.body.receiptUrl : null;
    const receiptUrls = Array.isArray(req.body?.receiptUrls)
      ? req.body.receiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
      : null;
    const receiptFilename = typeof req.body?.receiptFilename === "string" ? req.body.receiptFilename : null;

    try {
      const result = await addPayablePayment(pool, {
        payableId: id,
        warehouseId,
        paymentMethod,
        amount,
        referenceCode,
        notes,
        userId: req.auth!.userId,
        receiptUrl,
        receiptUrls,
        receiptFilename,
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err.code === "insufficient_credit_balance") {
        res.status(400).json({
          error: "insufficient_credit_balance",
          message: "Saldo a favor con el proveedor insuficiente.",
          available: err.available,
          requested: err.requested,
        });
        return;
      }
      if (err.code === "payable_not_found") {
        res.status(404).json({ error: "payable_not_found" });
        return;
      }
      if (err.code === "payable_already_paid") {
        res.status(400).json({ error: "payable_already_paid", message: "Esta deuda ya fue pagada en su totalidad." });
        return;
      }
      next(err);
    }
  });

  /**
   * Resumen de salidas de dinero / egresos por método.
   */
  r.get("/summary/egress-cash", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    let targetWh: string | null = null;
    const requestedWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      targetWh = requestedWh;
    } else if (!auth.hasAdminAccess && auth.warehouseIds && auth.warehouseIds.length > 0) {
      targetWh = auth.warehouseIds[0]!;
    }

    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : null;

    try {
      const result = await getEgressSummary(pool, {
        warehouseId: targetWh,
        dateFrom,
        dateTo,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ─── Comprobantes de Egreso (Salidas Generales de Dinero) ───────────────────

  /**
   * Listar comprobantes de egreso / salidas de dinero.
   */
  r.get("/outflows", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    let targetWh: string | null = null;
    const requestedWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      targetWh = requestedWh;
    } else if (!auth.hasAdminAccess && auth.warehouseIds && auth.warehouseIds.length > 0) {
      targetWh = auth.warehouseIds[0]!;
    }

    const supplierId =
      typeof req.query.supplierId === "string" && isUuid(req.query.supplierId)
        ? req.query.supplierId
        : null;
    const paymentMethod = typeof req.query.paymentMethod === "string" ? req.query.paymentMethod : null;
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : null;
    const query = typeof req.query.q === "string" ? req.query.q.trim() : null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    try {
      const result = await listCashOutflows(pool, {
        warehouseId: targetWh,
        supplierId,
        paymentMethod,
        dateFrom,
        dateTo,
        query,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Crear comprobante de egreso (salida de dinero).
   */
  r.post("/outflows", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const warehouseId =
      typeof req.body?.warehouseId === "string" && isUuid(req.body.warehouseId)
        ? req.body.warehouseId
        : null;
    if (!warehouseId) {
      res.status(400).json({ error: "warehouse_id_required" });
      return;
    }

    const concept = typeof req.body?.concept === "string" ? req.body.concept : "";
    const beneficiaryName = typeof req.body?.beneficiaryName === "string" ? req.body.beneficiaryName : "";
    const beneficiaryDoc = typeof req.body?.beneficiaryDoc === "string" ? req.body.beneficiaryDoc : null;
    const amount = Number(req.body?.amount);
    const paymentMethod = typeof req.body?.paymentMethod === "string" ? req.body.paymentMethod : "efectivo";
    const supplierId = typeof req.body?.supplierId === "string" && isUuid(req.body.supplierId) ? req.body.supplierId : null;
    const payableId = typeof req.body?.payableId === "string" && isUuid(req.body.payableId) ? req.body.payableId : null;
    const referenceCode = typeof req.body?.referenceCode === "string" ? req.body.referenceCode : null;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const receiptUrl = typeof req.body?.receiptUrl === "string" ? req.body.receiptUrl : null;
    const receiptUrls = Array.isArray(req.body?.receiptUrls)
      ? req.body.receiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
      : null;
    const receiptFilename = typeof req.body?.receiptFilename === "string" ? req.body.receiptFilename : null;

    try {
      const item = await createCashOutflow(pool, {
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
        userId: req.auth!.userId,
        receiptUrl,
        receiptUrls,
        receiptFilename,
      });
      res.status(201).json({ item });
    } catch (err: any) {
      if (err.code === "bank_account_restricted_to_main_warehouse") {
        res.status(403).json({
          error: "bank_account_restricted_to_main_warehouse",
          message: err.message,
        });
        return;
      }
      if (err.code === "concept_required" || err.code === "beneficiary_required" || err.code === "invalid_amount") {
        res.status(400).json({ error: err.code });
        return;
      }
      next(err);
    }
  });

  /**
   * Detalle de un comprobante de egreso.
   */
  r.get("/outflows/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await getCashOutflowDetail(pool, id);
      if (!item) {
        res.status(404).json({ error: "outflow_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  // ─── Traslados de Dinero entre Sedes ───────────────────────────────────────

  /**
   * Listar traslados de dinero entre sedes.
   */
  r.get("/transfers", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    let targetWh: string | null = null;
    const requestedWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      targetWh = requestedWh;
    } else if (!auth.hasAdminAccess && auth.warehouseIds && auth.warehouseIds.length > 0) {
      targetWh = auth.warehouseIds[0]!;
    }

    const role = (req.query.role as any) || "either";
    const status = req.query.status as any;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    try {
      const result = await listCashTransfers(pool, {
        warehouseId: targetWh,
        role,
        status,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Crear traslado de dinero (queda en estado pending y notifica a la sede destino).
   */
  r.post("/transfers", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const originWarehouseId =
      typeof req.body?.originWarehouseId === "string" && isUuid(req.body.originWarehouseId)
        ? req.body.originWarehouseId
        : null;
    if (!originWarehouseId) {
      res.status(400).json({ error: "origin_warehouse_id_required" });
      return;
    }

    const destinationWarehouseId =
      typeof req.body?.destinationWarehouseId === "string" && isUuid(req.body.destinationWarehouseId)
        ? req.body.destinationWarehouseId
        : null;
    if (!destinationWarehouseId) {
      res.status(400).json({ error: "destination_warehouse_id_required" });
      return;
    }

    const amount = Number(req.body?.amount);
    const carrierName = typeof req.body?.carrierName === "string" ? req.body.carrierName : "";
    const carrierDoc = typeof req.body?.carrierDoc === "string" ? req.body.carrierDoc : null;
    const concept = typeof req.body?.concept === "string" ? req.body.concept : "";
    const paymentMethod = typeof req.body?.paymentMethod === "string" ? req.body.paymentMethod : "efectivo";
    const senderReceiptUrl = typeof req.body?.senderReceiptUrl === "string" ? req.body.senderReceiptUrl : null;
    const senderReceiptUrls = Array.isArray(req.body?.senderReceiptUrls)
      ? req.body.senderReceiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
      : null;
    const senderReceiptFilename = typeof req.body?.senderReceiptFilename === "string" ? req.body.senderReceiptFilename : null;

    try {
      const item = await createCashTransfer(pool, {
        originWarehouseId,
        destinationWarehouseId,
        amount,
        carrierName,
        carrierDoc,
        concept,
        paymentMethod,
        userId: req.auth!.userId,
        senderReceiptUrl,
        senderReceiptUrls,
        senderReceiptFilename,
      });
      res.status(201).json({ item });
    } catch (err: any) {
      if (err.code === "bank_account_restricted_to_main_warehouse") {
        res.status(403).json({ error: err.code, message: err.message });
        return;
      }
      if (err.code === "origin_destination_same" || err.code === "carrier_required" || err.code === "invalid_amount") {
        res.status(400).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  });

  /**
   * Detalle de un traslado de dinero.
   */
  r.get("/transfers/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await getCashTransferDetail(pool, id);
      if (!item) {
        res.status(404).json({ error: "transfer_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Aprobar traslado de dinero (sede destino confirma recepción y deposita en su caja).
   */
  r.post("/transfers/:id/approve", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const receiverReceiptUrl = typeof req.body?.receiverReceiptUrl === "string" ? req.body.receiverReceiptUrl : null;
    const receiverReceiptUrls = Array.isArray(req.body?.receiverReceiptUrls)
      ? req.body.receiverReceiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
      : null;
    const receiverReceiptFilename = typeof req.body?.receiverReceiptFilename === "string" ? req.body.receiverReceiptFilename : null;

    try {
      const item = await approveCashTransfer(pool, id, req.auth!.userId, {
        receiverReceiptUrl,
        receiverReceiptUrls,
        receiverReceiptFilename,
      });
      res.json({ item });
    } catch (err: any) {
      if (err.code === "transfer_not_found") {
        res.status(404).json({ error: "transfer_not_found" });
        return;
      }
      if (err.code === "transfer_already_processed") {
        res.status(400).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  });

  /**
   * Rechazar traslado de dinero.
   */
  r.post("/transfers/:id/reject", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason : "Inconsistencia o dinero no recibido";

    try {
      const item = await rejectCashTransfer(pool, id, reason, req.auth!.userId);
      res.json({ item });
    } catch (err: any) {
      if (err.code === "transfer_not_found") {
        res.status(404).json({ error: "transfer_not_found" });
        return;
      }
      if (err.code === "transfer_already_processed") {
        res.status(400).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  });

  // ─── Empleados y Nómina ───────────────────────────────────────────────────

  /**
   * Listar empleados.
   */
  r.get("/employees", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : null;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : null;
    const isActive = req.query.isActive === "false" ? false : req.query.isActive === "true" ? true : null;

    try {
      const items = await listEmployees(pool, { warehouseId, search, isActive });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Obtener detalle de un empleado.
   */
  r.get("/employees/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await getEmployeeById(pool, id);
      if (!item) {
        res.status(404).json({ error: "employee_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Crear un nuevo empleado.
   */
  r.post("/employees", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const body = req.body || {};
    if (!body.fullName || typeof body.fullName !== "string" || !body.fullName.trim()) {
      res.status(400).json({ error: "full_name_required" });
      return;
    }
    if (!body.documentNumber || typeof body.documentNumber !== "string" || !body.documentNumber.trim()) {
      res.status(400).json({ error: "document_number_required" });
      return;
    }
    if (!body.position || typeof body.position !== "string" || !body.position.trim()) {
      res.status(400).json({ error: "position_required" });
      return;
    }

    try {
      const item = await createEmployee(pool, {
        code: body.code,
        fullName: body.fullName,
        documentType: body.documentType,
        documentNumber: body.documentNumber,
        phone: body.phone,
        email: body.email,
        position: body.position,
        warehouseId: body.warehouseId,
        baseSalary: body.baseSalary !== undefined ? Number(body.baseSalary) : 0,
        paymentFrequency: body.paymentFrequency,
        bankName: body.bankName,
        bankAccountType: body.bankAccountType,
        bankAccountNumber: body.bankAccountNumber,
        notes: body.notes,
      });
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Actualizar empleado.
   */
  r.put("/employees/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await updateEmployee(pool, id, req.body || {});
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Subir soporte de transferencia bancaria de nómina ("el que mande Maicol").
   */
  r.post("/payroll/upload-receipt", requireAuth, payrollReceiptUpload.single("file"), async (req, res, next) => {
    if (!req.file) {
      res.status(400).json({ error: "no_file_uploaded" });
      return;
    }

    try {
      const saved = await savePayrollReceiptFile(req.file.buffer, req.file.originalname);
      res.json(saved);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Listar pagos de nómina.
   */
  r.get("/payroll/payments", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : null;
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId.trim() : null;
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : null;
    const paymentMethod = typeof req.query.paymentMethod === "string" ? req.query.paymentMethod.trim() : null;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : null;

    try {
      const items = await listPayrollPayments(pool, {
        warehouseId,
        employeeId,
        dateFrom,
        dateTo,
        paymentMethod,
        search,
      });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Obtener detalle de un pago de nómina.
   */
  r.get("/payroll/payments/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await getPayrollPaymentDetail(pool, id);
      if (!item) {
        res.status(404).json({ error: "payroll_payment_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Crear un nuevo pago de nómina con comprobante / voucher.
   */
  r.post("/payroll/payments", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const body = req.body || {};
    if (!body.employeeId || !isUuid(body.employeeId)) {
      res.status(400).json({ error: "invalid_employee_id" });
      return;
    }
    if (!body.warehouseId || !isUuid(body.warehouseId)) {
      res.status(400).json({ error: "invalid_warehouse_id" });
      return;
    }
    if (!body.periodConcept || typeof body.periodConcept !== "string" || !body.periodConcept.trim()) {
      res.status(400).json({ error: "period_concept_required" });
      return;
    }
    if (!body.periodStart || !body.periodEnd) {
      res.status(400).json({ error: "period_dates_required" });
      return;
    }
    if (!body.paymentMethod || typeof body.paymentMethod !== "string") {
      res.status(400).json({ error: "payment_method_required" });
      return;
    }

    try {
      const item = await createPayrollPayment(pool, {
        employeeId: body.employeeId,
        warehouseId: body.warehouseId,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        periodConcept: body.periodConcept,
        baseSalary: Number(body.baseSalary ?? 0),
        bonuses: body.bonuses !== undefined ? Number(body.bonuses) : 0,
        deductions: body.deductions !== undefined ? Number(body.deductions) : 0,
        paymentMethod: body.paymentMethod,
        paymentDate: body.paymentDate,
        transferReceiptUrl: body.transferReceiptUrl,
        transferReceiptUrls: Array.isArray(body.transferReceiptUrls)
          ? body.transferReceiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
          : null,
        transferReceiptFilename: body.transferReceiptFilename,
        referenceCode: body.referenceCode,
        notes: body.notes,
        userId: req.auth!.userId,
      });
      res.status(201).json({ item });
    } catch (err: any) {
      if (err.message === "employee_not_found" || err.message === "warehouse_not_found") {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  /**
   * Adjuntar soporte de transferencia a un pago existente.
   */
  r.post("/payroll/payments/:id/receipt", requireAuth, payrollReceiptUpload.any(), async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    if (files.length === 0) {
      res.status(400).json({ error: "no_file_uploaded" });
      return;
    }

    try {
      const savedList = await Promise.all(
        files.map((f) => savePayrollReceiptFile(f.buffer, f.originalname))
      );
      const urls = savedList.map((s) => s.publicUrl);
      const referenceCode = typeof req.body?.referenceCode === "string" ? req.body.referenceCode : undefined;
      const updated = await attachPayrollReceipt(pool, id, {
        url: urls[0],
        urls,
        filename: savedList[0].filename,
        referenceCode,
      });
      res.json({ item: updated });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Resumen de nómina.
   */
  r.get("/payroll/summary", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : null;
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : null;

    try {
      const summary = await getPayrollSummary(pool, { warehouseId, dateFrom, dateTo });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  // ─── Cierres Diarios y Arqueo Consolidado ─────────────────────────────────

  /**
   * Obtener hoja de trabajo de cierre diario para una sede y fecha.
   */
  r.get("/closures/worksheet", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const auth = req.auth!;
    let targetWh: string | null = null;
    const requestedWh = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";

    if (requestedWh) {
      if (!isUuid(requestedWh)) {
        res.status(400).json({ error: "invalid_warehouse_id" });
        return;
      }
      targetWh = requestedWh;
    } else if (!auth.hasAdminAccess && auth.warehouseIds && auth.warehouseIds.length > 0) {
      targetWh = auth.warehouseIds[0]!;
    }

    if (!targetWh) {
      res.status(400).json({ error: "warehouse_required" });
      return;
    }

    const date = typeof req.query.date === "string" && req.query.date.trim()
      ? req.query.date.trim()
      : getTodayBogotaYmd();

    try {
      const worksheet = await getDailyClosureData(pool, targetWh, date);
      res.json(worksheet);
    } catch (err: any) {
      if (err.message === "warehouse_not_found") {
        res.status(404).json({ error: "warehouse_not_found" });
        return;
      }
      next(err);
    }
  });

  /**
   * Guardar o enviar Cierre Diario.
   */
  r.post("/closures", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const body = req.body || {};
    if (!body.warehouseId || !isUuid(body.warehouseId)) {
      res.status(400).json({ error: "invalid_warehouse_id" });
      return;
    }
    if (!body.closureDate || typeof body.closureDate !== "string") {
      res.status(400).json({ error: "closure_date_required" });
      return;
    }

    try {
      const item = await saveDailyClosure(pool, {
        warehouseId: body.warehouseId,
        closureDate: body.closureDate,
        openingCash: Number(body.openingCash ?? 0),
        countedCash: Number(body.countedCash ?? 0),
        cashierName: body.cashierName,
        notes: body.notes,
        status: body.status || "submitted",
      }, req.auth!.userId);

      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Listar historial de cierres diarios.
   */
  r.get("/closures", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : null;
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : null;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : null;

    try {
      const items = await listDailyClosures(pool, { warehouseId, dateFrom, dateTo });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Detalle de un cierre diario por ID.
   */
  r.get("/closures/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await getDailyClosureDetail(pool, id);
      if (!item) {
        res.status(404).json({ error: "closure_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Subir comprobante para cierre diario o para adjuntar a una operación.
   */
  r.post("/closures/upload-receipt", requireAuth, closureReceiptUpload.single("file"), async (req, res, next) => {
    if (!req.file) {
      res.status(400).json({ error: "no_file_uploaded" });
      return;
    }

    try {
      const saved = await saveClosureReceiptFile(req.file.buffer, req.file.originalname);
      res.json(saved);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Subir múltiples fotos / comprobantes a la vez.
   */
  r.post("/closures/upload-receipts", requireAuth, closureReceiptsMultiUpload.array("files", 10), async (req, res, next) => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "no_files_uploaded" });
      return;
    }

    try {
      const saved = await Promise.all(
        files.map((f) => saveClosureReceiptFile(f.buffer, f.originalname))
      );
      res.json({ files: saved });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Adjuntar comprobante directamente a una operación (venta, abono cartera, abono apartado, egreso, pago proveedor, remesa, nómina).
   */
  r.post("/closures/attach-receipt", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const body = req.body || {};
    if (!body.type || !body.id || (!body.receiptUrl && (!Array.isArray(body.receiptUrls) || body.receiptUrls.length === 0))) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const receiptUrls = Array.isArray(body.receiptUrls)
      ? body.receiptUrls.filter((u: any) => typeof u === "string" && u.trim().length > 0)
      : (body.receiptUrl ? [body.receiptUrl] : []);

    try {
      await attachReceiptToOperation(pool, {
        type: body.type,
        id: body.id,
        receiptUrl: receiptUrls[0] || body.receiptUrl,
        receiptUrls,
        receiptFilename: body.receiptFilename || "comprobante.jpg",
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ─── Cierres Contables Generales (Por Rango de Fechas y Sede) ───────────────

  /**
   * Obtener hoja de trabajo de Cierre Contable General por rango de fechas.
   */
  r.get("/general-closures/worksheet", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const warehouseId = typeof req.query.warehouseId === "string" && isUuid(req.query.warehouseId.trim())
      ? req.query.warehouseId.trim()
      : null;

    const dateFrom = typeof req.query.dateFrom === "string" && req.query.dateFrom.trim()
      ? req.query.dateFrom.trim()
      : getFirstDayOfMonthBogotaYmd();

    const dateTo = typeof req.query.dateTo === "string" && req.query.dateTo.trim()
      ? req.query.dateTo.trim()
      : getTodayBogotaYmd();

    try {
      const data = await getGeneralClosureData(pool, { warehouseId, dateFrom, dateTo });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Registrar / Emitir Cierre Contable General con fondo que se deja en la sede.
   */
  r.post("/general-closures", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const body = req.body || {};
    if (!body.dateFrom || !body.dateTo) {
      res.status(400).json({ error: "dates_required" });
      return;
    }

    const warehouseId = typeof body.warehouseId === "string" && isUuid(body.warehouseId.trim())
      ? body.warehouseId.trim()
      : null;

    try {
      const item = await saveGeneralClosure(pool, {
        warehouseId,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        cashToKeep: Number(body.cashToKeep ?? 0),
        notes: body.notes,
      }, req.auth!.userId);

      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Listar historial de Cierres Contables Generales.
   */
  r.get("/general-closures", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const warehouseId = typeof req.query.warehouseId === "string" && isUuid(req.query.warehouseId.trim())
      ? req.query.warehouseId.trim()
      : null;

    try {
      const items = await listGeneralClosures(pool, { warehouseId });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Obtener detalle de Cierre Contable General por ID.
   */
  r.get("/general-closures/:id", requireAuth, async (req, res, next) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }

    const id = String(req.params.id);
    if (!isUuid(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const item = await getGeneralClosureDetail(pool, id);
      if (!item) {
        res.status(404).json({ error: "general_closure_not_found" });
        return;
      }
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
