import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Menu,
  Package,
  PackageSearch,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext.js";

type MobileBottomNavProps = {
  onOpenMenu: () => void;
  menuOpen?: boolean;
};

export function MobileBottomNav({ onOpenMenu, menuOpen = false }: MobileBottomNavProps) {
  const { isAllWarehouses } = useWarehouse();

  return (
    <nav className="mobile-dock" aria-label="Navegación rápida móvil">
      <div className="mobile-dock__inner">
        <NavLink
          to="/app"
          end
          className={({ isActive }) =>
            `mobile-dock__item${isActive ? " is-active" : ""}`
          }
        >
          <LayoutDashboard size={20} strokeWidth={2} aria-hidden />
          <span>Inicio</span>
        </NavLink>

        {isAllWarehouses ? (
          <>
            <NavLink
              to="/app/productos"
              className={({ isActive }) =>
                `mobile-dock__item${isActive ? " is-active" : ""}`
              }
            >
              <Package size={20} strokeWidth={2} aria-hidden />
              <span>Productos</span>
            </NavLink>

            <NavLink
              to="/app/inventario/inicial"
              className={({ isActive }) =>
                `mobile-dock__item mobile-dock__item--primary${isActive ? " is-active" : ""}`
              }
            >
              <span className="mobile-dock__fab" aria-hidden>
                <ClipboardCheck size={20} strokeWidth={2.2} />
              </span>
              <span>Inicial</span>
            </NavLink>

            <NavLink
              to="/app/inventario/historial"
              className={({ isActive }) =>
                `mobile-dock__item${isActive ? " is-active" : ""}`
              }
            >
              <History size={20} strokeWidth={2} aria-hidden />
              <span>Historial</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink
              to="/app/inventario"
              end
              className={({ isActive }) =>
                `mobile-dock__item${isActive ? " is-active" : ""}`
              }
            >
              <PackageSearch size={20} strokeWidth={2} aria-hidden />
              <span>Stock</span>
            </NavLink>

            <NavLink
              to="/app/inventario/salida"
              className={({ isActive }) =>
                `mobile-dock__item mobile-dock__item--primary${isActive ? " is-active" : ""}`
              }
            >
              <span className="mobile-dock__fab" aria-hidden>
                <ArrowUpFromLine size={20} strokeWidth={2.25} />
              </span>
              <span>Vender</span>
            </NavLink>

            <NavLink
              to="/app/inventario/entrada"
              className={({ isActive }) =>
                `mobile-dock__item${isActive ? " is-active" : ""}`
              }
            >
              <ArrowDownToLine size={20} strokeWidth={2} aria-hidden />
              <span>Entrada</span>
            </NavLink>
          </>
        )}

        <button
          type="button"
          className={`mobile-dock__item${menuOpen ? " is-active" : ""}`}
          onClick={onOpenMenu}
          aria-label="Abrir menú completo"
          aria-expanded={menuOpen}
        >
          <Menu size={20} strokeWidth={2} aria-hidden />
          <span>Menú</span>
        </button>
      </div>
    </nav>
  );
}
