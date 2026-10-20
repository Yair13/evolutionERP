const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
      return (data as { error: string }).error;
    }
  } catch {
    /* ignore */
  }
  return res.statusText || "Error";
}

/**
 * Indica al backend si la sesión actual es la Sede Administrativa.
 * Regla: solo la Sede Administrativa puede pagar/egresar con cuentas; las sedes físicas solo en efectivo.
 * (El backend además valida que el usuario realmente tenga acceso administrativo.)
 */
function sessionScopeHeaders(): Record<string, string> {
  try {
    return localStorage.getItem("evolution_erp_warehouse") === "__all__" ? { "X-Session-Scope": "admin" } : {};
  } catch {
    return {};
  }
}

export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...sessionScopeHeaders() };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string, token: string, query?: Record<string, string | number | undefined>): Promise<T> {
  let url = `${base}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `${path.includes("?") ? "&" : "?"}${qs}`;
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiGetPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}
