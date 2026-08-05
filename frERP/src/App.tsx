import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { AppLayout } from "./components/layout/AppLayout.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { RequireOrgAdmin } from "./components/RequireOrgAdmin.js";
import { RequireSuperAdmin } from "./components/RequireSuperAdmin.js";
import { WarehousesManagePage } from "./features/organization/WarehousesManagePage.js";
import { UsersManagePage } from "./features/organization/UsersManagePage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { CatalogPage } from "./features/inventory/CatalogPage.js";
import { InventoryProductPage } from "./features/inventory/InventoryProductPage.js";
import { MovementPosPage } from "./features/inventory/MovementPosPage.js";
import { UtilitiesPage } from "./features/inventory/UtilitiesPage.js";
import { MovementsHistoryPage } from "./features/inventory/MovementsHistoryPage.js";
import { StockSemaphorePage } from "./features/inventory/StockSemaphorePage.js";
import { InventoryCountPage } from "./features/inventory/InventoryCountPage.js";
import { ProductsCatalogPage } from "./features/products/ProductsCatalogPage.js";
import { ProductDetailPage } from "./features/products/ProductDetailPage.js";
import { ProductEditPage } from "./features/products/ProductEditPage.js";
import { ProductNewPage } from "./features/products/ProductNewPage.js";
import { ProductBulkUploadPage } from "./features/products/ProductBulkUploadPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";

function RootRedirect() {
  const { token } = useAuth();
  return <Navigate to={token ? "/app" : "/login"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="productos" element={<ProductsCatalogPage />} />
            <Route path="productos/nuevo" element={<ProductNewPage />} />
            <Route path="productos/cargue-masivo" element={<ProductBulkUploadPage />} />
            <Route path="productos/:id/editar" element={<ProductEditPage />} />
            <Route path="productos/:id" element={<ProductDetailPage />} />
            <Route path="inventario" element={<CatalogPage />} />
            <Route path="inventario/nuevo" element={<Navigate to="/app/productos/nuevo" replace />} />
            <Route path="inventario/producto/:id" element={<InventoryProductPage />} />
            <Route path="inventario/entrada" element={<MovementPosPage mode="entry" />} />
            <Route path="inventario/salida" element={<MovementPosPage mode="exit" />} />
            <Route path="inventario/historial" element={<MovementsHistoryPage />} />
            <Route path="inventario/semaforo" element={<StockSemaphorePage />} />
            <Route path="inventario/cierre" element={<InventoryCountPage />} />
            <Route path="inventario/conteo" element={<Navigate to="/app/inventario/cierre" replace />} />
            <Route element={<RequireSuperAdmin />}>
              <Route path="inventario/utilidades" element={<UtilitiesPage />} />
            </Route>
            <Route path="almacenes" element={<Navigate to="/app" replace />} />
            <Route element={<RequireSuperAdmin />}>
              <Route path="configuracion/almacenes" element={<WarehousesManagePage />} />
            </Route>
            <Route element={<RequireOrgAdmin />}>
              <Route path="configuracion/usuarios" element={<UsersManagePage />} />
            </Route>
          </Route>
        </Route>
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </AuthProvider>
  );
}
