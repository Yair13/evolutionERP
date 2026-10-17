import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";
import { MobileBottomNav } from "./MobileBottomNav.js";

/** Entrada/salida en tablet: menú en drawer para dejar espacio al carrito (venta con cliente). */
const POS_PATH = /^\/app\/inventario\/(entrada|salida)\/?$/;
const NAV_PIN_STORAGE_KEY = "evolution_nav_pinned";

export function AppLayout() {
  const { loading, hasSelectedScope } = useWarehouse();
  const [navOpen, setNavOpen] = useState(false);
  const [navPinned, setNavPinned] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(NAV_PIN_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const isPosRoute = POS_PATH.test(location.pathname);
  /** En POS, tablets hasta ~10–11" usan menú hamburguesa (no rail fijo de PC). */
  const drawerMax = isPosRoute ? 1280 : 900;
  const railMin = drawerMax + 1;

  const toggleNavPin = () => {
    setNavPinned((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(NAV_PIN_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!navOpen) return;
    const mq = window.matchMedia(`(max-width: ${drawerMax}px)`);
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen, drawerMax]);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${railMin}px)`);
    const onChange = () => {
      if (mq.matches) setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [railMin]);

  if (loading) {
    return (
      <div className="shell">
        <div className="main" style={{ display: "grid", placeItems: "center" }}>
          <p className="muted">Cargando sesión de sede…</p>
        </div>
      </div>
    );
  }

  if (!hasSelectedScope) {
    return <Navigate to="/seleccionar-sede" replace />;
  }

  return (
    <div
      className={`shell${navOpen ? " shell--nav-open" : ""}${navPinned ? " shell--nav-pinned" : ""}${isPosRoute ? " shell--pos" : ""}`}
    >
      <button type="button" className="nav-backdrop" aria-label="Cerrar menú" onClick={() => setNavOpen(false)} />
      <Sidebar
        open={navOpen}
        pinned={navPinned}
        onTogglePin={toggleNavPin}
        onNavigate={() => setNavOpen(false)}
      />
      <div className="main">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="content">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav onOpenMenu={() => setNavOpen((v) => !v)} menuOpen={navOpen} />
    </div>
  );
}
