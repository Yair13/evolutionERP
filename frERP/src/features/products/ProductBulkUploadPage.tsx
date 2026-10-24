import { type ChangeEvent, type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { bulkImportProducts, fetchProductCatalog } from "../../api/inventory.js";
import { ProductPageHeader } from "../../components/products/ProductPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";
import { EVOLUTION_PRESET_CATALOG_CSV } from "./evolutionCatalogPreset.js";

type ColumnOrderMode = "auto" | "code_first" | "name_first";
type FilterTab = "all" | "valid" | "duplicates" | "warnings" | "errors";

type RawRow = {
  id: string;
  referenceCode: string;
  name: string;
  baseSalePrice: number;
  productionCost: number;
};

type ValidatedRow = RawRow & {
  isValid: boolean;
  hasWarning: boolean;
  errorMsg?: string;
  warningMsg?: string;
  isDuplicateInBatch: boolean;
  existsInCatalog: boolean;
  isDuplicate: boolean;
};

const HEADER_KEYWORDS = new Set([
  "CODIGO",
  "CÓDIGO",
  "CODE",
  "REFERENCIA",
  "SKU",
  "NOMBRE",
  "NAME",
  "PRODUCTO",
  "DESCRIPCION",
  "DESCRIPCIÓN",
  "VALOR",
  "PRECIO",
  "PRICE",
  "COSTO",
]);

function looksLikeCode(val: string): boolean {
  const s = val.trim().toUpperCase();
  if (!s) return false;
  if (s.startsWith("EVOLUTION") || s.startsWith("EVO-") || s.startsWith("EVO")) return true;
  // Sin espacios, alfanumérico corto con letras y números (ej. PROD01, REF-12)
  if (!/\s/.test(s) && s.length <= 24 && /[A-Z]/.test(s) && /\d/.test(s)) return true;
  return false;
}

function parseMoneyNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.trim().replace(/[^0-9.,-]/g, "");
  if (!cleaned) return 0;
  // Si tiene formato 202.000 o 202,000 sin decimales significativos, limpiamos separadores de miles
  const normalized = cleaned.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function parseSmartBulkText(text: string, mode: ColumnOrderMode): RawRow[] {
  const lines = text.split(/\r?\n/);
  const rows: RawRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!.trim();
    if (!rawLine) continue;

    let delimiter = ",";
    if (rawLine.includes("\t")) delimiter = "\t";
    else if (rawLine.includes(";")) delimiter = ";";

    // Quitar celdas vacías al inicio y al final (como `,CODIGO,NOMBRE,VALOR,`)
    const parts = rawLine.split(delimiter).map((p) => p.trim());
    while (parts.length > 0 && parts[0] === "") parts.shift();
    while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();

    if (parts.length === 0) continue;

    // Ignorar fila si todas sus celdas están vacías
    if (parts.every((p) => !p)) continue;

    // Detectar fila de encabezado (ej. CODIGO, NOMBRE, VALOR)
    const firstUpper = (parts[0] ?? "").toUpperCase();
    const secondUpper = (parts[1] ?? "").toUpperCase();
    if (HEADER_KEYWORDS.has(firstUpper) || HEADER_KEYWORDS.has(secondUpper)) {
      continue;
    }

    const col0 = parts[0] ?? "";
    const col1 = parts[1] ?? "";
    const col2 = parts[2] ?? "";
    const col3 = parts[3] ?? "";

    let referenceCode = "";
    let name = "";

    if (mode === "code_first") {
      referenceCode = col0;
      name = col1;
    } else if (mode === "name_first") {
      name = col0;
      referenceCode = col1;
    } else {
      // Auto-detección por fila
      if (looksLikeCode(col0) && !looksLikeCode(col1)) {
        referenceCode = col0;
        name = col1;
      } else if (looksLikeCode(col1) && !looksLikeCode(col0)) {
        name = col0;
        referenceCode = col1;
      } else {
        // Por defecto en CSV de Evolution: CODIGO, NOMBRE, VALOR
        referenceCode = col0;
        name = col1;
      }
    }

    const baseSalePrice = parseMoneyNumber(col2);
    const productionCost = parseMoneyNumber(col3);

    rows.push({
      id: `row-${i}-${Math.random().toString(36).slice(2, 7)}`,
      referenceCode: referenceCode.trim().toUpperCase(),
      name: name.trim().replace(/\s+/g, " "),
      baseSalePrice,
      productionCost,
    });
  }

  return rows;
}

