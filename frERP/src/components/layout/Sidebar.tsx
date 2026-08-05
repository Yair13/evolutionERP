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
  Cpu,
  LayoutDashboard,
  Package,
  PackageSearch,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";

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
      title={hint}
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
        title={hint}
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
  onNavigate?: () => void;
};

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { user } = useAuth();
  const isSuperAdmin = user?.roles.includes("super_admin") ?? false;
  const canOrgAdmin = user?.roles.some((r) => r === "super_admin" || r === "secretaria") ?? false;
  const hasFullAccess = canOrgAdmin;

  const systemItems: NavGroupChild[] = [];
  if (isSuperAdmin) {
    systemItems.push({
      to: "/app/configuracion/almacenes",
      end: true,
      icon: Building2,
      label: "Sedes",
      hint: "Estructura de almacenes (super admin)",
    });
  }
  if (canOrgAdmin) {
    systemItems.push({
      to: "/app/configuracion/usuarios",
      end: true,
      icon: Users,
      label: "Usuarios",
      hint: "Cuentas y permisos",
    });
  }

  return (
    <aside className={`nav-rail${open ? " nav-rail--open" : ""}`} aria-label="Navegación principal">
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
      </div>

      <nav className="nav-stack" aria-label="Módulos">
        <p className="nav-section">
          <span className="nav-section__line" aria-hidden />
          Operación
        </p>
        <NavItem to="/app" end icon={LayoutDashboard} label="Panel" hint="Resumen y KPIs" onNavigate={onNavigate} />
        <NavItem
          to="/app/productos"
          icon={Package}
          label="Productos"
          hint="Catálogo de toda la empresa"
          onNavigate={onNavigate}
        />
        <NavGroup
          label="Inventario"
          icon={PackageSearch}
          hint="Stock y cierre por sede"
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
              hint: "Existencias por sede",
            },
            {
              to: "/app/inventario/cierre",
              end: true,
              icon: ClipboardCheck,
              label: "Cierre",
              hint: "Inventario inicial y cierre de descuadre",
            },
          ]}
        />
        <NavItem
          to="/app/inventario/semaforo"
          end
          icon={Gauge}
          label="Alertas de stock"
          hint="Stock bajo, crítico y sin existencias por sede"
          onNavigate={onNavigate}
        />
        <NavItem
          to="/app/inventario/entrada"
          end
          icon={ArrowDownToLine}
          label="Entrada"
          hint="Recepción visual de stock"
          onNavigate={onNavigate}
        />
        <NavItem
          to="/app/inventario/salida"
          end
          icon={ArrowUpFromLine}
          label="Salida"
          hint="Salida tipo punto de venta"
          onNavigate={onNavigate}
        />
        <NavItem
          to="/app/inventario/historial"
          end
          icon={History}
          label="Historial"
          hint="Entradas y salidas registradas"
          onNavigate={onNavigate}
        />
        {isSuperAdmin ? (
          <NavItem
            to="/app/inventario/utilidades"
            end
            icon={Wallet}
            label="Utilidades"
            hint="Margen, costos y rentabilidad"
            onNavigate={onNavigate}
          />
        ) : null}

        {systemItems.length > 0 ? (
          <NavGroup
            label="Sistema"
            icon={Cpu}
            hint="Sedes y usuarios"
            matchPaths={["/app/configuracion/*"]}
            onNavigate={onNavigate}
            items={systemItems}
            spaced
          />
        ) : null}
      </nav>

      <div className="nav-rail__footer">
        {hasFullAccess ? (
          <span className="nav-access-pill" title="Tu rol opera sobre toda la empresa">
            <span className="nav-access-pill__dot" aria-hidden />
            Acceso total · todas las sedes
          </span>
        ) : null}
        <span className="nav-version">v0.1</span>
        <span className="nav-env">entorno interno</span>
      </div>
    </aside>
  );
}
