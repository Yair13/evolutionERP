import { useState } from "react";
import { Upload, X, CheckCircle2, FileText } from "lucide-react";
import {
  uploadClosureReceiptFile,
  attachReceiptToOperation,
  type ReceiptAuditItem,
} from "../../api/finance.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  token: string;
  item: ReceiptAuditItem;
  onClose: () => void;
  onSuccess: () => void;
};

export function UploadReceiptModal({ token, item, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Por favor selecciona un archivo de imagen o PDF.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // 1. Subir el archivo al servidor
      const uploaded = await uploadClosureReceiptFile(token, file);

      // 2. Adjuntarlo a la operación correspondiente
      await attachReceiptToOperation(token, {
        type: item.type,
        id: item.id,
        receiptUrl: uploaded.publicUrl,
        receiptFilename: uploaded.filename,
      });

      onSuccess();
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
        zIndex: 1100,
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
          maxWidth: 520,
          width: "100%",
          padding: "1.75rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Upload size={20} className="text-primary" />
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
              Adjuntar Comprobante / Soporte
            </h2>
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

        {/* Resumen de la operación */}
        <div
          style={{
            padding: "0.85rem",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
            borderRadius: 8,
            marginBottom: "1.25rem",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "var(--text-muted)" }}>Tipo:</span>
            <strong>{item.typeLabel}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "var(--text-muted)" }}>Referencia:</span>
            <span style={{ color: "#38bdf8", fontWeight: 600 }}>{item.reference}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "var(--text-muted)" }}>Concepto:</span>
            <span>{item.concept}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "var(--text-muted)" }}>Medio:</span>
            <span style={{ textTransform: "uppercase", fontWeight: 600 }}>{item.paymentMethod}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 4, marginTop: 4 }}>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Monto:</span>
            <strong style={{ fontSize: "1.05rem", color: "#10b981" }}>{formatMoney(item.amount)}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "1.5rem",
                background: "rgba(255, 255, 255, 0.02)",
                border: "2px dashed var(--border-color, rgba(255, 255, 255, 0.2))",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <FileText size={32} className="text-primary" />
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {file ? file.name : "Haz clic para seleccionar imagen o PDF del soporte"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Formatos: JPG, PNG, WEBP, PDF (Máx 10 MB)
              </span>
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

          {file && (
            <div style={{ fontSize: "0.8rem", color: "#10b981", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <CheckCircle2 size={16} /> Archivo listo para adjuntar ({(file.size / 1024).toFixed(0)} KB)
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              className="inv-btn inv-btn--ghost"
              onClick={onClose}
              disabled={uploading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inv-btn inv-btn--primary"
              disabled={uploading || !file}
            >
              {uploading ? "Subiendo…" : "Adjuntar y Validar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
