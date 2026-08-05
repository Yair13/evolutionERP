import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

export function RequireOrgAdmin() {
  const { user } = useAuth();
  const ok = user?.roles.some((r) => r === "super_admin" || r === "secretaria") ?? false;
  if (!ok) return <Navigate to="/app" replace />;
  return <Outlet />;
}
