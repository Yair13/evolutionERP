import { apiGet, apiPost, apiDelete } from "./client.js";

export type ReceivableStatus = "open" | "partial" | "paid" | "cancelled";

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

export interface WarehouseReceivablesReport {
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
}

export interface PaymentCashOperationItem {
  id: string;
  sourceType:
    | "sale"
    | "credit_payment"
    | "layaway_payment"
    | "cash_income"
    | "cash_outflow"
    | "cash_payroll"
    | "transfer_in"
    | "transfer_out"
    | "transfer_returned";
  sourceLabel: string;
  direction: "in" | "out";
  paymentMethod: string;
  paymentMethodLabel: string;
  amount: number;
  reference: string;
  relatedReference: string | null;
  thirdPartyName: string | null;
  concept: string | null;
  itemsSummary: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  createdByName: string | null;
  createdAt: string;
  receiptUrls: string[];
  discountAmount?: number;
  discountReason?: string | null;
  subtotalAmount?: number;
}

export interface PaymentCashDiscountItem {
  id: string;
  invoiceNumber: string;
  exitKind: string;
  customerName: string;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  discountReason: string | null;
  itemsSummary: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface PaymentsCashSummary {
  dateFrom: string;
  dateTo: string;
  warehouseId: string | null;
  totalCollected: number;
  cashCollected?: number;
  cashPayrollAmount?: number;
  cashOutflowsAmount?: number;
  cashTransfersReceivedAmount?: number;
  cashTransfersReturnedAmount?: number;
  cashTransfersSentAmount?: number;
  netCashInDrawer?: number;
  totalDiscountsAmount?: number;
  discountsCount?: number;
  discounts?: PaymentCashDiscountItem[];
  methods: {
    method: string;
    label: string;
    salesAmount: number;
    creditsAmount: number;
    totalAmount: number;
    transactionCount: number;
  }[];
  operations?: PaymentCashOperationItem[];
}

export async function fetchReceivables(
  token: string,
  params?: {
    warehouseId?: string | null;
    status?: string | null;
    customerId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    q?: string | null;
    limit?: number;
    offset?: number;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.status) qry.set("status", params.status);
  if (params?.customerId) qry.set("customerId", params.customerId);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);
  if (params?.q) qry.set("q", params.q);
  if (params?.limit) qry.set("limit", String(params.limit));
  if (params?.offset) qry.set("offset", String(params.offset));

  const qs = qry.toString();
  return apiGet<{
    items: ReceivableSummaryItem[];
    total: number;
    summary: {
      totalAmount: number;
      totalPaid: number;
      totalBalance: number;
      countPending: number;
      countPaid: number;
    };
  }>(`/finance/receivables${qs ? `?${qs}` : ""}`, token);
}

export async function fetchReceivableDetail(token: string, id: string) {
  return apiGet<{ item: ReceivableDetail }>(`/finance/receivables/${id}`, token);
}

export async function deleteManualReceivable(token: string, id: string) {
  return apiDelete<{ ok: boolean; item: { deletedId: string; invoiceNumber: string; warehouseId: string } }>(
    `/finance/receivables/${id}`,
    token
  );
}

export async function resetInitialReceivables(token: string, warehouseId: string) {
  return apiPost<{ ok: boolean; deletedCount: number; totalAmountReset: number }>(
    "/finance/receivables/reset-initial",
    { warehouseId },
    token
  );
}

export async function createReceivable(
  token: string,
  data: {
    warehouseId: string;
    customerId: string;
    invoiceNumber: string;
    totalAmount: number;
    balanceAmount?: number | null;
    dueDate?: string | null;
    issueDate?: string | null;
    notes?: string | null;
  }
) {
  return apiPost<{ item: ReceivableDetail }>("/finance/receivables", data, token);
}

