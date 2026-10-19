import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../api/client.js";
import { Modal } from "../../components/ui/Modal.js";
import { useAuth } from "../../context/AuthContext.js";
import { useWarehouse } from "../../context/WarehouseContext.js";
import { clearAllPosDrafts } from "../../lib/posDraft.js";
import { clearScanCache } from "../../lib/scanCache.js";
import type { WarehouseRow } from "./organization.types.js";

interface SystemResetResponse {
  ok: boolean;
  keptWarehouse: { id: string; code: string; name: string };
  keptUser: { id: string; email: string; fullName: string };
}

export function WarehousesManagePage() {
  const { token } = useAuth();
  const { reload: reloadWarehouses } = useWarehouse();
  const [items, setItems] = useState<WarehouseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const [edit, setEdit] = useState<WarehouseRow | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editFactory, setEditFactory] = useState(false);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const [cleanTestModalOpen, setCleanTestModalOpen] = useState(false);
  const [cleanTestConfirmText, setCleanTestConfirmText] = useState("");
  const [cleanTestBusy, setCleanTestBusy] = useState(false);
  const [cleanTestError, setCleanTestError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: WarehouseRow[] }>("/warehouses/manage", token);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!edit) return;
    setEditCode(edit.code);
    setEditName(edit.name);
    setEditAddress(edit.address ?? "");
    setEditActive(edit.is_active);
    setEditFactory(edit.is_factory ?? false);
  }, [edit]);

  const [isFactory, setIsFactory] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await apiPost<{ item: WarehouseRow }>(
        "/warehouses",
        { code: code.trim(), name: name.trim(), address: address.trim() || null, is_factory: isFactory },
        token
      );
      setCode("");
      setName("");
      setAddress("");
      setIsFactory(false);
      await load();
      await reloadWarehouses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !edit) return;
    setError(null);
    try {
      await apiPatch(
        `/warehouses/${edit.id}`,
        {
          code: editCode.trim(),
          name: editName.trim(),
          address: editAddress.trim() || null,
          is_active: editActive,
          is_factory: editFactory,
        },
        token
      );
      setEdit(null);
      await load();
      await reloadWarehouses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function onResetSystem(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (resetConfirmText.trim().toUpperCase() !== "ELIMINAR TODO") {
      setResetError('Debes escribir exactamente "ELIMINAR TODO" para confirmar.');
      return;
    }
    setResetBusy(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      const res = await apiPost<SystemResetResponse>(
        "/system/reset",
        { confirmText: resetConfirmText.trim().toUpperCase() },
        token
      );
      clearAllPosDrafts();
      clearScanCache();
      setResetModalOpen(false);
      setResetConfirmText("");
      setResetSuccess(
        `Sistema reiniciado correctamente. Solo quedaron la sede "${res.keptWarehouse.name}" (${res.keptWarehouse.code}) y el super administrador "${res.keptUser.email}".`
      );
      await load();
      await reloadWarehouses();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Error al reiniciar el sistema");
    } finally {
      setResetBusy(false);
    }
  }

  async function onCleanTestData(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (cleanTestConfirmText.trim().toUpperCase() !== "LIMPIAR PRUEBAS") {
      setCleanTestError('Debes escribir exactamente "LIMPIAR PRUEBAS" para confirmar.');
      return;
    }
    setCleanTestBusy(true);
    setCleanTestError(null);
    setResetSuccess(null);
    try {
      const res = await apiPost<{
        ok: boolean;
        message: string;
        keptCounts: {
          warehouses: number;
          users: number;
          products: number;
          suppliers: number;
          employees: number;
          customers: number;
        };
      }>("/system/clean-test-data", { confirmText: cleanTestConfirmText.trim().toUpperCase() }, token);

      clearAllPosDrafts();
      clearScanCache();
      setCleanTestModalOpen(false);
      setCleanTestConfirmText("");
      setResetSuccess(
        `${res.message} Se conservaron intactos: ${res.keptCounts.products} productos, ${res.keptCounts.warehouses} sedes, ${res.keptCounts.users} usuarios, ${res.keptCounts.suppliers} proveedores y ${res.keptCounts.employees} empleados.`
      );
      await load();
      await reloadWarehouses();
    } catch (err) {
      setCleanTestError(err instanceof Error ? err.message : "Error al limpiar datos de prueba");
    } finally {
      setCleanTestBusy(false);
    }
  }

  const sorted = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);

  return (
    <div className="page org-page">
      <header className="page-header">
        <h1>Administración de almacenes</h1>
        <p className="page-desc">
          Alta y edición de sedes / almacenes de la empresa. Solo el <strong>super administrador</strong> puede crear o
          desactivar sedes; el resto de roles usa la vista <strong>Almacenes</strong> para operar.
        </p>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {resetSuccess ? (
        <div
          style={{
            padding: "0.9rem 1.1rem",
            borderRadius: "10px",
            background: "rgba(22, 163, 74, 0.12)",
            border: "1px solid rgba(22, 163, 74, 0.35)",
            color: "#15803d",
            fontWeight: 600,
            marginBottom: "1rem",
          }}
        >
          {resetSuccess}
        </div>
      ) : null}

      <section className="org-card">
        <h2 className="org-card__title">Nuevo almacén</h2>
        <form className="org-form" onSubmit={onCreate}>
          <label className="field">
            <span>Código interno</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="p. ej. BOG_NORTE" />
          </label>
          <label className="field">
            <span>Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nombre visible" />
          </label>
          <label className="field field--grow">
            <span>Dirección (opcional)</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, ciudad…" />
          </label>
          <label className="field field--row org-form__inline-check">
            <input type="checkbox" checked={isFactory} onChange={(e) => setIsFactory(e.target.checked)} />
            <span>¿Es Fábrica?</span>
          </label>
          <button type="submit" className="btn primary org-form__submit">
            Crear
          </button>
        </form>
      </section>

      {loading ? <p className="muted">Cargando…</p> : null}

      {!loading ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th className="num">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => (
                <tr key={w.id}>
                  <td data-label="Código">
                    <code>{w.code}</code>
                  </td>
                  <td data-label="Nombre">{w.name}</td>
                  <td data-label="Tipo">
                    {w.is_factory ? (
                      <span
                        className="pill pill--ok"
                        style={{ background: "rgba(37,99,235,0.1)", color: "#1d4ed8", borderColor: "rgba(37,99,235,0.22)" }}
                      >
                        Fábrica
                      </span>
                    ) : (
                      <span className="pill pill--off" style={{ background: "#f1f5f9", color: "#475569" }}>
                        Punto Venta
                      </span>
                    )}
                  </td>
                  <td data-label="Estado">
                    {w.is_active ? <span className="pill pill--ok">Activo</span> : <span className="pill pill--off">Inactivo</span>}
                  </td>
                  <td data-label="Acciones" className="num">
                    <button type="button" className="btn ghost sm" onClick={() => setEdit(w)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Sección 1: Limpiar datos de prueba para arrancar en vivo (Conserva productos, sedes, usuarios) */}
      <section
        className="org-card"
        style={{
          marginTop: "2rem",
          borderColor: "rgba(245, 158, 11, 0.4)",
          background: "rgba(254, 243, 199, 0.25)",
        }}
      >
        <h2 className="org-card__title" style={{ color: "#d97706" }}>
          Puesta en Marcha Oficial · Limpiar Movimientos de Prueba
        </h2>
        <p className="page-desc" style={{ marginBottom: "0.5rem" }}>
          Elimina <strong>todas las ventas, facturas, movimientos de stock, créditos, apartados, egresos, traslados, nóminas y cierres de caja</strong> de prueba para arrancar la operación en ceros.
        </p>
        <p className="page-desc" style={{ marginBottom: "1rem", color: "#16a34a", fontWeight: 600 }}>
          ✓ CONSERVA INTACTOS: Todos los productos creados, precios, imágenes, códigos de barras, sedes, usuarios, roles, proveedores y empleados.
        </p>
        <button
          type="button"
          className="btn"
          style={{
            background: "#d97706",
            color: "#fff",
            borderColor: "#b45309",
            fontWeight: 600,
          }}
          onClick={() => {
            setCleanTestConfirmText("");
            setCleanTestError(null);
            setCleanTestModalOpen(true);
          }}
        >
          Limpiar datos de prueba (Arrancar en limpio)…
        </button>
      </section>

      {/* Sección 2: Reinicio Total a Fábrica */}
      <section
        className="org-card"
        style={{
          marginTop: "1.5rem",
          borderColor: "rgba(220, 38, 38, 0.35)",
          background: "rgba(254, 242, 242, 0.45)",
        }}
      >
        <h2 className="org-card__title" style={{ color: "#b91c1c" }}>
          Zona de peligro · Reinicio total a fábrica
        </h2>
        <p className="page-desc" style={{ marginBottom: "1rem" }}>
          Elimina <strong>absolutamente todo</strong>: productos, imágenes, clientes, gastos, cierres, otras sedes y otros usuarios.
          Únicamente se conservarán la sede <strong>Principal (MAIN)</strong> y tu cuenta de <strong>Super Administrador</strong>.
        </p>
        <button
          type="button"
          className="btn"
          style={{
            background: "#dc2626",
            color: "#fff",
            borderColor: "#b91c1c",
            fontWeight: 600,
          }}
          onClick={() => {
            setResetConfirmText("");
            setResetError(null);
            setResetModalOpen(true);
          }}
        >
          Limpiar todo el sistema…
        </button>
      </section>

      <Modal open={!!edit} title="Editar almacén" onClose={() => setEdit(null)}>
        {edit ? (
          <form className="org-form org-form--stack" onSubmit={onSaveEdit}>
            <label className="field">
              <span>Código</span>
              <input value={editCode} onChange={(e) => setEditCode(e.target.value)} required />
            </label>
            <label className="field">
              <span>Nombre</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Dirección</span>
              <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </label>
            <label className="field field--row">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
              <span>Activo (visible en operación)</span>
            </label>
            <label className="field field--row">
              <input type="checkbox" checked={editFactory} onChange={(e) => setEditFactory(e.target.checked)} />
              <span>Es fábrica (habilita OP a la salida)</span>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn primary">
                Guardar
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Modal: Limpiar solo movimientos de prueba */}
      <Modal
        open={cleanTestModalOpen}
        title="Limpiar movimientos de prueba (Arrancar en vivo)"
        onClose={() => {
          if (!cleanTestBusy) setCleanTestModalOpen(false);
        }}
      >
        <form className="org-form org-form--stack" onSubmit={onCleanTestData}>
          <p style={{ margin: 0, lineHeight: 1.5, color: "#334155" }}>
            Esta acción borrará todas las <strong>ventas, facturas, compras, stock/movimientos, créditos, apartados, egresos, traslados, nómina y cierres</strong> de prueba.
          </p>
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: "8px",
              fontSize: "0.85rem",
              color: "#065f46",
              fontWeight: 500,
            }}
          >
            ✓ Se conservarán intactos: Catálogo de productos, fotos, precios, códigos de barras, sedes, usuarios, empleados y proveedores.
          </div>
          {cleanTestError ? <p className="form-error">{cleanTestError}</p> : null}
          <label className="field">
            <span>
              Escribe <strong>LIMPIAR PRUEBAS</strong> para confirmar:
            </span>
            <input
              value={cleanTestConfirmText}
              onChange={(e) => setCleanTestConfirmText(e.target.value)}
              placeholder="LIMPIAR PRUEBAS"
              autoFocus
              required
              disabled={cleanTestBusy}
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={cleanTestBusy}
              onClick={() => setCleanTestModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn"
              disabled={cleanTestBusy || cleanTestConfirmText.trim().toUpperCase() !== "LIMPIAR PRUEBAS"}
              style={{
                background: "#d97706",
                color: "#fff",
                borderColor: "#b45309",
                fontWeight: 600,
              }}
            >
              {cleanTestBusy ? "Limpiando pruebas…" : "Sí, limpiar pruebas y arrancar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Reinicio total a fábrica */}
      <Modal
        open={resetModalOpen}
        title="Confirmar limpieza total del sistema"
        onClose={() => {
          if (!resetBusy) setResetModalOpen(false);
        }}
      >
        <form className="org-form org-form--stack" onSubmit={onResetSystem}>
          <p style={{ margin: 0, lineHeight: 1.5, color: "#334155" }}>
            Esta acción es <strong>irreversible</strong>. Se borrarán todos los productos, fotos, movimientos de inventario,
            entradas, salidas, conteos, clientes, sedes adicionales y usuarios adicionales.
          </p>
          <p style={{ margin: 0, lineHeight: 1.5, color: "#334155" }}>
            Solo quedarán la sede <strong>Principal (MAIN)</strong> y tu usuario <strong>Super Administrador</strong>.
          </p>
          {resetError ? <p className="form-error">{resetError}</p> : null}
          <label className="field">
            <span>
              Escribe <strong>ELIMINAR TODO</strong> para confirmar:
            </span>
            <input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="ELIMINAR TODO"
              autoFocus
              required
              disabled={resetBusy}
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={resetBusy}
              onClick={() => setResetModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn"
              disabled={resetBusy || resetConfirmText.trim().toUpperCase() !== "ELIMINAR TODO"}
              style={{
                background: "#dc2626",
                color: "#fff",
                borderColor: "#b91c1c",
                fontWeight: 600,
              }}
            >
              {resetBusy ? "Limpiando sistema…" : "Sí, limpiar todo el sistema"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

