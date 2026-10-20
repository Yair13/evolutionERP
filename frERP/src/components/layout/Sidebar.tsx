import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ClipboardCheck,
  Gauge,
  History,
  Wallet,
  Building2,
  LayoutDashboard,
  Package,
  PackagePlus,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Upload,
  Users,
  CreditCard,
  PiggyBank,
  Bookmark,
  Truck,
  ArrowLeftRight,
  ShieldCheck,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";

type NavItemProps = {
  to: string;
  end?: boolean;
  icon: LucideIcon;
  label: string;
  hint?: string;
  onNavigate?: () => void;
  nested?: boolean;
};

function NavItem({ to, end, icon: Icon, label, hint, onNavigate, nested }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      title={hint ?? label}
      onClick={onNavigate}
      className={({ isActive }) =>
        `nav-item${nested ? " nav-item--nested" : ""}${isActive ? " nav-item--active" : ""}`
      }
    >
      <span className="nav-item__glow" aria-hidden />
      <Icon className="nav-item__icon" size={nested ? 18 : 22} strokeWidth={1.65} aria-hidden />
      <span className="nav-item__text">{label}</span>
    </NavLink>
  );
}

type NavGroupChild = {
  to: string;
  end?: boolean;
  icon: LucideIcon;
  label: string;
  hint?: string;
};

type NavGroupProps = {
  label: string;
  icon: LucideIcon;
  hint?: string;
  matchPaths: string[];
  items: NavGroupChild[];
  onNavigate?: () => void;
  /** Separa el grupo del bloque anterior (equivalente a un encabezado de sección). */
  spaced?: boolean;
};

function pathMatches(pathname: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    if (p.endsWith("/*")) {
      const base = p.slice(0, -2);
      return pathname === base || pathname.startsWith(`${base}/`);
    }
    return pathname === p;
  });
}