export async function addReceivablePayment(
  token: string,
  id: string,
  data: {
    warehouseId: string;
    paymentMethod: string;
    amount: number;
    notes?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
) {
  return apiPost<{
    payment: ReceivablePaymentItem;
    appliedToDebt: number;
    excessToFavour: number;
    newBalanceAmount: number;
    newStatus: ReceivableStatus;
    customerCreditBalance: number;
  }>(`/finance/receivables/${id}/payments`, data, token);
}

export async function fetchCustomerCreditProfile(token: string, customerId: string, warehouseId?: string | null) {
  const qs = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : "";
  return apiGet<CustomerCreditProfile>(`/finance/customers/${customerId}/credit-profile${qs}`, token);
}

export async function fetchWarehouseReceivablesReport(token: string) {
  return apiGet<WarehouseReceivablesReport>(`/finance/reports/warehouse-receivables`, token);
}

export async function fetchPaymentsCashSummary(
  token: string,
  params?: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);

  const qs = qry.toString();
  return apiGet<PaymentsCashSummary>(`/finance/summary/payments-cash${qs ? `?${qs}` : ""}`, token);
}

// ─── Plan Separe / Apartados ───────────────────────────────────────────────

export type LayawayStatus = "active" | "completed" | "cancelled" | "expired";

export interface LayawayItem {
  productId: string;
  productName: string;
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
  customerName?: string;
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
  createdByName?: string | null;
}

export interface LayawayDetail extends LayawaySummaryItem {
  payments: LayawayPaymentItem[];
  customerCreditBalance: number;
}

export async function fetchLayaways(
  token: string,
  params?: {
    warehouseId?: string | null;
    status?: LayawayStatus | null;
    customerId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    q?: string | null;
    limit?: number;
    offset?: number;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.status) qry.set("status", params.status);
  if (params?.customerId) qry.set("customerId", params.customerId);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);
  if (params?.q) qry.set("q", params.q);
  if (params?.limit) qry.set("limit", String(params.limit));
  if (params?.offset) qry.set("offset", String(params.offset));

  const qs = qry.toString();
  return apiGet<{
    items: LayawaySummaryItem[];
    total: number;
    summary: {
      activeCount: number;
      totalTarget: number;
      totalCollected: number;
      totalRemaining: number;
    };
  }>(`/finance/layaways${qs ? `?${qs}` : ""}`, token);
}

export async function fetchLayawayDetail(token: string, id: string) {
  return apiGet<{ item: LayawayDetail }>(`/finance/layaways/${id}`, token);
}

