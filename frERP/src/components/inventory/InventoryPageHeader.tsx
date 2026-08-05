import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

type InventoryPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  scope?: ReactNode;
  toolbar?: ReactNode;
  alerts?: ReactNode;
};

export function InventoryPageHeader({
  title,
  description,
  backTo,
  backLabel = "Catálogo",
  actions,
  scope,
  toolbar,
  alerts,
}: InventoryPageHeaderProps) {
  return (
    <header className="inv-page__header">
      <div className="inv-page__title-row">
        <div className="inv-page__intro">
          {backTo ? (
            <Link to={backTo} className="inv-back">
              <ArrowLeft size={18} strokeWidth={2} aria-hidden />
              {backLabel}
            </Link>
          ) : null}
          <h1 className="inv-page__title">{title}</h1>
          {description ? <p className="inv-page__desc">{description}</p> : null}
        </div>
        {actions ? <div className="inv-page__actions">{actions}</div> : null}
      </div>
      {scope}
      {toolbar}
      {alerts}
    </header>
  );
}
