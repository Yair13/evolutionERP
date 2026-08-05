import jwt, { type SignOptions } from "jsonwebtoken";

export type AccessTokenPayload = { sub: string };

export function signAccessToken(userId: string): string {
  const secret = requireJwtSecret();
  const expiresIn = (process.env.JWT_EXPIRES_IN?.trim() || "8h") as SignOptions["expiresIn"];
  const options: SignOptions = { expiresIn, algorithm: "HS256" };
  return jwt.sign({ sub: userId }, secret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = requireJwtSecret();
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (typeof decoded === "string" || !decoded || typeof decoded !== "object")
    throw new Error("invalid_payload");
  const sub = (decoded as jwt.JwtPayload).sub;
  if (!sub || typeof sub !== "string") throw new Error("invalid_sub");
  return { sub };
}

function requireJwtSecret(): string {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET debe tener al menos 16 caracteres");
  }
  return s;
}
