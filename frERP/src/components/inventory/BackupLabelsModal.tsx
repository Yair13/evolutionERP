import { CopyPlus, Info, Minus, Plus, Tag, X } from "lucide-react";
import { useState } from "react";
import { createBackupLabels } from "../../api/inventory.js";
import type { InventoryDocumentDetail } from "../../features/inventory/inventory.types.js";
import { formatBogotaDateTimeShort } from "../../lib/dateUtils.js";

type Props = {
  document: InventoryDocumentDetail;
  token: string;
  warehouseId?: string | null;
  onClose: () => void;
  onSuccess: (updated: InventoryDocumentDetail) => void;
};

export function BackupLabelsModal({ document: doc, token, warehouseId, onClose, onSuccess }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    // Si ya había un respaldo previo pendiente, inicializamos con esas cantidades para conveniencia
    const initial: Record<string, number> = {};
    const existing = doc.backupLabels?.items;
    if (existing && existing.length > 0) {
      for (const item of existing) {
        initial[item.productId] = item.quantity;
      }
    }
    return initial;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderCode = doc.purchaseOrderCode || doc.productionOrderCode || doc.invoiceNumber || "—";
  const existingBackup = doc.backupLabels;

  // Calculamos el total de etiquetas seleccionadas
  const totalSelected = Object.values(quantities).reduce((acc, q) => acc + (q || 0), 0);

  function handleQuantityChange(productId: string, val: number, maxQty: number) {
    const clamped = Math.max(0, Math.min(maxQty, Math.floor(val || 0)));
    setQuantities((prev) => ({
      ...prev,
      [productId]: clamped,
    }));
  }

  function handleSetMax(productId: string, maxQty: number) {
    setQuantities((prev) => ({
      ...prev,
      [productId]: maxQty,
    }));
  }

  function handleReset() {
    setQuantities({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalSelected <= 0 || saving) return;

    setSaving(true);
    setError(null);

    const items = Object.entries(quantities)
      .filter(([_, q]) => q > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    try {
      const { item } = await createBackupLabels(token, doc.id, { items }, warehouseId);
      onSuccess(item);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al generar respaldo";
      setError(
        msg === "empty_backup_quantities"
          ? "Debes seleccionar al menos 1 etiqueta para respaldar."
          : msg === "not_a_production_order"
          ? "Este documento no admite etiquetas de respaldo."
          : msg
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-modal inv-backup-modal"
        role="dialog"
        aria-labelledby="backup-labels-title"
        style={{ width: "min(620px, calc(100vw - 32px))", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inv-modal__header" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 id="backup-labels-title" style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <CopyPlus size={20} className="text-teal-600" aria-hidden />
              Etiquetas de Respaldo · OP Nº {orderCode}
            </h2>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
              {doc.warehouseName ? `Sede: ${doc.warehouseName} · ` : ""}
              Selecciona cuántas etiquetas reimprimir para cada producto si la impresora falló.
            </p>
          </div>
          <button
            type="button"
            className="inv-btn-icon"
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)" }}
          >
            <X size={20} />
          </button>
        </div>

        {existingBackup ? (
          <div
            style={{
              padding: "10px 20px",
              background: existingBackup.status === "pending" ? "#fef3c7" : "#f1f5f9",
              borderBottom: "1px solid var(--border)",
              fontSize: "0.82rem",
              color: existingBackup.status === "pending" ? "#92400e" : "#475569",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Info size={16} style={{ flexShrink: 0 }} />
            <span>
              {existingBackup.status === "pending"
                ? `Hay un respaldo PENDIENTE de ${existingBackup.totalQuantity} etiquetas generado el ${formatBogotaDateTimeShort(existingBackup.requestedAt)}. Si generas uno nuevo, se actualizará.`
                : `Se imprimió un respaldo anterior de ${existingBackup.totalQuantity} etiquetas el ${formatBogotaDateTimeShort(existingBackup.printedAt ?? existingBackup.requestedAt)}.`}
            </span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {error ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  background: "#fee2e2",
                  color: "#991b1b",
                  marginBottom: 14,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                }}
              >
                {error}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
                Productos en la orden ({doc.lines.length})
              </span>
              {totalSelected > 0 ? (
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    border: "none",
                    background: "none",
                    color: "var(--primary)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Restablecer a 0
                </button>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {doc.lines.map((line) => {
                const maxQty = Math.max(1, Math.floor(Math.abs(line.quantity)));
                const currentQty = quantities[line.productId] || 0;
                const hasBarcode = Boolean(line.barcode);

                return (
                  <div
                    key={line.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      background: currentQty > 0 ? "rgba(13, 148, 136, 0.04)" : "var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      transition: "border-color 0.15s ease",
                      borderColor: currentQty > 0 ? "#0d9488" : "var(--border)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ fontSize: "0.95rem", color: "var(--text)" }}>{line.productName}</strong>
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 2 }}>
                        <span>Ref: {line.referenceCode}</span>
                        {line.barcode ? (
                          <span> · Código: <code>{line.barcode}</code></span>
                        ) : (
                          <span style={{ color: "#e11d48", marginLeft: 6 }}>⚠️ Sin código de barras</span>
                        )}
                        <span style={{ marginLeft: 8, fontWeight: 600, color: "var(--text)" }}>
                          (Total en orden: {maxQty} uds)
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "#ffffff" }}>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(line.productId, currentQty - 1, maxQty)}
                          disabled={currentQty <= 0 || !hasBarcode}
                          style={{
                            width: 32,
                            height: 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            background: "transparent",
                            cursor: currentQty <= 0 || !hasBarcode ? "not-allowed" : "pointer",
                            color: currentQty <= 0 ? "#cbd5e1" : "#334155",
                          }}
                          aria-label="Disminuir cantidad"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={maxQty}
                          value={currentQty === 0 ? "" : currentQty}
                          placeholder="0"
                          disabled={!hasBarcode}
                          onChange={(e) =>
                            handleQuantityChange(line.productId, parseInt(e.target.value, 10) || 0, maxQty)
                          }
                          style={{
                            width: 44,
                            height: 32,
                            border: "none",
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            outline: "none",
                            background: "transparent",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(line.productId, currentQty + 1, maxQty)}
                          disabled={currentQty >= maxQty || !hasBarcode}
                          style={{
                            width: 32,
                            height: 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            background: "transparent",
                            cursor: currentQty >= maxQty || !hasBarcode ? "not-allowed" : "pointer",
                            color: currentQty >= maxQty ? "#cbd5e1" : "#334155",
                          }}
                          aria-label="Aumentar cantidad"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSetMax(line.productId, maxQty)}
                        disabled={!hasBarcode || currentQty === maxQty}
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "4px 8px",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          background: "var(--background)",
                          cursor: !hasBarcode || currentQty === maxQty ? "not-allowed" : "pointer",
                          color: "var(--muted)",
                        }}
                        title={`Seleccionar el total (${maxQty})`}
                      >
                        Máx
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="inv-modal__footer"
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--border)",
              background: "var(--surface)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Total etiquetas de respaldo: </span>
              <strong style={{ fontSize: "1.1rem", color: totalSelected > 0 ? "#0d9488" : "var(--text)" }}>
                {totalSelected} {totalSelected === 1 ? "etiqueta" : "etiquetas"}
              </strong>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button
                type="submit"
                className="inv-btn inv-btn--primary"
                disabled={saving || totalSelected <= 0}
                style={{ minWidth: 160 }}
              >
                <Tag size={16} strokeWidth={2} aria-hidden />
                {saving ? "Generando…" : "Generar respaldo"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
