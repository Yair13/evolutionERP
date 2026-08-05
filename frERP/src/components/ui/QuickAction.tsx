import { Link } from "react-router-dom";

type Props = {
  label: string;
  to?: string;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
};

export function QuickAction({ label, to, disabled, hint, onClick }: Props) {
  const className = `quick-action${disabled ? " quick-action--disabled" : ""}`;

  if (to && !disabled) {
    return (
      <Link className={className} to={to} title={hint}>
        <span className="quick-action__label">{label}</span>
        <span className="quick-action__arrow" aria-hidden>
          →
        </span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={hint ?? (disabled ? "Próximamente" : undefined)}
      onClick={onClick}
    >
      <span className="quick-action__label">{label}</span>
      <span className="quick-action__arrow" aria-hidden>
        →
      </span>
    </button>
  );
}