function NavGroup({ label, icon: Icon, hint, matchPaths, items, onNavigate, spaced }: NavGroupProps) {
  const { pathname } = useLocation();
  const active = pathMatches(pathname, matchPaths);
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <div
      className={`nav-group${spaced ? " nav-group--mt" : ""}${active ? " nav-group--active" : ""}${open ? " nav-group--open" : ""}`}
    >
      <button
        type="button"
        className={`nav-item nav-item--group${active ? " nav-item--active" : ""}`}
        title={hint ?? label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-item__glow" aria-hidden />
        <Icon className="nav-item__icon" size={22} strokeWidth={1.65} aria-hidden />
        <span className="nav-item__text">{label}</span>
        <ChevronDown
          className={`nav-group__chevron${open ? " is-open" : ""}`}
          size={16}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="nav-group__children" role="group" aria-label={label}>
          {items.map((child) => (
            <NavItem
              key={child.to}
              to={child.to}
              end={child.end}
              icon={child.icon}
              label={child.label}
              hint={child.hint}
              onNavigate={onNavigate}
              nested
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type SidebarProps = {
  open: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  onNavigate?: () => void;
};

export function Sidebar({ open, pinned = false, onTogglePin, onNavigate }: SidebarProps) {
  const { user } = useAuth();
  const { isAllWarehouses, sessionLabel } = useWarehouse();
  const [hovered, setHovered] = useState(false);
  const isSuperAdmin = user?.roles.includes("super_admin") ?? false;
  const canOrgAdmin = user?.roles.some((r) => r === "super_admin" || r === "secretaria") ?? false;

  const isExpanded = open || pinned || hovered;

  return (
    <aside
      className={`nav-rail${open ? " nav-rail--open" : ""}${pinned ? " nav-rail--pinned" : ""}${isExpanded ? " nav-rail--expanded" : " nav-rail--collapsed"}`}
      aria-label="Navegación principal"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="nav-rail__ambient" aria-hidden />

      <div className="nav-brand">
        <div className="nav-brand__mark nav-brand__mark--logo">
          <img src="/logo-evolution.png?v=4" alt="Colchones Evolution S.A.S" className="nav-brand__logo" />
        </div>
        <div className="nav-brand__text">
          <span className="nav-brand__title">Evolution</span>
          <span className="nav-brand__subtitle">
            <Sparkles size={12} strokeWidth={2} className="nav-brand__spark" aria-hidden />
            colchones · S.A.S
          </span>
        </div>
        {onTogglePin ? (
          <button
            type="button"
            className={`nav-rail__pin${pinned ? " is-pinned" : ""}`}
            onClick={onTogglePin}
            title={pinned ? "Contraer menú automáticamente al alejarse" : "Mantener menú fijo abierto"}
            aria-label={pinned ? "Contraer menú automáticamente al alejarse" : "Mantener menú fijo abierto"}
            aria-pressed={pinned}
          >
            {pinned ? <PanelLeftClose size={16} strokeWidth={2} /> : <PanelLeftOpen size={16} strokeWidth={2} />}
          </button>
        ) : null}
        {onNavigate ? (
          <button
            type="button"
            className="nav-rail__close"
            onClick={onNavigate}
            aria-label="Cerrar menú"
            title="Cerrar menú"
          >
            <X size={18} strokeWidth={2.2} aria-hidden />
          </button>
        ) : null}
      </div>

      <nav className="nav-stack" aria-label="Módulos">
        <p className="nav-section">
          <span className="nav-section__line" aria-hidden />
          <span className="nav-section__label">{isAllWarehouses ? "Gestión General" : "Operación"}</span>
        </p>
        <NavItem
          to="/app"
          end
          icon={LayoutDashboard}
          label="Panel"
          hint={isAllWarehouses ? "Resumen consolidado de la empresa" : "Resumen y KPIs de la sede"}
          onNavigate={onNavigate}
        />

        {isAllWarehouses ? (
          <NavGroup
            label="Productos"
            icon={Package}
            hint="Catálogo, creación, cargue masivo e inventario inicial"
            matchPaths={[
              "/app/productos/*",
              "/app/inventario/inicial",
            ]}
            onNavigate={onNavigate}
            items={[
              {
                to: "/app/productos",
                end: true,
                icon: Package,
                label: "Catálogo",
                hint: "Catálogo de productos de toda la empresa",
              },
              {
                to: "/app/productos/nuevo",
                end: true,
                icon: PackagePlus,
                label: "Crear producto",
                hint: "Registrar un nuevo producto en el catálogo",
              },
              {
                to: "/app/productos/cargue-masivo",
                end: true,
                icon: Upload,
                label: "Cargue masivo",
                hint: "Importar productos masivamente",
              },
              {
                to: "/app/inventario/inicial",
                end: true,
                icon: ClipboardCheck,
                label: "Inventario inicial",
                hint: "Cargue de inventario inicial seleccionando por sede",
              },
            ]}
          />
        ) : null}

        {!isAllWarehouses ? (
          <>
            <NavGroup
              label="Inventario"
              icon={PackageSearch}
              hint="Stock y cierre de la sede"
              matchPaths={[
                "/app/inventario",
                "/app/inventario/cierre",
                "/app/inventario/producto/*",
              ]}
              onNavigate={onNavigate}
              items={[
                {
                  to: "/app/inventario",
                  end: true,
                  icon: PackageSearch,
                  label: "Stock",
                  hint: "Existencias de esta sede",
                },
                {
                  to: "/app/inventario/cierre",
                  end: true,
                  icon: ClipboardCheck,
                  label: "Cierre",
                  hint: "Cierre y cuadre de descuadre físico",
                },
              ]}
            />
            <NavItem
              to="/app/inventario/semaforo"
              end
              icon={Gauge}
              label="Alertas de stock"
              hint="Stock bajo, crítico y sin existencias en esta sede"
              onNavigate={onNavigate}
            />
            <NavGroup
              label="Entradas"
              icon={ArrowDownToLine}
              hint="Recepción e historial de entradas de la sede"
              matchPaths={[
                "/app/inventario/entrada",
                "/app/inventario/entradas/*",
              ]}
              onNavigate={onNavigate}
              items={[
                {
                  to: "/app/inventario/entrada",
                  end: true,
                  icon: ArrowDownToLine,
                  label: "Nueva entrada",
                  hint: "Recepción visual de stock",
                },
                {
                  to: "/app/inventario/entradas/historial",
                  end: true,
                  icon: History,
                  label: "Listado de entradas",
                  hint: "Entradas y órdenes registradas en esta sede",
                },
              ]}
            />
            <NavGroup
              label="Ventas y salidas"
              icon={ArrowUpFromLine}
              hint="Punto de venta y listado de ventas de la sede"
              matchPaths={[
                "/app/inventario/salida",
                "/app/inventario/salidas/*",
              ]}
              onNavigate={onNavigate}
              items={[
                {
                  to: "/app/inventario/salida",
                  end: true,
                  icon: ArrowUpFromLine,
                  label: "Nueva venta / salida",
                  hint: "Salida tipo punto de venta",
                },
                {
                  to: "/app/inventario/salidas/historial",
                  end: true,
                  icon: History,
                  label: "Listado de ventas",
                  hint: "Ventas y salidas registradas en esta sede",
                },
              ]}
            />
          </>
        ) : null}

        {isAllWarehouses ? (
          <NavItem
            to="/app/inventario/historial"
            end
            icon={History}
            label="Historial"
            hint="Historial de entradas y salidas de todas las sedes"
            onNavigate={onNavigate}
          />
        ) : null}

        <NavGroup
          label="Finanzas y Caja"
          icon={Wallet}
          hint="Control de cartera, créditos a clientes y arqueo de caja"
          matchPaths={["/app/finanzas/*"]}
          onNavigate={onNavigate}
          items={[
            {
              to: "/app/finanzas/cartera",
              end: true,
              icon: CreditCard,
              label: "Cuentas por cobrar",
              hint: "Créditos, abonos y saldos a favor",
            },
            {
              to: "/app/finanzas/apartados",
              end: true,
              icon: Bookmark,
              label: "Apartados (Separe)",
              hint: "Plan separe de clientes y control de abonos",
            },
            ...(isAllWarehouses ? [{
              to: "/app/finanzas/proveedores",
              end: true,
              icon: Truck,
              label: "Proveedores y Pagos",
              hint: "Cuentas por pagar a proveedores y saldos a favor",
            }] : []),
            {
              to: "/app/finanzas/egresos",
              end: true,
              icon: ArrowLeftRight,
              label: "Egresos y Traslados",
              hint: "Comprobantes de egreso, vales y traslados de efectivo",
            },
            {
              to: "/app/finanzas/nomina",
              end: true,
              icon: Users,
              label: "Nómina y Empleados",
              hint: "Liquidación de sueldos, vouchers y transferencias",
            },
            {
              to: "/app/finanzas/caja",
              end: true,
              icon: PiggyBank,
              label: "Arqueo y Medios",
              hint: "Arqueo de ingresos por efectivo, bancos y plataformas",
            },
            {
              to: "/app/finanzas/cierre-diario",
              end: false,
              icon: ShieldCheck,
              label: "Cierre Diario",
              hint: "Arqueo de caja acumulativo, arranques y auditoría de soportes",
            },
            {
              to: "/app/finanzas/cierre-general",
              end: true,
              icon: FileSpreadsheet,
              label: "Cierre General (Rango)",
              hint: "Consolidado contable por fechas, fondo en caja y retiro",
            },
          ]}
        />
        {isAllWarehouses && isSuperAdmin ? (
          <NavItem
            to="/app/inventario/utilidades"
            end
            icon={Wallet}
            label="Utilidades"
            hint="Margen, costos y rentabilidad"
            onNavigate={onNavigate}
          />
        ) : null}

        {isAllWarehouses && isSuperAdmin ? (
          <NavItem
            to="/app/configuracion/almacenes"
            end
            icon={Building2}
            label="Sedes"
            hint="Estructura de almacenes (super admin)"
            onNavigate={onNavigate}
          />
        ) : null}
        {isAllWarehouses && canOrgAdmin ? (
          <NavItem
            to="/app/configuracion/usuarios"
            end
            icon={Users}
            label="Usuarios y permisos"
            hint="Cuentas, roles y sedes asignadas"
            onNavigate={onNavigate}
          />
        ) : null}
      </nav>

      <div className="nav-rail__footer">
        <span
          className="nav-access-pill"
          title={isAllWarehouses ? "Sesión en Sede Administrativa" : `Operando en ${sessionLabel}`}
        >
          <span className="nav-access-pill__dot" aria-hidden />
          <span className="nav-access-pill__label">
            {isAllWarehouses ? "Sede Administrativa" : sessionLabel}
          </span>
        </span>
        <span className="nav-version">v0.1</span>
        <span className="nav-env">entorno interno</span>
      </div>
    </aside>
  );
}
