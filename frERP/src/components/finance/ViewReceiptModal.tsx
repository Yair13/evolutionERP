import { useState } from "react";
import { X, Download, Upload, CheckCircle2, FileText, Image as ImageIcon } from "lucide-react";
import { attachPayrollReceipt, type PayrollPaymentItem } from "../../api/finance.js";

type Props = {
  token: string;
  payment: PayrollPaymentItem;
  onClose: () => void;
  onUpdated: (updated: PayrollPaymentItem) => void;
};

export function ViewReceiptModal({ token, payment, onClose, onUpdated }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [referenceCode, setReferenceCode] = useState(payment.referenceCode || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const fullUrl = payment.transferReceiptUrl
    ? (payment.transferReceiptUrl.startsWith("http")
        ? payment.transferReceiptUrl
        : `${apiBase}${payment.transferReceiptUrl}`)
    : null;

  const isPdf = payment.transferReceiptFilename?.toLowerCase().endsWith(".pdf") ||
    payment.transferReceiptUrl?.toLowerCase().endsWith(".pdf");

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona un archivo.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await attachPayrollReceipt(token, payment.id, file, referenceCode.trim() || undefined);
      onUpdated(res.item);
    } catch (err: any) {
      setError(err?.message || "Error al subir comprobante");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card, #1e293b)",
          color: "var(--text-primary, #f8fafc)",
          borderRadius: 12,
          maxWidth: 640,
          width: "100%",
          padding: "1.75rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FileText className="text-primary" />
              Soporte de Transferencia Bancaria
            </h2>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
              Voucher: <strong>{payment.voucherNumber}</strong> | Colaborador: <strong>{payment.employeeName}</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              borderRadius: 8,
              marginBottom: "1rem",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        {/* Visualización del comprobante existente */}
        {fullUrl ? (
          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                background: "#0f172a",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "1rem",
              }}
            >
              {isPdf ? (
                <div style={{ padding: "2rem", textAlign: "center" }}>
                  <FileText size={48} className="text-sky-400" style={{ margin: "0 auto 1rem auto" }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>Documento PDF Adjunto</p>
                  <p style={{ margin: "4px 0 1rem 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {payment.transferReceiptFilename || "comprobante-transferencia.pdf"}
                  </p>
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inv-btn inv-btn--primary"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <Download size={16} /> Abrir / Descargar PDF
                  </a>
                </div>
              ) : (
                <>
                  <img
                    src={fullUrl}
                    alt="Comprobante de transferencia"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "50vh",
                      objectFit: "contain",
                      borderRadius: 6,
                      marginBottom: "0.75rem",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {payment.transferReceiptFilename || "comprobante.jpg"}
                    </span>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inv-btn inv-btn--ghost"
                      style={{ fontSize: "0.75rem", padding: "4px 8px", textDecoration: "none" }}
                    >
                      <Download size={14} /> Descargar Original
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "1.5rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed var(--border-color, rgba(255, 255, 255, 0.15))",
              borderRadius: 8,
              textAlign: "center",
              marginBottom: "1.5rem",
            }}
          >
            <ImageIcon size={36} className="text-muted" style={{ margin: "0 auto 0.5rem auto", opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Este pago aún no tiene comprobante de transferencia bancaria adjunto.
            </p>
          </div>
        )}

        {/* Formulario para subir o actualizar comprobante */}
        <form
          onSubmit={handleUpload}
          style={{
            padding: "1rem",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
            {fullUrl ? "Reemplazar Comprobante Bancario" : "Subir Comprobante (Enviado por Maicol / Tesorería)"}
          </span>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Referencia Bancaria</span>
              <input
                type="text"
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="Ej. REF-49201"
              />
            </label>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  padding: "8px 12px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  fontWeight: 600,
                  height: 38,
                }}
              >
                <Upload size={14} /> {file ? "Cambiar archivo" : "Seleccionar Archivo"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>
          </div>

          {file && (
            <div style={{ fontSize: "0.8rem", color: "#10b981", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <CheckCircle2 size={16} /> {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
            <button
              type="submit"
              className="inv-btn inv-btn--primary"
              disabled={uploading || !file}
            >
              {uploading ? "Subiendo…" : "Guardar Soporte"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
