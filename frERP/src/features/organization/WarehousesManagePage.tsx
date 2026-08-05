import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../api/client.js";
import { Modal } from "../../components/ui/Modal.js";
import { useAuth } from "../../context/AuthContext.js";
import type { WarehouseRow } from "./organization.types.js";

export function WarehousesManagePage() {
  const { token } = useAuth();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
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
          <label className="field field--row" style={{ alignSelf: "flex-end", marginBottom: "8px" }}>
            <input type="checkbox" checked={isFactory} onChange={(e) => setIsFactory(e.target.checked)} />
            <span>¿Es Fábrica?</span>
          </label>
          <button type="submit" className="btn primary" style={{ alignSelf: "flex-end", marginBottom: "8px" }}>
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
                  <td>
                    <code>{w.code}</code>
                  </td>
                  <td>{w.name}</td>
                  <td>{w.is_factory ? <span className="pill pill--ok" style={{ background: "rgba(37,99,235,0.1)", color: "#1d4ed8", borderColor: "rgba(37,99,235,0.22)" }}>Fábrica</span> : <span className="pill pill--off" style={{ background: "#f1f5f9", color: "#475569" }}>Punto Venta</span>}</td>
                  <td>{w.is_active ? <span className="pill pill--ok">Activo</span> : <span className="pill pill--off">Inactivo</span>}</td>
                  <td className="num">
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
    </div>
  );
}
