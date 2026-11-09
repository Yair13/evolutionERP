import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Package, Printer, Receipt, RefreshCw, Search, X } from "lucide-react";
import { fetchCatalog } from "../../api/inventory.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import type { CatalogItem } from "../../features/inventory/inventory.types.js";
import { formatBogotaDateTime } from "../../lib/dateUtils.js";

const LOGO_SRC = "/logo-evolution.png?v=4";

type Props = {
  warehouseId?: string | null;
  onClose: () => void;
};

type StockFilter = "in_stock" | "all" | "zero";

export function RealInventoryModal({ warehouseId: initialWarehouseId, onClose }: Props) {
  const { token, user } = useAuth();
  const { warehouses, warehouseId: contextWarehouseId, canViewAllWarehouses } = useWarehouse();

  const [portalReady, setPortalReady] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    initialWarehouseId || contextWarehouseId || warehouses[0]?.id || ""
  );
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("in_stock");
  const [format, setFormat] = useState<"half_letter" | "voucher">("half_letter");
  const [generatedAt, setGeneratedAt] = useState<string>(() => new Date().toISOString());

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    function clearPrintClass() {
      document.body.classList.remove("inv-print-count-half-letter", "inv-print-count-voucher");
      document.getElementById("inv-print-count-page-size")?.remove();
    }
    window.addEventListener("afterprint", clearPrintClass);
    return () => {
      window.removeEventListener("afterprint", clearPrintClass);
      clearPrintClass();
    };
  }, []);

  const loadRealInventory = useCallback(async () => {
    if (!token || !selectedWarehouseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCatalog(token, selectedWarehouseId, { limit: 2000 });
      setItems(res.items || []);
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar el inventario real");
    } finally {
      setLoading(false);
    }
  }, [token, selectedWarehouseId]);

  useEffect(() => {
    void loadRealInventory();
  }, [loadRealInventory]);

  const currentWarehouse = useMemo(
    () => warehouses.find((w) => w.id === selectedWarehouseId) ?? null,
    [warehouses, selectedWarehouseId]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const qty = Number(item.quantityOnHand) || 0;
      if (stockFilter === "in_stock" && qty <= 0) return false;
      if (stockFilter === "zero" && qty > 0) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.referenceCode.toLowerCase().includes(q) ||
        (item.barcode ?? "").toLowerCase().includes(q) ||
        (item.categoryName ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, stockFilter]);

  const summary = useMemo(() => {
    let inStockRefs = 0;
    let zeroRefs = 0;
    let totalUnits = 0;
    for (const item of items) {
      const qty = Number(item.quantityOnHand) || 0;
      if (qty > 0) {
        inStockRefs += 1;
        totalUnits += qty;
      } else {
        zeroRefs += 1;
      }
    }
    return {
      totalRefs: items.length,
      inStockRefs,
      zeroRefs,
      totalUnits,
    };
  }, [items]);

  function handlePrint() {
    let pageStyle = document.getElementById("inv-print-count-page-size");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "inv-print-count-page-size";
      document.head.appendChild(pageStyle);
    }

    if (format === "voucher") {
      document.body.classList.remove("inv-print-count-half-letter");
      document.body.classList.add("inv-print-count-voucher");
      pageStyle.textContent = "@page { size: auto; margin: 0mm; }";
    } else {
      document.body.classList.remove("inv-print-count-voucher");
      document.body.classList.add("inv-print-count-half-letter");
      pageStyle.textContent = "@page { size: letter portrait; margin: 0.25in; }";
    }

    window.setTimeout(() => window.print(), 80);
  }

  // ─── RENDER BAUCHER / TIRILLA (POS 80mm) ──────────────────────────────────
  const renderVoucherContent = () => (
    <div
      className="count-voucher-body"
      style={{
        width: "72mm",
        maxWidth: "72mm",
        margin: "0 auto",
        padding: "3mm 2.5mm",
        background: "#ffffff",
        color: "#000000",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: "10px",
        lineHeight: 1.25,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", borderBottom: "1.5px dashed #000000", paddingBottom: "4px", marginBottom: "5px" }}>
        <div style={{ fontSize: "13px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          EVOLUTION ERP
        </div>
        <div style={{ fontSize: "9px", fontWeight: 700, marginTop: "2px" }}>
          Sede: {currentWarehouse?.name ?? "Sede Operativa"} {currentWarehouse?.code ? `(${currentWarehouse.code})` : ""}
        </div>
        <div style={{ fontSize: "10.5px", fontWeight: 800, marginTop: "3px", textTransform: "uppercase" }}>
          REPORTE DE INVENTARIO REAL
        </div>
        <div style={{ fontSize: "9px", color: "#333333", marginTop: "2px" }}>
          {formatBogotaDateTime(generatedAt)}
        </div>
        {user?.fullName && (
          <div style={{ fontSize: "9px", color: "#333333", marginTop: "1px" }}>
            Consultado por: {user.fullName}
          </div>
        )}
      </div>

      <div style={{ borderBottom: "1px dashed #000000", paddingBottom: "5px", marginBottom: "5px", fontSize: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span>Ref. con Existencia:</span>
          <strong>{summary.inStockRefs} ref.</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: "11px" }}>
          <span>Total Unidades Reales:</span>
          <strong>{summary.totalUnits} uds</strong>
        </div>
      </div>

      <div style={{ marginBottom: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #000000", paddingBottom: "2px", fontWeight: 700, fontSize: "9px" }}>
          <span>REF / PRODUCTO</span>
          <span>EXISTENCIA</span>
        </div>
        {filteredItems.length === 0 ? (
          <div style={{ padding: "8px 4px", textAlign: "center", fontSize: "9px" }}>
            No hay productos para el filtro seleccionado.
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              style={{
                borderBottom: "0.5px dotted #cccccc",
                padding: "3px 0",
                fontSize: "9px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "6px",
              }}
            >
              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                <strong>{item.referenceCode}</strong> - {item.name}
              </div>
              <strong style={{ whiteSpace: "nowrap", fontSize: "10px" }}>
                {item.quantityOnHand} uds
              </strong>
            </div>
          ))
        )}
      </div>

      <div style={{ borderTop: "1px dashed #000000", paddingTop: "12px", marginTop: "8px", textAlign: "center" }}>
        <div style={{ fontSize: "7.5px", color: "#555" }}>
          Evolution ERP · Consulta Oficial de Inventario Real
        </div>
      </div>
    </div>
  );

  // ─── RENDER MEDIA CARTA / HOJA ────────────────────────────────────────────
  const renderHalfLetterContent = () => (
    <article
      className="count-half-letter-body"
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "16px 20px",
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: "12px",
        lineHeight: 1.35,
        boxSizing: "border-box",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "2px solid #0f766e",
          paddingBottom: "10px",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={LOGO_SRC} alt="Evolution ERP" style={{ height: "42px", objectFit: "contain" }} />
          <div>
            <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f766e", textTransform: "uppercase" }}>
              Evolution ERP
            </h1>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
              REPORTE DE INVENTARIO REAL ACTUAL EN SEDE
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a" }}>
            Sede: {currentWarehouse?.name ?? "Sede actual"} {currentWarehouse?.code ? `(${currentWarehouse.code})` : ""}
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            Fecha de Consulta: <strong>{formatBogotaDateTime(generatedAt)}</strong>
          </div>
          {user?.fullName && (
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Generado por: <strong>{user.fullName}</strong>
            </div>
          )}
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "8px",
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderRadius: "6px",
          padding: "10px 14px",
          marginBottom: "12px",
        }}
      >
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Total Referencias Catálogo:</span>
          <strong style={{ fontSize: "13px", color: "#0f172a" }}>{summary.totalRefs} productos</strong>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Con Existencia Real (&gt; 0):</span>
          <strong style={{ fontSize: "13px", color: "#0f766e" }}>{summary.inStockRefs} referencias</strong>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Total Unidades en Existencia:</span>
          <strong style={{ fontSize: "14px", color: "#047857" }}>{summary.totalUnits} uds</strong>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Vista Mostrada:</span>
          <strong style={{ fontSize: "11px", color: "#334155" }}>
            {stockFilter === "in_stock"
              ? `Solo con stock (${filteredItems.length})`
              : stockFilter === "zero"
                ? `Sin stock (${filteredItems.length})`
                : `Todo el catálogo (${filteredItems.length})`}
          </strong>
        </div>
      </section>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "11px",
          marginBottom: "14px",
        }}
      >
        <thead>
          <tr style={{ background: "#0f766e", color: "#ffffff", textAlign: "left" }}>
            <th style={{ padding: "6px 8px", width: "110px" }}>Referencia</th>
            <th style={{ padding: "6px 8px" }}>Descripción del Producto</th>
            <th style={{ padding: "6px 8px", width: "120px" }}>Categoría</th>
            <th style={{ padding: "6px 8px", textAlign: "right", width: "95px" }}>Existencia Real</th>
            <th style={{ padding: "6px 8px", textAlign: "center", width: "95px" }}>Verificación</th>
          </tr>
        </thead>
        <tbody>
          {filteredItems.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: "14px", textAlign: "center", color: "#64748b" }}>
                No se encontraron productos para el filtro seleccionado.
              </td>
            </tr>
          ) : (
            filteredItems.map((item, idx) => (
              <tr
                key={item.id}
                style={{
                  background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <td style={{ padding: "5px 8px", fontWeight: 700 }}>{item.referenceCode}</td>
                <td style={{ padding: "5px 8px" }}>
                  {item.name}
                  {item.barcode ? <span style={{ color: "#64748b", fontSize: "10px" }}> · {item.barcode}</span> : null}
                </td>
                <td style={{ padding: "5px 8px", color: "#475569" }}>{item.categoryName ?? "General"}</td>
                <td
                  style={{
                    padding: "5px 8px",
                    textAlign: "right",
                    fontWeight: 800,
                    color: item.quantityOnHand > 0 ? "#0f766e" : "#94a3b8",
                  }}
                >
                  {item.quantityOnHand} {item.unit || "uds"}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", color: "#94a3b8" }}>
                  ________
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <footer style={{ marginTop: "14px", paddingTop: "8px", borderTop: "1px dashed #cbd5e1", textAlign: "center", fontSize: "9.5px", color: "#94a3b8" }}>
        Evolution ERP · Reporte Oficial de Inventario Real en Bodega / Sede
      </footer>
    </article>
  );

  const modal = (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="inv-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: format === "voucher" ? "520px" : "920px",
          width: "95vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#f8fafc",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Barra superior de control */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 18px",
            background: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 800, color: "#0f172a" }}>
              <Package size={18} color="#0f766e" />
              <span>Inventario Real</span>
            </div>

            {canViewAllWarehouses && warehouses.length > 1 && (
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            )}

            {/* Selector de formato */}
            <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
              <button
                type="button"
                onClick={() => setFormat("half_letter")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 12px",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  border: "none",
                  background: format === "half_letter" ? "#ffffff" : "transparent",
                  color: format === "half_letter" ? "#0f766e" : "#475569",
                  cursor: "pointer",
                }}
              >
                <FileText size={14} />
                <span>Media Carta / Hoja</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat("voucher")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 12px",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  border: "none",
                  background: format === "voucher" ? "#ffffff" : "transparent",
                  color: format === "voucher" ? "#0f766e" : "#475569",
                  cursor: "pointer",
                }}
              >
                <Receipt size={14} />
                <span>Baucher POS</span>
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => void loadRealInventory()}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 12px",
                background: "#f1f5f9",
                color: "#334155",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.84rem",
                cursor: "pointer",
              }}
              title="Actualizar existencias reales"
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                background: "#0f766e",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
              }}
            >
              <Printer size={16} />
              <span>Imprimir Inventario Real</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                padding: "6px",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#64748b",
              }}
              title="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Barra de filtros de existencias y búsqueda */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 18px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setStockFilter("in_stock")}
              style={{
                padding: "5px 12px",
                borderRadius: "999px",
                fontSize: "0.8rem",
                fontWeight: 700,
                border: stockFilter === "in_stock" ? "1px solid #0f766e" : "1px solid #cbd5e1",
                background: stockFilter === "in_stock" ? "#ccfbf1" : "#ffffff",
                color: stockFilter === "in_stock" ? "#0f766e" : "#475569",
                cursor: "pointer",
              }}
            >
              Con existencias ({summary.inStockRefs})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter("all")}
              style={{
                padding: "5px 12px",
                borderRadius: "999px",
                fontSize: "0.8rem",
                fontWeight: 700,
                border: stockFilter === "all" ? "1px solid #0f766e" : "1px solid #cbd5e1",
                background: stockFilter === "all" ? "#ccfbf1" : "#ffffff",
                color: stockFilter === "all" ? "#0f766e" : "#475569",
                cursor: "pointer",
              }}
            >
              Todo el catálogo ({summary.totalRefs})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter("zero")}
              style={{
                padding: "5px 12px",
                borderRadius: "999px",
                fontSize: "0.8rem",
                fontWeight: 700,
                border: stockFilter === "zero" ? "1px solid #0f766e" : "1px solid #cbd5e1",
                background: stockFilter === "zero" ? "#ccfbf1" : "#ffffff",
                color: stockFilter === "zero" ? "#0f766e" : "#475569",
                cursor: "pointer",
              }}
            >
              Sin stock ({summary.zeroRefs})
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "4px 10px",
              minWidth: "220px",
            }}
          >
            <Search size={15} color="#64748b" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar producto o referencia…"
              style={{
                border: "none",
                outline: "none",
                fontSize: "0.84rem",
                width: "100%",
              }}
            />
          </div>
        </div>

        {/* Vista previa */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            background: "#f1f5f9",
          }}
        >
          {error ? (
            <div style={{ padding: "12px", background: "#fef2f2", color: "#991b1b", borderRadius: 8, marginBottom: 12 }}>
              {error}
            </div>
          ) : null}
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b", fontWeight: 600 }}>
              Consultando existencias reales de la sede…
            </div>
          ) : format === "voucher" ? (
            renderVoucherContent()
          ) : (
            renderHalfLetterContent()
          )}
        </div>
      </div>
    </div>
  );

  return portalReady ? (
    <>
      {createPortal(modal, document.body)}
      {createPortal(
        <div id="inv-count-voucher-print-area" aria-hidden="true" style={{ display: "none" }}>
          {renderVoucherContent()}
        </div>,
        document.body
      )}
      {createPortal(
        <div id="inv-count-half-letter-print-area" aria-hidden="true" style={{ display: "none" }}>
          {renderHalfLetterContent()}
        </div>,
        document.body
      )}
    </>
  ) : null;
}
