import type pg from "pg";
import {
  SQL_PICK_CATALOG_IMAGE,
  sqlProductImageSubselect,
} from "../../lib/image-variants.js";
import type { AuthContext } from "../auth-context.js";

export type CountKind = "initial" | "audit";
export type CountStatus = "open" | "completed" | "cancelled";

export type InventoryCountLineView = {
  id: string;
  productId: string;
  productName: string;
  referenceCode: string;
  barcode: string | null;
  imageUrl: string | null;
  unit: string;
  expectedQuantity: number;
  countedQuantity: number;
  difference: number;
};

export type InventoryCountSummary = {
  id: string;
  warehouseId: string;
  warehouseName: string | null;
  warehouseCode: string | null;
  status: CountStatus;
  countKind: CountKind;
  notes: string | null;
  invoiceNumber: string | null;
  documentId: string | null;
  createdAt: string;
  completedAt: string | null;
  createdByName: string | null;
  lineCount: number;
  matchedCount: number;
  shortCount: number;
  overCount: number;
  pendingCount: number;
  expectedTotal: number;
  countedTotal: number;
};

export type InventoryCountDetail = InventoryCountSummary & {
  lines: InventoryCountLineView[];
};

function warehouseScopeSql(
  auth: AuthContext,
  warehouseId: string | null | undefined,
  alias: string,
  params: unknown[]
): string {
  if (warehouseId) {
    params.push(warehouseId);
    return `${alias}.warehouse_id = $${params.length}::uuid`;
  }
  if (auth.warehouseIds === null) return "TRUE";
  if (auth.warehouseIds.length === 0) return "FALSE";
  params.push(auth.warehouseIds);
  return `${alias}.warehouse_id = ANY($${params.length}::uuid[])`;
}

function warehouseCodePrefix(code: string | undefined): string {
  const raw = (code ?? "SED").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (raw.slice(0, 4) || "SED");
}

