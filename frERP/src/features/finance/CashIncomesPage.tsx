import { useState, useEffect, useCallback } from "react";
import {
  fetchCashIncomes,
  type CashIncomeItem,
  type CashIncomeCategory,
  type ReceiptAuditItem,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import { CreateCashIncomeModal } from "../../components/finance/CreateCashIncomeModal.js";
import { PrintCashIncomeVoucherModal } from "../../components/finance/PrintCashIncomeVoucherModal.js";
import { ViewReceiptPhotosModal } from "../../components/common/ViewReceiptPhotosModal.js";
import { UploadReceiptModal } from "../../components/finance/UploadReceiptModal.js";
import {
  PlusCircle,
  Search,
  Printer,
  RefreshCw,
  Camera,
  Image as ImageIcon,
  DollarSign,
  Wallet,
  Landmark,
  FileCheck2,
  AlertCircle,
} from "lucide-react";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null): string {
  return formatBogotaDateTime(iso);
}

const CATEGORY_META: Record<CashIncomeCategory, { label: string; bg: string; color: string; border: string; icon: string }> = {
  driver_refund: {
    label: "Devolución Conductor",
    bg: "rgba(14, 165, 233, 0.08)",
    color: "#0284c7",
    border: "rgba(14, 165, 233, 0.25)",
    icon: "🚚",
  },
  scrap_sale: {
    label: "Venta Cuero / Retal",
    bg: "rgba(245, 158, 11, 0.08)",
    color: "#d97706",
    border: "rgba(245, 158, 11, 0.25)",
    icon: "📦",
  },
  operational_refund: {
    label: "Reintegro Operativo",
    bg: "rgba(139, 92, 246, 0.08)",
    color: "#7c3aed",
    border: "rgba(139, 92, 246, 0.25)",
    icon: "🔄",
  },
  other: {
    label: "Otros Ingresos",
    bg: "rgba(100, 116, 139, 0.08)",
    color: "#475569",
    border: "rgba(100, 116, 139, 0.25)",
    icon: "💰",
  },
};

const METHOD_STYLE: Record<
  string,
  { bg: string; border: string; color: string; icon: string }
> = {
  efectivo: { bg: "rgba(5, 150, 105, 0.08)", border: "rgba(5, 150, 105, 0.22)", color: "#059669", icon: "💵" },
  bancolombia: { bg: "rgba(217, 119, 6, 0.08)", border: "rgba(217, 119, 6, 0.22)", color: "#d97706", icon: "🟡" },
  davivienda: { bg: "rgba(225, 29, 72, 0.08)", border: "rgba(225, 29, 72, 0.22)", color: "#e11d48", icon: "🔴" },
  nequi: { bg: "rgba(124, 58, 237, 0.08)", border: "rgba(124, 58, 237, 0.22)", color: "#7c3aed", icon: "🟣" },
  daviplata: { bg: "rgba(225, 29, 72, 0.08)", border: "rgba(225, 29, 72, 0.22)", color: "#e11d48", icon: "📱" },
  bold: { bg: "rgba(2, 132, 199, 0.08)", border: "rgba(2, 132, 199, 0.22)", color: "#0284c7", icon: "🔵" },
  addi: { bg: "rgba(13, 148, 136, 0.08)", border: "rgba(13, 148, 136, 0.22)", color: "#0d9488", icon: "🟢" },
  sistecredito: { bg: "rgba(2, 132, 199, 0.08)", border: "rgba(2, 132, 199, 0.22)", color: "#0284c7", icon: "💳" },
  transferencia: { bg: "rgba(79, 70, 229, 0.08)", border: "rgba(79, 70, 229, 0.22)", color: "#4f46e5", icon: "🏦" },
};

