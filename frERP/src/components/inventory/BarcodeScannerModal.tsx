import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export function BarcodeScannerModal({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          if (typeof window !== "undefined" && !window.isSecureContext) {
            throw new Error(
              "Conexión no segura (HTTP): Los navegadores bloquean la cámara si entras por IP local sin HTTPS. Accede por localhost o usa HTTPS."
            );
          }
          throw new Error("Este navegador o dispositivo no soporta acceso a la cámara.");
        }

        let preferred: string | undefined = undefined;
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          if (devices && devices.length > 0) {
            preferred =
              devices.find((d) => /back|rear|trás|environment/i.test(d.label))?.deviceId ??
              devices[devices.length - 1]?.deviceId ??
              devices[0]?.deviceId;
          }
        } catch {
          // Si listVideoInputDevices falla antes de otorgar permisos, se intenta sin deviceId (usará facingMode por defecto)
        }

        if (!videoRef.current || cancelled) return;

        const controls = await reader.decodeFromVideoDevice(preferred, videoRef.current, (result) => {
          if (cancelled || !result) return;
          onDetected(result.getText().trim());
          void controls.stop();
          onClose();
        });
        controlsRef.current = controls;
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { name?: string; message?: string };
        if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
          setError("Permiso denegado: autoriza el acceso a la cámara en el candado de la barra del navegador.");
        } else if (e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError") {
          setError("No se detectó ninguna cámara disponible en este dispositivo.");
        } else if (e?.name === "NotReadableError" || e?.name === "TrackStartError") {
          setError("La cámara ya está siendo utilizada por otra aplicación o pestaña.");
        } else if (e?.message) {
          setError(e.message);
        } else {
          setError("No se pudo usar la cámara. Revisa permisos o usa una pistola USB.");
        }
      }
    })();

    return () => {
      cancelled = true;
      void controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onClose, onDetected]);

  if (!open) return null;

  return (
    <div className="inv-scanner-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-scanner"
        role="dialog"
        aria-labelledby="inv-scanner-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="inv-scanner__head">
          <h2 id="inv-scanner-title">Escanear código</h2>
          <button type="button" className="inv-scanner__close" onClick={onClose} aria-label="Cerrar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>
        <div className="inv-scanner__viewport">
          <video ref={videoRef} muted playsInline autoPlay className="inv-scanner__video" />
          <span className="inv-scanner__frame" aria-hidden />
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <p className="inv-scanner__hint">Apunta al código de barras. También puedes usar pistola USB en el campo de búsqueda.</p>
      </div>
    </div>
  );
}