async function nextCountInvoiceNumber(
  client: pg.PoolClient,
  warehouseId: string
): Promise<string> {
  const { rows: wh } = await client.query<{ code: string }>(
    `SELECT code FROM warehouses WHERE id = $1::uuid`,
    [warehouseId]
  );
  const prefix = warehouseCodePrefix(wh[0]?.code);
  const { rows: seq } = await client.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM inventory_counts
    WHERE warehouse_id = $1::uuid AND invoice_number IS NOT NULL
    `,
    [warehouseId]
  );
  const num = Number(seq[0]?.n ?? 0) + 1;
  return `CNT-${prefix}-${num}`;
}

function mapSummary(row: {
  id: string;
  warehouse_id: string;
  warehouse_name: string | null;
  warehouse_code: string | null;
  status: string;
  count_kind: string;
  notes: string | null;
  invoice_number: string | null;
  document_id: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
  created_by_name: string | null;
  line_count: string | number;
  matched_count: string | number;
  short_count: string | number;
  over_count: string | number;
  pending_count: string | number;
  expected_total: string | number;
  counted_total: string | number;
}): InventoryCountSummary {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    warehouseCode: row.warehouse_code,
    status: row.status as CountStatus,
    countKind: row.count_kind as CountKind,
    notes: row.notes,
    invoiceNumber: row.invoice_number,
    documentId: row.document_id,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
    completedAt: row.completed_at
      ? typeof row.completed_at === "string"
        ? row.completed_at
        : row.completed_at.toISOString()
      : null,
    createdByName: row.created_by_name,
    lineCount: Number(row.line_count) || 0,
    matchedCount: Number(row.matched_count) || 0,
    shortCount: Number(row.short_count) || 0,
    overCount: Number(row.over_count) || 0,
    pendingCount: Number(row.pending_count) || 0,
    expectedTotal: Number(row.expected_total) || 0,
    countedTotal: Number(row.counted_total) || 0,
  };
}

const SUMMARY_SELECT = `
  c.id::text,
  c.warehouse_id::text,
  w.name AS warehouse_name,
  w.code AS warehouse_code,
  c.status,
  c.count_kind,
  c.notes,
  c.invoice_number,
  c.document_id::text,
  c.created_at,
  c.completed_at,
  u.full_name AS created_by_name,
  COUNT(l.id)::text AS line_count,
  COUNT(*) FILTER (
    WHERE l.id IS NOT NULL
      AND l.counted_quantity = l.expected_quantity
      AND (l.expected_quantity > 0 OR l.counted_quantity > 0)
  )::text AS matched_count,
  COUNT(*) FILTER (
    WHERE l.id IS NOT NULL AND l.counted_quantity < l.expected_quantity
  )::text AS short_count,
  COUNT(*) FILTER (
    WHERE l.id IS NOT NULL AND l.counted_quantity > l.expected_quantity
  )::text AS over_count,
  COUNT(*) FILTER (
    WHERE l.id IS NOT NULL
      AND l.counted_quantity = 0
      AND l.expected_quantity > 0
  )::text AS pending_count,
  COALESCE(SUM(l.expected_quantity), 0)::text AS expected_total,
  COALESCE(SUM(l.counted_quantity), 0)::text AS counted_total
`;

export async function listCounts(
  pool: pg.Pool,
  auth: AuthContext,
  opts?: { warehouseId?: string | null; status?: CountStatus; limit?: number; offset?: number }
): Promise<{ items: InventoryCountSummary[]; total: number }> {
  const params: unknown[] = [];
  const whFilter = warehouseScopeSql(auth, opts?.warehouseId, "c", params);
  let statusFilter = "";
  if (opts?.status) {
    params.push(opts.status);
    statusFilter = ` AND c.status = $${params.length}`;
  }
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const countParams = [...params];
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;
  const { rows: totalRows } = await pool.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM inventory_counts c
    WHERE (${whFilter})${statusFilter}
    `,
    countParams
  );

  const { rows } = await pool.query(
    `
    SELECT ${SUMMARY_SELECT}
    FROM inventory_counts c
    JOIN warehouses w ON w.id = c.warehouse_id
    LEFT JOIN users u ON u.id = c.created_by
    LEFT JOIN inventory_count_lines l ON l.count_id = c.id
    WHERE (${whFilter})${statusFilter}
    GROUP BY c.id, w.name, w.code, u.full_name
    ORDER BY c.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    params
  );

  return {
    items: rows.map((r) => mapSummary(r as Parameters<typeof mapSummary>[0])),
    total: Number(totalRows[0]?.n ?? 0),
  };
}

export async function getOpenCount(
  pool: pg.Pool,
  auth: AuthContext,
  warehouseId: string
): Promise<InventoryCountDetail | null> {
  const params: unknown[] = [];
  const whFilter = warehouseScopeSql(auth, warehouseId, "c", params);
  const { rows } = await pool.query<{ id: string }>(
    `
    SELECT c.id::text
    FROM inventory_counts c
    WHERE c.status = 'open' AND (${whFilter})
    LIMIT 1
    `,
    params
  );
  const id = rows[0]?.id;
  if (!id) return null;
  return getCount(pool, auth, id, warehouseId);
}

export async function getCount(
  pool: pg.Pool,
  auth: AuthContext,
  countId: string,
  warehouseId?: string | null
): Promise<InventoryCountDetail | null> {
  const params: unknown[] = [countId];
  const whFilter = warehouseScopeSql(auth, warehouseId, "c", params);
  const { rows } = await pool.query(
    `
    SELECT ${SUMMARY_SELECT}
    FROM inventory_counts c
    JOIN warehouses w ON w.id = c.warehouse_id
    LEFT JOIN users u ON u.id = c.created_by
    LEFT JOIN inventory_count_lines l ON l.count_id = c.id
    WHERE c.id = $1::uuid AND (${whFilter})
    GROUP BY c.id, w.name, w.code, u.full_name
    `,
    params
  );
  const head = rows[0];
  if (!head) return null;

  const summary = mapSummary(head as Parameters<typeof mapSummary>[0]);
  const imgSql = sqlProductImageSubselect(SQL_PICK_CATALOG_IMAGE);

  const { rows: lineRows } = await pool.query<{
    id: string;
    product_id: string;
    product_name: string;
    reference_code: string;
    barcode: string | null;
    image_url: string | null;
    unit: string;
    expected_quantity: string;
    counted_quantity: string;
  }>(
    `
    SELECT
      l.id::text,
      l.product_id::text,
      p.name AS product_name,
      p.reference_code,
      p.barcode,
      ${imgSql} AS image_url,
      p.unit,
      l.expected_quantity::text,
      l.counted_quantity::text
    FROM inventory_count_lines l
    JOIN products p ON p.id = l.product_id
    WHERE l.count_id = $1::uuid
    ORDER BY
      CASE
        WHEN l.counted_quantity = 0 AND l.expected_quantity > 0 THEN 0
        WHEN l.counted_quantity <> l.expected_quantity THEN 1
        ELSE 2
      END,
      p.reference_code ASC,
      p.name ASC
    `,
    [countId]
  );

  return {
    ...summary,
    lines: lineRows.map((l) => {
      const expected = Number(l.expected_quantity) || 0;
      const counted = Number(l.counted_quantity) || 0;
      return {
        id: l.id,
        productId: l.product_id,
        productName: l.product_name,
        referenceCode: l.reference_code,
        barcode: l.barcode,
        imageUrl: l.image_url,
        unit: l.unit,
        expectedQuantity: expected,
        countedQuantity: counted,
        difference: counted - expected,
      };
    }),
  };
}

export async function openCount(
  pool: pg.Pool,
  auth: AuthContext,
  warehouseId: string,
  countKind: CountKind,
  notes?: string | null
): Promise<InventoryCountDetail> {
  if (countKind === "initial" && !auth.hasAdminAccess) {
    throw Object.assign(new Error("initial_count_requires_admin"), {
      code: "initial_count_requires_admin",
    });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query<{ id: string }>(
      `
      SELECT id::text FROM inventory_counts
      WHERE warehouse_id = $1::uuid AND status = 'open'
      LIMIT 1
      FOR UPDATE
      `,
      [warehouseId]
    );
    if (existing[0]) {
      throw Object.assign(new Error("count_already_open"), {
        code: "count_already_open",
        countId: existing[0].id,
      });
    }

    const { rows: wh } = await client.query<{ id: string; is_active: boolean }>(
      `SELECT id::text, is_active FROM warehouses WHERE id = $1::uuid`,
      [warehouseId]
    );
    if (!wh[0]?.is_active) {
      throw Object.assign(new Error("warehouse_not_found"), { code: "warehouse_not_found" });
    }

    const invoiceNumber = await nextCountInvoiceNumber(client, warehouseId);

    const { rows: countRows } = await client.query<{ id: string }>(
      `
      INSERT INTO inventory_counts (
        warehouse_id, status, count_kind, notes, invoice_number, created_by, metadata
      )
      VALUES ($1::uuid, 'open', $2, $3, $4, $5::uuid, $6::jsonb)
      RETURNING id::text
      `,
      [
        warehouseId,
        countKind,
        notes?.trim() || null,
        invoiceNumber,
        auth.userId,
        JSON.stringify({ openedAt: new Date().toISOString() }),
      ]
    );
    const countId = countRows[0]!.id;

    // Snapshot: productos activos. En auditoría solo los que tienen stock o movimiento reciente
    // no basta — incluimos todos los activos para poder pistolear referencias en cero.
    await client.query(
      `
      INSERT INTO inventory_count_lines (count_id, product_id, expected_quantity, counted_quantity)
      SELECT
        $1::uuid,
        p.id,
        COALESCE(s.quantity_on_hand, 0),
        0
      FROM products p
      LEFT JOIN v_warehouse_product_stock s
        ON s.product_id = p.id AND s.warehouse_id = $2::uuid
      WHERE p.is_active = true
      `,
      [countId, warehouseId]
    );

    const { rows: lineCheck } = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM inventory_count_lines WHERE count_id = $1::uuid`,
      [countId]
    );
    if (Number(lineCheck[0]?.n ?? 0) === 0) {
      throw Object.assign(new Error("no_active_products"), { code: "no_active_products" });
    }

    await client.query("COMMIT");

    const detail = await getCount(pool, auth, countId, warehouseId);
    if (!detail) throw new Error("count_open_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type UpdateCountLineInput = {
  productId: string;
  countedQuantity?: number;
  delta?: number;
};

