import { useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCw, Check, AlertCircle } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onPhotosCaptured: (files: File[]) => void;
  onFallbackNative?: () => void;
};

export function CameraCaptureModal({ open, onClose, onPhotosCaptured, onFallbackNative }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<
    Array<{ file: File; previewUrl: string }>
  >([]);
  const [flashEffect, setFlashEffect] = useState(false);

  // Iniciar cámara cuando el modal se abre
  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    setError(null);
    setCapturedPhotos([]);

    async function initCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError(
            "Tu navegador o dispositivo no permite acceso directo a la cámara. Usa el botón de subir archivo."
          );
          return;
        }

        // Listar cámaras disponibles
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
        if (isMounted) {
          setDevices(videoInputs);
        }

        // Preferir cámara trasera ('environment') en móviles
        const backCamera = videoInputs.find((d) =>
          /back|rear|trás|environment/i.test(d.label)
        );
        const deviceId = backCamera ? backCamera.deviceId : videoInputs[0]?.deviceId;

        if (isMounted && deviceId) {
          setSelectedDeviceId(deviceId);
        }

        await startStream(deviceId);
      } catch (err: any) {
        if (isMounted) {
          console.error("Camera access error:", err);
          setError(
            err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
              ? "Permiso de cámara denegado. Permite el acceso a la cámara en los ajustes del navegador."
              : "No se pudo iniciar la cámara: " + (err.message || "Error desconocido")
          );
        }
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      stopStream();
    };
  }, [open]);

  async function startStream(deviceId?: string) {
    stopStream();
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn("Could not start specific camera, trying generic video constraint:", err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (fallbackErr: any) {
        setError("Error al encender la cámara. Comprueba los permisos del dispositivo.");
      }
    }
  }

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function switchCamera() {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    if (nextDevice) {
      setSelectedDeviceId(nextDevice.deviceId);
      await startStream(nextDevice.deviceId);
    }
  }

  function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    // Efecto visual de flash
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 180);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const now = Date.now();
        const filename = `foto-comprobante-${now}-${capturedPhotos.length + 1}.jpg`;
        const file = new File([blob], filename, { type: "image/jpeg" });
        const previewUrl = URL.createObjectURL(blob);

        setCapturedPhotos((prev) => [...prev, { file, previewUrl }]);
      },
      "image/jpeg",
      0.9
    );
  }

  function removeCaptured(index: number) {
    setCapturedPhotos((prev) => {
      const target = prev[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleFinish() {
    if (capturedPhotos.length > 0) {
      onPhotosCaptured(capturedPhotos.map((p) => p.file));
    }
    stopStream();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.88)",
        zIndex: 1200,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopStream();
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "#0f172a",
          color: "#f8fafc",
          borderRadius: 16,
          maxWidth: 680,
          width: "100%",
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: "0.85rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(30, 41, 59, 0.8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Camera size={20} color="#38bdf8" />
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>
              Tomar Foto del Comprobante / Soporte
            </span>
            {capturedPhotos.length > 0 && (
              <span
                style={{
                  background: "#10b981",
                  color: "#fff",
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {capturedPhotos.length} {capturedPhotos.length === 1 ? "foto lista" : "fotos listas"}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {devices.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                title="Cambiar de cámara"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "none",
                  color: "#fff",
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.8rem",
                }}
              >
                <RefreshCw size={14} /> Cambiar cámara
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                stopStream();
                onClose();
              }}
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

        {/* Visor de video / Cámara */}
        <div
          style={{
            position: "relative",
            width: "100%",
            background: "#000",
            minHeight: 320,
            maxHeight: 460,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {error ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "#f87171",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <AlertCircle size={36} />
              <p style={{ margin: 0, fontSize: "0.9rem", maxWidth: 400 }}>{error}</p>
              {onFallbackNative && (
                <button
                  type="button"
                  onClick={() => {
                    stopStream();
                    onClose();
                    onFallbackNative();
                  }}
                  className="inv-btn"
                  style={{
                    marginTop: "0.5rem",
                    background: "#38bdf8",
                    color: "#0f172a",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Camera size={18} />
                  <span>Tomar foto con la cámara del dispositivo</span>
                </button>
              )}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  maxHeight: 440,
                }}
              />

              {/* Guía de encuadre */}
              <div
                style={{
                  position: "absolute",
                  inset: "14px",
                  border: "2px dashed rgba(255, 255, 255, 0.35)",
                  borderRadius: 8,
                  pointerEvents: "none",
                }}
              />

              {/* Efecto de flash al disparar */}
              {flashEffect && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(255, 255, 255, 0.85)",
                    pointerEvents: "none",
                    transition: "opacity 0.15s ease-out",
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Galería de fotos tomadas en esta sesión */}
        {capturedPhotos.length > 0 && (
          <div
            style={{
              padding: "0.6rem 1rem",
              background: "rgba(15, 23, 42, 0.95)",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              overflowX: "auto",
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
              Fotos tomadas ({capturedPhotos.length}):
            </span>
            {capturedPhotos.map((photo, idx) => (
              <div
                key={photo.file.name + idx}
                style={{
                  position: "relative",
                  width: 52,
                  height: 52,
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid #38bdf8",
                  flexShrink: 0,
                }}
              >
                <img
                  src={photo.previewUrl}
                  alt={`Foto ${idx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  type="button"
                  onClick={() => removeCaptured(idx)}
                  title="Eliminar foto"
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 16,
                    height: 16,
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
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Controles del obturador y confirmación */}
        <div
          style={{
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#1e293b",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="inv-btn inv-btn--ghost"
            style={{ color: "#94a3b8" }}
          >
            Cancelar
          </button>

          {/* Botón de captura central */}
          {!error && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={capturePhoto}
                title="Capturar Foto"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  backgroundColor: "#ffffff",
                  border: "4px solid #38bdf8",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 15px rgba(56, 189, 248, 0.5)",
                  transition: "transform 0.1s ease",
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <Camera size={26} color="#0f172a" />
              </button>
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                {capturedPhotos.length === 0 ? "Haz clic para tomar foto" : "Tomar otra"}
              </span>
            </div>
          )}

          {/* Botón para aceptar las fotos tomadas */}
          <button
            type="button"
            onClick={handleFinish}
            disabled={capturedPhotos.length === 0}
            className="inv-btn inv-btn--primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              opacity: capturedPhotos.length === 0 ? 0.5 : 1,
            }}
          >
            <Check size={16} />
            <span>
              {capturedPhotos.length === 0
                ? "Adjuntar"
                : `Adjuntar (${capturedPhotos.length})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
