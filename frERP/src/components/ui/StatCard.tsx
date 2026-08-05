import type { ReactNode } from "react";

type Tone = "default" | "accent" | "warn" | "danger";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  children?: ReactNode;
};

const toneClass: Record<Tone, string> = {
  default: "",
  accent: "stat-card--accent",
  warn: "stat-card--warn",
  danger: "stat-card--danger",
};

export function StatCard({ label, value, hint, tone = "default", children }: Props) {
  return (
    <article className={`stat-card ${toneClass[tone]}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {children}
      </div>
      <div className="stat-card__value">{value}</div>
      {hint ? <p className="stat-card__hint">{hint}</p> : null}
    </article>
  );
}
