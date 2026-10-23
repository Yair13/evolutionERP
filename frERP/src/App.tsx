import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { useWarehouse } from "./context/WarehouseContext.js";
import { AppLayout } from "./components/layout/AppLayout.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { RequireOrgAdmin } from "./components/RequireOrgAdmin.js";
import { RequireSuperAdmin } from "./components/RequireSuperAdmin.js";
import { WarehousesManagePage } from "./features/organization/WarehousesManagePage.js";
import { UsersManagePage } from "./features/organization/UsersManagePage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SelectSedePage } from "./pages/SelectSedePage.js";
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
import { ReceivablesPage } from "./features/finance/ReceivablesPage.js";
import { PaymentsCashPage } from "./features/finance/PaymentsCashPage.js";
import { LayawaysPage } from "./features/finance/LayawaysPage.js";
import { PayablesPage } from "./features/finance/PayablesPage.js";
import { CashOutflowsPage } from "./features/finance/CashOutflowsPage.js";
import { CashIncomesPage } from "./features/finance/CashIncomesPage.js";
import { PayrollPage } from "./features/finance/PayrollPage.js";
import { DailyClosurePage } from "./features/finance/DailyClosurePage.js";

function RootRedirect() {
  const { token } = useAuth();
  return <Navigate to={token ? "/app" : "/login"} replace />;
}

/**
 * Protege pantallas exclusivas de la Sede Administrativa (Productos, Utilidades, Configuración).
 */
function RequireAdminHeadquarters() {
  const { isAllWarehouses } = useWarehouse();
  if (!isAllWarehouses) return <Navigate to="/app" replace />;
  return <Outlet />;
}

/**
 * Protege pantallas operativas de local (Stock, Entrada, Salida, Cierre, Semáforo)
 * para que solo se abran cuando se ha ingresado a una sede específica y no en la Sede Administrativa.
 */
function RequireOperationalSede() {
  const { isAllWarehouses } = useWarehouse();
  if (isAllWarehouses) return <Navigate to="/app" replace />;
  return <Outlet />;
}

function HistoryRoute() {
  const { isAllWarehouses } = useWarehouse();
  if (!isAllWarehouses) return <Navigate to="/app/inventario/salidas/historial" replace />;
  return <MovementsHistoryPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/seleccionar-sede" element={<SelectSedePage />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="inventario/historial" element={<HistoryRoute />} />
            <Route path="finanzas/cartera" element={<ReceivablesPage />} />
            <Route path="finanzas/caja" element={<PaymentsCashPage />} />
            <Route path="finanzas/apartados" element={<LayawaysPage />} />
            <Route path="finanzas/ingresos" element={<CashIncomesPage />} />
            <Route path="finanzas/egresos" element={<CashOutflowsPage />} />
            <Route path="finanzas/nomina" element={<PayrollPage />} />
            <Route path="finanzas/cierre-diario" element={<DailyClosurePage />} />
            <Route path="finanzas/cierre-diario/historial" element={<DailyClosurePage defaultTab="history" />} />
            <Route path="finanzas/cierre-general" element={<DailyClosurePage defaultTab="general" />} />

            <Route element={<RequireAdminHeadquarters />}>
              <Route path="finanzas/proveedores" element={<PayablesPage />} />
              <Route path="productos" element={<ProductsCatalogPage />} />
              <Route path="productos/nuevo" element={<ProductNewPage />} />
              <Route path="productos/cargue-masivo" element={<ProductBulkUploadPage />} />
              <Route path="productos/:id/editar" element={<ProductEditPage />} />
              <Route path="productos/:id" element={<ProductDetailPage />} />
              <Route path="inventario/nuevo" element={<Navigate to="/app/productos/nuevo" replace />} />
              <Route path="inventario/inicial" element={<InventoryCountPage key="initial" mode="initial" />} />
              <Route element={<RequireSuperAdmin />}>
                <Route path="inventario/utilidades" element={<UtilitiesPage />} />
              </Route>
              <Route element={<RequireSuperAdmin />}>
                <Route path="configuracion/almacenes" element={<WarehousesManagePage />} />
              </Route>
              <Route element={<RequireOrgAdmin />}>
                <Route path="configuracion/usuarios" element={<UsersManagePage />} />
              </Route>
            </Route>

            <Route element={<RequireOperationalSede />}>
              <Route path="inventario" element={<CatalogPage />} />
              <Route path="inventario/producto/:id" element={<InventoryProductPage />} />
              <Route path="inventario/entrada" element={<MovementPosPage key="entry" mode="entry" />} />
              <Route
                path="inventario/entradas/historial"
                element={<MovementsHistoryPage key="history-entry" fixedType="entry" />}
              />
              <Route path="inventario/salida" element={<MovementPosPage key="exit" mode="exit" />} />
              <Route
                path="inventario/salidas/historial"
                element={<MovementsHistoryPage key="history-exit" fixedType="exit" />}
              />
              <Route path="inventario/semaforo" element={<StockSemaphorePage />} />
              <Route path="inventario/cierre" element={<InventoryCountPage key="audit" mode="audit" />} />
              <Route path="inventario/conteo" element={<Navigate to="/app/inventario/cierre" replace />} />
            </Route>

            <Route path="almacenes" element={<Navigate to="/app" replace />} />
          </Route>
        </Route>
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </AuthProvider>
  );
}
