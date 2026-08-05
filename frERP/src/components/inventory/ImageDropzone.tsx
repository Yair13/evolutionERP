import { useCallback, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

const MAX_FILES = 8;

type PendingFile = {
  id: string;
  file: File;
  preview: string;
};

type Props = {
  disabled?: boolean;
  label?: string;
  hint?: string;
  files: PendingFile[];
  onFilesChange: (files: PendingFile[]) => void;
};

export function ImageDropzone({
  disabled,
  label = "Imágenes del producto",
  hint = "Arrastra fotos aquí o toca para elegir · JPG, PNG, WebP · máx. 5 MB c/u",
  files,
  onFilesChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list).filter((f) => f.type.startsWith("image/"));
      if (incoming.length === 0) return;

      const room = MAX_FILES - files.length;
      const slice = incoming.slice(0, room);
      const next: PendingFile[] = [
        ...files,
        ...slice.map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          file,
          preview: URL.createObjectURL(file),
        })),
      ];
      onFilesChange(next);
    },
    [files, onFilesChange]
  );

  function remove(id: string) {
    const target = files.find((f) => f.id === id);
    if (target) URL.revokeObjectURL(target.preview);
    onFilesChange(files.filter((f) => f.id !== id));
  }

  return (
    <div className="inv-dropzone-wrap">
      <span className="inv-dropzone-wrap__label">{label}</span>
      <div
        className={`inv-dropzone${dragOver ? " inv-dropzone--over" : ""}${disabled ? " inv-dropzone--disabled" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Subir imágenes"
      >
        <ImagePlus size={32} strokeWidth={1.5} aria-hidden />
        <p>{hint}</p>
        <span className="inv-dropzone__count">
          {files.length}/{MAX_FILES}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 ? (
        <ul className="inv-dropzone__previews">
          {files.map((f) => (
            <li key={f.id}>
              <img src={f.preview} alt="" />
              <button
                type="button"
                className="inv-dropzone__remove"
                aria-label="Quitar imagen"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(f.id);
                }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type { PendingFile };
