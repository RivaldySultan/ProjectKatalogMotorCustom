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
import './ProductCard.css';

export default function ProductCard({ product, index = 0 }) {
  const [imageError, setImageError] = useState(false);
  const detailPath = `/motor/${encodeURIComponent(product.id)}`;
  const image = getCatalogProductImage(product, index);
  const buildCode = getProductBuildCode(product);
  const buildName = getProductBuildName(product);
  const basis = getProductBasis(product);

  return (
    <article className="rm-product-card">
      <Link
        aria-label={`Lihat detail ${product.name}`}
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
            Foto build belum tersedia
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
          <span className="rm-meta">Harga build</span>
          <span className="rm-product-card__price">
            {formatRupiah(product.price)}
          </span>
        </div>

        <div className="rm-product-card__actions">
          <Link className="rm-product-card__action" to={detailPath}>
            <span>Lihat Detail</span>
            <Icon name="arrow-up-right" size={18} />
          </Link>
          {product.canPurchase === 1 ? (
            <Link className="rm-product-card__action rm-product-card__action--purchase" to={`/checkout/${encodeURIComponent(product.id)}`}>
              <span>Pesan Langsung</span>
              <Icon name="arrow-up-right" size={18} />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
