import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { ensureUploadsDir, UPLOADS_ROOT } from "../lib/product-uploads.js";

export interface SystemResetOptions {
  /** Si se pasa, prioriza conservar este usuario (por ejemplo el super_admin autenticado). */
  keepUserId?: string;
  /** Si se pasa (ej. desde script CLI), busca conservar este email como super_admin. */
  preferredAdminEmail?: string;
}

export interface SystemResetResult {
  keptWarehouse: {
    id: string;
    code: string;
    name: string;
  };
  keptUser: {
    id: string;
    email: string;
    fullName: string;
  };
}

export async function resetSystemData(
  pool: Pool,
  options: SystemResetOptions = {}
): Promise<SystemResetResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await resetSystemDataInTx(client, options);
    await client.query("COMMIT");

    // Limpiar imágenes de productos en disco después del COMMIT
    try {
      await rm(join(UPLOADS_ROOT, "products"), { recursive: true, force: true });
      await ensureUploadsDir();
    } catch (fsErr) {
      console.error("Advertencia al limpiar carpeta uploads/products:", fsErr);
    }

    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback error */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function resetSystemDataInTx(
  client: PoolClient,
  options: SystemResetOptions
): Promise<SystemResetResult> {
  // 1. Asegurar catálogo de roles base
  await client.query(`
    INSERT INTO roles (code, name) VALUES
      ('super_admin', 'Super administrador'),
      ('secretaria', 'Secretaría administrativa'),
      ('admin_local', 'Administrador de local')
    ON CONFLICT (code) DO NOTHING
  `);

  // 2. Identificar el usuario super_admin que se va a conservar
  let keptUser: { id: string; email: string; full_name: string } | undefined;

  if (options.keepUserId) {
    const { rows } = await client.query<{ id: string; email: string; full_name: string }>(
      `SELECT u.id::text, u.email, u.full_name
       FROM users u
       WHERE u.id = $1::uuid`,
      [options.keepUserId]
    );
    keptUser = rows[0];
  }

  if (!keptUser && options.preferredAdminEmail) {
    const { rows } = await client.query<{ id: string; email: string; full_name: string }>(
      `SELECT u.id::text, u.email, u.full_name
       FROM users u
       WHERE lower(u.email) = lower($1)
       LIMIT 1`,
      [options.preferredAdminEmail]
    );
    keptUser = rows[0];
  }

  if (!keptUser) {
    const { rows } = await client.query<{ id: string; email: string; full_name: string }>(
      `SELECT u.id::text, u.email, u.full_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.code = 'super_admin'
       ORDER BY u.created_at ASC
       LIMIT 1`
    );
    keptUser = rows[0];
  }

  if (!keptUser) {
    throw new Error("super_admin_not_found");
  }

  // 3. Identificar la sede Principal (MAIN) que se va a conservar
  const { rows: whRows } = await client.query<{ id: string; code: string; name: string }>(
    `SELECT id::text, code, name
     FROM warehouses
     ORDER BY
       CASE
         WHEN upper(code) = 'MAIN' THEN 0
         WHEN lower(name) = 'principal' THEN 1
         ELSE 2
       END,
       created_at ASC
     LIMIT 1`
  );

  let keptWarehouse = whRows[0];

  // 4. Vaciar todas las tablas operativas, de inventario, de productos, financieras y auditoría
  await client.query(`
    TRUNCATE TABLE
      inventory_count_lines,
      inventory_counts,
      document_status_events,
      inventory_document_lines,
      inventory_documents,
      stock_movements,
      production_orders,
      customers,
      warehouse_product_settings,
      product_price_history,
      product_images,
      products,
      product_categories,
      closure_payment_breakdown,
      daily_closures,
      layaway_payments,
      layaways,
      receivable_payments,
      accounts_receivable,
      expenses,
      payable_payments,
      accounts_payable,
      suppliers,
      cash_outflows,
      cash_transfers,
      payroll_payments,
      employees,
      global_closures,
      notifications,
      audit_logs
    RESTART IDENTITY CASCADE
  `);

  // 5. Reiniciar configuración de desbloqueo de edición de movimientos
  await client.query(`
    INSERT INTO inventory_movement_settings (singleton, entry_editing_enabled, exit_editing_enabled, editing_date, updated_by, updated_at)
    VALUES (1, false, false, NULL, NULL, now())
    ON CONFLICT (singleton) DO UPDATE SET
      entry_editing_enabled = false,
      exit_editing_enabled = false,
      editing_date = NULL,
      updated_by = NULL,
      updated_at = now()
  `);

  // 6. Dejar únicamente la sede Principal
  if (!keptWarehouse) {
    const { rows: insertedWh } = await client.query<{ id: string; code: string; name: string }>(
      `INSERT INTO warehouses (code, name, is_active, is_factory)
       VALUES ('MAIN', 'Principal', true, false)
       RETURNING id::text, code, name`
    );
    keptWarehouse = insertedWh[0]!;
  } else {
    await client.query(`DELETE FROM warehouses WHERE id <> $1::uuid`, [keptWarehouse.id]);
    const { rows: updatedWh } = await client.query<{ id: string; code: string; name: string }>(
      `UPDATE warehouses
       SET is_active = true
       WHERE id = $1::uuid
       RETURNING id::text, code, name`,
      [keptWarehouse.id]
    );
    keptWarehouse = updatedWh[0] ?? keptWarehouse;
  }

  // 7. Dejar únicamente el usuario super_admin y asegurar sus permisos y sede
  await client.query(`DELETE FROM users WHERE id <> $1::uuid`, [keptUser.id]);

  await client.query(
    `UPDATE users
     SET is_active = true,
         has_admin_access = true,
         updated_at = now()
     WHERE id = $1::uuid`,
    [keptUser.id]
  );

  await client.query(`DELETE FROM user_roles WHERE user_id = $1::uuid`, [keptUser.id]);
  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1::uuid, r.id
     FROM roles r
     WHERE r.code = 'super_admin'`,
    [keptUser.id]
  );

  await client.query(`DELETE FROM user_warehouse WHERE user_id = $1::uuid`, [keptUser.id]);
  await client.query(
    `INSERT INTO user_warehouse (user_id, warehouse_id)
     VALUES ($1::uuid, $2::uuid)
     ON CONFLICT DO NOTHING`,
    [keptUser.id, keptWarehouse.id]
  );

  return {
    keptWarehouse: {
      id: keptWarehouse.id,
      code: keptWarehouse.code,
      name: keptWarehouse.name,
    },
    keptUser: {
      id: keptUser.id,
      email: keptUser.email,
      fullName: keptUser.full_name,
    },
  };
}

export interface CleanTestDataResult {
  clearedOperations: boolean;
  message: string;
  keptCounts: {
    warehouses: number;
    users: number;
    products: number;
    suppliers: number;
    employees: number;
    customers: number;
  };
}

/**
 * Limpia únicamente movimientos operacionales y financieros de prueba:
 * - Ventas, compras, movimientos de stock, documentos e inventarios.
 * - Cuentas por cobrar, abonos y apartados.
 * - Cuentas por pagar, comprobantes de egreso y traslados de efectivo.
 * - Nómina y liquidaciones.
 * - Cierres diarios y cierres generales.
 * 
 * CONSERVA INTACTOS:
 * - Todos los productos del catálogo, imágenes, precios y categorías.
 * - Todas las sedes / almacenes activos.
 * - Todos los usuarios, roles y asignaciones.
 * - Todos los proveedores creados.
 * - Todos los empleados dados de alta.
 * - Todos los clientes (reiniciando saldos a favor de prueba a $0).
 */
export async function cleanOperationalTestData(pool: Pool): Promise<CleanTestDataResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Vaciar únicamente tablas transaccionales de prueba
    await client.query(`
      TRUNCATE TABLE
        inventory_count_lines,
        inventory_counts,
        document_status_events,
        inventory_document_lines,
        inventory_documents,
        stock_movements,
        production_orders,
        closure_payment_breakdown,
        daily_closures,
        layaway_payments,
        layaways,
        receivable_payments,
        accounts_receivable,
        expenses,
        payable_payments,
        accounts_payable,
        cash_outflows,
        cash_transfers,
        payroll_payments,
        global_closures,
        notifications,
        audit_logs
      RESTART IDENTITY CASCADE
    `);

    // 2. Reiniciar saldos a favor de clientes y proveedores a 0
    await client.query(`UPDATE customers SET credit_balance = 0`);
    await client.query(`UPDATE suppliers SET credit_balance = 0`);

    // 3. Reiniciar configuración de desbloqueo de edición de movimientos
    await client.query(`
      INSERT INTO inventory_movement_settings (singleton, entry_editing_enabled, exit_editing_enabled, editing_date, updated_by, updated_at)
      VALUES (1, false, false, NULL, NULL, now())
      ON CONFLICT (singleton) DO UPDATE SET
        entry_editing_enabled = false,
        exit_editing_enabled = false,
        editing_date = NULL,
        updated_by = NULL,
        updated_at = now()
    `);

    // 4. Contar lo que se conservó intacto
    const { rows: wCount } = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM warehouses WHERE is_active = true`);
    const { rows: uCount } = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM users WHERE is_active = true`);
    const { rows: pCount } = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM products WHERE is_active = true`);
    const { rows: sCount } = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM suppliers WHERE is_active = true`);
    const { rows: eCount } = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM employees WHERE is_active = true`);
    const { rows: cCount } = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM customers`);

    await client.query("COMMIT");

    // Limpiar comprobantes temporales en disco (uploads/closures y uploads/payroll) SIN TOCAR uploads/products
    try {
      await rm(join(UPLOADS_ROOT, "closures"), { recursive: true, force: true });
      await rm(join(UPLOADS_ROOT, "payroll"), { recursive: true, force: true });
    } catch {
      /* ignore */
    }

    return {
      clearedOperations: true,
      message: "Operaciones de prueba limpiadas con éxito. Catálogo de productos, sedes, usuarios, empleados y proveedores conservados intactos.",
      keptCounts: {
        warehouses: Number(wCount[0]?.c ?? 0),
        users: Number(uCount[0]?.c ?? 0),
        products: Number(pCount[0]?.c ?? 0),
        suppliers: Number(sCount[0]?.c ?? 0),
        employees: Number(eCount[0]?.c ?? 0),
        customers: Number(cCount[0]?.c ?? 0),
      },
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}