export async function updateCountLine(
  pool: pg.Pool,
  auth: AuthContext,
  countId: string,
  input: UpdateCountLineInput
): Promise<InventoryCountDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: heads } = await client.query<{
      id: string;
      warehouse_id: string;
      status: string;
      count_kind: string;
    }>(
      `
      SELECT id::text, warehouse_id::text, status, count_kind
      FROM inventory_counts
      WHERE id = $1::uuid
      FOR UPDATE
      `,
      [countId]
    );
    const head = heads[0];
    if (!head) {
      throw Object.assign(new Error("count_not_found"), { code: "count_not_found" });
    }
    if (head.status !== "open") {
      throw Object.assign(new Error("count_not_open"), { code: "count_not_open" });
    }
    if (head.count_kind === "initial" && !auth.hasAdminAccess) {
      throw Object.assign(new Error("initial_count_requires_admin"), {
        code: "initial_count_requires_admin",
      });
    }
    if (
      auth.warehouseIds !== null &&
      !auth.warehouseIds.includes(head.warehouse_id)
    ) {
      throw Object.assign(new Error("warehouse_forbidden"), { code: "warehouse_forbidden" });
    }

    const { rows: lines } = await client.query<{
      id: string;
      counted_quantity: string;
    }>(
      `
      SELECT id::text, counted_quantity::text
      FROM inventory_count_lines
      WHERE count_id = $1::uuid AND product_id = $2::uuid
      FOR UPDATE
      `,
      [countId, input.productId]
    );
    let line = lines[0];

    if (!line) {
      // Producto agregado después de abrir: lo incluimos con esperado actual
      const { rows: stockRows } = await client.query<{ qty: string; active: boolean }>(
        `
        SELECT
          COALESCE(s.quantity_on_hand, 0)::text AS qty,
          p.is_active AS active
        FROM products p
        LEFT JOIN v_warehouse_product_stock s
          ON s.product_id = p.id AND s.warehouse_id = $2::uuid
        WHERE p.id = $1::uuid
        `,
        [input.productId, head.warehouse_id]
      );
      const product = stockRows[0];
      if (!product?.active) {
        throw Object.assign(new Error("product_not_found"), { code: "product_not_found" });
      }
      const { rows: inserted } = await client.query<{ id: string; counted_quantity: string }>(
        `
        INSERT INTO inventory_count_lines (
          count_id, product_id, expected_quantity, counted_quantity
        )
        VALUES ($1::uuid, $2::uuid, $3, 0)
        RETURNING id::text, counted_quantity::text
        `,
        [countId, input.productId, Number(product.qty) || 0]
      );
      line = inserted[0]!;
    }

    let next = Number(line.counted_quantity) || 0;
    if (input.countedQuantity != null) {
      next = Number(input.countedQuantity);
    } else if (input.delta != null) {
      next = next + Number(input.delta);
    }
    if (!Number.isFinite(next) || next < 0) {
      throw Object.assign(new Error("invalid_quantity"), { code: "invalid_quantity" });
    }
    next = Math.round(next * 10000) / 10000;

    await client.query(
      `
      UPDATE inventory_count_lines
      SET counted_quantity = $2
      WHERE id = $1::uuid
      `,
      [line.id, next]
    );

    await client.query("COMMIT");

    const detail = await getCount(pool, auth, countId, head.warehouse_id);
    if (!detail) throw new Error("count_update_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function resetCountedQuantities(
  pool: pg.Pool,
  auth: AuthContext,
  countId: string
): Promise<InventoryCountDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: heads } = await client.query<{
      id: string;
      warehouse_id: string;
      status: string;
      count_kind: string;
    }>(
      `
      SELECT id::text, warehouse_id::text, status, count_kind
      FROM inventory_counts
      WHERE id = $1::uuid
      FOR UPDATE
      `,
      [countId]
    );
    const head = heads[0];
    if (!head) {
      throw Object.assign(new Error("count_not_found"), { code: "count_not_found" });
    }
    if (head.status !== "open") {
      throw Object.assign(new Error("count_not_open"), { code: "count_not_open" });
    }
    if (head.count_kind === "initial" && !auth.hasAdminAccess) {
      throw Object.assign(new Error("initial_count_requires_admin"), {
        code: "initial_count_requires_admin",
      });
    }
    if (
      auth.warehouseIds !== null &&
      !auth.warehouseIds.includes(head.warehouse_id)
    ) {
      throw Object.assign(new Error("warehouse_forbidden"), { code: "warehouse_forbidden" });
    }

    await client.query(
      `UPDATE inventory_count_lines SET counted_quantity = 0 WHERE count_id = $1::uuid`,
      [countId]
    );

    await client.query("COMMIT");

    const detail = await getCount(pool, auth, countId, head.warehouse_id);
    if (!detail) throw new Error("count_reset_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelCount(
  pool: pg.Pool,
  auth: AuthContext,
  countId: string
): Promise<InventoryCountDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: heads } = await client.query<{
      id: string;
      warehouse_id: string;
      status: string;
      count_kind: string;
    }>(
      `
      SELECT id::text, warehouse_id::text, status, count_kind
      FROM inventory_counts
      WHERE id = $1::uuid
      FOR UPDATE
      `,
      [countId]
    );
    const head = heads[0];
    if (!head) {
      throw Object.assign(new Error("count_not_found"), { code: "count_not_found" });
    }
    if (head.status !== "open") {
      throw Object.assign(new Error("count_not_open"), { code: "count_not_open" });
    }
    if (head.count_kind === "initial" && !auth.hasAdminAccess) {
      throw Object.assign(new Error("initial_count_requires_admin"), {
        code: "initial_count_requires_admin",
      });
    }
    if (
      auth.warehouseIds !== null &&
      !auth.warehouseIds.includes(head.warehouse_id)
    ) {
      throw Object.assign(new Error("warehouse_forbidden"), { code: "warehouse_forbidden" });
    }

    await client.query(
      `
      UPDATE inventory_counts
      SET status = 'cancelled', completed_at = now()
      WHERE id = $1::uuid
      `,
      [countId]
    );

    await client.query("COMMIT");

    const detail = await getCount(pool, auth, countId, head.warehouse_id);
    if (!detail) throw new Error("count_cancel_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmCount(
  pool: pg.Pool,
  auth: AuthContext,
  countId: string,
  notes?: string | null
): Promise<InventoryCountDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: heads } = await client.query<{
      id: string;
      warehouse_id: string;
      status: string;
      count_kind: string;
      invoice_number: string | null;
      notes: string | null;
    }>(
      `
      SELECT id::text, warehouse_id::text, status, count_kind, invoice_number, notes
      FROM inventory_counts
      WHERE id = $1::uuid
      FOR UPDATE
      `,
      [countId]
    );
    const head = heads[0];
    if (!head) {
      throw Object.assign(new Error("count_not_found"), { code: "count_not_found" });
    }
    if (head.status !== "open") {
      throw Object.assign(new Error("count_not_open"), { code: "count_not_open" });
    }
    if (head.count_kind === "initial" && !auth.hasAdminAccess) {
      throw Object.assign(new Error("initial_count_requires_admin"), {
        code: "initial_count_requires_admin",
      });
    }
    if (
      auth.warehouseIds !== null &&
      !auth.warehouseIds.includes(head.warehouse_id)
    ) {
      throw Object.assign(new Error("warehouse_forbidden"), { code: "warehouse_forbidden" });
    }

    const { rows: diffLines } = await client.query<{
      product_id: string;
      expected_quantity: string;
      counted_quantity: string;
      production_cost: string;
      name: string;
    }>(
      `
      SELECT
        l.product_id::text,
        l.expected_quantity::text,
        l.counted_quantity::text,
        p.production_cost::text,
        p.name
      FROM inventory_count_lines l
      JOIN products p ON p.id = l.product_id
      WHERE l.count_id = $1::uuid
        AND l.counted_quantity <> l.expected_quantity
      `,
      [countId]
    );

    let documentId: string | null = null;

    if (diffLines.length > 0) {
      const kindLabel =
        head.count_kind === "initial" ? "Inventario inicial" : "Cierre de conteo";
      const mergedNotes =
        notes?.trim() ||
        head.notes ||
        `${kindLabel} · ${head.invoice_number ?? countId}`;

      const { rows: docRows } = await client.query<{ id: string }>(
        `
        INSERT INTO inventory_documents (
          warehouse_id, doc_type, status, notes, metadata, created_by,
          completed_at, reason, invoice_number
        )
        VALUES (
          $1::uuid, 'adjustment', 'completed', $2, $3::jsonb, $4::uuid,
          now(), $5, $6
        )
        RETURNING id::text
        `,
        [
          head.warehouse_id,
          mergedNotes,
          JSON.stringify({
            countId,
            countKind: head.count_kind,
            countInvoiceNumber: head.invoice_number,
          }),
          auth.userId,
          kindLabel,
          head.invoice_number,
        ]
      );
      documentId = docRows[0]!.id;

      await client.query(
        `
        INSERT INTO document_status_events (document_id, status, comment, actor_id)
        VALUES ($1::uuid, 'completed', $2, $3::uuid)
        `,
        [
          documentId,
          `${kindLabel} aplicado · ${diffLines.length} referencia(s) ajustada(s)`,
          auth.userId,
        ]
      );

      for (const line of diffLines) {
        const expected = Number(line.expected_quantity) || 0;
        const counted = Number(line.counted_quantity) || 0;
        const delta = counted - expected;
        if (delta === 0) continue;

        await client.query(
          `
          INSERT INTO inventory_document_lines (
            document_id, product_id, quantity, unit_cost, line_notes
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5)
          `,
          [
            documentId,
            line.product_id,
            Math.abs(delta),
            Number(line.production_cost) || 0,
            `Sistema ${expected} → Contado ${counted} (Δ ${delta > 0 ? "+" : ""}${delta})`,
          ]
        );

        await client.query(
          `
          INSERT INTO stock_movements (
            warehouse_id, product_id, movement_type, quantity, unit_cost,
            batch_id, created_by, notes
          )
          VALUES ($1::uuid, $2::uuid, 'inventory_close', $3, $4, $5::uuid, $6::uuid, $7)
          `,
          [
            head.warehouse_id,
            line.product_id,
            delta,
            Number(line.production_cost) || 0,
            documentId,
            auth.userId,
            `Conteo ${head.invoice_number ?? countId}: ${line.name}`,
          ]
        );
      }
    }

    await client.query(
      `
      UPDATE inventory_counts
      SET
        status = 'completed',
        completed_at = now(),
        document_id = $2::uuid,
        notes = COALESCE($3, notes)
      WHERE id = $1::uuid
      `,
      [countId, documentId, notes?.trim() || null]
    );

    await client.query("COMMIT");

    const detail = await getCount(pool, auth, countId, head.warehouse_id);
    if (!detail) throw new Error("count_confirm_failed");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
