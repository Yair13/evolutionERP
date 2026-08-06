import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { WarehouseProvider } from "../../context/WarehouseContext.js";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";

/** Entrada/salida en tablet: menú en drawer para dejar espacio al carrito (venta con cliente). */
const POS_PATH = /^\/app\/inventario\/(entrada|salida)\/?$/;

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const isPosRoute = POS_PATH.test(location.pathname);
  /** En POS, tablets hasta ~10–11" usan menú hamburguesa (no rail fijo de PC). */
  const drawerMax = isPosRoute ? 1280 : 900;
  const railMin = drawerMax + 1;

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

  return (
    <WarehouseProvider>
      <div
        className={`shell${navOpen ? " shell--nav-open" : ""}${isPosRoute ? " shell--pos" : ""}`}
      >
        <button type="button" className="nav-backdrop" aria-label="Cerrar menú" onClick={() => setNavOpen(false)} />
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
        <div className="main">
          <Topbar onOpenNav={() => setNavOpen(true)} />
          <main className="content">
            <Outlet />
          </main>
        </div>
      </div>
    </WarehouseProvider>
  );
}