export function ProductBulkUploadPage() {
  const { token, user } = useAuth();
  const showCost = user?.roles.includes("super_admin") ?? false;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inputText, setInputText] = useState("");
  const [columnOrder, setColumnOrder] = useState<ColumnOrderMode>("auto");
  const [rows, setRows] = useState<RawRow[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [tableSearch, setTableSearch] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());

  // Opciones de importación
  const [hasBarcode, setHasBarcode] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    duplicates: number;
  } | null>(null);

  const loadExistingCodes = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchProductCatalog(token, { limit: 5000, includeInactive: true });
      const codes = new Set<string>();
      for (const item of data.items) {
        if (item.referenceCode) codes.add(item.referenceCode.trim().toUpperCase());
      }
      setExistingCodes(codes);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    void loadExistingCodes();
  }, [loadExistingCodes]);

  // Parseo reactivo cuando cambia el texto o el modo de columnas
  useEffect(() => {
    if (!inputText.trim()) {
      setRows([]);
      return;
    }
    const parsed = parseSmartBulkText(inputText, columnOrder);
    setRows(parsed);
  }, [inputText, columnOrder]);

  // Validación en tiempo real (incluyendo duplicados dentro del mismo listado y contra el catálogo existente)
  const validatedRows = useMemo<ValidatedRow[]>(() => {
    const codeCounts = new Map<string, number>();
    for (const r of rows) {
      const code = r.referenceCode.trim().toUpperCase();
      if (code) {
        codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
      }
    }

    return rows.map((r) => {
      const code = r.referenceCode.trim().toUpperCase();
      const name = r.name.trim();
      const count = code ? (codeCounts.get(code) ?? 0) : 0;
      const isDuplicateInBatch = count > 1;
      const existsInCatalog = Boolean(code && existingCodes.has(code));
      const isDuplicate = isDuplicateInBatch || existsInCatalog;

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!code) errors.push("Falta código");
      if (!name) errors.push("Falta nombre");
      if (isDuplicateInBatch) {
        warnings.push(`Código repetido ${count} veces en el cargue (se actualizará)`);
      } else if (existsInCatalog) {
        warnings.push("Código ya existe en el catálogo (se actualizará)");
      }
      if (r.baseSalePrice <= 0) {
        warnings.push("Precio en $0 (materia prima / sin valor)");
      }

      return {
        ...r,
        referenceCode: code,
        name,
        isValid: errors.length === 0,
        hasWarning: errors.length === 0 && warnings.length > 0,
        errorMsg: errors.length > 0 ? errors.join(" · ") : undefined,
        warningMsg: warnings.length > 0 ? warnings.join(" · ") : undefined,
        isDuplicateInBatch,
        existsInCatalog,
        isDuplicate,
      };
    });
  }, [rows, existingCodes]);

  const stats = useMemo(() => {
    let valid = 0;
    let duplicates = 0;
    let warnings = 0;
    let errors = 0;
    for (const r of validatedRows) {
      if (!r.isValid) errors++;
      else {
        valid++;
        if (r.isDuplicate) duplicates++;
        if (r.baseSalePrice <= 0) warnings++;
      }
    }
    return {
      total: validatedRows.length,
      valid,
      duplicates,
      warnings,
      errors,
    };
  }, [validatedRows]);

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return validatedRows.filter((r) => {
      if (filterTab === "valid" && !r.isValid) return false;
      if (filterTab === "duplicates" && !r.isDuplicate) return false;
      if (filterTab === "warnings" && r.baseSalePrice > 0) return false;
      if (filterTab === "errors" && r.isValid) return false;
      if (q) {
        const matchCode = r.referenceCode.toLowerCase().includes(q);
        const matchName = r.name.toLowerCase().includes(q);
        if (!matchCode && !matchName) return false;
      }
      return true;
    });
  }, [validatedRows, filterTab, tableSearch]);

  function handleUpdateRow(id: string, patch: Partial<RawRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function handleDeleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function handleAddEmptyRow() {
    const newRow: RawRow = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      referenceCode: "EVOLUTION",
      name: "",
      baseSalePrice: 0,
      productionCost: 0,
    };
    setRows((prev) => [newRow, ...prev]);
    setFilterTab("all");
  }

  function handleDeduplicateBatch() {
    // Si hay códigos repetidos como EVOLUTIONBC07, conserva ambos numerando el segundo o dejando el último
    const seen = new Map<string, number>();
    setRows((prev) =>
      prev.map((r) => {
        const code = r.referenceCode.trim().toUpperCase();
        if (!code) return r;
        const count = seen.get(code) ?? 0;
        seen.set(code, count + 1);
        if (count === 0) return r;
        return {
          ...r,
          referenceCode: `${code}-${count + 1}`,
        };
      })
    );
  }

  function handleLoadPresetCatalog() {
    setError(null);
    setResult(null);
    setInputText(EVOLUTION_PRESET_CATALOG_CSV);
    setFilterTab("all");
  }

  function handleFileRead(file: File) {
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = typeof ev.target?.result === "string" ? ev.target.result : "";
      setInputText(content);
      setFilterTab("all");
    };
    reader.onerror = () => {
      setError("No se pudo leer el archivo seleccionado.");
    };
    reader.readAsText(file, "utf-8");
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileRead(file);
  }

  async function handleImport() {
    if (!token) return;
    const validOnes = validatedRows.filter((p) => p.isValid);
    if (validOnes.length === 0) {
      setError("No hay productos válidos para importar.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await bulkImportProducts(
        token,
        validOnes.map((p) => ({
          name: p.name,
          referenceCode: p.referenceCode,
          baseSalePrice: p.baseSalePrice,
          productionCost: p.productionCost,
        })),
        {
          updateExisting: true,
          hasBarcode,
        }
      );
      setResult({
        imported: data.imported,
        updated: data.updated ?? 0,
        duplicates: data.duplicates,
      });
      setRows([]);
      setInputText("");
      await loadExistingCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar productos");
    } finally {
      setLoading(false);
    }
  }

  const duplicateCodesCount = useMemo(
    () => validatedRows.filter((r) => r.isDuplicateInBatch).length,
    [validatedRows]
  );

  return (
    <div className="inv-page">
      <ProductPageHeader
        backTo="/app/productos"
        title="Cargue Masivo de Productos"
        description="Importa catálogos desde Excel, archivos CSV o texto separado por comas con detección inteligente y edición en vivo."
        actions={
          <button
            type="button"
            className="inv-btn inv-btn--primary"
            onClick={handleLoadPresetCatalog}
            title="Cargar el listado de 199 productos Evolution listo para revisar e importar"
          >
            <Sparkles size={17} strokeWidth={2.2} aria-hidden />
            Cargar listado Evolution (199 productos)
          </button>
        }
      />

      <div className="bulk-upload">
        {result && (
          <div className="bulk-upload__banner bulk-upload__banner--success" role="status">
            <CheckCircle2 size={24} className="bulk-upload__banner-icon" style={{ color: "#15803d" }} />
            <div className="bulk-upload__banner-body">
              <strong className="bulk-upload__banner-title">¡Cargue masivo completado con éxito!</strong>
              <span>
                Nuevos creados: <strong>{result.imported}</strong> · Actualizados porque el código era
                igual: <strong>{result.updated}</strong>.
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bulk-upload__banner bulk-upload__banner--error" role="alert">
            <AlertCircle size={22} className="bulk-upload__banner-icon" style={{ color: "#b91c1c" }} />
            <div className="bulk-upload__banner-body">
              <strong className="bulk-upload__banner-title">No se pudo completar la operación</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Barra de resumen interactiva */}
        <div className="bulk-upload__stats-bar" role="tablist" aria-label="Filtrar filas por estado">
          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "all"}
            className={`bulk-upload__stat ${filterTab === "all" ? "is-active" : ""}`}
            onClick={() => setFilterTab("all")}
          >
            <div className="bulk-upload__stat-icon bulk-upload__stat-icon--total">
              <Layers size={20} />
            </div>
            <div className="bulk-upload__stat-info">
              <span className="bulk-upload__stat-value">{stats.total}</span>
              <span className="bulk-upload__stat-label">Total detectados</span>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "valid"}
            className={`bulk-upload__stat ${filterTab === "valid" ? "is-active" : ""}`}
            onClick={() => setFilterTab("valid")}
          >
            <div className="bulk-upload__stat-icon bulk-upload__stat-icon--ok">
              <CheckCircle2 size={20} />
            </div>
            <div className="bulk-upload__stat-info">
              <span className="bulk-upload__stat-value">{stats.valid}</span>
              <span className="bulk-upload__stat-label">Listos para importar</span>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "duplicates"}
            className={`bulk-upload__stat ${filterTab === "duplicates" ? "is-active" : ""}`}
            onClick={() => setFilterTab("duplicates")}
          >
            <div className="bulk-upload__stat-icon bulk-upload__stat-icon--warn">
              <Copy size={20} />
            </div>
            <div className="bulk-upload__stat-info">
              <span className="bulk-upload__stat-value">{stats.duplicates}</span>
              <span className="bulk-upload__stat-label">Duplicados en el cargue</span>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "warnings"}
            className={`bulk-upload__stat ${filterTab === "warnings" ? "is-active" : ""}`}
            onClick={() => setFilterTab("warnings")}
          >
            <div className="bulk-upload__stat-icon bulk-upload__stat-icon--warn">
              <AlertTriangle size={20} />
            </div>
            <div className="bulk-upload__stat-info">
              <span className="bulk-upload__stat-value">{stats.warnings}</span>
              <span className="bulk-upload__stat-label">Avisos (precio $0)</span>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "errors"}
            className={`bulk-upload__stat ${filterTab === "errors" ? "is-active" : ""}`}
            onClick={() => setFilterTab("errors")}
          >
            <div className="bulk-upload__stat-icon bulk-upload__stat-icon--err">
              <AlertCircle size={20} />
            </div>
            <div className="bulk-upload__stat-info">
              <span className="bulk-upload__stat-value">{stats.errors}</span>
              <span className="bulk-upload__stat-label">Con errores (incompletos)</span>
            </div>
          </button>
        </div>

        <div className="bulk-upload__grid">
          {/* Columna 1: Origen de datos y configuración */}
          <div className="bulk-upload__card">
            <div className="bulk-upload__card-head">
              <h2 className="bulk-upload__card-title">
                <span className="bulk-upload__step-badge">1</span>
                Origen de datos
              </h2>
              <div className="bulk-upload__quick-actions">
                <button
                  type="button"
                  className="inv-btn inv-btn--ghost"
                  style={{ fontSize: "12px", padding: "6px 10px", minHeight: "32px" }}
                  onClick={handleLoadPresetCatalog}
                >
                  <Sparkles size={14} />
                  Cargar listado Evolution
                </button>
                {inputText && (
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    style={{ fontSize: "12px", padding: "6px 10px", minHeight: "32px" }}
                    onClick={() => {
                      setInputText("");
                      setRows([]);
                    }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <div
              className={`bulk-upload__dropzone ${isDragging ? "is-dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={onFileInputChange}
                style={{ display: "none" }}
              />
              <Upload size={22} style={{ color: "var(--accent)" }} />
              <span className="bulk-upload__dropzone-title">
                Sube un archivo .CSV / .TXT o arrástralo aquí
              </span>
              <span className="bulk-upload__dropzone-sub">
                Acepta formato Excel, comas (<code>,CODIGO,NOMBRE,VALOR,</code>), punto y coma o tabulaciones
              </span>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                }}
              >
                <label
                  htmlFor="bulk-raw-textarea"
                  style={{ fontSize: "12.5px", fontWeight: 700, color: "#334155" }}
                >
                  O pega el texto directamente:
                </label>
                <select
                  value={columnOrder}
                  onChange={(e) => setColumnOrder(e.target.value as ColumnOrderMode)}
                  style={{
                    fontSize: "12px",
                    padding: "4px 8px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    fontWeight: 600,
                    color: "#334155",
                  }}
                  aria-label="Orden de columnas"
                >
                  <option value="auto">Columnas: Auto-detectar</option>
                  <option value="code_first">Orden: Código → Nombre → Valor</option>
                  <option value="name_first">Orden: Nombre → Código → Valor</option>
                </select>
              </div>

              <textarea
                id="bulk-raw-textarea"
                className="bulk-upload__textarea"
                rows={10}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`,CODIGO,NOMBRE,VALOR,\n,EVOLUTIONS01,SENSAFLEX 140X17,202000,\n,EVOLUTIONS02,SENSAFLEX 120X17,182000,`}
              />
            </div>

            {/* Opciones de importación */}
            <div className="bulk-upload__config-box">
              <div className="field" style={{ margin: 0 }}>
                <span>¿Tiene código de barras? *</span>
                <div
                  role="radiogroup"
                  aria-label="¿Tiene código de barras?"
                  className="inv-form__radio-group"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={hasBarcode}
                    className={`inv-btn ${hasBarcode ? "inv-btn--primary" : "inv-btn--ghost"}`}
                    onClick={() => setHasBarcode(true)}
                  >
                    Sí — se genera al guardar (solo pistola en salida)
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!hasBarcode}
                    className={`inv-btn ${!hasBarcode ? "inv-btn--primary" : "inv-btn--ghost"}`}
                    onClick={() => setHasBarcode(false)}
                  >
                    No — buscable en el listado de salida
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Columna 2: Tabla interactiva de vista previa y edición */}
          <div className="bulk-upload__card">
            <div className="bulk-upload__card-head">
              <h2 className="bulk-upload__card-title">
                <span className="bulk-upload__step-badge">2</span>
                Vista previa y edición en vivo ({filteredRows.length})
              </h2>

              <div className="bulk-upload__quick-actions">
                {duplicateCodesCount > 0 && (
                  <button
                    type="button"
                    className="inv-btn inv-btn--ghost"
                    style={{
                      fontSize: "12px",
                      padding: "6px 10px",
                      minHeight: "32px",
                      borderColor: "#f59e0b",
                      color: "#b45309",
                      background: "#fffbeb",
                    }}
                    onClick={handleDeduplicateBatch}
                    title="Agrega un sufijo (-2) a los códigos repetidos en la lista para crear ambos por separado"
                  >
                    Numerar {duplicateCodesCount} repetidos (-2)
                  </button>
                )}
                <button
                  type="button"
                  className="inv-btn inv-btn--ghost"
                  style={{ fontSize: "12px", padding: "6px 10px", minHeight: "32px" }}
                  onClick={handleAddEmptyRow}
                >
                  <Plus size={14} />
                  Fila manual
                </button>
              </div>
            </div>

            {validatedRows.length === 0 ? (
              <div className="bulk-upload__empty">
                <FileSpreadsheet size={38} strokeWidth={1.6} style={{ color: "#94a3b8" }} />
                <div>
                  <strong style={{ display: "block", color: "#334155", fontSize: "14px" }}>
                    No hay productos en la vista previa
                  </strong>
                  <span style={{ fontSize: "12.5px" }}>
                    Pega tus líneas a la izquierda, sube un archivo CSV o usa el botón{" "}
                    <strong>“Cargar listado Evolution”</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  className="inv-btn inv-btn--primary"
                  style={{ marginTop: "6px" }}
                  onClick={handleLoadPresetCatalog}
                >
                  <Sparkles size={16} />
                  Cargar los 199 productos Evolution ahora
                </button>
              </div>
            ) : (
              <>
                <div className="bulk-upload__table-toolbar">
                  <div className="bulk-upload__table-search">
                    <Search size={15} style={{ color: "#64748b", flexShrink: 0 }} />
                    <input
                      type="search"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Filtrar en la tabla por código o nombre…"
                    />
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Haz clic en cualquier celda para editarla antes de importar
                  </span>
                </div>

                <div className="bulk-upload__table-wrap">
                  <table className="bulk-upload__table">
                    <thead>
                      <tr>
                        <th style={{ width: "36px" }}>#</th>
                        <th>Código</th>
                        <th>Nombre del producto</th>
                        <th style={{ textAlign: "right" }}>Precio Venta</th>
                        {showCost && <th style={{ textAlign: "right" }}>Costo Prod.</th>}
                        <th>Estado</th>
                        <th style={{ width: "36px" }} aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, idx) => (
                        <tr
                          key={row.id}
                          className={
                            !row.isValid
                              ? "is-invalid"
                              : row.hasWarning
                                ? "is-warning"
                                : undefined
                          }
                        >
                          <td data-label="#" style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 600 }}>
                            {idx + 1}
                          </td>
                          <td data-label="Código">
                            <input
                              className="bulk-upload__cell-input bulk-upload__cell-input--code"
                              value={row.referenceCode}
                              onChange={(e) =>
                                handleUpdateRow(row.id, {
                                  referenceCode: e.target.value.toUpperCase(),
                                })
                              }
                              placeholder="CÓDIGO"
                            />
                          </td>
                          <td data-label="Producto">
                            <input
                              className="bulk-upload__cell-input"
                              value={row.name}
                              onChange={(e) =>
                                handleUpdateRow(row.id, { name: e.target.value })
                              }
                              placeholder="Nombre del producto"
                            />
                          </td>
                          <td data-label="Precio Venta">
                            <input
                              type="number"
                              min={0}
                              step={500}
                              className="bulk-upload__cell-input bulk-upload__cell-input--price"
                              value={row.baseSalePrice || ""}
                              onChange={(e) =>
                                handleUpdateRow(row.id, {
                                  baseSalePrice: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              placeholder="0"
                            />
                          </td>
                          {showCost && (
                            <td data-label="Costo Prod.">
                              <input
                                type="number"
                                min={0}
                                step={500}
                                className="bulk-upload__cell-input bulk-upload__cell-input--price"
                                value={row.productionCost || ""}
                                onChange={(e) =>
                                  handleUpdateRow(row.id, {
                                    productionCost: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                placeholder="0"
                              />
                            </td>
                          )}
                          <td data-label="Estado">
                            {!row.isValid ? (
                              <span
                                className="bulk-upload__badge bulk-upload__badge--err"
                                title={row.errorMsg}
                              >
                                <AlertCircle size={12} />
                                {row.errorMsg}
                              </span>
                            ) : row.isDuplicate ? (
                              <span
                                className="bulk-upload__badge bulk-upload__badge--warn"
                                title={row.warningMsg}
                              >
                                <Copy size={12} />
                                {row.isDuplicateInBatch
                                  ? "Duplicado en lista (se actualizará)"
                                  : "Código existente (se actualizará)"}
                              </span>
                            ) : row.hasWarning ? (
                              <span
                                className="bulk-upload__badge bulk-upload__badge--warn"
                                title={row.warningMsg}
                              >
                                <AlertTriangle size={12} />
                                Precio $0
                              </span>
                            ) : (
                              <span className="bulk-upload__badge bulk-upload__badge--ok">
                                <CheckCircle2 size={12} />
                                Listo
                              </span>
                            )}
                          </td>
                          <td data-label="Quitar">
                            <button
                              type="button"
                              className="bulk-upload__row-del"
                              onClick={() => handleDeleteRow(row.id)}
                              title="Quitar fila"
                              aria-label={`Quitar ${row.name || row.referenceCode}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    paddingTop: "6px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#475569" }}>
                    Se importarán{" "}
                    <strong style={{ color: "#0f766e" }}>{stats.valid}</strong> productos válidos
                    {stats.duplicates > 0 ? (
                      <>
                        {" "}
                        · <strong style={{ color: "#b45309" }}>{stats.duplicates}</strong> con código
                        duplicado se actualizarán automáticamente
                      </>
                    ) : null}
                    .
                  </div>

                  <button
                    type="button"
                    className="inv-btn inv-btn--primary"
                    style={{ minHeight: "44px", padding: "0 22px", fontSize: "14px" }}
                    disabled={loading || stats.valid === 0}
                    onClick={() => void handleImport()}
                  >
                    {loading
                      ? "Importando catálogo…"
                      : `Confirmar e importar ${stats.valid} productos`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
