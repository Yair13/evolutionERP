import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

/** Solo super administrador (p. ej. gestión de sedes / empresa). */
export function RequireSuperAdmin() {
  const { user } = useAuth();
  if (!user?.roles.includes("super_admin")) return <Navigate to="/app" replace />;
  return <Outlet />;
}
