import { useState, useEffect, useCallback } from "react";
import {
  fetchCashOutflows,
  fetchCashTransfers,
  approveCashTransfer,
  rejectCashTransfer,
  type CashOutflowItem,
  type CashTransferItem,
  type ReceiptAuditItem,
} from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import { CreateEgressVoucherModal } from "../../components/finance/CreateEgressVoucherModal.js";
import { CreateCashTransferModal } from "../../components/finance/CreateCashTransferModal.js";
import { PrintEgressVoucherModal } from "../../components/finance/PrintEgressVoucherModal.js";
import { PrintCashTransferVoucherModal } from "../../components/finance/PrintCashTransferVoucherModal.js";
import { ViewReceiptPhotosModal } from "../../components/common/ViewReceiptPhotosModal.js";
import { UploadReceiptModal } from "../../components/finance/UploadReceiptModal.js";
import {
  FileMinus,
  ArrowLeftRight,
  PlusCircle,
  Search,
  Printer,
  CheckCircle2,
  Clock,
  Building2,
  ArrowRight,
  Filter,
  RefreshCw,
  Camera,
  Image as ImageIcon,
} from "lucide-react";

function formatMoney(n: number): string {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const hasDecimals = Math.abs(val % 1) > 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatDate(iso: string | null): string {
  return formatBogotaDateTime(iso);
}

export function CashOutflowsPage() {
  const { token } = useAuth();
  const { warehouses, warehouseId, isAllWarehouses } = useWarehouse();

  const [activeTab, setActiveTab] = useState<"outflows" | "transfers">("outflows");

  // Filtros de Egresos
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(
    isAllWarehouses ? "" : (warehouseId || "")
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouse(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [searchOutflows, setSearchOutflows] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Datos de Egresos
  const [outflows, setOutflows] = useState<CashOutflowItem[]>([]);
  const [totalOutflows, setTotalOutflows] = useState(0);
  const [totalOutflowsAmount, setTotalOutflowsAmount] = useState(0);
  const [outflowsPage, setOutflowsPage] = useState(1);
  const limit = 25;

  // Datos de Traslados
  const [transfers, setTransfers] = useState<CashTransferItem[]>([]);
  const [totalTransfers, setTotalTransfers] = useState(0);
  const [incomingTransfers, setIncomingTransfers] = useState<CashTransferItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modales
  const [openCreateOutflow, setOpenCreateOutflow] = useState(false);
  const [openCreateTransfer, setOpenCreateTransfer] = useState(false);
  const [voucherToPrint, setVoucherToPrint] = useState<CashOutflowItem | null>(null);
  const [transferToPrint, setTransferToPrint] = useState<{
    transfer: CashTransferItem;
    mandatory: boolean;
  } | null>(null);
  const [viewingPhotos, setViewingPhotos] = useState<{ title: string; urls: string[] } | null>(null);
  const [uploadingAuditItem, setUploadingAuditItem] = useState<ReceiptAuditItem | null>(null);

  // Cargar Egresos
  const loadOutflows = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const targetWh = isAllWarehouses ? (selectedWarehouse || null) : (warehouseId || null);
      const res = await fetchCashOutflows(token, {
        warehouseId: targetWh,
        paymentMethod: paymentMethod || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        q: searchOutflows.trim() || null,
        limit,
        offset: (outflowsPage - 1) * limit,
      });
      setOutflows(res.items);
      setTotalOutflows(res.total);
      setTotalOutflowsAmount(res.totalAmount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los comprobantes de egreso.");
    } finally {
      setLoading(false);
    }
  }, [token, isAllWarehouses, warehouseId, selectedWarehouse, paymentMethod, dateFrom, dateTo, searchOutflows, outflowsPage]);

  // Cargar Traslados de Dinero
  const loadTransfers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const targetWh = isAllWarehouses ? (selectedWarehouse || null) : (warehouseId || null);
      const res = await fetchCashTransfers(token, {
        warehouseId: targetWh,
      });
      setTransfers(res.items);
      setTotalTransfers(res.total);

      // Filtrar los que van dirigidos a la sede actual y están pendientes
      if (warehouseId) {
        const incoming = res.items.filter(
          (t) => t.destinationWarehouseId === warehouseId && t.status === "pending"
        );
        setIncomingTransfers(incoming);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar traslados.");
    } finally {
      setLoading(false);
    }
  }, [token, isAllWarehouses, selectedWarehouse, warehouseId]);

  useEffect(() => {
    if (activeTab === "outflows") {
      void loadOutflows();
      void loadTransfers();
    } else {
      void loadTransfers();
    }
  }, [activeTab, loadOutflows, loadTransfers]);

  // Aprobar traslado entrante
  async function handleApproveTransfer(t: CashTransferItem) {
    if (!token) return;
    try {
      await approveCashTransfer(token, t.id);
      setActionSuccess(`Traslado ${t.code} recibido y sumado a la caja de la sede.`);
      void loadTransfers();
      setIncomingTransfers((prev) => prev.filter((item) => item.id !== t.id));
      window.setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aprobar traslado.");
    }
  }

  // Rechazar traslado
  async function handleRejectTransfer(t: CashTransferItem) {
    const reason = window.prompt("Indica el motivo del rechazo del dinero:");
    if (!reason || !reason.trim() || !token) return;

    try {
      await rejectCashTransfer(token, t.id, reason.trim());
      setActionSuccess(
        `Traslado ${t.code} rechazado. El dinero (${formatMoney(t.amount)}) ha retornado automáticamente a la caja de ${t.originWarehouseName}.`
      );
      void loadTransfers();
      setIncomingTransfers((prev) => prev.filter((item) => item.id !== t.id));
      window.setTimeout(() => setActionSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al rechazar traslado.");
    }
  }

  const totalPages = Math.ceil(totalOutflows / limit) || 1;

  return (
    <div className="fin-page">
      {/* Header */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge fin-header__icon-badge--rose">
              <FileMinus size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">Egresos y Traslados</h1>
              <p className="fin-header__subtitle">
                Emisión de comprobantes de egreso con firma, gastos operativos y remesas de efectivo entre sucursales.
              </p>
            </div>
          </div>
        </div>

        <div className="fin-header__actions">
          <button
            type="button"
            className="fin-btn fin-btn--ghost"
            onClick={() => setOpenCreateTransfer(true)}
          >
            <ArrowLeftRight size={17} />
            <span>Trasladar Dinero</span>
          </button>
          <button
            type="button"
            className="fin-btn fin-btn--primary"
            onClick={() => setOpenCreateOutflow(true)}
          >
            <PlusCircle size={17} />
            <span>Nuevo Comprobante de Egreso</span>
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="fin-alert fin-alert--success">
          <CheckCircle2 size={18} />
          <div>{actionSuccess}</div>
        </div>
      )}

      {/* ALERTA DE TRASLADOS ENTRANTES PENDIENTES DE RECIBIR */}
      {incomingTransfers.length > 0 && (
        <div
          style={{
            background: "rgba(79, 70, 229, 0.05)",
            border: "1.5px solid var(--fin-indigo-border)",
            borderRadius: 14,
            padding: "1.25rem 1.5rem",
            marginBottom: "1.75rem",
            boxShadow: "var(--fin-shadow-sm)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#4f46e5", fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.85rem" }}>
            <Clock size={20} />
            <span>Tienes {incomingTransfers.length} traslado(s) de dinero entrante(s) pendiente(s) por recibir en esta sede</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {incomingTransfers.map((t) => {
              const senderUrls = (t.senderReceiptUrls && t.senderReceiptUrls.length > 0)
                ? t.senderReceiptUrls
                : (t.senderReceiptUrl ? [t.senderReceiptUrl] : []);
              const receiverUrls = (t.receiverReceiptUrls && t.receiverReceiptUrls.length > 0)
                ? t.receiverReceiptUrls
                : (t.receiverReceiptUrl ? [t.receiverReceiptUrl] : []);

              return (
              <div
                key={t.id}
                style={{
                  background: "#ffffff",
                  borderRadius: 12,
                  padding: "0.85rem 1.15rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  border: "1px solid var(--border-color)",
                  boxShadow: "var(--fin-shadow-sm)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="fin-badge fin-badge--teal">{t.code}</span>
                    <span style={{ fontSize: "0.88rem" }}>· Enviado desde: <strong style={{ color: "#0f172a" }}>{t.originWarehouseName}</strong></span>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.25rem" }}>
                    Transportado por: <strong style={{ color: "#334155" }}>{t.carrierName}</strong> {t.carrierDoc ? `(CC: ${t.carrierDoc})` : ""} · Motivo: {t.concept}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#059669", fontFamily: "var(--font-display, inherit)" }}>
                    {formatMoney(t.amount)}
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {senderUrls.length > 0 && (
                      <button
                        type="button"
                        className="fin-btn fin-btn--ghost fin-btn--sm"
                        style={{ color: "#6366f1" }}
                        onClick={() => setViewingPhotos({ title: `Soporte de Envío ${t.code}`, urls: senderUrls })}
                      >
                        <ImageIcon size={14} />
                        <span>Ver Sop. Envío</span>
                      </button>
                    )}
                    {receiverUrls.length > 0 ? (
                      <button
                        type="button"
                        className="fin-btn fin-btn--ghost fin-btn--sm"
                        style={{ color: "#10b981" }}
                        onClick={() => setViewingPhotos({ title: `Soporte de Recepción ${t.code}`, urls: receiverUrls })}
                      >
                        <ImageIcon size={14} />
                        <span>Sop. Recepción ({receiverUrls.length})</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="fin-btn fin-btn--ghost fin-btn--sm"
                        style={{ color: "#059669" }}
                        onClick={() =>
                          setUploadingAuditItem({
                            id: t.id,
                            type: "transfer_received",
                            typeLabel: "Traslado Recibido",
                            reference: t.code,
                            concept: `Recepción ${t.originWarehouseName} → ${t.destinationWarehouseName}`,
                            paymentMethod: t.paymentMethod,
                            amount: t.amount,
                            warehouseId: warehouseId || t.destinationWarehouseId,
                            warehouseName: t.destinationWarehouseName,
                            createdAt: t.approvedAt || t.createdAt,
                            createdByName: null,
                            receiptUrl: null,
                            receiptFilename: null,
                          })
                        }
                      >
                        <Camera size={14} />
                        <span>+ Sop. Recepción</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="fin-btn fin-btn--ghost fin-btn--sm"
                      onClick={() => setTransferToPrint({ transfer: t, mandatory: false })}
                      title="Imprimir Voucher de Traslado"
                    >
                      <Printer size={14} />
                      <span>Voucher</span>
                    </button>
                    <button
                      type="button"
                      className="fin-btn fin-btn--primary fin-btn--sm"
                      onClick={() => void handleApproveTransfer(t)}
                    >
                      <CheckCircle2 size={15} />
                      <span>Aprobar y Recibir en Caja</span>
                    </button>
                    <button
                      type="button"
                      className="fin-btn fin-btn--danger fin-btn--sm"
                      onClick={() => void handleRejectTransfer(t)}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="fin-tabs">
          <button
            type="button"
            className={`fin-tab ${activeTab === "outflows" ? "is-active" : ""}`}
            onClick={() => setActiveTab("outflows")}
          >
            <FileMinus size={16} />
            <span>Comprobantes de Egreso</span>
          </button>
          <button
            type="button"
            className={`fin-tab ${activeTab === "transfers" ? "is-active" : ""}`}
            onClick={() => setActiveTab("transfers")}
          >
            <ArrowLeftRight size={16} />
            <span>Traslados entre Sedes</span>
            {totalTransfers > 0 && <span className="fin-tab__badge">{totalTransfers}</span>}
          </button>
        </div>
      </div>

      {activeTab === "outflows" && (
        <>
          {/* KPI Summary */}
          <div className="fin-kpi-grid fin-kpi-grid--4">
            <div className="fin-kpi-card fin-kpi-card--rose">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Total Egresos Desembolsados</span>
                <div className="fin-kpi-icon fin-kpi-icon--rose">
                  <FileMinus size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--rose">
                {formatMoney(totalOutflowsAmount)}
              </div>
              <div className="fin-kpi-sub">
                {totalOutflows} comprobantes emitidos en el período
              </div>
            </div>

            <div className="fin-kpi-card fin-kpi-card--indigo">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Sede de Operación</span>
                <div className="fin-kpi-icon fin-kpi-icon--indigo">
                  <Building2 size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--indigo" style={{ fontSize: "1.35rem" }}>
                {selectedWarehouse ? (warehouses.find((w) => w.id === selectedWarehouse)?.name || "Sede") : "Todas las sedes"}
              </div>
              <div className="fin-kpi-sub">
                Control de salidas y caja menor
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="fin-filter-card">
            {/* Sede */}
            {isAllWarehouses ? (
              <div className="fin-filter-field" style={{ minWidth: 180 }}>
                <span>SEDE</span>
                <select
                  className="fin-select"
                  value={selectedWarehouse}
                  onChange={(e) => {
                    setSelectedWarehouse(e.target.value);
                    setOutflowsPage(1);
                  }}
                >
                  <option value="">Todas las sedes</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="fin-filter-field" style={{ minWidth: 180 }}>
                <span>SEDE</span>
                <div style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--inv-border)", background: "var(--inv-bg-field)", fontSize: "0.85rem", fontWeight: 600, color: "var(--inv-text-primary)" }}>
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede actual"}
                </div>
              </div>
            )}

            {/* Medio de Pago */}
            <div className="fin-filter-field" style={{ minWidth: 150 }}>
              <span>MEDIO DE PAGO</span>
              <select
                className="fin-select"
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  setOutflowsPage(1);
                }}
              >
                <option value="">Todos los medios</option>
                <option value="efectivo">Efectivo 💵</option>
                <option value="bancolombia">Bancolombia 🟡</option>
                <option value="davivienda">Davivienda 🔴</option>
                <option value="nequi">Nequi 🟣</option>
                <option value="daviplata">Daviplata 📱</option>
                <option value="bold">Bold 🔵</option>
              </select>
            </div>

            {/* Búsqueda */}
            <div className="fin-filter-field" style={{ flex: 2, minWidth: 220 }}>
              <span>BUSCAR COMPROBANTE / BENEFICIARIO</span>
              <div className="fin-search-wrap">
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  value={searchOutflows}
                  onChange={(e) => {
                    setSearchOutflows(e.target.value);
                    setOutflowsPage(1);
                  }}
                  placeholder="N° comprobante, persona, concepto..."
                />
              </div>
            </div>

            {/* Fechas */}
            <div className="fin-filter-field" style={{ minWidth: 140 }}>
              <span>DESDE</span>
              <input
                className="fin-input"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setOutflowsPage(1);
                }}
              />
            </div>

            <div className="fin-filter-field" style={{ minWidth: 140 }}>
              <span>HASTA</span>
              <input
                className="fin-input"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setOutflowsPage(1);
                }}
              />
            </div>
          </div>

          {error && <div className="fin-alert fin-alert--danger">{error}</div>}

          {/* Tabla de Egresos */}
          <div className="fin-table-card">
            <div className="fin-table-header">
              <h3 className="fin-table-title">
                <FileMinus size={18} color="#e11d48" />
                <span>Comprobantes de Egreso Emitidos</span>
              </h3>
              <span className="fin-badge fin-badge--neutral">
                {totalOutflows} registros encontrados
              </span>
            </div>

            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Comprobante</th>
                    <th>Fecha y Hora</th>
                    <th>Sede</th>
                    <th>Pagado a (Beneficiario)</th>
                    <th>Concepto</th>
                    <th>Proveedor</th>
                    <th>Medio</th>
                    <th style={{ textAlign: "right" }}>Valor Salida</th>
                    <th>Soporte</th>
                    <th>Registrado por</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
                        <RefreshCw size={24} className="spin" style={{ margin: "0 auto 0.5rem" }} />
                        <div>Cargando egresos…</div>
                      </td>
                    </tr>
                  ) : outflows.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                        <Filter size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>No se encontraron comprobantes de egreso</div>
                        <div style={{ fontSize: "0.82rem", marginTop: 4 }}>Ajusta los filtros de búsqueda o fecha.</div>
                      </td>
                    </tr>
                  ) : (
                    outflows.map((item) => {
                      const urls = (item.receiptUrls && item.receiptUrls.length > 0)
                        ? item.receiptUrls
                        : (item.receiptUrl ? [item.receiptUrl] : []);
                      return (
                      <tr key={item.id}>
                        <td>
                          <span className="fin-badge fin-badge--danger" style={{ fontWeight: 800 }}>
                            {item.voucherNumber}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap" }}>
                          {formatDate(item.createdAt)}
                        </td>
                        <td>{item.warehouseName}</td>
                        <td>
                          <div>
                            <strong style={{ color: "#0f172a" }}>{item.beneficiaryName}</strong>
                            {item.beneficiaryDoc && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                CC: {item.beneficiaryDoc}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.concept}>
                          {item.concept}
                        </td>
                        <td>
                          {item.supplierName ? (
                            <span style={{ fontSize: "0.82rem" }}>{item.supplierName}</span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>—</span>
                          )}
                        </td>
                        <td>
                          <span className="fin-badge fin-badge--neutral" style={{ textTransform: "capitalize" }}>
                            {item.paymentMethod}
                          </span>
                        </td>
                        <td className="fin-table-num" style={{ fontWeight: 800, color: "#e11d48" }}>
                          {formatMoney(item.amount)}
                        </td>
                        <td>
                          {urls.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setViewingPhotos({
                                  title: `Soporte ${item.voucherNumber} - ${item.concept}`,
                                  urls,
                                })
                              }
                              className="fin-btn fin-btn--ghost fin-btn--sm"
                              style={{ color: "#6366f1", gap: "4px" }}
                              title="Ver fotos / soporte adjunto"
                            >
                              <ImageIcon size={14} />
                              <span>{urls.length > 1 ? `${urls.length} fotos` : "Ver foto"}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setUploadingAuditItem({
                                  id: item.id,
                                  type: "cash_outflow",
                                  typeLabel: "Comprobante de Egreso",
                                  reference: item.voucherNumber,
                                  concept: item.concept,
                                  paymentMethod: item.paymentMethod,
                                  amount: item.amount,
                                  warehouseId: item.warehouseId,
                                  warehouseName: item.warehouseName,
                                  createdAt: item.createdAt,
                                  createdByName: item.createdByName || null,
                                  receiptUrl: null,
                                  receiptFilename: null,
                                })
                              }
                              className="fin-btn fin-btn--ghost fin-btn--sm"
                              style={{ color: "#f59e0b", gap: "4px" }}
                              title="Adjuntar o tomar foto de soporte con la cámara"
                            >
                              <Camera size={14} />
                              <span>+ Adjuntar</span>
                            </button>
                          )}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                          {item.createdByName || "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="fin-btn fin-btn--ghost fin-btn--sm"
                            onClick={() => setVoucherToPrint(item)}
                            title="Imprimir Voucher de Egreso"
                          >
                            <Printer size={14} />
                            <span>Voucher</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div
                style={{
                  padding: "0.85rem 1.25rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--border-color)",
                  fontSize: "0.85rem",
                  background: "#fcfdfe",
                }}
              >
                <span>
                  Página <strong>{outflowsPage}</strong> de <strong>{totalPages}</strong> ({totalOutflows} registros)
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    disabled={outflowsPage <= 1}
                    onClick={() => setOutflowsPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    disabled={outflowsPage >= totalPages}
                    onClick={() => setOutflowsPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "transfers" && (
        <>
          {/* Tabla de Traslados de Dinero */}
          <div className="fin-table-card">
            <div className="fin-table-header">
              <h3 className="fin-table-title">
                <ArrowLeftRight size={18} color="var(--accent)" />
                <span>Historial de Remesas y Traslados de Dinero</span>
              </h3>
              <span className="fin-badge fin-badge--neutral">
                {totalTransfers} traslados
              </span>
            </div>

            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Ruta (Sede Origen → Destino)</th>
                    <th style={{ textAlign: "right" }}>Monto Trasladado</th>
                    <th>Transportador / Mensajero</th>
                    <th>Concepto</th>
                    <th>Medio</th>
                    <th>Estado</th>
                    <th>Fecha Envío</th>
                    <th>Fecha Recepción</th>
                    <th>Soportes</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
                        <RefreshCw size={24} className="spin" style={{ margin: "0 auto 0.5rem" }} />
                        <div>Cargando traslados de dinero…</div>
                      </td>
                    </tr>
                  ) : transfers.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                        <ArrowLeftRight size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>No se han registrado traslados de dinero entre sedes</div>
                        <div style={{ fontSize: "0.82rem", marginTop: 4 }}>Usa el botón "Trasladar Dinero" para registrar una remesa.</div>
                      </td>
                    </tr>
                  ) : (
                    transfers.map((t) => {
                      const senderUrls = (t.senderReceiptUrls && t.senderReceiptUrls.length > 0)
                        ? t.senderReceiptUrls
                        : (t.senderReceiptUrl ? [t.senderReceiptUrl] : []);

                      const receiverUrls = (t.receiverReceiptUrls && t.receiverReceiptUrls.length > 0)
                        ? t.receiverReceiptUrls
                        : (t.receiverReceiptUrl ? [t.receiverReceiptUrl] : []);

                      return (
                      <tr key={t.id}>
                        <td>
                          <span className="fin-badge fin-badge--teal" style={{ fontWeight: 800 }}>
                            {t.code}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span>{t.originWarehouseName}</span>
                            <ArrowRight size={13} color="#94a3b8" />
                            <strong style={{ color: "#0f172a" }}>{t.destinationWarehouseName}</strong>
                          </div>
                        </td>
                        <td className="fin-table-num" style={{ fontWeight: 800, color: "#059669", fontSize: "0.95rem" }}>
                          {formatMoney(t.amount)}
                        </td>
                        <td>
                          <div>
                            <strong style={{ color: "#0f172a" }}>{t.carrierName}</strong>
                            {t.carrierDoc && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                CC: {t.carrierDoc}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.concept}>
                          {t.concept}
                        </td>
                        <td>
                          <span className="fin-badge fin-badge--neutral" style={{ textTransform: "capitalize" }}>
                            {t.paymentMethod}
                          </span>
                        </td>
                        <td>
                          {t.status === "pending" && (
                            <span className="fin-badge fin-badge--warning">
                              En tránsito
                            </span>
                          )}
                          {t.status === "approved" && (
                            <span className="fin-badge fin-badge--success">
                              Recibido en caja
                            </span>
                          )}
                          {t.status === "rejected" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                              <span
                                className="fin-badge fin-badge--danger"
                                title={t.rejectionReason ? `Motivo: ${t.rejectionReason}` : "Rechazado y retornado a sede origen"}
                              >
                                Rechazado · Retornado a origen
                              </span>
                              {t.rejectionReason && (
                                <span style={{ fontSize: "0.73rem", color: "#64748b" }}>
                                  Motivo: {t.rejectionReason}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap" }}>
                          {formatDate(t.createdAt)}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap" }}>
                          {t.approvedAt ? formatDate(t.approvedAt) : "—"}
                        </td>
                        <td>
                          {(() => {
                            const isOriginSede = Boolean(warehouseId && warehouseId === t.originWarehouseId);
                            const isDestinationSede = Boolean(warehouseId && warehouseId === t.destinationWarehouseId);

                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                                {/* Soporte de Envío: solo la sede de origen puede cargarlo */}
                                {senderUrls.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setViewingPhotos({ title: `Soporte de Envío ${t.code}`, urls: senderUrls })}
                                    className="fin-btn fin-btn--ghost fin-btn--sm"
                                    style={{ color: "#6366f1", padding: "2px 6px", fontSize: "0.74rem", gap: "3px" }}
                                    title="Ver comprobante de envío"
                                  >
                                    <ImageIcon size={12} />
                                    <span>Envío ({senderUrls.length})</span>
                                  </button>
                                ) : isOriginSede ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setUploadingAuditItem({
                                        id: t.id,
                                        type: "transfer_sent",
                                        typeLabel: "Traslado Enviado (Soporte de Salida)",
                                        reference: t.code,
                                        concept: `Envío ${t.originWarehouseName} → ${t.destinationWarehouseName}`,
                                        paymentMethod: t.paymentMethod,
                                        amount: t.amount,
                                        warehouseId: warehouseId || t.originWarehouseId,
                                        warehouseName: t.originWarehouseName,
                                        createdAt: t.createdAt,
                                        createdByName: null,
                                        receiptUrl: null,
                                        receiptFilename: null,
                                      })
                                    }
                                    className="fin-btn fin-btn--ghost fin-btn--sm"
                                    style={{ color: "#6366f1", padding: "2px 6px", fontSize: "0.74rem", gap: "3px" }}
                                    title="Adjuntar foto de soporte del envío (exclusivo sede de origen)"
                                  >
                                    <Camera size={12} />
                                    <span>+ Sop. Envío</span>
                                  </button>
                                ) : (
                                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", padding: "1px 4px" }}>
                                    Envío: Sin soporte
                                  </span>
                                )}

                                {/* Soporte de Recepción: solo la sede destinataria puede cargarlo */}
                                {receiverUrls.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setViewingPhotos({ title: `Soporte de Recepción ${t.code}`, urls: receiverUrls })}
                                    className="fin-btn fin-btn--ghost fin-btn--sm"
                                    style={{ color: "#10b981", padding: "2px 6px", fontSize: "0.74rem", gap: "3px" }}
                                    title="Ver comprobante de recepción"
                                  >
                                    <ImageIcon size={12} />
                                    <span>Recepción ({receiverUrls.length})</span>
                                  </button>
                                ) : isDestinationSede && t.status !== "rejected" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setUploadingAuditItem({
                                        id: t.id,
                                        type: "transfer_received",
                                        typeLabel: "Traslado Recibido (Soporte de Recepción)",
                                        reference: t.code,
                                        concept: `Recepción ${t.originWarehouseName} → ${t.destinationWarehouseName}`,
                                        paymentMethod: t.paymentMethod,
                                        amount: t.amount,
                                        warehouseId: warehouseId || t.destinationWarehouseId,
                                        warehouseName: t.destinationWarehouseName,
                                        createdAt: t.approvedAt || t.createdAt,
                                        createdByName: null,
                                        receiptUrl: null,
                                        receiptFilename: null,
                                      })
                                    }
                                    className="fin-btn fin-btn--ghost fin-btn--sm"
                                    style={{ color: "#059669", padding: "2px 6px", fontSize: "0.74rem", gap: "3px" }}
                                    title="Adjuntar foto de soporte de la recepción (exclusivo sede destinataria)"
                                  >
                                    <Camera size={12} />
                                    <span>+ Sop. Recep.</span>
                                  </button>
                                ) : t.status !== "rejected" ? (
                                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", padding: "1px 4px" }}>
                                    Recep.: Sin soporte
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", justifyContent: "flex-end" }}>
                            {t.status === "pending" && t.destinationWarehouseId === warehouseId && (
                              <>
                                <button
                                  type="button"
                                  className="fin-btn fin-btn--primary fin-btn--sm"
                                  onClick={() => void handleApproveTransfer(t)}
                                >
                                  Recibir
                                </button>
                                <button
                                  type="button"
                                  className="fin-btn fin-btn--danger fin-btn--sm"
                                  onClick={() => void handleRejectTransfer(t)}
                                >
                                  Rechazar
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="fin-btn fin-btn--ghost fin-btn--sm"
                              onClick={() => setTransferToPrint({ transfer: t, mandatory: false })}
                              title="Imprimir Voucher de Traslado"
                            >
                              <Printer size={14} />
                              <span>Voucher</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal Crear Comprobante de Egreso */}
      <CreateEgressVoucherModal
        open={openCreateOutflow}
        onClose={() => setOpenCreateOutflow(false)}
        onSuccess={(outflow) => {
          void loadOutflows();
          setVoucherToPrint(outflow);
        }}
      />

      {/* Modal Crear Traslado de Dinero */}
      <CreateCashTransferModal
        open={openCreateTransfer}
        onClose={() => setOpenCreateTransfer(false)}
        onSuccess={(transfer) => {
          void loadTransfers();
          setTransferToPrint({ transfer, mandatory: true });
          setActionSuccess("Traslado de dinero registrado. Se ha enviado notificación a la sede destino.");
          window.setTimeout(() => setActionSuccess(null), 4000);
        }}
      />

      {/* Modal Imprimir Voucher de Egreso */}
      {voucherToPrint && (
        <PrintEgressVoucherModal
          open={Boolean(voucherToPrint)}
          outflow={voucherToPrint}
          onClose={() => setVoucherToPrint(null)}
        />
      )}

      {/* Modal Imprimir Voucher de Traslado de Dinero */}
      {transferToPrint && (
        <PrintCashTransferVoucherModal
          open={Boolean(transferToPrint)}
          transfer={transferToPrint.transfer}
          mandatory={transferToPrint.mandatory}
          onClose={() => setTransferToPrint(null)}
        />
      )}

      {viewingPhotos && (
        <ViewReceiptPhotosModal
          open={Boolean(viewingPhotos)}
          onClose={() => setViewingPhotos(null)}
          title={viewingPhotos.title}
          urls={viewingPhotos.urls}
        />
      )}

      {uploadingAuditItem && token && (
        <UploadReceiptModal
          token={token}
          item={uploadingAuditItem}
          onClose={() => setUploadingAuditItem(null)}
          onSuccess={() => {
            const uploadedType = uploadingAuditItem.type;
            setUploadingAuditItem(null);
            if (uploadedType === "transfer_sent" || uploadedType === "transfer_received" || activeTab === "transfers") {
              void loadTransfers();
            }
            if (activeTab === "outflows") {
              void loadOutflows();
            }
          }}
        />
      )}
    </div>
  );
}
