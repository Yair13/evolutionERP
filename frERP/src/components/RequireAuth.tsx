import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { WarehouseProvider } from "../context/WarehouseContext.js";

export function RequireAuth() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return (
    <WarehouseProvider>
      <Outlet />
    </WarehouseProvider>
  );
}
