import { useState, useEffect } from "react";
import { resetInitialReceivables } from "../../api/finance.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { RotateCcw, X, AlertTriangle, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialWarehouseId?: string;
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ResetInitialReceivablesModal({ open, onClose, onSuccess, initialWarehouseId }: Props) {
  const { token } = useAuth();
  const { warehouses } = useWarehouse();

  const [targetWarehouseId, setTargetWarehouseId] = useState<string>(initialWarehouseId || "");
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    deletedCount: number;
    totalAmountReset: number;
    warehouseName: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setTargetWarehouseId(initialWarehouseId || (warehouses[0]?.id || ""));
      setConfirmed(false);
      setError(null);
      setSuccessResult(null);
    }
  }, [open, initialWarehouseId, warehouses]);

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    setTargetWarehouseId("");
    setConfirmed(false);
    setError(null);
    setSuccessResult(null);
    onClose();
  };

  const selectedWh = warehouses.find((w) => w.id === targetWarehouseId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !targetWarehouseId || !confirmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await resetInitialReceivables(token, targetWarehouseId);
      setSuccessResult({
        deletedCount: res.deletedCount,
        totalAmountReset: res.totalAmountReset,
        warehouseName: selectedWh?.name || "Sede seleccionada",
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.message || "Error al resetear saldos iniciales de la sede.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1050,
        padding: "1rem",
        backdropFilter: "blur(3px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="modal-card"
        style={{
          width: "100%",
          maxWidth: "540px",
          backgroundColor: "#ffffff",
          borderRadius: "14px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
          border: "1px solid #fee2e2",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #fee2e2",
            backgroundColor: "#fff5f5",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#dc2626",
              }}
            >
              <RotateCcw size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#991b1b" }}>
                Resetear Saldos Iniciales por Sede
              </h2>
              <span style={{ fontSize: "0.8rem", color: "#b91c1c" }}>
                Acción restringida a Sede Administrativa
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: "4px",
              borderRadius: "6px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "1.5rem" }}>
          {successResult ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <CheckCircle2 size={48} color="#16a34a" style={{ margin: "0 auto 1rem auto" }} />
              <h3 style={{ margin: "0 0 0.5rem 0", color: "#166534", fontSize: "1.1rem" }}>
                ¡Reseteo completado con éxito!
              </h3>
              <p style={{ margin: "0 0 1.25rem 0", color: "#475569", fontSize: "0.9rem" }}>
                Se eliminaron <strong>{successResult.deletedCount}</strong> saldo(s) inicial(es) de la sede{" "}
                <strong>{successResult.warehouseName}</strong> por un monto total de{" "}
                <strong>{formatMoney(successResult.totalAmountReset)}</strong>.
              </p>
              <button
                type="button"
                className="fin-btn fin-btn--primary"
                onClick={handleClose}
                style={{ minWidth: 140 }}
              >
                Cerrar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  padding: "0.85rem 1rem",
                  backgroundColor: "#fffbeb",
                  border: "1px solid #fef3c7",
                  borderRadius: "8px",
                  marginBottom: "1.25rem",
                }}
              >
                <AlertTriangle size={24} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: "0.83rem", color: "#92400e", lineHeight: 1.45 }}>
                  <strong>¿Cómo funciona el reseteo?</strong>
                  <br />
                  Esta herramienta elimina <strong>únicamente</strong> los saldos iniciales creados
                  manualmente en caso de error de digitación o migración.
                  <br />
                  <br />
                  🛡️ <strong>Protección de Ventas:</strong> Las facturas y créditos originados por ventas
                  reales de Evolution ERP <strong>NO</strong> se borrarán ni se modificarán.
                </div>
              </div>

              {error && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    color: "#b91c1c",
                    fontSize: "0.85rem",
                    marginBottom: "1rem",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Selector de Sede */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "0.35rem",
                  }}
                >
                  Selecciona la Sede a resetear *
                </label>
                <select
                  value={targetWarehouseId}
                  onChange={(e) => {
                    setTargetWarehouseId(e.target.value);
                    setConfirmed(false);
                  }}
                  required
                  disabled={submitting}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="">-- Elige una sede física --</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Casilla de confirmación obligatoria */}
              {targetWarehouseId && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    padding: "0.75rem 1rem",
                    border: "1px dashed #fca5a5",
                    borderRadius: "8px",
                    backgroundColor: "#fef2f2",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.6rem",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      color: "#991b1b",
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      disabled={submitting}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      Confirmo que deseo vaciar todos los saldos iniciales manuales registrados en{" "}
                      {selectedWh?.name}. Entiendo que esta operación es irreversible.
                    </span>
                  </label>
                </div>
              )}

              {/* Acciones */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="fin-btn fin-btn--ghost"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="fin-btn fin-btn--danger"
                  disabled={!targetWarehouseId || !confirmed || submitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <RotateCcw size={16} />
                  <span>{submitting ? "Reseteando..." : "Resetear Saldos de esta Sede"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
