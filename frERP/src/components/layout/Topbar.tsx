import { LogOut, Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext.js";
import { SessionScopeSelect } from "./SessionScopeSelect.js";

type Props = {
  onOpenNav?: () => void;
};

function initialsFromName(name: string | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    return `${a}${b}`.toUpperCase();
  }
  const w = parts[0];
  return w.length >= 2 ? w.slice(0, 2).toUpperCase() : `${w[0]}`.toUpperCase();
}

function formatRoleLabel(role: string): string {
  return role.replace(/_/g, " ");
}

export function Topbar({ onOpenNav }: Props) {
  const { user, logout } = useAuth();
  const initials = initialsFromName(user?.fullName);
  const primaryRole = user?.roles?.[0];
  const rolesTitle = (user?.roles ?? []).map(formatRoleLabel).join(", ");
  const handle = user?.email ? (user.email.includes("@") ? user.email : `@${user.email}`) : "";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-burger"
          aria-label="Abrir menú"
          aria-expanded={false}
          onClick={onOpenNav}
        >
          <Menu size={22} strokeWidth={2} aria-hidden />
        </button>
        <div className="topbar-product">
          <span className="topbar-product__name">Evolution</span>
          <span className="topbar-product__badge" aria-hidden>
            ERP
          </span>
        </div>
      </div>
      <div className="topbar-right">
        <div className="topbar-session" title={rolesTitle}>
          <SessionScopeSelect />
          <span className="topbar-session__divider" aria-hidden />
          <div className="topbar-avatar" aria-hidden>
            <span className="topbar-avatar__inner">{initials}</span>
          </div>
          <div className="topbar-user">
            <span className="topbar-user__name">{user?.fullName ?? "—"}</span>
            <span className="topbar-user__email">{handle}</span>
            {primaryRole ? (
              <span className="topbar-user__role-pill">{formatRoleLabel(primaryRole)}</span>
            ) : null}
          </div>
          <button type="button" className="topbar-logout" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <LogOut size={18} strokeWidth={2} aria-hidden />
            <span className="topbar-logout__text">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