export async function createLayaway(
  token: string,
  data: {
    warehouseId: string;
    customerId: string;
    targetAmount: number;
    initialPayment?: number;
    paymentMethod?: string;
    items?: LayawayItem[];
    expiryDate?: string | null;
    notes?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
) {
  return apiPost<{ item: LayawayDetail }>(`/finance/layaways`, data, token);
}

export async function addLayawayPayment(
  token: string,
  id: string,
  data: {
    warehouseId: string;
    paymentMethod: string;
    amount: number;
    notes?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
) {
  return apiPost<{
    payment: LayawayPaymentItem;
    newPaidAmount: number;
    newRemainingAmount: number;
    customerCreditBalance: number;
  }>(`/finance/layaways/${id}/payments`, data, token);
}

export async function cancelLayaway(
  token: string,
  id: string,
  data?: {
    refundToCreditBalance?: boolean;
    notes?: string;
  }
) {
  return apiPost<{
    success: boolean;
    refundedAmount: number;
  }>(`/finance/layaways/${id}/cancel`, data || {}, token);
}

export async function fetchCustomerActiveLayaway(token: string, customerId: string) {
  return apiGet<{ item: LayawaySummaryItem | null }>(
    `/finance/customers/${customerId}/active-layaway`,
    token
  );
}

// ─── Proveedores y Cuentas por Pagar (Accounts Payable) ─────────────────────

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

export interface SupplierProfile {
  supplier: SupplierItem;
  stats: {
    totalBilled: number;
    totalPaid: number;
    currentDebt: number;
    creditBalance: number;
  };
  payables: PayableSummaryItem[];
  recentPayments: PayablePaymentItem[];
}

export interface EgressCashSummary {
  totalDisbursed: number;
  methods: { method: string; totalAmount: number; count: number }[];
}

export async function fetchSuppliers(
  token: string,
  params?: {
    q?: string | null;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  const qry = new URLSearchParams();
  if (params?.q) qry.set("q", params.q);
  if (params?.activeOnly) qry.set("activeOnly", "true");
  if (params?.limit) qry.set("limit", String(params.limit));
  if (params?.offset) qry.set("offset", String(params.offset));

  const qs = qry.toString();
  return apiGet<{ items: SupplierItem[]; total: number }>(
    `/finance/suppliers${qs ? `?${qs}` : ""}`,
    token
  );
}

export async function createSupplier(
  token: string,
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
) {
  return apiPost<{ item: SupplierItem }>("/finance/suppliers", data, token);
}

export async function fetchSupplierProfile(token: string, id: string) {
  return apiGet<SupplierProfile>(`/finance/suppliers/${id}`, token);
}

export async function fetchPayables(
  token: string,
  params?: {
    warehouseId?: string | null;
    supplierId?: string | null;
    status?: PayableStatus | null;
    dueDateFrom?: string | null;
    dueDateTo?: string | null;
    q?: string | null;
    limit?: number;
    offset?: number;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.supplierId) qry.set("supplierId", params.supplierId);
  if (params?.status) qry.set("status", params.status);
  if (params?.dueDateFrom) qry.set("dueDateFrom", params.dueDateFrom);
  if (params?.dueDateTo) qry.set("dueDateTo", params.dueDateTo);
  if (params?.q) qry.set("q", params.q);
  if (params?.limit) qry.set("limit", String(params.limit));
  if (params?.offset) qry.set("offset", String(params.offset));

  const qs = qry.toString();
  return apiGet<{
    items: PayableSummaryItem[];
    total: number;
    summary: {
      totalBilled: number;
      totalPaid: number;
      totalBalance: number;
      openCount: number;
      paidCount: number;
    };
  }>(`/finance/payables${qs ? `?${qs}` : ""}`, token);
}

export async function createPayable(
  token: string,
  data: {
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
  }
) {
  return apiPost<{
    payable: PayableSummaryItem;
    payment?: PayablePaymentItem;
    excessToFavour: number;
  }>("/finance/payables", data, token);
}

export async function fetchPayableDetail(token: string, id: string) {
  return apiGet<{ item: PayableDetail }>(`/finance/payables/${id}`, token);
}

export async function addPayablePayment(
  token: string,
  id: string,
  data: {
    warehouseId: string;
    paymentMethod: string;
    amount: number;
    referenceCode?: string | null;
    notes?: string | null;
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
) {
  return apiPost<{
    payment: PayablePaymentItem;
    appliedToDebt: number;
    excessToFavour: number;
    newBalanceAmount: number;
    newStatus: PayableStatus;
    supplierCreditBalance: number;
  }>(`/finance/payables/${id}/payments`, data, token);
}

export async function fetchEgressSummary(
  token: string,
  params?: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);

  const qs = qry.toString();
  return apiGet<EgressCashSummary>(`/finance/summary/egress-cash${qs ? `?${qs}` : ""}`, token);
}

// ─── Comprobantes de Egreso (Salidas Generales de Dinero) ───────────────────

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

export async function fetchCashOutflows(
  token: string,
  params?: {
    warehouseId?: string | null;
    supplierId?: string | null;
    paymentMethod?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    q?: string | null;
    limit?: number;
    offset?: number;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.supplierId) qry.set("supplierId", params.supplierId);
  if (params?.paymentMethod) qry.set("paymentMethod", params.paymentMethod);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);
  if (params?.q) qry.set("q", params.q);
  if (params?.limit) qry.set("limit", String(params.limit));
  if (params?.offset) qry.set("offset", String(params.offset));

  const qs = qry.toString();
  return apiGet<{
    items: CashOutflowItem[];
    total: number;
    totalAmount: number;
  }>(`/finance/outflows${qs ? `?${qs}` : ""}`, token);
}

export async function createCashOutflow(
  token: string,
  data: {
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
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
) {
  return apiPost<{ item: CashOutflowItem }>("/finance/outflows", data, token);
}

export async function fetchCashOutflowDetail(token: string, id: string) {
  return apiGet<{ item: CashOutflowItem }>(`/finance/outflows/${id}`, token);
}

// ─── Recibos de Caja / Otros Ingresos ────────────────────────────────────────

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
  receiptUrl?: string | null;
  receiptUrls?: string[];
  receiptFilename?: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export async function fetchCashIncomes(
  token: string,
  params?: {
    warehouseId?: string | null;
    paymentMethod?: string | null;
    category?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    q?: string | null;
    page?: number;
    limit?: number;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.paymentMethod) qry.set("paymentMethod", params.paymentMethod);
  if (params?.category) qry.set("category", params.category);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);
  if (params?.q) qry.set("q", params.q);
  if (params?.page) qry.set("page", String(params.page));
  if (params?.limit) qry.set("limit", String(params.limit));

  const qs = qry.toString();
  return apiGet<{
    items: CashIncomeItem[];
    total: number;
    page: number;
    limit: number;
    totalAmount: number;
    cashAmount: number;
    bankAmount: number;
  }>(`/finance/incomes${qs ? `?${qs}` : ""}`, token);
}

export async function createCashIncome(
  token: string,
  data: {
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
    receiptUrl?: string | null;
    receiptUrls?: string[] | null;
    receiptFilename?: string | null;
  }
) {
  return apiPost<{ item: CashIncomeItem }>("/finance/incomes", data, token);
}

export async function fetchCashIncomeDetail(token: string, id: string) {
  return apiGet<{ item: CashIncomeItem }>(`/finance/incomes/${id}`, token);
}

// ─── Traslados de Dinero entre Sedes ─────────────────────────────────────────

export async function fetchCashTransfers(
  token: string,
  params?: {
    warehouseId?: string | null;
    role?: "origin" | "destination" | "either";
    status?: TransferStatus | null;
    limit?: number;
    offset?: number;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.role) qry.set("role", params.role);
  if (params?.status) qry.set("status", params.status);
  if (params?.limit) qry.set("limit", String(params.limit));
  if (params?.offset) qry.set("offset", String(params.offset));

  const qs = qry.toString();
  return apiGet<{
    items: CashTransferItem[];
    total: number;
    pendingCount: number;
  }>(`/finance/transfers${qs ? `?${qs}` : ""}`, token);
}

export async function createCashTransfer(
  token: string,
  data: {
    originWarehouseId: string;
    destinationWarehouseId: string;
    amount: number;
    carrierName: string;
    carrierDoc?: string | null;
    concept: string;
    paymentMethod?: string;
    senderReceiptUrl?: string | null;
    senderReceiptUrls?: string[] | null;
    senderReceiptFilename?: string | null;
  }
) {
  return apiPost<{ item: CashTransferItem }>("/finance/transfers", data, token);
}

export async function fetchCashTransferDetail(token: string, id: string) {
  return apiGet<{ item: CashTransferItem }>(`/finance/transfers/${id}`, token);
}

export async function approveCashTransfer(
  token: string,
  id: string,
  receiptData?: {
    receiverReceiptUrl?: string | null;
    receiverReceiptUrls?: string[] | null;
    receiverReceiptFilename?: string | null;
  }
) {
  return apiPost<{ item: CashTransferItem }>(`/finance/transfers/${id}/approve`, receiptData || {}, token);
}

export async function rejectCashTransfer(token: string, id: string, reason?: string) {
  return apiPost<{ item: CashTransferItem }>(`/finance/transfers/${id}/reject`, { reason }, token);
}

// ─── Empleados y Nómina ───────────────────────────────────────────────────

export interface EmployeeItem {
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

export interface PayrollPaymentItem {
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

export interface PayrollSummary {
  totalPaid: number;
  cashTotal: number;
  transferTotal: number;
  paymentCount: number;
  employeesCount: number;
}

export async function fetchEmployees(
  token: string,
  params?: {
    warehouseId?: string | null;
    search?: string | null;
    isActive?: boolean | null;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.search) qry.set("search", params.search);
  if (params?.isActive !== undefined && params?.isActive !== null) {
    qry.set("isActive", String(params.isActive));
  }
  const qs = qry.toString();
  return apiGet<{ items: EmployeeItem[] }>(`/finance/employees${qs ? `?${qs}` : ""}`, token);
}

export async function fetchEmployeeDetail(token: string, id: string) {
  return apiGet<{ item: EmployeeItem }>(`/finance/employees/${id}`, token);
}

export async function createEmployee(
  token: string,
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
) {
  return apiPost<{ item: EmployeeItem }>("/finance/employees", data, token);
}

export async function updateEmployee(
  token: string,
  id: string,
  data: Partial<{
    fullName: string;
    documentType: string;
    documentNumber: string;
    phone: string | null;
    email: string | null;
    position: string;
    warehouseId: string | null;
    baseSalary: number;
    paymentFrequency: string;
    bankName: string | null;
    bankAccountType: string | null;
    bankAccountNumber: string | null;
    isActive: boolean;
    notes: string | null;
  }>
) {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/finance/employees/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = await res.json();
      if (err?.error) msg = String(err.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ item: EmployeeItem }>;
}

export async function fetchPayrollPayments(
  token: string,
  params?: {
    warehouseId?: string | null;
    employeeId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    paymentMethod?: string | null;
    search?: string | null;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.employeeId) qry.set("employeeId", params.employeeId);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);
  if (params?.paymentMethod) qry.set("paymentMethod", params.paymentMethod);
  if (params?.search) qry.set("search", params.search);
  const qs = qry.toString();
  return apiGet<{ items: PayrollPaymentItem[] }>(`/finance/payroll/payments${qs ? `?${qs}` : ""}`, token);
}

export async function fetchPayrollPaymentDetail(token: string, id: string) {
  return apiGet<{ item: PayrollPaymentItem }>(`/finance/payroll/payments/${id}`, token);
}

export async function createPayrollPayment(
  token: string,
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
  }
) {
  return apiPost<{ item: PayrollPaymentItem }>("/finance/payroll/payments", data, token);
}

export async function uploadPayrollReceiptFile(
  token: string,
  file: File
): Promise<{ filename: string; publicUrl: string }> {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${base}/finance/payroll/upload-receipt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ filename: string; publicUrl: string }>;
}

export async function attachPayrollReceipt(
  token: string,
  paymentId: string,
  files: File[] | File,
  referenceCode?: string
) {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const form = new FormData();
  const fileArr = Array.isArray(files) ? files : [files];
  for (const f of fileArr) {
    form.append("files", f);
    form.append("file", f);
  }
  if (referenceCode) form.append("referenceCode", referenceCode);
  const res = await fetch(`${base}/finance/payroll/payments/${paymentId}/receipt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ item: PayrollPaymentItem }>;
}

export async function fetchPayrollSummary(
  token: string,
  params?: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);
  const qs = qry.toString();
  return apiGet<PayrollSummary>(`/finance/payroll/summary${qs ? `?${qs}` : ""}`, token);
}

// ─── Cierre Diario y Arqueo Consolidado ───────────────────────────────────

export interface ReceiptAuditItem {
  id: string;
  type: "sale" | "credit_payment" | "layaway_payment" | "outflow" | "cash_outflow" | "payable_payment" | "transfer_sent" | "transfer_received" | "payroll" | "payroll_payment" | "other_income" | "cash_income";
  typeLabel: string;
  reference: string;
  concept: string;
  amount: number;
  paymentMethod: string;
  receiptUrl: string | null;
  receiptUrls?: string[];
  receiptFilename: string | null;
  isMissing?: boolean;
  createdAt: string;
  warehouseId?: string;
  warehouseName?: string;
  createdByName?: string | null;
}

export interface DailyClosureWorksheet {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  closureDate: string;
  shiftNumber?: number;
  startedAt?: string | null;
  closedAt?: string | null;
  openingCash: number;
  suggestedOpeningCash: number;
  hasPreviousClosure?: boolean;
  isExistingClosure: boolean;
  existingClosureId: string | null;
  existingStatus: string | null;
  existingVoucherNumber: string | null;
  existingCountedCash: number | null;
  existingNotes: string | null;
  existingCashierName: string | null;
  dayShifts?: {
    id: string;
    voucherNumber: string;
    shiftNumber: number;
    closedAt: string;
    countedCash: number;
    cashierName?: string | null;
  }[];

  // Entradas de Efectivo
  cashSales: number;
  cashCreditPayments: number;
  cashLayawayPayments: number;
  cashTransfersReceived: number;
  cashTransfersReturned?: number;
  cashOtherIncomes?: number;
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

  // Control de descuentos en facturas de venta
  totalDiscountsAmount?: number;
  discountsCount?: number;
  discountItems?: DiscountInvoiceAuditItem[];
}

export interface DiscountInvoiceAuditItem {
  id: string;
  invoiceNumber: string;
  exitKind: string;
  customerName: string;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  discountReason: string | null;
  itemsSummary: string | null;
  createdByName: string | null;
  createdAt: string;
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
  cashOtherIncomes?: number;
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

export async function fetchDailyClosureWorksheet(
  token: string,
  warehouseId: string,
  dateOrOpts?: string | { date?: string; closureId?: string }
) {
  const qry = new URLSearchParams({ warehouseId });
  if (typeof dateOrOpts === "string") {
    qry.set("date", dateOrOpts);
  } else if (dateOrOpts) {
    if (dateOrOpts.date) qry.set("date", dateOrOpts.date);
    if (dateOrOpts.closureId) qry.set("closureId", dateOrOpts.closureId);
  }
  return apiGet<DailyClosureWorksheet>(`/finance/closures/worksheet?${qry.toString()}`, token);
}

export async function saveDailyClosure(
  token: string,
  data: {
    warehouseId: string;
    closureDate: string;
    openingCash: number;
    countedCash: number;
    cashierName?: string | null;
    notes?: string | null;
    status?: "submitted" | "approved";
    declaredBankMethods?: Record<string, number>;
  }
) {
  return apiPost<{ item: DailyClosureRecord }>("/finance/closures", data, token);
}

export async function fetchDailyClosures(
  token: string,
  params?: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);
  const qs = qry.toString();
  return apiGet<{ items: DailyClosureRecord[] }>(`/finance/closures${qs ? `?${qs}` : ""}`, token);
}

export async function fetchDailyClosureDetail(token: string, id: string) {
  return apiGet<{ item: DailyClosureRecord }>(`/finance/closures/${id}`, token);
}

export async function uploadClosureReceiptFile(
  token: string,
  file: File
): Promise<{ filename: string; publicUrl: string }> {
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${base}/finance/closures/upload-receipt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ filename: string; publicUrl: string }>;
}

export async function uploadClosureReceiptFiles(
  token: string,
  files: File[]
): Promise<Array<{ filename: string; publicUrl: string; url: string }>> {
  if (files.length === 0) return [];
  const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const form = new FormData();
  for (const f of files) {
    form.append("files", f);
  }

  try {
    const res = await fetch(`${base}/finance/closures/upload-receipts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.files) && data.files.length > 0) {
        return data.files.map((f: any) => ({
          filename: f.filename,
          publicUrl: f.publicUrl || f.url,
          url: f.url || f.publicUrl,
        }));
      }
    }
  } catch {
    // fallback if endpoint not reachable
  }

  // Fallback upload sequentially / parallel
  const fallback = await Promise.all(files.map((f) => uploadClosureReceiptFile(token, f)));
  return fallback.map((fb) => ({
    filename: fb.filename,
    publicUrl: fb.publicUrl,
    url: fb.publicUrl,
  }));
}

