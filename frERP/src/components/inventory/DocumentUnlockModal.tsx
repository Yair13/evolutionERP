import { useState, type FormEvent } from "react";
import { Unlock, X } from "lucide-react";
import type { InventoryDocumentSummary } from "../../features/inventory/inventory.types.js";
import { documentTypeLabel } from "../../features/inventory/document-labels.js";

const ERROR_LABELS: Record<string, string> = {
  observation_required: "Debes escribir el motivo para activar la edición.",
  document_not_today: "Solo se puede activar edición en movimientos del día de hoy.",
  movement_edit_forbidden: "No tienes permiso para activar la edición.",
  document_not_found: "Documento no encontrado.",
};

type Props = {
  document: InventoryDocumentSummary;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (observation: string) => void;
};

export function DocumentUnlockModal({ document: doc, saving, error, onClose, onConfirm }: Props) {
  const [observation, setObservation] = useState("");
  const label = documentTypeLabel(doc);

  function submit(e: FormEvent) {
    e.preventDefault();
    onConfirm(observation.trim());
  }

  const displayError = error ? (ERROR_LABELS[error] ?? error) : null;

  return (
    <div className="inv-modal-backdrop" role="presentation">
      <form
        className="inv-modal inv-modal--unlock-doc"
        role="dialog"
        aria-labelledby="unlock-doc-title"
        onSubmit={submit}
      >
        <h2 id="unlock-doc-title">Activar edición</h2>
        <p className="inv-modal__hint">
          <strong>{label}</strong>
          {doc.invoiceNumber ? ` · Nº ${doc.invoiceNumber}` : ""}. Indica por qué se habilita editar este
          movimiento. Quedará en el registro de auditoría.
        </p>

        <label className="inv-edit-doc-obs">
          <span>Observación (obligatoria)</span>
          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            rows={3}
            required
            maxLength={2000}
            placeholder="Ej.: error en cantidades al registrar…"
            autoFocus
          />
        </label>

        {displayError ? (
          <p className="form-error" role="alert">
            {displayError}
          </p>
        ) : null}

        <div className="inv-modal__actions">
          <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose} disabled={saving}>
            <X size={18} strokeWidth={2} aria-hidden />
            Cancelar
          </button>
          <button type="submit" className="inv-btn inv-btn--primary" disabled={saving || !observation.trim()}>
            <Unlock size={18} strokeWidth={2} aria-hidden />
            {saving ? "Activando…" : "Activar edición"}
          </button>
        </div>
      </form>
    </div>
  );
}
