import type { Request, Response } from "express";

/**
 * REGLA GENERAL DEL SISTEMA — Salidas de dinero:
 * - Las sedes físicas solo pueden sacar dinero en EFECTIVO (caja de la sede).
 * - Solo la Sede Administrativa puede pagar/egresar mediante cuentas (bancos, Nequi, etc.).
 *
 * La sesión administrativa se indica con el header `X-Session-Scope: admin`
 * y solo es válida si el usuario realmente tiene acceso a la Sede Administrativa.
 */
export function isAdminSessionRequest(req: Request): boolean {
  const header = req.headers["x-session-scope"];
  const scope = typeof header === "string" ? header.trim().toLowerCase() : "";
  return scope === "admin" && req.auth?.hasAdminAccess === true;
}

/** Métodos que no representan salida de dinero de una cuenta (permitidos en sedes físicas). */
const PHYSICAL_SITE_ALLOWED_METHODS = new Set(["efectivo", "saldo_a_favor"]);

export function normalizePaymentMethod(method: string | null | undefined): string {
  return String(method ?? "efectivo").trim().toLowerCase();
}

export function assertOutflowPaymentMethodAllowed(
  paymentMethod: string | null | undefined,
  fromAdminSession: boolean
): void {
  if (fromAdminSession) return;
  if (PHYSICAL_SITE_ALLOWED_METHODS.has(normalizePaymentMethod(paymentMethod))) return;
  throw Object.assign(new Error("physical_site_cash_only"), {
    code: "physical_site_cash_only",
    statusCode: 400,
    message:
      "Las sedes físicas solo pueden realizar pagos y salidas de dinero en Efectivo. Los pagos por cuentas bancarias solo se hacen desde la Sede Administrativa.",
  });
}

/**
 * Valida la regla en una ruta HTTP. Si no se permite, responde 400 y retorna true
 * (la ruta debe hacer `return`).
 */
export function rejectIfOutflowMethodNotAllowed(
  req: Request,
  res: Response,
  paymentMethod: string | null | undefined
): boolean {
  try {
    assertOutflowPaymentMethodAllowed(paymentMethod, isAdminSessionRequest(req));
    return false;
  } catch (err: any) {
    res.status(400).json({ error: err.message, code: err.code });
    return true;
  }
}
