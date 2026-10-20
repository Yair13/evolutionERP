import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Download, ExternalLink, Image as ImageIcon, FileText } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  urls: string[];
  title?: string;
  reference?: string;
};

export function ViewReceiptPhotosModal({
  open,
  onClose,
  urls,
  title = "Comprobantes / Soportes de Pago",
  reference,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!open || urls.length === 0) return null;

  const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const currentUrl = urls[currentIndex] || urls[0]!;
  const fullUrl = currentUrl.startsWith("http") ? currentUrl : `${apiBase}${currentUrl}`;
  const isPdf = currentUrl.toLowerCase().endsWith(".pdf");

  function prev() {
    setCurrentIndex((idx) => (idx > 0 ? idx - 1 : urls.length - 1));
  }

  function next() {
    setCurrentIndex((idx) => (idx < urls.length - 1 ? idx + 1 : 0));
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0f172a",
          color: "#f8fafc",
          borderRadius: 16,
          maxWidth: 820,
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: "0.85rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "#1e293b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <ImageIcon size={20} color="#38bdf8" />
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>{title}</div>
              {reference && (
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Referencia: <strong style={{ color: "#38bdf8" }}>{reference}</strong>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <a
              href={fullUrl}
              target="_blank"
              rel="noreferrer"
              title="Abrir en pestaña nueva"
              style={{
                color: "#94a3b8",
                display: "inline-flex",
                alignItems: "center",
                padding: "6px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <ExternalLink size={18} />
            </a>
            <a
              href={fullUrl}
              download
              title="Descargar archivo"
              style={{
                color: "#94a3b8",
                display: "inline-flex",
                alignItems: "center",
                padding: "6px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <Download size={18} />
            </a>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Visor Principal con flechas de navegación */}
        <div
          style={{
            position: "relative",
            flex: 1,
            minHeight: 380,
            maxHeight: "68vh",
            background: "#020617",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            padding: "0.5rem",
          }}
        >
          {isPdf ? (
            <iframe
              src={fullUrl}
              title="Comprobante PDF"
              style={{ width: "100%", height: "65vh", border: "none", borderRadius: 8 }}
            />
          ) : (
            <img
              src={fullUrl}
              alt={`Soporte ${currentIndex + 1}`}
              style={{
                maxWidth: "100%",
                maxHeight: "64vh",
                objectFit: "contain",
                borderRadius: 8,
              }}
            />
          )}

          {/* Flechas si hay más de 1 foto */}
          {urls.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                title="Foto anterior"
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "rgba(15, 23, 42, 0.75)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  backdropFilter: "blur(4px)",
                }}
              >
                <ChevronLeft size={22} />
              </button>

              <button
                type="button"
                onClick={next}
                title="Foto siguiente"
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "rgba(15, 23, 42, 0.75)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  backdropFilter: "blur(4px)",
                }}
              >
                <ChevronRight size={22} />
              </button>

              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  padding: "4px 12px",
                  borderRadius: 14,
                  background: "rgba(15, 23, 42, 0.8)",
                  fontSize: "0.75rem",
                  color: "#cbd5e1",
                  backdropFilter: "blur(4px)",
                }}
              >
                Foto {currentIndex + 1} de {urls.length}
              </div>
            </>
          )}
        </div>

        {/* Tira inferior de miniaturas si hay más de una foto */}
        {urls.length > 1 && (
          <div
            style={{
              padding: "0.6rem 1rem",
              background: "#1e293b",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              overflowX: "auto",
            }}
          >
            {urls.map((url, idx) => {
              const u = url.startsWith("http") ? url : `${apiBase}${url}`;
              const isSelected = idx === currentIndex;
              const isPdfThumb = url.toLowerCase().endsWith(".pdf");

              return (
                <div
                  key={`thumb-${idx}`}
                  onClick={() => setCurrentIndex(idx)}
                  style={{
                    position: "relative",
                    width: 52,
                    height: 52,
                    borderRadius: 6,
                    overflow: "hidden",
                    border: isSelected ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.15)",
                    opacity: isSelected ? 1 : 0.65,
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                >
                  {isPdfThumb ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#334155",
                      }}
                    >
                      <FileText size={20} color="#f87171" />
                    </div>
                  ) : (
                    <img
                      src={u}
                      alt={`Miniatura ${idx + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
