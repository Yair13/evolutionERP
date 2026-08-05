import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Panel({ title, subtitle, action, children, className = "" }: Props) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel__head">
        <div>
          <h2 className="panel__title">{title}</h2>
          {subtitle ? <p className="panel__sub">{subtitle}</p> : null}
        </div>
        {action ? <div className="panel__action">{action}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
