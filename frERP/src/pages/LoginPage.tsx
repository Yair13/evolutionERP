import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LayoutDashboard, Loader2, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  if (token) return <Navigate to="/app" replace />;

  function detectCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") {
      setCapsLockOn(e.getModifierState("CapsLock"));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate__photo" aria-hidden />
      <div className="auth-gate__bg" aria-hidden />
      <div className="auth-gate__aurora" aria-hidden />
      <div className="auth-gate__grid" aria-hidden />
      <div className="auth-gate__vignette" aria-hidden />

      <div className="auth-gate__shell">
        <header className="auth-hero">
          <div className="auth-hero__copy">
            <p className="auth-hero__eyebrow">
              <Sparkles size={14} strokeWidth={2} className="auth-hero__eyebrow-icon" aria-hidden />
              Plataforma corporativa
            </p>
            <h1 className="auth-hero__title">
              Bienvenido al <span className="auth-hero__title-accent">Evolution</span> ERP
            </h1>
            <p className="auth-hero__lead">
              Inventario, sedes y operación en un solo lugar. Entra con tu cuenta corporativa.
            </p>
            <ul className="auth-hero__bullets" aria-label="Capacidades">
              <li>
                <LayoutDashboard size={18} strokeWidth={1.75} aria-hidden />
                <span>Panel operativo con métricas en vivo</span>
              </li>
              <li>
                <ShieldCheck size={18} strokeWidth={1.75} aria-hidden />
                <span>Acceso por roles y sedes controlado</span>
              </li>
            </ul>
          </div>
        </header>

        <div className="auth-panel">
          <div className="auth-panel__head">
            <h2 className="auth-panel__title">Accede a tu espacio</h2>
            <p className="auth-panel__sub">Usa el usuario y contraseña que te asignó el administrador.</p>
          </div>

          <form className="auth-panel__form" onSubmit={onSubmit} noValidate>
            <label className="field auth-field">
              <span>Usuario</span>
              <input
                ref={usernameRef}
                autoComplete="username"
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="tu.usuario"
                disabled={loading}
              />
            </label>

            <label className="field auth-field auth-field--password">
              <span>Contraseña</span>
              <div className="auth-input-wrap">
                <input
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={detectCapsLock}
                  onKeyUp={detectCapsLock}
                  onBlur={() => setCapsLockOn(false)}
                  required
                  placeholder="Tu contraseña"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                </button>
              </div>
              {capsLockOn ? (
                <span className="auth-hint auth-hint--warn" role="status">
                  <TriangleAlert size={14} strokeWidth={2} aria-hidden />
                  Bloq Mayús está activado
                </span>
              ) : null}
            </label>

            {error ? (
              <div className="auth-alert" role="alert">
                {error}
              </div>
            ) : null}

            <button type="submit" className="auth-submit" disabled={loading}>
              <span className="auth-submit__shine" aria-hidden />
              <span className="auth-submit__label">
                {loading ? (
                  <>
                    <Loader2 size={18} strokeWidth={2.25} className="auth-submit__spinner" aria-hidden />
                    Validando…
                  </>
                ) : (
                  "Entrar al panel"
                )}
              </span>
            </button>
          </form>

          <p className="auth-panel__foot">
            <strong>Colchones Evolution S.A.S</strong> · entorno interno
          </p>
        </div>
      </div>
    </div>
  );
}
