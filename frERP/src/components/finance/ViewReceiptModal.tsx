import { useState } from "react";
import { X, Download, FileText, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { attachPayrollReceipt, type PayrollPaymentItem } from "../../api/finance.js";
import { ReceiptPhotosUploader } from "../common/ReceiptPhotosUploader.js";

type Props = {
  token: string;
  payment: PayrollPaymentItem;
  onClose: () => void;
  onUpdated: (updated: PayrollPaymentItem) => void;
};

export function ViewReceiptModal({ token, payment, onClose, onUpdated }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [referenceCode, setReferenceCode] = useState(payment.referenceCode || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const rawUrls: string[] = (payment.transferReceiptUrls && payment.transferReceiptUrls.length > 0)
    ? payment.transferReceiptUrls
    : (payment.transferReceiptUrl ? [payment.transferReceiptUrl] : []);

  const fullUrls = rawUrls.map((u) => (u.startsWith("http") ? u : `${apiBase}${u}`));
  const currentUrl = fullUrls[selectedIndex] || fullUrls[0] || null;

  const isPdf = currentUrl?.toLowerCase().includes(".pdf");

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Por favor toma una foto con la cámara o selecciona al menos un archivo.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await attachPayrollReceipt(token, payment.id, files, referenceCode.trim() || undefined);
      setFiles([]);
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
        {currentUrl ? (
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
                position: "relative",
              }}
            >
              {fullUrls.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedIndex((prev) => (prev > 0 ? prev - 1 : fullUrls.length - 1))}
                    className="inv-btn inv-btn--ghost inv-btn--sm"
                    style={{ color: "#fff", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <span style={{ fontSize: "0.82rem", color: "#94a3b8", fontWeight: 600 }}>
                    Foto {selectedIndex + 1} de {fullUrls.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIndex((prev) => (prev < fullUrls.length - 1 ? prev + 1 : 0))}
                    className="inv-btn inv-btn--ghost inv-btn--sm"
                    style={{ color: "#fff", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    Siguiente <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {isPdf ? (
                <div style={{ padding: "2rem", textAlign: "center" }}>
                  <FileText size={48} className="text-sky-400" style={{ margin: "0 auto 1rem auto" }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>Documento PDF Adjunto</p>
                  <p style={{ margin: "4px 0 1rem 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {payment.transferReceiptFilename || "comprobante-transferencia.pdf"}
                  </p>
                  <a
                    href={currentUrl}
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
                    src={currentUrl}
                    alt={`Comprobante ${selectedIndex + 1}`}
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
                      Foto {selectedIndex + 1} de {fullUrls.length}
                    </span>
                    <a
                      href={currentUrl}
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

              {fullUrls.length > 1 && (
                <div style={{ display: "flex", gap: "6px", marginTop: "0.75rem", overflowX: "auto", maxWidth: "100%", padding: "4px 0" }}>
                  {fullUrls.map((u, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedIndex(i)}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 6,
                        overflow: "hidden",
                        border: i === selectedIndex ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.2)",
                        opacity: i === selectedIndex ? 1 : 0.6,
                        cursor: "pointer",
                        padding: 0,
                        background: "#000",
                        flexShrink: 0,
                      }}
                    >
                      {u.toLowerCase().includes(".pdf") ? (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1e293b", color: "#38bdf8", fontSize: "0.6rem" }}>
                          PDF
                        </div>
                      ) : (
                        <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </button>
                  ))}
                </div>
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
            gap: "0.85rem",
          }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
            {currentUrl ? "Reemplazar / Agregar Comprobantes Bancarios" : "Subir Comprobante (Tesorería / Banco)"}
          </span>

          <label className="field" style={{ margin: 0 }}>
            <span>Referencia Bancaria</span>
            <input
              type="text"
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
              placeholder="Ej. REF-49201"
            />
          </label>

          <ReceiptPhotosUploader
            files={files}
            onChange={setFiles}
            disabled={uploading}
            label="Fotos o comprobantes de la transferencia"
            helperText="Puedes tomar fotos con la cámara o seleccionar archivos (imágenes o PDF)."
          />

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
            <button
              type="submit"
              className="inv-btn inv-btn--primary"
              disabled={uploading || files.length === 0}
            >
              {uploading ? "Subiendo…" : `Guardar Soporte (${files.length})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