export function CashIncomesPage() {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();

  // Filtros
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(
    isAllWarehouses ? "" : (warehouseId || "")
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouse(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);

  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Datos
  const [incomes, setIncomes] = useState<CashIncomeItem[]>([]);
  const [totalIncomes, setTotalIncomes] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [voucherToPrint, setVoucherToPrint] = useState<CashIncomeItem | null>(null);
  const [viewingPhotos, setViewingPhotos] = useState<{ title: string; urls: string[] } | null>(null);
  const [uploadingAuditItem, setUploadingAuditItem] = useState<ReceiptAuditItem | null>(null);

  // Cargar datos
  const loadIncomes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const targetWh = isAllWarehouses ? (selectedWarehouse || null) : (warehouseId || null);
      const res = await fetchCashIncomes(token, {
        warehouseId: targetWh,
        paymentMethod: paymentMethod || null,
        category: category || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        q: search || null,
        page,
        limit,
      });
      setIncomes(res.items);
      setTotalIncomes(res.total);
      setTotalAmount(res.totalAmount);
      setCashAmount(res.cashAmount);
      setBankAmount(res.bankAmount);
    } catch (err: any) {
      setError(err?.message || "Error al cargar recibos de caja");
    } finally {
      setLoading(false);
    }
  }, [token, isAllWarehouses, selectedWarehouse, warehouseId, paymentMethod, category, dateFrom, dateTo, search, page]);

  useEffect(() => {
    loadIncomes();
  }, [loadIncomes]);

  function handleCreatedIncome(created: CashIncomeItem) {
    setOpenCreateModal(false);
    loadIncomes();
    // Abrir inmediatamente para imprimir
    setVoucherToPrint(created);
  }

  const totalPages = Math.ceil(totalIncomes / limit) || 1;

  return (
    <div className="inv-page" style={{ padding: "1.5rem" }}>
      {/* Encabezado y Botón Principal */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: "#0f172a", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FileCheck2 size={28} color="#059669" />
            Recibos de Caja / Otros Ingresos
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.88rem" }}>
            Control de dineros no correspondientes a ventas de catálogo (devoluciones de conductores, venta de rezagos/cuero, etc.) y su impacto en cierres
          </p>
        </div>

        <button
          type="button"
          className="inv-btn inv-btn--primary"
          onClick={() => setOpenCreateModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "#059669",
            padding: "0.6rem 1.1rem",
            fontSize: "0.9rem",
            fontWeight: 700,
            boxShadow: "0 2px 4px rgba(5, 150, 105, 0.2)",
          }}
        >
          <PlusCircle size={18} />
          + Registrar Nuevo Ingreso
        </button>
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "0.88rem",
            marginBottom: "1rem",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {/* Tarjetas KPI */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {/* Total Ingresado */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            padding: "1rem 1.2rem",
            border: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "10px",
              background: "rgba(5, 150, 105, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#059669",
            }}
          >
            <DollarSign size={26} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Total Ingresos
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#0f172a" }}>
              {formatMoney(totalAmount)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              {totalIncomes} comprobante(s)
            </div>
          </div>
        </div>

        {/* Efectivo en Caja */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            padding: "1rem 1.2rem",
            border: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#10b981",
            }}
          >
            <Wallet size={26} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Entradas en Efectivo (Caja)
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#10b981" }}>
              {formatMoney(cashAmount)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#059669" }}>
              Suma al arqueo de caja física
            </div>
          </div>
        </div>

        {/* Bancos y Cuentas */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            padding: "1rem 1.2rem",
            border: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "10px",
              background: "rgba(14, 165, 233, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0284c7",
            }}
          >
            <Landmark size={26} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Cuentas / Bancos / Digital
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#0284c7" }}>
              {formatMoney(bankAmount)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Auditado por comprobantes
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          padding: "1rem",
          marginBottom: "1.25rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        {/* Selector de Sede */}
        {isAllWarehouses && (
          <div style={{ minWidth: 180 }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: 3 }}>
              Sede
            </label>
            <select
              value={selectedWarehouse}
              onChange={(e) => {
                setSelectedWarehouse(e.target.value);
                setPage(1);
              }}
              className="inv-input"
              style={{ width: "100%", padding: "0.45rem", fontSize: "0.85rem" }}
            >
              <option value="">Todas las sedes</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tipo / Categoría */}
        <div style={{ minWidth: 170 }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: 3 }}>
            Tipo de Ingreso
          </label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="inv-input"
            style={{ width: "100%", padding: "0.45rem", fontSize: "0.85rem" }}
          >
            <option value="">Todos los tipos</option>
            <option value="driver_refund">Devolución Conductor</option>
            <option value="scrap_sale">Venta Cuero / Retal / Desecho</option>
            <option value="operational_refund">Reintegro Operativo</option>
            <option value="other">Otros Ingresos</option>
          </select>
        </div>

        {/* Medio de Pago */}
        <div style={{ minWidth: 150 }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: 3 }}>
            Medio de Pago
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setPage(1);
            }}
            className="inv-input"
            style={{ width: "100%", padding: "0.45rem", fontSize: "0.85rem" }}
          >
            <option value="">Todos los medios</option>
            <option value="efectivo">Efectivo</option>
            <option value="bancolombia">Bancolombia</option>
            <option value="nequi">Nequi</option>
            <option value="davivienda">Davivienda</option>
            <option value="daviplata">Daviplata</option>
            <option value="bold">Bold</option>
            <option value="sistecredito">Sistecrédito</option>
            <option value="addi">Addi</option>
            <option value="transferencia">Transferencia Bancaria</option>
          </select>
        </div>

        {/* Fechas */}
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: 3 }}>
            Desde
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="inv-input"
            style={{ padding: "0.45rem", fontSize: "0.85rem" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: 3 }}>
            Hasta
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="inv-input"
            style={{ padding: "0.45rem", fontSize: "0.85rem" }}
          />
        </div>

        {/* Búsqueda */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: 3 }}>
            Búsqueda
          </label>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Buscar por Nº recibo, concepto, pagador o cédula..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="inv-input"
              style={{ width: "100%", padding: "0.45rem 0.5rem 0.45rem 2rem", fontSize: "0.85rem" }}
            />
          </div>
        </div>

        {/* Refrescar */}
        <div style={{ alignSelf: "flex-end" }}>
          <button
            type="button"
            className="inv-btn inv-btn--secondary"
            onClick={loadIncomes}
            title="Recargar datos"
            style={{ padding: "0.45rem 0.75rem" }}
          >
            <RefreshCw size={16} className={loading ? "inv-spinner" : ""} />
          </button>
        </div>
      </div>

      {/* Tabla de Resultados */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table className="inv-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left", fontSize: "0.78rem", color: "#475569", textTransform: "uppercase" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Consecutivo</th>
                <th style={{ padding: "0.75rem 1rem" }}>Fecha y Hora</th>
                <th style={{ padding: "0.75rem 1rem" }}>Sede</th>
                <th style={{ padding: "0.75rem 1rem" }}>Quien Entrega</th>
                <th style={{ padding: "0.75rem 1rem" }}>Tipo y Concepto</th>
                <th style={{ padding: "0.75rem 1rem" }}>Medio de Pago</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Valor Recibido</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Soporte</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && incomes.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                    <RefreshCw size={24} className="inv-spinner" style={{ margin: "0 auto 0.5rem auto", display: "block" }} />
                    Cargando recibos de caja...
                  </td>
                </tr>
              ) : incomes.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                    No se encontraron entradas de dinero registradas con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                incomes.map((inc) => {
                  const catMeta = CATEGORY_META[inc.category] || CATEGORY_META.other;
                  const methodStyle = METHOD_STYLE[inc.paymentMethod.toLowerCase()] || {
                    bg: "rgba(100, 116, 139, 0.08)",
                    border: "rgba(100, 116, 139, 0.22)",
                    color: "#475569",
                    icon: "💳",
                  };
                  const photos = inc.receiptUrls && inc.receiptUrls.length > 0 ? inc.receiptUrls : (inc.receiptUrl ? [inc.receiptUrl] : []);
                  const hasPhotos = photos.length > 0;
                  const isBank = inc.paymentMethod.toLowerCase() !== "efectivo";

                  return (
                    <tr key={inc.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                      {/* Consecutivo */}
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 800, color: "#0f172a" }}>
                        {inc.voucherNumber}
                      </td>

                      {/* Fecha */}
                      <td style={{ padding: "0.75rem 1rem", color: "#475569", whiteSpace: "nowrap" }}>
                        {formatDate(inc.createdAt)}
                      </td>

                      {/* Sede */}
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 600 }}>{inc.warehouseName}</span>
                        <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: 4 }}>({inc.warehouseCode})</span>
                      </td>

                      {/* Quien entrega */}
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ fontWeight: 700, color: "#1e293b" }}>{inc.payerName}</div>
                        {inc.payerDoc && (
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>C.C. {inc.payerDoc}</div>
                        )}
                      </td>

                      {/* Tipo y Concepto */}
                      <td style={{ padding: "0.75rem 1rem", maxWidth: 280 }}>
                        <div style={{ marginBottom: 3 }}>
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "1px 7px",
                              borderRadius: "12px",
                              background: catMeta.bg,
                              color: catMeta.color,
                              border: `1px solid ${catMeta.border}`,
                            }}
                          >
                            {catMeta.icon} {catMeta.label}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, color: "#334155" }}>{inc.concept}</div>
                        {inc.notes && (
                          <div style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic", marginTop: 2 }}>
                            {inc.notes}
                          </div>
                        )}
                      </td>

                      {/* Medio de Pago */}
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            background: methodStyle.bg,
                            border: `1px solid ${methodStyle.border}`,
                            color: methodStyle.color,
                          }}
                        >
                          <span>{methodStyle.icon}</span>
                          <span>{inc.paymentMethod.toUpperCase()}</span>
                        </span>
                        {inc.referenceCode && (
                          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 2 }}>
                            Ref: {inc.referenceCode}
                          </div>
                        )}
                      </td>

                      {/* Monto */}
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 900, color: "#059669", fontSize: "0.95rem", whiteSpace: "nowrap" }}>
                        {formatMoney(inc.amount)}
                      </td>

                      {/* Soporte */}
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center", whiteSpace: "nowrap" }}>
                        {hasPhotos ? (
                          <button
                            type="button"
                            className="inv-btn inv-btn--ghost inv-btn--sm"
                            onClick={() =>
                              setViewingPhotos({
                                title: `Soporte - ${inc.voucherNumber} (${inc.concept})`,
                                urls: photos,
                              })
                            }
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#059669",
                              padding: "3px 8px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                            }}
                          >
                            <ImageIcon size={14} />
                            Ver ({photos.length})
                          </button>
                        ) : isBank ? (
                          <button
                            type="button"
                            className="inv-btn inv-btn--outline inv-btn--sm"
                            onClick={() =>
                              setUploadingAuditItem({
                                id: inc.id,
                                type: "other_income",
                                typeLabel: "Otro Ingreso",
                                reference: inc.voucherNumber,
                                concept: inc.concept,
                                amount: inc.amount,
                                paymentMethod: inc.paymentMethod,
                                receiptUrl: null,
                                receiptFilename: null,
                                createdAt: inc.createdAt,
                              })
                            }
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#dc2626",
                              borderColor: "#fca5a5",
                              padding: "2px 7px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                            }}
                          >
                            <Camera size={13} />
                            Falta foto
                          </button>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>—</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="inv-btn inv-btn--secondary inv-btn--sm"
                          onClick={() => setVoucherToPrint(inc)}
                          title="Imprimir Voucher para firmas"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 9px",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                          }}
                        >
                          <Printer size={14} color="#059669" />
                          Voucher
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalIncomes > limit && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "#f8fafc",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.85rem",
              color: "#64748b",
            }}
          >
            <div>
              Mostrando {((page - 1) * limit) + 1} a {Math.min(page * limit, totalIncomes)} de {totalIncomes} registros
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="inv-btn inv-btn--secondary inv-btn--sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span style={{ alignSelf: "center", fontWeight: 700 }}>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                className="inv-btn inv-btn--secondary inv-btn--sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal para Crear Entrada de Dinero */}
      {openCreateModal && (
        <CreateCashIncomeModal
          open={openCreateModal}
          onClose={() => setOpenCreateModal(false)}
          onSuccess={handleCreatedIncome}
        />
      )}

      {/* Modal para Imprimir Voucher */}
      {voucherToPrint && (
        <PrintCashIncomeVoucherModal
          open={Boolean(voucherToPrint)}
          income={voucherToPrint}
          onClose={() => setVoucherToPrint(null)}
        />
      )}

      {/* Modal para Ver Fotos de Soporte */}
      {viewingPhotos && (
        <ViewReceiptPhotosModal
          open={Boolean(viewingPhotos)}
          title={viewingPhotos.title}
          urls={viewingPhotos.urls}
          onClose={() => setViewingPhotos(null)}
        />
      )}

      {/* Modal para Subir Soporte Faltante */}
      {uploadingAuditItem && token && (
        <UploadReceiptModal
          token={token}
          item={uploadingAuditItem}
          onClose={() => setUploadingAuditItem(null)}
          onSuccess={() => {
            setUploadingAuditItem(null);
            loadIncomes();
          }}
        />
      )}
    </div>
  );
}
