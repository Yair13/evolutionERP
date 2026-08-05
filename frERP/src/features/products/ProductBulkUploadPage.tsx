import { useState } from "react";
import { CheckCircle, AlertCircle, Grid } from "lucide-react";
import { bulkImportProducts } from "../../api/inventory.js";
import { ProductPageHeader } from "../../components/products/ProductPageHeader.js";
import { useAuth } from "../../context/AuthContext.js";

type ParsedProduct = {
  name: string;
  referenceCode: string;
  baseSalePrice: number;
  productionCost: number;
  isValid: boolean;
  error?: string;
};

export function ProductBulkUploadPage() {
  const { token } = useAuth();
  const [inputText, setInputText] = useState("");
  const [parsed, setParsed] = useState<ParsedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null);

  function handleParse() {
    setError(null);
    setResult(null);
    if (!inputText.trim()) {
      setParsed([]);
      return;
    }
    const lines = inputText.split(/\r?\n/);
    const parsedList: ParsedProduct[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;
      // Separación por tabulador, punto y coma o coma
      let parts = line.split("\t");
      if (parts.length < 2) parts = line.split(";");
      if (parts.length < 2) parts = line.split(",");

      const name = parts[0]?.trim() || "";
      const rawCode = parts[1]?.trim() || "";
      const rawPrice = parts[2]?.trim() || "0";
      const rawCost = parts[3]?.trim() || "0";

      const baseSalePrice = Number(rawPrice.replace(/[^0-9.]/g, "")) || 0;
      const productionCost = Number(rawCost.replace(/[^0-9.]/g, "")) || 0;

      const isValid = Boolean(name && rawCode);
      let lineError = "";
      if (!name) lineError = "Falta Nombre";
      else if (!rawCode) lineError = "Falta Código";

      parsedList.push({
        name,
        referenceCode: rawCode.toUpperCase(),
        baseSalePrice,
        productionCost,
        isValid,
        error: lineError || undefined,
      });
    }
    setParsed(parsedList);
  }

  async function handleImport() {
    if (!token || parsed.length === 0) return;
    const validOnes = parsed.filter((p) => p.isValid);
    if (validOnes.length === 0) {
      setError("No hay productos válidos para importar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await bulkImportProducts(token, validOnes);
      setResult({ imported: data.imported, duplicates: data.duplicates });
      setParsed([]);
      setInputText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar productos");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inv-page">
      <ProductPageHeader
        backTo="/app/productos"
        title="Cargue Masivo de Productos"
        description="Pega líneas separadas por Tabulaciones (copiado de Excel), Comas o Punto y coma"
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "20px" }}>
        {result && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "16px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
            <CheckCircle size={24} style={{ color: "#15803d" }} />
            <div>
              <strong style={{ display: "block" }}>¡Importación Finalizada!</strong>
              <span>Se importaron con éxito <strong>{result.imported}</strong> productos. Se omitieron <strong>{result.duplicates}</strong> códigos duplicados.</span>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "16px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle size={24} style={{ color: "#b91c1c" }} />
            <span>{error}</span>
          </div>
        )}

        <div className="bulk-upload__grid">
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: "bold", marginBottom: "8px", color: "#334155" }}>1. Pega los datos de tus productos</h3>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px" }}>
              Formato esperado:<br />
              <code>Nombre [Tab] Código [Tab] Precio Venta [Tab] Costo Producción</code><br />
              Ejemplo:<br />
              <code style={{ background: "#f1f5f9", padding: "2px 4px", borderRadius: "4px" }}>Colchón Premium Espuma	EVOLUTION-001	950000	320000</code>
            </p>
            <textarea
              rows={12}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Nombre producto 1	CÓDIGO1	PrecioVenta1	CostoProducción1&#10;Nombre producto 2	CÓDIGO2	PrecioVenta2	CostoProducción2"
              style={{ width: "100%", padding: "12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "13px", fontFamily: "monospace" }}
            />
            <button
              type="button"
              className="inv-btn inv-btn--primary"
              style={{ marginTop: "12px", width: "100%" }}
              onClick={handleParse}
            >
              Procesar y verificar líneas
            </button>
          </div>

          <div>
            <h3 style={{ fontSize: "15px", fontWeight: "bold", marginBottom: "8px", color: "#334155" }}>2. Vista previa y confirmación</h3>
            {parsed.length === 0 ? (
              <div style={{ border: "2px dashed #e2e8f0", borderRadius: "8px", height: "300px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#94a3b8" }}>
                <Grid size={32} />
                <span style={{ fontSize: "13px", marginTop: "8px" }}>Procesa las líneas para previsualizar los productos</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
                <div style={{ maxHeight: "300px", overflow: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                  <table style={{ width: "100%", minWidth: "420px", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #cbd5e1" }}>
                        <th style={{ padding: "8px 12px" }}>Nombre</th>
                        <th style={{ padding: "8px 12px" }}>Código</th>
                        <th style={{ padding: "8px 12px" }}>Precio</th>
                        <th style={{ padding: "8px 12px" }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 12px", fontWeight: "bold" }}>{p.name || "—"}</td>
                          <td style={{ padding: "8px 12px" }}><code>{p.referenceCode || "—"}</code></td>
                          <td style={{ padding: "8px 12px" }}>${p.baseSalePrice.toLocaleString()}</td>
                          <td style={{ padding: "8px 12px" }}>
                            {p.isValid ? (
                              <span style={{ color: "#166534", background: "#dcfce7", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>OK</span>
                            ) : (
                              <span style={{ color: "#991b1b", background: "#fee2e2", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }} title={p.error}>Error</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: "16px" }}>
                  <div style={{ fontSize: "13px", marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
                    <span>Total detectado: <strong>{parsed.length}</strong></span>
                    <span>Válidos: <strong style={{ color: "#15803d" }}>{parsed.filter((p) => p.isValid).length}</strong></span>
                  </div>
                  <button
                    type="button"
                    className="inv-btn inv-btn--primary"
                    style={{ width: "100%", height: "42px", display: "flex", justifyContent: "center", alignItems: "center" }}
                    disabled={loading || parsed.filter((p) => p.isValid).length === 0}
                    onClick={handleImport}
                  >
                    {loading ? "Importando productos..." : "Confirmar e importar productos válidos"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
