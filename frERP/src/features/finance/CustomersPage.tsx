import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Clock,
  Edit2,
  Eye,
  PlusCircle,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Users,
  Wallet,
  X,
  ChevronRight,
  Trash2,
  ArrowDownLeft,
} from "lucide-react";
import {
  fetchCustomersSummary,
  fetchCustomerCreditProfile,
  type CustomerDirectoryItem,
  type CustomerCreditProfile,
} from "../../api/finance.js";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  fetchDocument,
} from "../../api/inventory.js";
import type { InventoryDocumentDetail } from "../inventory/inventory.types.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";
import { DocumentInvoicePrint } from "../../components/inventory/DocumentInvoicePrint.js";
import { AddPaymentModal } from "../../components/finance/AddPaymentModal.js";
import { AddDirectPaymentModal } from "../../components/finance/AddDirectPaymentModal.js";

function formatMoney(n: number | null | undefined): string {
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const hasDecimals = Math.abs(val % 1) > 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatBogotaDateTime(iso);
}

type TabDetailMode = "invoices" | "payments" | "favour_movements";

export function CustomersPage() {
  const { token } = useAuth();
  const {
    warehouses,
    warehouseId,
    isAllWarehouses,
    loading: whLoading,
  } = useWarehouse();

  // Filtros del directorio
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    isAllWarehouses ? "" : warehouseId || ""
  );

  useEffect(() => {
    if (!isAllWarehouses && warehouseId) {
      setSelectedWarehouseId(warehouseId);
    }
  }, [isAllWarehouses, warehouseId]);

  const effectiveWarehouseId = isAllWarehouses ? selectedWarehouseId : warehouseId || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "with_debt" | "with_favour" | "with_activity">("all");
  const [items, setItems] = useState<CustomerDirectoryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    customersWithDebt: 0,
    totalDebtAmount: 0,
    customersWithFavour: 0,
    totalFavourAmount: 0,
    totalInvoicesCount: 0,
    totalBilledAmount: 0,
    totalAbonosAmount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cliente seleccionado para vista de detalle
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerCreditProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<TabDetailMode>("invoices");
  const [detailSedeFilter, setDetailSedeFilter] = useState<string>("");

  // Modales
  const [openCreateCustomer, setOpenCreateCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustTaxId, setNewCustTaxId] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Modal edición rápida del cliente
  const [openEditCustomer, setOpenEditCustomer] = useState(false);
  const [editCustName, setEditCustName] = useState("");
  const [editCustTaxId, setEditCustTaxId] = useState("");
  const [editCustPhone, setEditCustPhone] = useState("");
  const [editCustAddress, setEditCustAddress] = useState("");
  const [savingEditCustomer, setSavingEditCustomer] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  // Modal para ver/imprimir factura generada
  const [selectedDocToPrint, setSelectedDocToPrint] = useState<InventoryDocumentDetail | null>(null);
  const [loadingDocToPrint, setLoadingDocToPrint] = useState(false);

  // Modal para abonar a una factura a crédito
  const [activeReceivableForPayment, setActiveReceivableForPayment] = useState<any | null>(null);

  // Modal para ver foto ampliada de recibo
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Modal para abono directo sin factura / saldo a favor
  const [openDirectPayment, setOpenDirectPayment] = useState(false);

  // Carga del directorio
    const handleDeleteCustomer = async (cust: { id: string; displayName: string }) => {
    if (!isAllWarehouses) {
      alert("Solo se pueden eliminar clientes desde la Sede Administrativa.");
      return;
    }
    const ok = window.confirm(
      `¿Estás seguro de que deseas eliminar al cliente "${cust.displayName}"?\n\n` +
      `Esta acción solo está permitida desde la Sede Administrativa.\n` +
      `• Si no tiene movimientos ni créditos registrados, se eliminará definitivamente.\n` +
      `• Si tiene historial comercial cerrado, se archivará para proteger la contabilidad.\n` +
      `• No podrá eliminarse si tiene deudas pendientes o saldos a favor.`
    );
    if (!ok) return;

    try {
      const res = await deleteCustomer(token!, cust.id);
      alert(res.message || "Operación realizada con éxito.");
      if (selectedCustomerId === cust.id) {
        setSelectedCustomerId(null);
      }
      void loadDirectory();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar el cliente.");
    }
  };

  const loadDirectory = useCallback(async () => {
    if (!token || whLoading) return;
    if (!isAllWarehouses && !warehouseId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetchCustomersSummary(token, {
        warehouseId: effectiveWarehouseId || undefined,
        filter: filterMode,
        q: searchQuery.trim() || undefined,
        limit: 150,
      });
      setItems(res.items);
      setTotalCount(res.total);
      setSummary(res.summary);
    } catch (err: any) {
      setError(err?.message || "Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  }, [token, whLoading, isAllWarehouses, warehouseId, effectiveWarehouseId, filterMode, searchQuery]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  // Carga de ficha detallada del cliente seleccionado
  const loadProfile = useCallback(
    async (cid: string) => {
      if (!token) return;
      setProfileLoading(true);
      setProfileError(null);
      try {
        const prof = await fetchCustomerCreditProfile(
          token,
          cid,
          effectiveWarehouseId || undefined
        );
        setCustomerProfile(prof);
      } catch (err: any) {
        setProfileError(err?.message || "Error al cargar ficha del cliente");
      } finally {
        setProfileLoading(false);
      }
    },
    [token, effectiveWarehouseId]
  );

  useEffect(() => {
    if (selectedCustomerId) {
      void loadProfile(selectedCustomerId);
    }
  }, [selectedCustomerId, loadProfile]);

  // Abrir vista de factura para imprimir
  async function handleOpenDocumentPrint(documentId: string, whId?: string) {
    if (!token) return;
    setLoadingDocToPrint(true);
    try {
      const res = await fetchDocument(token, documentId, whId || warehouseId);
      if (res?.item) {
        setSelectedDocToPrint(res.item);
      }
    } catch (err: any) {
      alert(err?.message || "Error al cargar documento para impresión");
    } finally {
      setLoadingDocToPrint(false);
    }
  }

  // Guardar nuevo cliente express
  async function handleCreateNewCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newCustName.trim()) return;
    setSavingCustomer(true);
    try {
      const res = await createCustomer(token, {
        displayName: newCustName.trim(),
        taxId: newCustTaxId.trim() || undefined,
        phone: newCustPhone.trim() || undefined,
        address: newCustAddress.trim() || undefined,
      });
      setOpenCreateCustomer(false);
      setNewCustName("");
      setNewCustTaxId("");
      setNewCustPhone("");
      setNewCustAddress("");
      await loadDirectory();
      if (res?.item?.id) {
        setSelectedCustomerId(res.item.id);
      }
    } catch (err: any) {
      alert(err?.message || "Error al registrar cliente");
    } finally {
      setSavingCustomer(false);
    }
  }

  // Guardar edición rápida del cliente
  async function handleSaveEditCustomer(e: React.FormEvent) {
    e.preventDefault();
    const targetId = editingCustomerId || customerProfile?.customer.id;
    if (!token || !targetId || !editCustName.trim()) return;
    setSavingEditCustomer(true);
    try {
      await updateCustomer(token, targetId, {
        displayName: editCustName.trim(),
        taxId: editCustTaxId.trim() || null,
        phone: editCustPhone.trim() || null,
        address: editCustAddress.trim() || null,
      });
      setOpenEditCustomer(false);
      if (customerProfile && customerProfile.customer.id === targetId) {
        await loadProfile(targetId);
      }
      void loadDirectory();
    } catch (err: any) {
      alert(err?.message || "Error al actualizar datos del cliente");
    } finally {
      setSavingEditCustomer(false);
    }
  }

  function startEditingCustomer() {
    if (!customerProfile) return;
    setEditingCustomerId(customerProfile.customer.id);
    setEditCustName(customerProfile.customer.displayName);
    setEditCustTaxId(customerProfile.customer.taxId || "");
    setEditCustPhone(customerProfile.customer.phone || "");
    setEditCustAddress(customerProfile.customer.address || "");
    setOpenEditCustomer(true);
  }

  function startEditingCustomerFromItem(c: CustomerDirectoryItem) {
    setEditingCustomerId(c.id);
    setEditCustName(c.displayName);
    setEditCustTaxId(c.taxId || "");
    setEditCustPhone(c.phone || "");
    setEditCustAddress(c.address || "");
    setOpenEditCustomer(true);
  }

  // Filtrado interno de facturas, abonos y movimientos por sede seleccionada en la vista de detalle
  const filteredInvoices = customerProfile?.invoices?.filter((inv) => {
    if (!detailSedeFilter) return true;
    return inv.warehouseId === detailSedeFilter;
  }) ?? [];

  const filteredPayments = customerProfile?.recentPayments?.filter((p) => {
    if (!detailSedeFilter) return true;
    return p.warehouseId === detailSedeFilter;
  }) ?? [];

  const filteredMovements = customerProfile?.creditBalanceMovements?.filter((m) => {
    if (!detailSedeFilter) return true;
    return m.warehouseId === detailSedeFilter;
  }) ?? [];

  const activeSedeBreakdown = customerProfile?.warehouseBreakdown?.find(
    (w) => w.warehouseId === detailSedeFilter
  ) || null;

  const currentDisplayCreditBalance = activeSedeBreakdown
    ? activeSedeBreakdown.creditBalance
    : customerProfile?.customer.creditBalance ?? 0;

  const currentDisplayDebt = activeSedeBreakdown
    ? activeSedeBreakdown.currentDebt
    : customerProfile?.stats.totalCurrentDebt ?? 0;

  const currentDisplayBilled = activeSedeBreakdown
    ? activeSedeBreakdown.totalBilled
    : customerProfile?.stats.totalBilledAmount ?? 0;

  const currentDisplayAbonos = activeSedeBreakdown
    ? activeSedeBreakdown.totalAbonos
    : customerProfile?.stats.totalAbonosAmount ?? 0;

  return (
    <div className="fin-page">
      {/* ────────────────── HEADER PRINCIPAL ────────────────── */}
      <div className="fin-header">
        <div className="fin-header__info">
          <div className="fin-header__title-row">
            <div className="fin-header__icon-badge fin-header__icon-badge--teal">
              <Users size={24} />
            </div>
            <div>
              <h1 className="fin-header__title">
                {selectedCustomerId && customerProfile ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      onClick={() => setSelectedCustomerId(null)}
                      style={{ cursor: "pointer", opacity: 0.7 }}
                    >
                      Clientes
                    </span>
                    <ChevronRight size={18} />
                    <span>{customerProfile.customer.displayName}</span>
                  </span>
                ) : (
                  "Clientes · Ficha, Deuda y Saldo a Favor"
                )}
              </h1>
              <p className="fin-header__subtitle">
                {isAllWarehouses
                  ? "Consolidado corporativo en todas las sedes: seguimiento de saldos a favor, facturas generadas, cartera y abonos."
                  : `Visualización de clientes, facturas y abonos en ${
                      warehouses.find((w) => w.id === warehouseId)?.name ?? "esta sede"
                    }.`}
              </p>
            </div>
          </div>
        </div>

        <div className="fin-header__actions" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {selectedCustomerId ? (
            <button
              type="button"
              className="fin-btn fin-btn--ghost"
              onClick={() => setSelectedCustomerId(null)}
            >
              ← Volver al Directorio
            </button>
          ) : (
            <>
              <button
                type="button"
                className="fin-btn fin-btn--emerald"
                onClick={() => setOpenDirectPayment(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Wallet size={17} />
                <span>+ Abono sin Factura</span>
              </button>
              <button
                type="button"
                className="fin-btn fin-btn--primary"
                onClick={() => setOpenCreateCustomer(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <PlusCircle size={17} />
                <span>+ Nuevo Cliente</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="fin-btn fin-btn--ghost"
            onClick={() => {
              if (selectedCustomerId) void loadProfile(selectedCustomerId);
              void loadDirectory();
            }}
            title="Refrescar datos"
            disabled={loading || profileLoading}
          >
            <RefreshCw size={16} className={loading || profileLoading ? "spin" : ""} />
            <span>Refrescar</span>
          </button>
        </div>
      </div>

      {/* ────────────────── VISTA 1: DIRECTORIO DE CLIENTES ────────────────── */}
      {!selectedCustomerId && (
        <>
          {/* Tarjetas KPI de Resumen */}
          <div className="fin-kpi-grid fin-kpi-grid--4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {/* Saldo a Favor */}
            <div
              className="fin-kpi-card fin-kpi-card--emerald"
              style={{
                cursor: "pointer",
                border: filterMode === "with_favour" ? "2px solid #10b981" : undefined,
                background: "linear-gradient(145deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))",
              }}
              onClick={() => setFilterMode(filterMode === "with_favour" ? "all" : "with_favour")}
              title="Click para ver solo clientes con saldo a favor disponible"
            >
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "#059669" }}>
                  💰 Saldo a Favor Disponible
                </span>
                <div className="fin-kpi-icon fin-kpi-icon--emerald">
                  <Wallet size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--emerald">
                {formatMoney(summary.totalFavourAmount)}
              </div>
              <div className="fin-kpi-sub">
                {summary.customersWithFavour} cliente(s) con saldo a favor
              </div>
            </div>

            {/* Deuda en Resumen */}
            <div
              className="fin-kpi-card fin-kpi-card--rose"
              style={{
                cursor: "pointer",
                border: filterMode === "with_debt" ? "2px solid #e11d48" : undefined,
                background: "linear-gradient(145deg, rgba(225, 29, 72, 0.08), rgba(225, 29, 72, 0.02))",
              }}
              onClick={() => setFilterMode(filterMode === "with_debt" ? "all" : "with_debt")}
              title="Click para ver solo clientes con deuda pendiente"
            >
              <div className="fin-kpi-top">
                <span className="fin-kpi-label" style={{ color: "#e11d48" }}>
                  ⚠️ Deuda en Cartera
                </span>
                <div className="fin-kpi-icon fin-kpi-icon--rose">
                  <Clock size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--rose">
                {formatMoney(summary.totalDebtAmount)}
              </div>
              <div className="fin-kpi-sub">
                {summary.customersWithDebt} cliente(s) con deuda activa
              </div>
            </div>

            {/* Facturas Generadas */}
            <div className="fin-kpi-card fin-kpi-card--indigo">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Facturas Generadas</span>
                <div className="fin-kpi-icon fin-kpi-icon--indigo">
                  <Receipt size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--indigo">
                {formatMoney(summary.totalBilledAmount)}
              </div>
              <div className="fin-kpi-sub">
                {summary.totalInvoicesCount} facturas completadas
              </div>
            </div>

            {/* Abonos Recibidos */}
            <div className="fin-kpi-card fin-kpi-card--teal">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Total Recaudado en Abonos</span>
                <div className="fin-kpi-icon fin-kpi-icon--teal">
                  <ArrowDownLeft size={18} />
                </div>
              </div>
              <div className="fin-kpi-val fin-kpi-val--teal">
                {formatMoney(summary.totalAbonosAmount)}
              </div>
              <div className="fin-kpi-sub">
                Recaudos registrados en recibos de caja
              </div>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div className="fin-filter-card" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
            {/* Buscador */}
            <div className="fin-filter-field" style={{ flex: 2, minWidth: 240 }}>
              <span>BUSCAR CLIENTE</span>
              <div className="fin-search-wrap">
                <Search size={16} className="fin-search-wrap__icon" />
                <input
                  className="fin-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, cédula o teléfono…"
                />
              </div>
            </div>

            {/* Filtro Rápido */}
            <div className="fin-filter-field" style={{ minWidth: 190 }}>
              <span>FILTRO RÁPIDO</span>
              <select
                className="fin-select"
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as any)}
              >
                <option value="all">Todos los clientes</option>
                <option value="with_favour">💰 Con Saldo a Favor</option>
                <option value="with_debt">⚠️ Con Deuda Pendiente</option>
                <option value="with_activity">Con Movimientos / Historial</option>
              </select>
            </div>

            {/* Selector de Sede */}
            {isAllWarehouses ? (
              <div className="fin-filter-field" style={{ minWidth: 190 }}>
                <span>SEDE DE HISTORIAL</span>
                <select
                  className="fin-select"
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                >
                  <option value="">Todas las Sedes (Consolidado)</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="fin-filter-field" style={{ minWidth: 170 }}>
                <span>SEDE OPERATIVA</span>
                <div
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--inv-border)",
                    background: "var(--inv-bg-field)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? "Sede Actual"}
                </div>
              </div>
            )}
          </div>

          {/* Tabla de Directorio de Clientes */}
          <div className="fin-table-card">
            <div className="fin-table-header">
              <h3 className="fin-table-title">
                <Users size={18} color="var(--accent)" />
                <span>Directorio de Clientes ({totalCount})</span>
              </h3>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {filterMode !== "all" && (
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    onClick={() => setFilterMode("all")}
                  >
                    Limpiar filtro
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="fin-empty">
                <RefreshCw size={24} className="spin" />
                <h3 className="fin-empty__title">Cargando directorio de clientes</h3>
              </div>
            ) : error ? (
              <div className="fin-alert fin-alert--danger" style={{ margin: "1rem" }}>{error}</div>
            ) : items.length === 0 ? (
              <div className="fin-empty">
                <Users size={32} />
                <h3 className="fin-empty__title">No se encontraron clientes</h3>
                <p className="fin-empty__desc">Prueba cambiando los términos de búsqueda o filtros.</p>
              </div>
            ) : (
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Contacto / Cédula</th>
                      <th style={{ textAlign: "right" }}>Facturación</th>
                      <th style={{ textAlign: "right" }}>Abonos</th>
                      <th style={{ textAlign: "right" }}>Deuda Actual</th>
                      <th style={{ textAlign: "right" }}>Saldo a Favor</th>
                      {isAllWarehouses && <th>Sedes con Actividad</th>}
                      <th style={{ textAlign: "right" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            <strong
                              style={{ color: "#0f172a", cursor: "pointer", textDecoration: "underline" }}
                              onClick={() => setSelectedCustomerId(c.id)}
                            >
                              {c.displayName}
                            </strong>
                            {c.creditBalance > 0 && (
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  background: "rgba(16, 185, 129, 0.15)",
                                  color: "#059669",
                                  border: "1px solid rgba(16, 185, 129, 0.35)",
                                }}
                              >
                                💰 {formatMoney(c.creditBalance)}
                              </span>
                            )}
                            {c.totalDebt > 0 && (
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  background: "rgba(225, 29, 72, 0.12)",
                                  color: "#e11d48",
                                  border: "1px solid rgba(225, 29, 72, 0.3)",
                                }}
                              >
                                Debe {formatMoney(c.totalDebt)}
                              </span>
                            )}
                          </div>
                          {c.address && (
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              {c.address}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: "0.85rem", color: "#0f172a" }}>
                            {c.taxId ? `CC/NIT: ${c.taxId}` : "—"}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                            {c.phone ? `Tel: ${c.phone}` : "—"}
                          </div>
                        </td>
                        <td className="fin-table-num">
                          <strong>{formatMoney(c.totalBilled)}</strong>
                          <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                            {c.invoicesCount} factura(s)
                          </div>
                        </td>
                        <td className="fin-table-num" style={{ color: "#059669" }}>
                          <strong>{formatMoney(c.totalAbonos)}</strong>
                          <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                            {c.paymentsCount} abono(s)
                          </div>
                        </td>
                        <td className="fin-table-num">
                          <strong
                            style={{
                              color: c.totalDebt > 0 ? "#e11d48" : "#64748b",
                              fontSize: c.totalDebt > 0 ? "1rem" : "0.9rem",
                            }}
                          >
                            {formatMoney(c.totalDebt)}
                          </strong>
                          {c.activeCreditsCount > 0 && (
                            <div style={{ fontSize: "0.74rem", color: "#e11d48" }}>
                              {c.activeCreditsCount} crédito(s) activo(s)
                            </div>
                          )}
                        </td>
                        <td className="fin-table-num">
                          <strong
                            style={{
                              color: c.creditBalance > 0 ? "#059669" : "#64748b",
                              fontSize: c.creditBalance > 0 ? "1rem" : "0.9rem",
                            }}
                          >
                            {formatMoney(c.creditBalance)}
                          </strong>
                          {c.creditBalance > 0 && (
                            <div style={{ fontSize: "0.72rem", color: "#059669" }}>
                              A favor disponible
                            </div>
                          )}
                        </td>
                        {isAllWarehouses && (
                          <td>
                            <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", maxWidth: 180 }}>
                              {c.warehouses && c.warehouses.length > 0 ? (
                                c.warehouses.map((w) => (
                                  <span
                                    key={w.warehouseId}
                                    className="fin-badge fin-badge--neutral"
                                    style={{ fontSize: "0.7rem", padding: "1px 5px" }}
                                    title={`${w.warehouseName}: Facturado ${formatMoney(w.totalBilled)}, Deuda ${formatMoney(w.totalDebt)}`}
                                  >
                                    {w.warehouseCode}
                                  </span>
                                ))
                              ) : (
                                <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>—</span>
                              )}
                            </div>
                          </td>
                        )}
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                            <button
                              type="button"
                              className="fin-btn fin-btn--ghost fin-btn--sm"
                              onClick={() => startEditingCustomerFromItem(c)}
                              title="Editar datos personales del cliente"
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            >
                              <Edit2 size={13} />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              className="fin-btn fin-btn--primary fin-btn--sm"
                              onClick={() => setSelectedCustomerId(c.id)}
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                            >
                              <Eye size={14} />
                              <span>Ver Ficha</span>
                            </button>
                            {isAllWarehouses && (
                              <button
                                type="button"
                                className="fin-btn fin-btn--ghost fin-btn--sm"
                                onClick={() => void handleDeleteCustomer(c)}
                                title="Eliminar cliente (solo Sede Administrativa)"
                                style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "#dc2626" }}
                              >
                                <Trash2 size={13} />
                                <span>Eliminar</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ────────────────── VISTA 2: DETALLE COMPLETO DEL CLIENTE ────────────────── */}
      {selectedCustomerId && (
        <div>
          {profileLoading ? (
            <div className="fin-empty">
              <RefreshCw size={28} className="spin" />
              <h3 className="fin-empty__title">Cargando ficha completa del cliente</h3>
            </div>
          ) : profileError ? (
            <div className="fin-alert fin-alert--danger">{profileError}</div>
          ) : customerProfile ? (
            <>
              {/* Tarjeta de Datos del Cliente */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--border-color)",
                  borderRadius: 12,
                  padding: "1.25rem",
                  marginBottom: "1.25rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                  boxShadow: "var(--fin-shadow-sm)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, fontSize: "1.4rem", color: "#0f172a" }}>
                      {customerProfile.customer.displayName}
                    </h2>
                    {currentDisplayCreditBalance > 0 && (
                      <span
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          color: "#166534",
                          border: "1px solid #bbf7d0",
                        }}
                      >
                        💰 Saldo a Favor: {formatMoney(currentDisplayCreditBalance)}
                      </span>
                    )}
                    {currentDisplayDebt > 0 && (
                      <span
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "#fee2e2",
                          color: "#991b1b",
                          border: "1px solid #fecaca",
                        }}
                      >
                        ⚠️ Deuda: {formatMoney(currentDisplayDebt)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.5rem", flexWrap: "wrap", fontSize: "0.88rem", color: "#64748b" }}>
                    <span>Cédula/NIT: <strong style={{ color: "#0f172a" }}>{customerProfile.customer.taxId || "—"}</strong></span>
                    <span>Teléfono: <strong style={{ color: "#0f172a" }}>{customerProfile.customer.phone || "—"}</strong></span>
                    <span>Dirección: <strong style={{ color: "#0f172a" }}>{customerProfile.customer.address || "—"}</strong></span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="fin-btn fin-btn--emerald fin-btn--sm"
                    onClick={() => setOpenDirectPayment(true)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <Wallet size={14} />
                    <span>+ Abonar sin Factura</span>
                  </button>
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    onClick={startEditingCustomer}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <Edit2 size={14} />
                    <span>Editar Datos</span>
                  </button>
                  {isAllWarehouses && (
                    <button
                      type="button"
                      className="fin-btn fin-btn--ghost fin-btn--sm"
                      onClick={() => {
                        if (customerProfile) {
                          void handleDeleteCustomer({
                            id: customerProfile.customer.id,
                            displayName: customerProfile.customer.displayName,
                          });
                        }
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#dc2626" }}
                      title="Eliminar cliente (solo Sede Administrativa)"
                    >
                      <Trash2 size={14} />
                      <span>Eliminar Cliente</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Banner de Sede Activa */}
              {detailSedeFilter ? (
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: "rgba(99, 102, 241, 0.08)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    marginBottom: "1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.88rem",
                    color: "#3730a3",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Building2 size={16} />
                    <span>
                      Mostrando datos y saldos exclusivos de:{" "}
                      <strong>{warehouses.find((w) => w.id === detailSedeFilter)?.name ?? "Sede seleccionada"}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="fin-btn fin-btn--ghost fin-btn--sm"
                    onClick={() => setDetailSedeFilter("")}
                  >
                    Ver consolidado de todas las sedes
                  </button>
                </div>
              ) : !isAllWarehouses ? (
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    marginBottom: "1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "0.88rem",
                    color: "#166534",
                  }}
                >
                  <Building2 size={16} />
                  <span>
                    Sede actual: <strong>{warehouses.find((w) => w.id === warehouseId)?.name ?? "Esta sede"}</strong>. Los saldos, facturas y abonos corresponden únicamente a esta sede.
                  </span>
                </div>
              ) : null}

              {/* Tarjetas KPI del Cliente */}
              <div className="fin-kpi-grid fin-kpi-grid--4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                <div
                  className="fin-kpi-card fin-kpi-card--emerald"
                  style={{ background: "linear-gradient(145deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.02))" }}
                >
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#059669" }}>
                      {detailSedeFilter || !isAllWarehouses ? "Saldo a Favor (Esta Sede)" : "Saldo a Favor Global"}
                    </span>
                    <div className="fin-kpi-icon fin-kpi-icon--emerald">
                      <Wallet size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--emerald">
                    {formatMoney(currentDisplayCreditBalance)}
                  </div>
                  <div className="fin-kpi-sub">
                    Disponible para aplicar en esta sede
                  </div>
                </div>

                <div
                  className="fin-kpi-card fin-kpi-card--rose"
                  style={{ background: "linear-gradient(145deg, rgba(225, 29, 72, 0.1), rgba(225, 29, 72, 0.02))" }}
                >
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label" style={{ color: "#e11d48" }}>
                      {detailSedeFilter || !isAllWarehouses ? "Deuda (Esta Sede)" : "Deuda Total"}
                    </span>
                    <div className="fin-kpi-icon fin-kpi-icon--rose">
                      <Clock size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--rose">
                    {formatMoney(currentDisplayDebt)}
                  </div>
                  <div className="fin-kpi-sub">
                    Saldo pendiente en facturas a crédito
                  </div>
                </div>

                <div className="fin-kpi-card fin-kpi-card--indigo">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">
                      {detailSedeFilter || !isAllWarehouses ? "Facturado (Esta Sede)" : "Total Facturado"}
                    </span>
                    <div className="fin-kpi-icon fin-kpi-icon--indigo">
                      <Receipt size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--indigo">
                    {formatMoney(currentDisplayBilled)}
                  </div>
                  <div className="fin-kpi-sub">
                    {filteredInvoices.length} facturas generadas
                  </div>
                </div>

                <div className="fin-kpi-card fin-kpi-card--teal">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">
                      {detailSedeFilter || !isAllWarehouses ? "Abonos (Esta Sede)" : "Total Recaudado"}
                    </span>
                    <div className="fin-kpi-icon fin-kpi-icon--teal">
                      <ArrowDownLeft size={18} />
                    </div>
                  </div>
                  <div className="fin-kpi-val fin-kpi-val--teal">
                    {formatMoney(currentDisplayAbonos)}
                  </div>
                  <div className="fin-kpi-sub">
                    {filteredPayments.length} abonos registrados
                  </div>
                </div>
              </div>

              {/* ────────────────── RESUMEN HISTORIAL EN TODAS LAS SEDES (ADMIN) ────────────────── */}
              {isAllWarehouses && customerProfile.warehouseBreakdown && customerProfile.warehouseBreakdown.length > 0 && (
                <div className="fin-table-card" style={{ marginBottom: "1.25rem" }}>
                  <div className="fin-table-header" style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <div>
                      <h3 className="fin-table-title" style={{ margin: 0 }}>
                        <Building2 size={18} color="var(--accent)" />
                        <span>Resumen del Historial en Todas las Sedes</span>
                      </h3>
                      <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Desglose de compras, cartera y abonos del cliente por cada punto de venta de la empresa.
                      </p>
                    </div>

                    {detailSedeFilter && (
                      <button
                        type="button"
                        className="fin-btn fin-btn--ghost fin-btn--sm"
                        onClick={() => setDetailSedeFilter("")}
                      >
                        Ver todas las sedes
                      </button>
                    )}
                  </div>

                  <div className="fin-table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Sede</th>
                          <th style={{ textAlign: "right" }}>Facturas Generadas</th>
                          <th style={{ textAlign: "right" }}>Total Facturado</th>
                          <th style={{ textAlign: "center" }}>Créditos Activos</th>
                          <th style={{ textAlign: "right" }}>Deuda en Sede</th>
                          <th style={{ textAlign: "right" }}>Abonos en Sede</th>
                          <th style={{ textAlign: "right" }}>Saldo a Favor Sede</th>
                          <th style={{ textAlign: "center" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerProfile.warehouseBreakdown.map((w) => (
                          <tr
                            key={w.warehouseId}
                            style={{
                              background: detailSedeFilter === w.warehouseId ? "rgba(99, 102, 241, 0.08)" : undefined,
                            }}
                          >
                            <td>
                              <strong>{w.warehouseName}</strong> ({w.warehouseCode})
                            </td>
                            <td className="fin-table-num">
                              {w.invoicesCount} facturas
                            </td>
                            <td className="fin-table-num" style={{ fontWeight: 600 }}>
                              {formatMoney(w.totalBilled)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className="fin-badge fin-badge--neutral">
                                {w.activeCreditsCount}
                              </span>
                            </td>
                            <td className="fin-table-num">
                              <strong style={{ color: w.currentDebt > 0 ? "#e11d48" : "#059669" }}>
                                {formatMoney(w.currentDebt)}
                              </strong>
                            </td>
                            <td className="fin-table-num" style={{ color: "#059669", fontWeight: 600 }}>
                              {formatMoney(w.totalAbonos)} ({w.paymentsCount} abonos)
                            </td>
                            <td className="fin-table-num">
                              {w.creditBalance > 0 ? (
                                <strong style={{ color: "#059669" }}>
                                  💰 {formatMoney(w.creditBalance)}
                                </strong>
                              ) : (
                                <span style={{ color: "#94a3b8" }}>$ 0</span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className={`fin-btn fin-btn--sm ${
                                  detailSedeFilter === w.warehouseId ? "fin-btn--primary" : "fin-btn--ghost"
                                }`}
                                onClick={() =>
                                  setDetailSedeFilter(detailSedeFilter === w.warehouseId ? "" : w.warehouseId)
                                }
                              >
                                {detailSedeFilter === w.warehouseId ? "Filtrando" : "Filtrar"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ────────────────── PESTAÑAS DE DETALLE ────────────────── */}
              <div className="fin-tabs" style={{ marginBottom: "1rem" }}>
                <button
                  type="button"
                  className={`fin-tab ${detailTab === "invoices" ? "is-active" : ""}`}
                  onClick={() => setDetailTab("invoices")}
                >
                  <Receipt size={16} />
                  <span>Facturas Generadas ({filteredInvoices.length})</span>
                </button>

                <button
                  type="button"
                  className={`fin-tab ${detailTab === "payments" ? "is-active" : ""}`}
                  onClick={() => setDetailTab("payments")}
                >
                  <ArrowDownLeft size={16} />
                  <span>Abonos Recibidos ({filteredPayments.length})</span>
                </button>

                <button
                  type="button"
                  className={`fin-tab ${detailTab === "favour_movements" ? "is-active" : ""}`}
                  onClick={() => setDetailTab("favour_movements")}
                >
                  <Wallet size={16} />
                  <span>Movimientos de Saldo a Favor ({filteredMovements.length})</span>
                </button>
              </div>

              {/* ── TAB DETALLE 1: FACTURAS GENERADAS ── */}
              {detailTab === "invoices" && (
                <div className="fin-table-card">
                  <div className="fin-table-header">
                    <div>
                      <h3 className="fin-table-title" style={{ margin: 0 }}>
                        <Receipt size={18} color="var(--accent)" />
                        <span>Facturas y Documentos de Venta</span>
                      </h3>
                      {detailSedeFilter && (
                        <span style={{ fontSize: "0.8rem", color: "#6366f1", fontWeight: 600 }}>
                          Filtrado por sede: {warehouses.find((w) => w.id === detailSedeFilter)?.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {filteredInvoices.length === 0 ? (
                    <div className="fin-empty" style={{ padding: "2.5rem" }}>
                      <p className="fin-empty__desc">No hay facturas registradas para este cliente en el filtro actual.</p>
                    </div>
                  ) : (
                    <div className="fin-table-wrap">
                      <table className="fin-table">
                        <thead>
                          <tr>
                            <th>Factura / Fecha</th>
                            <th>Sede</th>
                            <th>Modalidad</th>
                            <th>Productos / Detalle</th>
                            <th style={{ textAlign: "right" }}>Total Neto</th>
                            <th style={{ textAlign: "right" }}>Pagado</th>
                            <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                            <th style={{ textAlign: "center" }}>Estado</th>
                            <th style={{ textAlign: "right" }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInvoices.map((inv) => (
                            <tr key={inv.documentId || inv.receivableId || inv.invoiceNumber}>
                              <td>
                                <strong style={{ color: "#0f172a" }}>{inv.invoiceNumber}</strong>
                                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                  {formatDateTime(inv.createdAt)}
                                </div>
                              </td>
                              <td>
                                <span className="fin-badge fin-badge--neutral">
                                  {inv.warehouseCode}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`fin-badge ${
                                    inv.exitKind === "credit"
                                      ? "fin-badge--warning"
                                      : inv.exitKind === "sale"
                                      ? "fin-badge--success"
                                      : "fin-badge--neutral"
                                  }`}
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {inv.exitKind === "credit"
                                    ? "Crédito"
                                    : inv.exitKind === "sale"
                                    ? "Contado"
                                    : inv.exitKind}
                                </span>
                              </td>
                              <td style={{ maxWidth: 280 }}>
                                <div style={{ fontSize: "0.84rem", color: "#0f172a", whiteSpace: "normal" }}>
                                  {inv.itemsSummary || "—"}
                                </div>
                                <div style={{ display: "flex", gap: "0.4rem", marginTop: "3px", flexWrap: "wrap" }}>
                                  {inv.creditBalanceUsed > 0 && (
                                    <span
                                      style={{
                                        fontSize: "0.72rem",
                                        fontWeight: 700,
                                        padding: "1px 6px",
                                        borderRadius: 999,
                                        background: "rgba(16, 185, 129, 0.15)",
                                        color: "#059669",
                                      }}
                                    >
                                      Usó {formatMoney(inv.creditBalanceUsed)} saldo a favor
                                    </span>
                                  )}
                                  {inv.excessToFavour > 0 && (
                                    <span
                                      style={{
                                        fontSize: "0.72rem",
                                        fontWeight: 700,
                                        padding: "1px 6px",
                                        borderRadius: 999,
                                        background: "rgba(16, 185, 129, 0.15)",
                                        color: "#059669",
                                      }}
                                    >
                                      +{formatMoney(inv.excessToFavour)} a favor
                                    </span>
                                  )}
                                  {inv.discountAmount > 0 && (
                                    <span style={{ fontSize: "0.72rem", color: "#dc2626" }}>
                                      Desc: -{formatMoney(inv.discountAmount)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="fin-table-num">
                                <strong>{formatMoney(inv.totalAmount)}</strong>
                              </td>
                              <td className="fin-table-num" style={{ color: "#059669" }}>
                                {formatMoney(inv.paidAmount)}
                              </td>
                              <td className="fin-table-num">
                                <strong
                                  style={{
                                    color: inv.balanceAmount > 0 ? "#e11d48" : "#059669",
                                  }}
                                >
                                  {formatMoney(inv.balanceAmount)}
                                </strong>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span
                                  className={`fin-badge ${
                                    inv.status === "cancelled"
                                      ? "fin-badge--danger"
                                      : inv.balanceAmount > 0
                                      ? "fin-badge--warning"
                                      : "fin-badge--success"
                                  }`}
                                >
                                  {inv.status === "cancelled"
                                    ? "Anulada"
                                    : inv.balanceAmount > 0
                                    ? "Pendiente"
                                    : "Pagada"}
                                </span>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.35rem" }}>
                                  {inv.documentId && (
                                    <button
                                      type="button"
                                      className="fin-btn fin-btn--ghost fin-btn--sm"
                                      onClick={() => handleOpenDocumentPrint(inv.documentId!, inv.warehouseId)}
                                      title="Imprimir o ver factura"
                                      disabled={loadingDocToPrint}
                                    >
                                      <Printer size={14} />
                                      <span>Imprimir</span>
                                    </button>
                                  )}

                                  {inv.balanceAmount > 0 && inv.receivableId && (
                                    <button
                                      type="button"
                                      className="fin-btn fin-btn--primary fin-btn--sm"
                                      onClick={() => {
                                        setActiveReceivableForPayment({
                                          id: inv.receivableId,
                                          invoiceNumber: inv.invoiceNumber,
                                          warehouseId: inv.warehouseId,
                                          warehouseCode: inv.warehouseCode,
                                          warehouseName: inv.warehouseName,
                                          customerId: customerProfile.customer.id,
                                          customerName: customerProfile.customer.displayName,
                                          customerTaxId: customerProfile.customer.taxId,
                                          customerPhone: customerProfile.customer.phone,
                                          customerCreditBalance: customerProfile.customer.creditBalance,
                                          totalAmount: inv.totalAmount,
                                          initialPayment: 0,
                                          paidAmount: inv.paidAmount,
                                          balanceAmount: inv.balanceAmount,
                                          status: "partial",
                                          dueDate: null,
                                          notes: null,
                                          createdAt: inv.createdAt,
                                          paidAt: null,
                                          createdByName: null,
                                        });
                                      }}
                                    >
                                      Abonar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB DETALLE 2: ABONOS RECIBIDOS DE LAS SEDES ── */}
              {detailTab === "payments" && (
                <div className="fin-table-card">
                  <div className="fin-table-header">
                    <div>
                      <h3 className="fin-table-title" style={{ margin: 0 }}>
                        <ArrowDownLeft size={18} color="var(--accent)" />
                        <span>Abonos Recibidos en las Sedes</span>
                      </h3>
                      {detailSedeFilter && (
                        <span style={{ fontSize: "0.8rem", color: "#6366f1", fontWeight: 600 }}>
                          Filtrado por sede: {warehouses.find((w) => w.id === detailSedeFilter)?.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {filteredPayments.length === 0 ? (
                    <div className="fin-empty" style={{ padding: "2.5rem" }}>
                      <p className="fin-empty__desc">No hay abonos registrados para este cliente en el filtro actual.</p>
                    </div>
                  ) : (
                    <div className="fin-table-wrap">
                      <table className="fin-table">
                        <thead>
                          <tr>
                            <th>Recibo de Caja</th>
                            <th>Factura</th>
                            <th>Sede</th>
                            <th>Fecha</th>
                            <th>Medio de Pago</th>
                            <th style={{ textAlign: "right" }}>Monto Recibido</th>
                            <th style={{ textAlign: "right" }}>Amortizado a Deuda</th>
                            <th style={{ textAlign: "right" }}>Excedente a Favor</th>
                            <th>Comprobante</th>
                            <th>Atendido por</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPayments.map((p) => {
                            const urls = (p.receiptUrls && p.receiptUrls.length > 0)
                              ? p.receiptUrls
                              : (p.receiptUrl ? [p.receiptUrl] : []);
                            return (
                              <tr key={p.id}>
                                <td>
                                  <strong style={{ color: "#0f172a" }}>{p.receiptNumber}</strong>
                                </td>
                                <td>
                                  <strong>{p.invoiceNumber || "—"}</strong>
                                </td>
                                <td>
                                  <span className="fin-badge fin-badge--neutral">
                                    {p.warehouseCode}
                                  </span>
                                </td>
                                <td style={{ color: "#64748b" }}>
                                  {formatDateTime(p.createdAt)}
                                </td>
                                <td>
                                  <span className="fin-badge fin-badge--neutral" style={{ textTransform: "capitalize" }}>
                                    {p.paymentMethod}
                                  </span>
                                </td>
                                <td className="fin-table-num" style={{ color: "#059669", fontWeight: 700 }}>
                                  {formatMoney(p.amount)}
                                </td>
                                <td className="fin-table-num">
                                  {formatMoney(p.appliedToDebt)}
                                </td>
                                <td className="fin-table-num">
                                  {p.excessToFavour > 0 ? (
                                    <span
                                      style={{
                                        color: "#059669",
                                        fontWeight: 700,
                                        padding: "2px 7px",
                                        borderRadius: 999,
                                        background: "rgba(16, 185, 129, 0.15)",
                                        border: "1px solid rgba(16, 185, 129, 0.35)",
                                      }}
                                    >
                                      +{formatMoney(p.excessToFavour)}
                                    </span>
                                  ) : (
                                    <span style={{ color: "#94a3b8" }}>$ 0</span>
                                  )}
                                </td>
                                <td>
                                  {urls.length > 0 ? (
                                    <div style={{ display: "flex", gap: "4px" }}>
                                      {urls.map((u, i) => (
                                        <img
                                          key={i}
                                          src={u}
                                          alt="Comprobante"
                                          style={{
                                            width: 32,
                                            height: 32,
                                            objectFit: "cover",
                                            borderRadius: 4,
                                            cursor: "pointer",
                                            border: "1px solid var(--border-color)",
                                          }}
                                          onClick={() => setPreviewPhotoUrl(u)}
                                          title="Click para ampliar comprobante"
                                        />
                                      ))}
                                    </div>
                                  ) : (
                                    <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Sin foto</span>
                                  )}
                                </td>
                                <td style={{ fontSize: "0.78rem", color: "#64748b" }}>
                                  {p.createdByName || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB DETALLE 3: MOVIMIENTOS DE SALDO A FAVOR ── */}
              {detailTab === "favour_movements" && (
                <div className="fin-table-card">
                  <div className="fin-table-header">
                    <div>
                      <h3 className="fin-table-title" style={{ margin: 0 }}>
                        <Wallet size={18} color="var(--accent)" />
                        <span>Libro Mayor de Saldo a Favor del Cliente</span>
                      </h3>
                      <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Trazabilidad exacta de cada centavo que el cliente abonó de más o utilizó en sus compras.
                      </p>
                    </div>
                    <div
                      style={{
                        padding: "4px 12px",
                        borderRadius: 999,
                        background: "#dcfce7",
                        color: "#166534",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        border: "1px solid #bbf7d0",
                      }}
                    >
                      Saldo Disponible Hoy: {formatMoney(customerProfile.customer.creditBalance)}
                    </div>
                  </div>

                  {filteredMovements.length === 0 ? (
                    <div className="fin-empty" style={{ padding: "2.5rem" }}>
                      <p className="fin-empty__desc">No hay movimientos de saldo a favor registrados para este cliente.</p>
                    </div>
                  ) : (
                    <div className="fin-table-wrap">
                      <table className="fin-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Tipo de Movimiento</th>
                            <th>Sede</th>
                            <th>Referencia</th>
                            <th>Detalle / Concepto</th>
                            <th style={{ textAlign: "right" }}>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMovements.map((m) => (
                            <tr key={m.id}>
                              <td style={{ color: "#64748b" }}>
                                {formatDateTime(m.createdAt)}
                              </td>
                              <td>
                                <span
                                  className={`fin-badge ${
                                    m.amount > 0 ? "fin-badge--success" : "fin-badge--warning"
                                  }`}
                                >
                                  {m.type === "generated_overpayment"
                                    ? "💰 Excedente Generado (A favor)"
                                    : "🏷️ Saldo Usado en Compra/Abono"}
                                </span>
                              </td>
                              <td>
                                <span className="fin-badge fin-badge--neutral">
                                  {m.warehouseCode}
                                </span>
                              </td>
                              <td>
                                <strong>{m.referenceNumber}</strong>
                              </td>
                              <td style={{ color: "#0f172a" }}>
                                {m.description}
                              </td>
                              <td
                                className="fin-table-num"
                                style={{
                                  fontWeight: 800,
                                  color: m.amount > 0 ? "#059669" : "#e11d48",
                                  fontSize: "0.95rem",
                                }}
                              >
                                {m.amount > 0 ? `+${formatMoney(m.amount)}` : formatMoney(m.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ────────────────── MODALES AUXILIARES ────────────────── */}

      {/* Modal Registrar Nuevo Cliente Express */}
      {openCreateCustomer && (
        <div className="inv-modal-backdrop" role="presentation" onClick={() => !savingCustomer && setOpenCreateCustomer(false)}>
          <div className="inv-modal" role="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <PlusCircle size={20} className="text-primary" />
                Registrar Nuevo Cliente
              </h2>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                onClick={() => setOpenCreateCustomer(false)}
                disabled={savingCustomer}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewCustomer} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label className="field">
                <span>Nombre Completo *</span>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Juan Manuel Pérez"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Cédula / NIT</span>
                <input
                  type="text"
                  placeholder="Ej. 1020304050"
                  value={newCustTaxId}
                  onChange={(e) => setNewCustTaxId(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Teléfono de Contacto</span>
                <input
                  type="text"
                  placeholder="Ej. 3101234567"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Dirección de Residencia</span>
                <input
                  type="text"
                  placeholder="Ej. Calle 45 # 12-34"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="inv-btn inv-btn--ghost"
                  onClick={() => setOpenCreateCustomer(false)}
                  disabled={savingCustomer}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inv-btn inv-btn--primary"
                  disabled={savingCustomer || !newCustName.trim()}
                >
                  {savingCustomer ? "Guardando…" : "Registrar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Cliente */}
      {openEditCustomer && (
        <div className="inv-modal-backdrop" role="presentation" onClick={() => !savingEditCustomer && setOpenEditCustomer(false)}>
          <div className="inv-modal" role="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Edit2 size={20} className="text-primary" />
                Editar Datos del Cliente
              </h2>
              <button
                type="button"
                className="inv-btn inv-btn--ghost"
                onClick={() => setOpenEditCustomer(false)}
                disabled={savingEditCustomer}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditCustomer} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <label className="field">
                <span>Nombre Completo *</span>
                <input
                  type="text"
                  required
                  value={editCustName}
                  onChange={(e) => setEditCustName(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Cédula / NIT</span>
                <input
                  type="text"
                  value={editCustTaxId}
                  onChange={(e) => setEditCustTaxId(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Teléfono de Contacto</span>
                <input
                  type="text"
                  value={editCustPhone}
                  onChange={(e) => setEditCustPhone(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Dirección</span>
                <input
                  type="text"
                  value={editCustAddress}
                  onChange={(e) => setEditCustAddress(e.target.value)}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="inv-btn inv-btn--ghost"
                  onClick={() => setOpenEditCustomer(false)}
                  disabled={savingEditCustomer}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inv-btn inv-btn--primary"
                  disabled={savingEditCustomer || !editCustName.trim()}
                >
                  {savingEditCustomer ? "Guardando…" : "Actualizar Datos"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Imprimir / Ver Comprobante */}
      {selectedDocToPrint && (
        <DocumentInvoicePrint
          document={selectedDocToPrint}
          onClose={() => setSelectedDocToPrint(null)}
        />
      )}

      {/* Modal para Registrar Abono */}
      {activeReceivableForPayment && (
        <AddPaymentModal
          open={Boolean(activeReceivableForPayment)}
          receivable={activeReceivableForPayment}
          customerCreditBalance={activeReceivableForPayment.customerCreditBalance}
          onClose={() => setActiveReceivableForPayment(null)}
          onSuccess={() => {
            if (selectedCustomerId) void loadProfile(selectedCustomerId);
            void loadDirectory();
          }}
        />
      )}

      {/* Modal para Foto Ampliada */}
      {previewPhotoUrl && (
        <div
          className="inv-modal-backdrop"
          role="presentation"
          onClick={() => setPreviewPhotoUrl(null)}
          style={{ zIndex: 9999 }}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "90vh",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewPhotoUrl}
              alt="Comprobante ampliado"
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                borderRadius: 8,
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
              }}
            />
            <button
              type="button"
              onClick={() => setPreviewPhotoUrl(null)}
              style={{
                position: "absolute",
                top: -12,
                right: -12,
                background: "#0f172a",
                color: "#ffffff",
                border: "2px solid #ffffff",
                borderRadius: "50%",
                width: 32,
                height: 32,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Modal para abono directo sin factura / saldo a favor */}
      {openDirectPayment && (
        <AddDirectPaymentModal
          open={openDirectPayment}
          onClose={() => setOpenDirectPayment(false)}
          defaultWarehouseId={effectiveWarehouseId || undefined}
          defaultCustomerId={customerProfile?.customer.id || undefined}
          defaultCustomerName={customerProfile?.customer.displayName || undefined}
          onSuccess={() => {
            if (selectedCustomerId) void loadProfile(selectedCustomerId);
            void loadDirectory();
          }}
        />
      )}
    </div>
  );
}
