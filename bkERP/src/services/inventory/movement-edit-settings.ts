import type pg from "pg";
import type { AuthContext } from "../auth-context.js";

/** Zona horaria del negocio para “movimientos del día”. */
export const MOVEMENT_EDIT_TZ = "America/Bogota";

export type MovementEditSettings = {
  entryEditingEnabled: boolean;
  exitEditingEnabled: boolean;
  editingDate: string | null;
  appliesToday: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};

export function canManageMovementEditing(auth: AuthContext): boolean {
  return auth.roles.some((r) => r === "super_admin" || r === "secretaria");
}

export function isOutboundDocType(docType: string): boolean {
  return docType === "exit" || docType === "warranty" || docType === "return";
}

/** ISO timestamp → YYYY-MM-DD en zona Colombia. */
export function movementDateYmd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: MOVEMENT_EDIT_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function todayYmdInMovementTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MOVEMENT_EDIT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isMovementFromToday(completedOrCreatedAt: string | null | undefined): boolean {
  const ymd = movementDateYmd(completedOrCreatedAt);
  return ymd != null && ymd === todayYmdInMovementTz();
}

export async function getMovementEditSettings(pool: pg.Pool): Promise<MovementEditSettings> {
  const { rows } = await pool.query<{
    entry_editing_enabled: boolean;
    exit_editing_enabled: boolean;
    editing_date: string | null;
    applies_today: boolean;
    updated_at: string | null;
    updated_by_name: string | null;
  }>(
    `
    SELECT
      CASE WHEN s.editing_date = (now() AT TIME ZONE $1)::date THEN s.entry_editing_enabled ELSE false END AS entry_editing_enabled,
      CASE WHEN s.editing_date = (now() AT TIME ZONE $1)::date THEN s.exit_editing_enabled ELSE false END AS exit_editing_enabled,
      s.editing_date::text,
      (s.editing_date = (now() AT TIME ZONE $1)::date) AS applies_today,
      s.updated_at::text,
      u.full_name AS updated_by_name
    FROM inventory_movement_settings s
    LEFT JOIN users u ON u.id = s.updated_by
    WHERE s.singleton = 1
    `,
    [MOVEMENT_EDIT_TZ]
  );
  const r = rows[0];
  return {
    entryEditingEnabled: r?.entry_editing_enabled ?? false,
    exitEditingEnabled: r?.exit_editing_enabled ?? false,
    editingDate: r?.editing_date ?? null,
    appliesToday: r?.applies_today ?? false,
    updatedAt: r?.updated_at ?? null,
    updatedByName: r?.updated_by_name ?? null,
  };
}

export async function updateMovementEditSettings(
  pool: pg.Pool,
  auth: AuthContext,
  input: { entryEditingEnabled: boolean; exitEditingEnabled: boolean }
): Promise<MovementEditSettings> {
  if (!canManageMovementEditing(auth)) {
    throw Object.assign(new Error("movement_edit_forbidden"), { code: "movement_edit_forbidden" });
  }
  await pool.query(
    `
    UPDATE inventory_movement_settings
    SET
      entry_editing_enabled = $1,
      exit_editing_enabled = $2,
      editing_date = (now() AT TIME ZONE $4)::date,
      updated_at = now(),
      updated_by = $3::uuid
    WHERE singleton = 1
    `,
    [input.entryEditingEnabled, input.exitEditingEnabled, auth.userId, MOVEMENT_EDIT_TZ]
  );
  return getMovementEditSettings(pool);
}
