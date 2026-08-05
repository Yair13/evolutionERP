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
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const preferred =
          devices.find((d) => /back|rear|trás|environment/i.test(d.label))?.deviceId ??
          devices[devices.length - 1]?.deviceId ??
          devices[0]?.deviceId;

        if (!videoRef.current || cancelled) return;

        const controls = await reader.decodeFromVideoDevice(preferred, videoRef.current, (result) => {
          if (cancelled || !result) return;
          onDetected(result.getText().trim());
          void controls.stop();
          onClose();
        });
        controlsRef.current = controls;
      } catch {
        if (!cancelled) setError("No se pudo usar la cámara. Revisa permisos o usa una pistola USB.");
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
