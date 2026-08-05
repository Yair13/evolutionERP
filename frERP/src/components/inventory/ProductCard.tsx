import { Gauge, Package, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { resolveMediaUrl } from "../../lib/mediaUrl.js";
import type { CatalogItem } from "../../features/inventory/inventory.types.js";
import { StockBadge } from "./StockBadge.js";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  item: CatalogItem;
  linkBase?: "/app/productos" | "/app/inventario";
  showStock?: boolean;
  showSemaphoreTag?: boolean;
  returnTo?: string;
};

export function ProductCard({
  item,
  linkBase = "/app/inventario",
  showStock = linkBase === "/app/inventario",
  showSemaphoreTag = false,
  returnTo,
}: Props) {
  const imgSrc = resolveMediaUrl(item.imageUrl);
  const href =
    linkBase === "/app/inventario"
      ? `/app/inventario/producto/${item.id}`
      : `/app/productos/${item.id}`;
  const navState = returnTo ? { from: returnTo } : undefined;

  return (
    <article className="inv-card">
      <Link to={href} state={navState} className="inv-card__link">
        <div className="inv-card__media">
          {imgSrc ? (
            <img src={imgSrc} alt="" className="inv-card__img" loading="lazy" decoding="async" />
          ) : (
            <div className="inv-card__placeholder" aria-hidden>
              <Package size={40} strokeWidth={1.25} />
            </div>
          )}
          {showStock ? (
            <div className="inv-card__badges">
              <StockBadge
                signal={item.stockSignal}
                quantity={item.quantityOnHand}
                className="inv-card__badge"
              />
              {showSemaphoreTag ? (
                item.semaphoreConfigured ? (
                  <span
                    className="inv-active-alert inv-active-alert--card"
                    title={`Alertas configuradas · mín ${item.minStockLevel} · crít ${item.criticalStockLevel ?? 0}`}
                  >
                    <span className="inv-active-alert__icon" aria-hidden>
                      <Gauge size={12} strokeWidth={2.25} />
                    </span>
                    <span className="inv-active-alert__text">
                      Alertas
                      <span className="inv-active-alert__dot" aria-hidden />
                    </span>
                  </span>
                ) : (
                  <span className="inv-card__sem-tag inv-card__sem-tag--pending" title="Sin umbrales en esta sede">
                    Sin umbrales
                  </span>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="inv-card__body inv-card__body--simple">
          <div className="inv-card__info">
            <h3 className="inv-card__name" title={item.name}>
              {item.name}
            </h3>
            {item.categoryName ? (
              <span className="inv-card__chip">{item.categoryName}</span>
            ) : null}
          </div>
          <p className="inv-card__sale">
            <span className="inv-card__sale-icon-wrap" aria-hidden>
              <Tag size={15} strokeWidth={2.25} className="inv-card__sale-icon" />
            </span>
            <span className="inv-card__sale-text">
              <span className="inv-card__sale-label">Valor Venta</span>
              <span className="inv-card__sale-value">{formatMoney(item.baseSalePrice)}</span>
            </span>
          </p>
        </div>
      </Link>
    </article>
  );
}
