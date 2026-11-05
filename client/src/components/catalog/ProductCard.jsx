import { useState } from 'react';
import {
  formatRupiah,
  getCatalogProductImage,
  getProductBasis,
  getProductBuildCode,
  getProductBuildName,
} from '../../lib/products';
import Icon from '../ui/Icon';
import Link from '../ui/Link';
import { getWhatsAppLink } from '../../lib/whatsapp';
import './ProductCard.css';

export default function ProductCard({ product, index = 0 }) {
  const [imageError, setImageError] = useState(false);
  const detailPath = `/motor/${encodeURIComponent(product.id)}`;
  const image = getCatalogProductImage(product, index);
  const buildCode = getProductBuildCode(product);
  const buildName = getProductBuildName(product);
  const basis = getProductBasis(product);
  const whatsappOrderLink = getWhatsAppLink([
    'Hello Ruka Motorworks, I am interested in ordering this build via WhatsApp.',
    `Product: ${product.name}`,
    `Build: ${buildName || product.name}`,
    basis ? `Motorcycle basis: ${basis}` : '',
    `Price: ${formatRupiah(product.price)}`,
  ].filter(Boolean).join('\n'));
  const canPurchase = product.canPurchase === true || Number(product.canPurchase) === 1;

  return (
    <article className="rm-product-card">
      <Link
        aria-label={`View ${product.name} details`}
        className="rm-product-card__media"
        to={detailPath}
      >
        {image && !imageError ? (
          <img
            alt={product.imageAlt || [product.name, buildName].filter(Boolean).join(' / ')}
            className="rm-product-card__image"
            loading="lazy"
            onError={() => setImageError(true)}
            src={image}
          />
        ) : (
          <span aria-hidden="true" className="rm-product-card__image-placeholder">
            Build photo unavailable
          </span>
        )}
        <span className="rm-product-card__style">
          {product.categoryName || 'Custom build'}
        </span>
      </Link>

      <div className="rm-product-card__body">
        <p className="rm-meta rm-product-card__index">
          {buildCode || `Build / ${String(index + 1).padStart(2, '0')}`}
          {buildName ? ` / ${buildName}` : ''}
        </p>

        <h2 className="rm-product-card__title">
          <Link to={detailPath}>{product.name}</Link>
        </h2>

        {basis ? <p className="rm-product-card__basis">{basis}</p> : null}

        <div className="rm-product-card__price-row">
          <span className="rm-meta">Build price</span>
          <span className="rm-product-card__price">
            {formatRupiah(product.price)}
          </span>
        </div>

        <div className="rm-product-card__actions">
          {canPurchase ? (
            <>
              <a
                className="rm-product-card__action rm-product-card__action--whatsapp"
                href={whatsappOrderLink}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span>Order via WhatsApp</span>
                <Icon name="arrow-up-right" size={18} />
              </a>
              <Link
                className="rm-product-card__action rm-product-card__action--purchase"
                to={`/checkout/${encodeURIComponent(product.id)}`}
              >
                <span>Order via Web</span>
                <Icon name="arrow-up-right" size={18} />
              </Link>
            </>
          ) : null}
          <Link className="rm-product-card__action" to={detailPath}>
            <span>View Details</span>
            <Icon name="arrow-up-right" size={18} />
          </Link>
        </div>
      </div>
    </article>
  );
}
