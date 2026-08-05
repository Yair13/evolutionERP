import type { NextFunction, Request, Response } from "express";

export function requireAnyRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "missing_auth" });
      return;
    }
    const ok = allowed.some((code) => auth.roles.includes(code));
    if (!ok) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

export function hasRole(auth: { roles: string[] }, code: string): boolean {
  return auth.roles.includes(code);
}
