import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../api/client.js";
import { Modal } from "../../components/ui/Modal.js";
import { useAuth } from "../../context/AuthContext.js";
import type { RoleRow, UserRow, WarehouseRow } from "./organization.types.js";

const roleLabelEs: Record<string, string> = {
  super_admin: "Super administrador",
  secretaria: "Secretaría administrativa",
  admin_local: "Administrador de local",
};

export function UsersManagePage() {
  const { token, user } = useAuth();
  const canAssignSuperAdmin = user?.roles.includes("super_admin") ?? false;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<RoleRow[]>([]);
  const [warehouseCatalog, setWarehouseCatalog] = useState<WarehouseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<UserRow | null>(null);

  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cName, setCName] = useState("");
  const [cRoles, setCRoles] = useState<string[]>([]);
  const [cAdminAccess, setCAdminAccess] = useState(false);
  const [cWh, setCWh] = useState<string[]>([]);

  const [eName, setEName] = useState("");
  const [eActive, setEActive] = useState(true);
  const [eRoles, setERoles] = useState<string[]>([]);
  const [eAdminAccess, setEAdminAccess] = useState(false);
  const [eWh, setEWh] = useState<string[]>([]);
  const [ePassword, setEPassword] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [u, r, w] = await Promise.all([
        apiGet<{ items: UserRow[] }>("/users", token),
        apiGet<{ items: RoleRow[] }>("/roles", token),
        apiGet<{ items: WarehouseRow[] }>("/warehouses/manage", token),
      ]);
      setUsers(u.items);
      setRoleCatalog(r.items);
      setWarehouseCatalog(w.items);
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
    setEName(edit.fullName);
    setEActive(edit.isActive);
    setERoles([...edit.roles]);
    setEAdminAccess(Boolean(edit.hasAdminAccess || edit.roles.includes("super_admin")));
    setEWh([...edit.warehouseIds]);
    setEPassword("");
  }, [edit]);

  const roleOptions = useMemo(
    () => roleCatalog.filter((r) => (r.code === "super_admin" ? canAssignSuperAdmin : true)),
    [roleCatalog, canAssignSuperAdmin]
  );

  function toggle(list: string[], code: string, on: boolean) {
    const set = new Set(list);
    if (on) set.add(code);
    else set.delete(code);
    return [...set];
  }

  const cIsSuperAdmin = cRoles.includes("super_admin");
  const eIsSuperAdmin = eRoles.includes("super_admin");

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (cRoles.length === 0) {
      setError("Selecciona al menos un rol.");
      return;
    }
    setError(null);
    try {
      await apiPost(
        "/users",
        {
          username: cEmail.trim().toLowerCase(),
          password: cPassword,
          fullName: cName.trim(),
          roleCodes: cRoles,
          hasAdminAccess: cIsSuperAdmin ? true : cAdminAccess,
          warehouseIds: cIsSuperAdmin ? [] : cWh,
        },
        token
      );
      setCreateOpen(false);
      setCEmail("");
      setCPassword("");
      setCName("");
      setCRoles([]);
      setCAdminAccess(false);
      setCWh([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !edit) return;
    if (eRoles.length === 0) {
      setError("Selecciona al menos un rol.");
      return;
    }
    setError(null);
    try {
      const body: Record<string, unknown> = {
        fullName: eName.trim(),
        is_active: eActive,
        roleCodes: eRoles,
        hasAdminAccess: eIsSuperAdmin ? true : eAdminAccess,
        warehouseIds: eIsSuperAdmin ? [] : eWh,
      };
      if (ePassword.trim().length > 0) body.password = ePassword;
      await apiPatch(`/users/${edit.id}`, body, token);
      setEdit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="page org-page">
      <header className="page-header">
        <h1>Usuarios y permisos</h1>
        <p className="page-desc">
          Alta de cuentas, asignación de roles, permiso de acceso a la <strong>Sede Administrativa</strong> y sedes
          operativas asignadas.
        </p>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="org-toolbar">
        <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
          Nuevo usuario
        </button>
      </div>

      {loading ? <p className="muted">Cargando…</p> : null}

      {!loading ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Roles</th>
                <th>Sedes y acceso</th>
                <th>Estado</th>
                <th className="num">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSuper = u.roles.includes("super_admin");
                return (
                  <tr key={u.id}>
                    <td data-label="Usuario">
                      <div className="cell-stack">
                        <span className="cell-strong">{u.fullName}</span>
                        <span className="muted">{u.email.includes("@") ? u.email : `@${u.email}`}</span>
                      </div>
                    </td>
                    <td data-label="Roles">
                      <div className="tag-row">
                        {u.roles.map((r) => (
                          <span key={r} className="pill pill--neutral">
                            {roleLabelEs[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td data-label="Sedes y acceso">
                      <div className="tag-row">
                        {u.hasAdminAccess || isSuper ? (
                          <span className="pill pill--info">Sede Administrativa</span>
                        ) : null}
                        {isSuper ? (
                          <span className="pill pill--neutral">Todas las sedes</span>
                        ) : u.warehouseIds.length ? (
                          <span className="pill pill--neutral">{u.warehouseIds.length} sede(s)</span>
                        ) : !u.hasAdminAccess ? (
                          <span className="muted">—</span>
                        ) : null}
                      </div>
                    </td>
                    <td data-label="Estado">
                      {u.isActive ? (
                        <span className="pill pill--ok">Activo</span>
                      ) : (
                        <span className="pill pill--off">Inactivo</span>
                      )}
                    </td>
                    <td data-label="Acciones" className="num">
                      <button type="button" className="btn ghost sm" onClick={() => setEdit(u)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal open={createOpen} title="Nuevo usuario" onClose={() => setCreateOpen(false)}>
        <form className="org-form org-form--stack" onSubmit={onCreate}>
          <label className="field">
            <span>Usuario</span>
            <input
              type="text"
              value={cEmail}
              onChange={(e) => setCEmail(e.target.value)}
              required
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={3}
              pattern="[A-Za-z0-9._@+\-]{3,}"
              placeholder="p. ej. juan, ana.lopez o juan@empresa.com"
              title="Mínimo 3 caracteres. Letras, números, punto, guion bajo, guion, + y @"
            />
          </label>
          <label className="field">
            <span>Contraseña inicial</span>
            <input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} required minLength={8} />
          </label>
          <label className="field">
            <span>Nombre completo</span>
            <input value={cName} onChange={(e) => setCName(e.target.value)} required />
          </label>
          <fieldset className="fieldset">
            <legend>Roles</legend>
            <div className="checks">
              {roleOptions.map((r) => (
                <label key={r.id} className="check">
                  <input
                    type="checkbox"
                    checked={cRoles.includes(r.code)}
                    onChange={(e) => {
                      const next = toggle(cRoles, r.code, e.target.checked);
                      setCRoles(next);
                      if (e.target.checked && (r.code === "super_admin" || r.code === "secretaria")) {
                        setCAdminAccess(true);
                      }
                    }}
                  />
                  <span>{roleLabelEs[r.code] ?? r.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="fieldset">
            <legend>Parte administrativa</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={cIsSuperAdmin ? true : cAdminAccess}
                disabled={cIsSuperAdmin}
                onChange={(e) => setCAdminAccess(e.target.checked)}
              />
              <span>
                <strong>Acceso a Sede Administrativa</strong> · Permite ingresar a la sede administrativa al iniciar sesión
              </span>
            </label>
          </fieldset>
          <fieldset className="fieldset" disabled={cIsSuperAdmin}>
            <legend>Sedes operativas asignadas</legend>
            {cIsSuperAdmin ? (
              <p className="field-hint">
                El rol <strong>Super administrador</strong> tiene acceso a todas las sedes operativas de forma automática.
              </p>
            ) : (
              <p className="field-hint">Marca las sedes operativas a las que puede ingresar este usuario.</p>
            )}
            <div className="checks checks--grid">
              {warehouseCatalog.map((w) => (
                <label key={w.id} className="check">
                  <input
                    type="checkbox"
                    checked={cIsSuperAdmin ? true : cWh.includes(w.id)}
                    disabled={cIsSuperAdmin}
                    onChange={(e) => setCWh(toggle(cWh, w.id, e.target.checked))}
                  />
                  <span>
                    <strong>{w.code}</strong> · {w.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn primary">
              Crear
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!edit} title="Editar usuario" onClose={() => setEdit(null)}>
        {edit ? (
          <form className="org-form org-form--stack" onSubmit={onSaveEdit}>
            <p className="muted">
              <strong>Usuario:</strong> {edit.email}
            </p>
            <label className="field">
              <span>Nombre completo</span>
              <input value={eName} onChange={(e) => setEName(e.target.value)} required />
            </label>
            <label className="field field--row">
              <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
              <span>Usuario activo</span>
            </label>
            <label className="field">
              <span>Nueva contraseña (opcional)</span>
              <input type="password" value={ePassword} onChange={(e) => setEPassword(e.target.value)} minLength={8} />
            </label>
            <fieldset className="fieldset">
              <legend>Roles</legend>
              <div className="checks">
                {roleOptions.map((r) => (
                  <label key={r.id} className="check">
                    <input
                      type="checkbox"
                      checked={eRoles.includes(r.code)}
                      onChange={(e) => setERoles(toggle(eRoles, r.code, e.target.checked))}
                    />
                    <span>{roleLabelEs[r.code] ?? r.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="fieldset">
              <legend>Parte administrativa</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={eIsSuperAdmin ? true : eAdminAccess}
                  disabled={eIsSuperAdmin}
                  onChange={(e) => setEAdminAccess(e.target.checked)}
                />
                <span>
                  <strong>Acceso a Sede Administrativa</strong> · Permite ingresar a la sede administrativa al iniciar sesión
                </span>
              </label>
            </fieldset>
            <fieldset className="fieldset" disabled={eIsSuperAdmin}>
              <legend>Sedes operativas asignadas</legend>
              {eIsSuperAdmin ? (
                <p className="field-hint">
                  El rol <strong>Super administrador</strong> tiene acceso a todas las sedes operativas de forma automática.
                </p>
              ) : (
                <p className="field-hint">Marca las sedes operativas a las que puede ingresar este usuario.</p>
              )}
              <div className="checks checks--grid">
                {warehouseCatalog.map((w) => (
                  <label key={w.id} className="check">
                    <input
                      type="checkbox"
                      checked={eIsSuperAdmin ? true : eWh.includes(w.id)}
                      disabled={eIsSuperAdmin}
                      onChange={(e) => setEWh(toggle(eWh, w.id, e.target.checked))}
                    />
                    <span>
                      <strong>{w.code}</strong> · {w.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
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
