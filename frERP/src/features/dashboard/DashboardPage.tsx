import { Building2, Calendar, Clock, ShieldCheck, Sparkles, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";

function getGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatRole(role?: string): string {
  if (!role) return "Usuario";
  if (role === "super_admin") return "Super Admin";
  if (role === "secretaria") return "Secretaría";
  return role.replace(/_/g, " ");
}

export function DashboardPage() {
  const { user } = useAuth();
  const { isAllWarehouses, sessionLabel } = useWarehouse();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const greeting = useMemo(() => getGreeting(now), [now]);

  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now),
    [now]
  );

  const formattedTime = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(now),
    [now]
  );

  const primaryRole = formatRole(user?.roles?.[0]);

  return (
    <div className="dashboard dashboard--welcome">
      <section className="welcome-stage" aria-label="Bienvenida Colchones Evolution">
        <div className="welcome-stage__bg" aria-hidden />
        <div className="welcome-stage__aurora" aria-hidden />
        <div className="welcome-stage__grid" aria-hidden />
        <div className="welcome-stage__vignette" aria-hidden />

        <div className="welcome-stage__inner">
          <div className="welcome-stage__copy">
            <div className="welcome-stage__eyebrow-row">
              <span className="welcome-stage__eyebrow">
                <Sparkles size={14} strokeWidth={2} className="welcome-stage__eyebrow-icon" aria-hidden />
                Plataforma Corporativa · Evolution ERP
              </span>
            </div>

            <p className="welcome-stage__greeting">{greeting},</p>
            <h1 className="welcome-stage__title">
              Bienvenido,{" "}
              <span className="welcome-stage__title-accent">{user?.fullName ?? "Administrador"}</span>
            </h1>

            <p className="welcome-stage__lead">
              Sistema integral de gestión operativa, inventario y control corporativo de{" "}
              <strong>Colchones Evolution S.A.S</strong>. Selecciona cualquier módulo en el menú lateral para comenzar.
            </p>

            <div className="welcome-stage__pills" aria-label="Estado de la sesión">
              <div className="welcome-pill welcome-pill--primary">
                <span className="welcome-pill__icon" aria-hidden>
                  {isAllWarehouses ? <Building2 size={16} strokeWidth={2} /> : <Store size={16} strokeWidth={2} />}
                </span>
                <div className="welcome-pill__meta">
                  <span className="welcome-pill__label">Ámbito activo</span>
                  <strong className="welcome-pill__value">
                    {isAllWarehouses ? "Sede Administrativa · Gestión General" : sessionLabel}
                  </strong>
                </div>
              </div>

              <div className="welcome-pill">
                <span className="welcome-pill__icon" aria-hidden>
                  <ShieldCheck size={16} strokeWidth={2} />
                </span>
                <div className="welcome-pill__meta">
                  <span className="welcome-pill__label">Perfil de acceso</span>
                  <strong className="welcome-pill__value">{primaryRole}</strong>
                </div>
              </div>

              <div className="welcome-pill">
                <span className="welcome-pill__icon" aria-hidden>
                  <Calendar size={16} strokeWidth={2} />
                </span>
                <div className="welcome-pill__meta">
                  <span className="welcome-pill__label">{formattedDate}</span>
                  <strong className="welcome-pill__value welcome-pill__value--time">
                    <Clock size={13} strokeWidth={2} aria-hidden />
                    {formattedTime}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="welcome-stage__brand">
            <div className="welcome-brand-showcase">
              <div className="welcome-brand-showcase__halo" aria-hidden />
              <div className="welcome-brand-showcase__ring" aria-hidden />
              <div className="welcome-brand-showcase__card">
                <div className="welcome-brand-showcase__art-wrap">
                  <img
                    src="/logo-evolution-login-hero.png?v=12"
                    alt="Colchones Evolution S.A.S"
                    className="welcome-brand-showcase__art"
                  />
                  <div className="welcome-brand-showcase__art-shine" aria-hidden />
                </div>
                <div className="welcome-brand-showcase__footer">
                  <div className="welcome-brand-showcase__seal">
                    <img src="/logo-evolution.png?v=4" alt="" aria-hidden />
                  </div>
                  <div className="welcome-brand-showcase__caption">
                    <strong>Colchones Evolution S.A.S</strong>
                    <span>Calidad, confort y gestión en tiempo real</span>
                  </div>
                  <span className="welcome-brand-showcase__status">
                    <span className="welcome-brand-showcase__dot" aria-hidden />
                    En línea
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