export async function attachReceiptToOperation(
  token: string,
  data: {
    type: "sale" | "credit_payment" | "layaway_payment" | "outflow" | "cash_outflow" | "payable_payment" | "transfer_sent" | "transfer_received" | "payroll" | "payroll_payment" | "other_income" | "cash_income";
    id: string;
    receiptUrl: string;
    receiptUrls?: string[];
    receiptFilename?: string;
  }
) {
  return apiPost<{ ok: boolean }>("/finance/closures/attach-receipt", data, token);
}

// ─── Cierre Contable General (Rango de Fechas) ─────────────────────────────

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

  // Otros Ingresos
  totalOtherIncomes?: number;
  totalCashOtherIncomes?: number;

  // Salidas y Nómina
  totalOutflows: number;
  totalPayroll: number;
  totalCashPayroll: number;
  totalTransfersReceived: number;
  totalTransfersReturned?: number;
  totalTransfersSent: number;

  // Base inicial y efectivo total
  openingCash: number;
  suggestedOpeningCash: number;
  totalCashAvailable: number;

  // Efectivo Neto Acumulado en el Período
  totalNetCash: number;

  // Desglose por método
  paymentBreakdown: MethodBreakdownItem[];

  // Información del último cierre previo
  lastClosure?: {
    id: string;
    closureCode: string;
    dateFrom: string;
    dateTo: string;
    createdAt: string;
    startedAt?: string | null;
    closedAt?: string | null;
  } | null;
  suggestedDateFrom?: string;
  hasPreviousClosure?: boolean;

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
  startedAt?: string | null;
  closedAt?: string | null;
  totalSales: number;
  totalCashSales: number;
  totalBankSales: number;
  totalCreditPayments: number;
  totalLayawayPayments: number;
  totalOtherIncomes?: number;
  totalCashOtherIncomes?: number;
  totalOutflows: number;
  totalPayroll: number;
  openingCash: number;
  totalNetCash: number;
  totalCashAvailable?: number;
  cashToKeep: number;
  cashToWithdraw: number;
  paymentBreakdown: MethodBreakdownItem[];
  status: string;
  notes: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export async function fetchGeneralClosureWorksheet(
  token: string,
  params: {
    warehouseId?: string | null;
    dateFrom: string;
    dateTo: string;
  }
) {
  const qry = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  if (params.warehouseId) qry.set("warehouseId", params.warehouseId);
  return apiGet<GeneralClosureWorksheet>(`/finance/general-closures/worksheet?${qry.toString()}`, token);
}

