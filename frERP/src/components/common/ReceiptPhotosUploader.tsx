import { useState, useRef, useEffect } from "react";
import { Camera, Upload, X, FileText, Image as ImageIcon } from "lucide-react";
import { CameraCaptureModal } from "./CameraCaptureModal.js";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  existingUrls?: string[];
  onRemoveExistingUrl?: (url: string) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
  helperText?: string;
  required?: boolean;
};

export function ReceiptPhotosUploader({
  files,
  onChange,
  existingUrls = [],
  onRemoveExistingUrl,
  disabled = false,
  label = "Comprobantes / Fotos de Soporte (No Efectivo)",
  hint,
  helperText,
  required = false,
}: Props) {
  const effectiveHint = helperText || hint || "Puedes adjuntar una o varias fotos o usar la cámara del dispositivo.";
  const [cameraOpen, setCameraOpen] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // Crear object URLs para vista previa de los archivos nuevos
  useEffect(() => {
    const urls = files.map((f) => {
      if (f.type.startsWith("image/")) {
        return URL.createObjectURL(f);
      }
      return "";
    });
    setPreviews(urls);

    return () => {
      urls.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
    };
  }, [files]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const newFiles = Array.from(selected);
    // Añadir a los existentes evitando duplicados por nombre
    const existingNames = new Set(files.map((f) => f.name));
    const combined = [...files];
    for (const f of newFiles) {
      if (!existingNames.has(f.name)) {
        combined.push(f);
        existingNames.add(f.name);
      }
    }

    onChange(combined);
    // Limpiar input para permitir seleccionar el mismo archivo si se desea
    e.target.value = "";
  }

  function handleCameraPhotos(newPhotos: File[]) {
    const combined = [...files, ...newPhotos];
    onChange(combined);
  }

  function removeFile(index: number) {
    const updated = files.filter((_, i) => i !== index);
    onChange(updated);
  }

  const totalCount = files.length + existingUrls.length;

  return (
    <div
      style={{
        background: "rgba(241, 245, 249, 0.6)",
        border: "1px dashed #cbd5e1",
        borderRadius: 10,
        padding: "0.85rem",
        marginTop: "0.5rem",
        marginBottom: "0.5rem",
      }}
    >
      {/* Etiqueta y descripción */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "0.5rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Camera size={16} color="#6366f1" />
            <strong style={{ fontSize: "0.85rem", color: "#1e293b" }}>{label}</strong>
            {required && <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>*</span>}
          </div>
          {effectiveHint && (
            <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", color: "#64748b" }}>
              {effectiveHint}
            </p>
          )}
        </div>

        {totalCount > 0 && (
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 12,
              background: "#dcfce7",
              color: "#166534",
            }}
          >
            {totalCount} {totalCount === 1 ? "foto adjunta" : "fotos adjuntas"}
          </span>
        )}
      </div>

      {/* Botones de acción: Cámara y Subir */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={disabled}
          className="inv-btn"
          style={{
            background: "#4f46e5",
            color: "#ffffff",
            fontSize: "0.82rem",
            padding: "6px 12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          <Camera size={16} />
          <span>Tomar foto con cámara</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="inv-btn inv-btn--ghost"
          style={{
            fontSize: "0.82rem",
            padding: "6px 12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#334155",
            cursor: "pointer",
          }}
        >
          <Upload size={15} />
          <span>Seleccionar archivo(s)</span>
        </button>

        {/* Input file oculto */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={handleFileSelect}
          disabled={disabled}
        />
      </div>

      {/* Tira de fotos y comprobantes */}
      {totalCount > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.6rem",
            flexWrap: "wrap",
            paddingTop: "0.4rem",
            borderTop: "1px solid rgba(0, 0, 0, 0.05)",
          }}
        >
          {/* URLs existentes en BD */}
          {existingUrls.map((url, idx) => {
            const fullUrl = url.startsWith("http") ? url : `${apiBase}${url}`;
            const isPdf = url.toLowerCase().endsWith(".pdf");

            return (
              <div
                key={`existing-${idx}`}
                style={{
                  position: "relative",
                  width: 76,
                  height: 76,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                {isPdf ? (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 4,
                    }}
                    onClick={() => window.open(fullUrl, "_blank")}
                  >
                    <FileText size={24} color="#ef4444" />
                    <span style={{ fontSize: "0.65rem", color: "#64748b" }}>PDF</span>
                  </div>
                ) : (
                  <img
                    src={fullUrl}
                    alt={`Soporte ${idx + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
                    onClick={() => setViewingImage(fullUrl)}
                  />
                )}

                {onRemoveExistingUrl && !disabled && (
                  <button
                    type="button"
                    onClick={() => onRemoveExistingUrl(url)}
                    title="Eliminar este soporte"
                    style={{
                      position: "absolute",
                      top: 3,
                      right: 3,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "rgba(239, 68, 68, 0.9)",
                      color: "#fff",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Archivos nuevos cargados por el usuario */}
          {files.map((file, idx) => {
            const preview = previews[idx];
            const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");

            return (
              <div
                key={`file-${file.name}-${idx}`}
                style={{
                  position: "relative",
                  width: 76,
                  height: 76,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "2px solid #6366f1",
                  background: "#ffffff",
                  boxShadow: "0 2px 4px rgba(99, 102, 241, 0.15)",
                }}
              >
                {isPdf ? (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 4,
                    }}
                  >
                    <FileText size={24} color="#ef4444" />
                    <span
                      style={{
                        fontSize: "0.6rem",
                        color: "#334155",
                        textAlign: "center",
                        maxWidth: 70,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </span>
                  </div>
                ) : preview ? (
                  <img
                    src={preview}
                    alt={file.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
                    onClick={() => setViewingImage(preview)}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ImageIcon size={22} color="#94a3b8" />
                  </div>
                )}

                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    title="Quitar foto"
                    style={{
                      position: "absolute",
                      top: 3,
                      right: 3,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "rgba(239, 68, 68, 0.9)",
                      color: "#fff",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para captura por cámara */}
      {cameraOpen && (
        <CameraCaptureModal
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onPhotosCaptured={handleCameraPhotos}
        />
      )}

      {/* Lightbox / Preview modal si el usuario hace clic en una miniatura */}
      {viewingImage && (
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
          onClick={() => setViewingImage(null)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "90vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={viewingImage}
              alt="Vista previa ampliada"
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                borderRadius: 8,
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
              }}
            />
            <button
              type="button"
              onClick={() => setViewingImage(null)}
              style={{
                position: "absolute",
                top: -14,
                right: -14,
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#ffffff",
                color: "#0f172a",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
