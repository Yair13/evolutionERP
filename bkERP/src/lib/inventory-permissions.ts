import type { AuthContext } from "../services/auth-context.js";

export function canSeeProductionCost(auth: AuthContext): boolean {
  return auth.roles.includes("super_admin");
}

export function canManageInventory(auth: AuthContext): boolean {
  return auth.roles.some((r) =>
    ["super_admin", "secretaria", "admin_local"].includes(r)
  );
}

export function canApproveDocuments(auth: AuthContext): boolean {
  return auth.roles.some((r) => ["super_admin", "admin_local"].includes(r));
}