export async function saveGeneralClosure(
  token: string,
  data: {
    warehouseId?: string | null;
    dateFrom: string;
    dateTo: string;
    openingCash?: number;
    cashToKeep: number;
    notes?: string | null;
  }
) {
  return apiPost<{ item: GeneralClosureRecord }>("/finance/general-closures", data, token);
}

export async function fetchGeneralClosures(
  token: string,
  params?: {
    warehouseId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }
) {
  const qry = new URLSearchParams();
  if (params?.warehouseId) qry.set("warehouseId", params.warehouseId);
  if (params?.dateFrom) qry.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qry.set("dateTo", params.dateTo);
  const qs = qry.toString();
  return apiGet<{ items: GeneralClosureRecord[] }>(`/finance/general-closures${qs ? `?${qs}` : ""}`, token);
}

export async function fetchLastGeneralClosure(
  token: string,
  warehouseId?: string | null
) {
  const qry = new URLSearchParams();
  if (warehouseId) qry.set("warehouseId", warehouseId);
  const qs = qry.toString();
  return apiGet<{
    item: {
      id: string;
      closureCode: string;
      warehouseId: string | null;
      dateFrom: string;
      dateTo: string;
      cashToKeep: number;
      cashToWithdraw: number;
      createdAt: string;
    } | null;
    suggestedDateFrom: string;
    hasPreviousClosure: boolean;
  }>(`/finance/general-closures/last${qs ? `?${qs}` : ""}`, token);
}

export async function fetchGeneralClosureDetail(token: string, id: string) {
  return apiGet<{ item: GeneralClosureRecord }>(`/finance/general-closures/${id}`, token);
}






