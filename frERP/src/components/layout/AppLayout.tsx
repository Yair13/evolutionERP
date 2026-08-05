import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { WarehouseProvider } from "../../context/WarehouseContext.js";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!navOpen) return;
    const mq = window.matchMedia("(max-width: 900px)");
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const onChange = () => {
      if (mq.matches) setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <WarehouseProvider>
      <div className={`shell${navOpen ? " shell--nav-open" : ""}`}>
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
