import type pg from "pg";
import { generateProductBarcode } from "../../lib/barcode.js";
import { canSeeProductionCost } from "../../lib/inventory-permissions.js";
import type { AuthContext } from "../auth-context.js";
import type { ProductDetail, StockSignal } from "./types.js";

type ProductRow = {
  id: string;
  reference_code: string;
  sku: string | null;
  internal_code: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  unit: string;
  status: string;
  category_id: string | null;
  category_name: string | null;
  base_sale_price: string;
  production_cost: string;
  margin_percent: string | null;
  barcode: string | null;
  quantity_on_hand: string | null;
  min_stock_level: string | null;
  critical_stock_level: string | null;
  stock_signal: StockSignal | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateProductInput = {
  name: string;
  referenceCode: string;
  sku?: string | null;
  internalCode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  brand?: string | null;
  unit?: string;
  status?: string;
  baseSalePrice: number;
  productionCost?: number;
  minStockLevel?: number;
  criticalStockLevel?: number;
  initialStock?: number;
  barcode?: string | null;
  /** Si es false, el producto queda sin código de barras (solo buscable por clic en salida). */
  hasBarcode?: boolean;
  imageUrls?: string[];
  warehousePrices?: { warehouseId: string; salePrice: number | null }[];
};

export type UpdateProductInput = Partial<
  Omit<CreateProductInput, "referenceCode" | "initialStock">
> & {
  referenceCode?: string;
  isActive?: boolean;
};

function calcMargin(sale: number, cost: number): number | null {
  if (sale <= 0) return null;
  return Math.round(((sale - cost) / sale) * 10000) / 100;
}

async function upsertWarehouseSettings(
  client: pg.PoolClient,
  warehouseId: string,
  productId: string,
  minStock: number,
  criticalStock: number
) {
  await client.query(
    `
    INSERT INTO warehouse_product_settings (warehouse_id, product_id, min_stock_level, critical_stock_level)
    VALUES ($1::uuid, $2::uuid, $3, $4)
    ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
      min_stock_level = EXCLUDED.min_stock_level,
      critical_stock_level = EXCLUDED.critical_stock_level
    `,
    [warehouseId, productId, minStock, criticalStock]
  );
}

async function recordPriceChange(
  client: pg.PoolClient,
  productId: string,
  field: "base_sale_price" | "production_cost",
  oldVal: number | null,
  newVal: number,
  userId: string
) {
  if (oldVal === newVal) return;
  await client.query(
    `
    INSERT INTO product_price_history (product_id, field, old_value, new_value, changed_by)
    VALUES ($1::uuid, $2, $3, $4, $5::uuid)
    `,
    [productId, field, oldVal, newVal, userId]
  );
}

export async function getProductDetail(
  pool: pg.Pool,
  auth: AuthContext,
  warehouseId: string | null,
  productId: string
): Promise<ProductDetail | null> {
  const includeCost = canSeeProductionCost(auth);
  const { rows } = await pool.query<ProductRow>(
    `
    SELECT
      p.id::text,
      p.reference_code,
      p.sku,
      p.internal_code,
      p.name,
      p.description,
      p.brand,
      p.unit,
      p.status,
      p.category_id::text,
      c.name AS category_name,
      p.base_sale_price::text,
      p.production_cost::text,
      p.margin_percent::text,
      p.barcode,
      cs.quantity_on_hand::text,
      cs.min_stock_level::text,
      cs.critical_stock_level::text,
      cs.stock_signal,
      p.is_active,
      p.created_at::text,
      p.updated_at::text
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    LEFT JOIN v_catalog_stock cs
      ON cs.product_id = p.id
      AND ($1::uuid IS NULL OR cs.warehouse_id = $1::uuid)
    WHERE p.id = $2::uuid
    `,
    [warehouseId, productId]
  );
  const row = rows[0];
  if (!row) return null;

  const { rows: images } = await pool.query<{
    id: string;
    url: string;
    thumb_url: string | null;
    variants: Record<string, string> | null;
    is_primary: boolean;
  }>(
    `SELECT id::text, url, thumb_url, variants, is_primary
     FROM product_images WHERE product_id = $1::uuid
     ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
    [productId]
  );

  const qty = row.quantity_on_hand != null ? Number(row.quantity_on_hand) : 0;
  const detail: ProductDetail = {
    id: row.id,
    referenceCode: row.reference_code,
    sku: row.sku,
    internalCode: row.internal_code,
    name: row.name,
    description: row.description,
    brand: row.brand,
    unit: row.unit,
    status: row.status,
    categoryId: row.category_id,
    categoryName: row.category_name,
    baseSalePrice: Number(row.base_sale_price),
    marginPercent: row.margin_percent != null ? Number(row.margin_percent) : null,
    barcode: row.barcode,
    imageUrl: images[0]?.url ?? null,
    quantityOnHand: qty,
    minStockLevel: row.min_stock_level != null ? Number(row.min_stock_level) : 0,
    criticalStockLevel: row.critical_stock_level != null ? Number(row.critical_stock_level) : 0,
    stockSignal: row.stock_signal ?? (qty <= 0 ? "out" : "ok"),
    isActive: row.is_active,
    images: images.map((im) => ({
      id: im.id,
      url: im.url,
      thumbUrl: im.thumb_url,
      variants: im.variants ?? undefined,
      isPrimary: im.is_primary,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  
  const { rows: whPrices } = await pool.query<{
    warehouse_id: string;
    warehouse_name: string;
    warehouse_code: string;
    sale_price: string | null;
  }>(
    `SELECT
       w.id::text AS warehouse_id,
       w.name AS warehouse_name,
       w.code AS warehouse_code,
       wps.sale_price::text AS sale_price
     FROM warehouses w
     LEFT JOIN warehouse_product_settings wps
       ON wps.warehouse_id = w.id AND wps.product_id = $1::uuid
     WHERE w.is_active = true
     ORDER BY w.name`,
    [productId]
  );
  
  detail.warehousePrices = whPrices.map((wp) => ({
    warehouseId: wp.warehouse_id,
    warehouseName: wp.warehouse_name,
    warehouseCode: wp.warehouse_code,
    salePrice: wp.sale_price != null ? Number(wp.sale_price) : null,
  }));

  if (includeCost) detail.productionCost = Number(row.production_cost);
  return detail;
}

async function saveWarehousePrices(
  client: pg.PoolClient,
  productId: string,
  prices: { warehouseId: string; salePrice: number | null }[]
) {
  for (const entry of prices) {
    const salePrice = entry.salePrice != null && Number.isFinite(Number(entry.salePrice)) ? Number(entry.salePrice) : null;
    await client.query(
      `
      INSERT INTO warehouse_product_settings (warehouse_id, product_id, sale_price)
      VALUES ($1::uuid, $2::uuid, $3)
      ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
        sale_price = EXCLUDED.sale_price
      `,
      [entry.warehouseId, productId, salePrice]
    );
  }
}

export async function createProduct(
  pool: pg.Pool,
  auth: AuthContext,
  warehouseId: string | null,
  input: CreateProductInput
): Promise<ProductDetail> {
  const includeCost = canSeeProductionCost(auth);
  const sale = Number(input.baseSalePrice) || 0;
  const cost = includeCost ? Number(input.productionCost ?? 0) : 0;
  const margin = calcMargin(sale, cost);
  const cleanRef = input.referenceCode.trim().toUpperCase();
  const barcode =
    input.hasBarcode === false
      ? null
      : input.barcode?.trim().toUpperCase() || generateProductBarcode(cleanRef);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ id: string }>(
      `
      INSERT INTO products (
        reference_code, sku, internal_code, name, description, category_id,
        brand, unit, status, base_sale_price, production_cost, margin_percent, barcode
      )
      VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id::text
      `,
      [
        cleanRef,
        input.sku?.trim() || null,
        input.internalCode?.trim().toUpperCase() || cleanRef,
        input.name.trim(),
        input.description?.trim() || null,
        input.categoryId || null,
        input.brand?.trim() || null,
        input.unit?.trim() || "und",
        input.status ?? "active",
        sale,
        cost,
        margin,
        barcode,
      ]
    );
    const productId = rows[0]!.id;

    if (warehouseId) {
      const minStock = Number(input.minStockLevel ?? 0);
      const criticalStock = Number(input.criticalStockLevel ?? 0);
      if (minStock > 0 || criticalStock > 0) {
        await upsertWarehouseSettings(client, warehouseId, productId, minStock, criticalStock);
      }

      const initialStock = Number(input.initialStock ?? 0);
      if (initialStock > 0) {
        await client.query(
          `
          INSERT INTO stock_movements (
            warehouse_id, product_id, movement_type, quantity, unit_cost, created_by, notes
          )
          VALUES ($1::uuid, $2::uuid, 'entry_factory', $3, $4, $5::uuid, 'Stock inicial')
          `,
          [warehouseId, productId, initialStock, cost || null, auth.userId]
        );
      }
    }

    const urls = (input.imageUrls ?? []).filter((u) => typeof u === "string" && u.trim());
    for (let idx = 0; idx < urls.length; idx++) {
      await client.query(
        `
        INSERT INTO product_images (product_id, url, is_primary, sort_order)
        VALUES ($1::uuid, $2, $3, $4)
        `,
        [productId, urls[idx]!.trim(), idx === 0, idx]
      );
    }

    if (input.warehousePrices && input.warehousePrices.length > 0) {
      await saveWarehousePrices(client, productId, input.warehousePrices);
    }

    await client.query("COMMIT");

    const detail = await getProductDetail(pool, auth, warehouseId, productId);
    if (!detail) throw new Error("product_create_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateProduct(
  pool: pg.Pool,
  auth: AuthContext,
  productId: string,
  input: UpdateProductInput,
  warehouseId?: string | null
): Promise<ProductDetail | null> {
  const includeCost = canSeeProductionCost(auth);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query<{
      base_sale_price: string;
      production_cost: string;
    }>(
      `SELECT base_sale_price::text, production_cost::text FROM products WHERE id = $1::uuid`,
      [productId]
    );
    if (!existing[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    const setField = (col: string, val: unknown) => {
      sets.push(`${col} = $${i}`);
      vals.push(val);
      i++;
    };

    if (input.referenceCode !== undefined) setField("reference_code", input.referenceCode.trim());
    if (input.sku !== undefined) setField("sku", input.sku?.trim() || null);
    if (input.internalCode !== undefined) setField("internal_code", input.internalCode?.trim() || null);
    if (input.name !== undefined) setField("name", input.name.trim());
    if (input.description !== undefined) setField("description", input.description?.trim() || null);
    if (input.categoryId !== undefined) setField("category_id", input.categoryId || null);
    if (input.brand !== undefined) setField("brand", input.brand?.trim() || null);
    if (input.unit !== undefined) setField("unit", input.unit.trim() || "und");
    if (input.status !== undefined) setField("status", input.status);
    if (input.isActive !== undefined) setField("is_active", input.isActive);
    if (input.barcode !== undefined) setField("barcode", input.barcode?.trim() || null);

    let newSale = Number(existing[0].base_sale_price);
    let newCost = Number(existing[0].production_cost);

    if (input.baseSalePrice !== undefined) {
      newSale = Number(input.baseSalePrice);
      setField("base_sale_price", newSale);
      await recordPriceChange(
        client,
        productId,
        "base_sale_price",
        Number(existing[0].base_sale_price),
        newSale,
        auth.userId
      );
    }

    if (includeCost && input.productionCost !== undefined) {
      newCost = Number(input.productionCost);
      setField("production_cost", newCost);
      await recordPriceChange(
        client,
        productId,
        "production_cost",
        Number(existing[0].production_cost),
        newCost,
        auth.userId
      );
    }

    if (input.baseSalePrice !== undefined || (includeCost && input.productionCost !== undefined)) {
      setField("margin_percent", calcMargin(newSale, newCost));
    }

    if (sets.length > 0) {
      sets.push("updated_at = now()");
      vals.push(productId);
      await client.query(
        `UPDATE products SET ${sets.join(", ")} WHERE id = $${i}::uuid`,
        vals
      );
    }

    if (
      warehouseId &&
      (input.minStockLevel !== undefined || input.criticalStockLevel !== undefined)
    ) {
      const minStock = Number(input.minStockLevel ?? 0);
      const criticalStock = Number(input.criticalStockLevel ?? 0);
      await upsertWarehouseSettings(client, warehouseId, productId, minStock, criticalStock);
    }

    if (input.warehousePrices && input.warehousePrices.length > 0) {
      await saveWarehousePrices(client, productId, input.warehousePrices);
    }

    await client.query("COMMIT");
    return getProductDetail(pool, auth, warehouseId ?? null, productId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listCategories(pool: pg.Pool) {
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT id::text, name FROM product_categories ORDER BY name`
  );
  return rows;
}

export async function createCategory(pool: pg.Pool, name: string) {
  const { rows } = await pool.query<{ id: string; name: string }>(
    `INSERT INTO product_categories (name) VALUES ($1) RETURNING id::text, name`,
    [name.trim()]
  );
  return rows[0]!;
}
