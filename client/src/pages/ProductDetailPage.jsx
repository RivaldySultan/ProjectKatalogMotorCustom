import Button from '../components/ui/Button';
import ConsultationForm from '../components/forms/ConsultationForm';
import Icon from '../components/ui/Icon';
import Link from '../components/ui/Link';
import {
  formatRupiah,
  getCatalogProductImage,
  getProductBasis,
  getProductBuildCode,
  getProductBuildName,
  getProductIndex,
  getProductSpecifications,
} from '../lib/products';
import { usePageTitle } from '../lib/usePageTitle';
import { CONSULTATION_FORM_ID, getConsultationPath } from '../lib/router';
import WhatsAppOrderForm from '../components/ui/WhatsAppOrderForm';
import './ProductDetailPage.css';

const STAGES = [
  { number: '01', title: 'Consultation', description: 'Tell us about your needs, donor motorcycle, and budget range.' },
  { number: '02', title: 'Concept & plan', description: 'Agree on the design, scope of work, cost, and schedule.' },
  { number: '03', title: 'Build & assembly', description: 'Fabrication, assembly, and finishing based on the agreed concept.' },
  { number: '04', title: 'Final inspection', description: 'Functional checks, adjustments, and handover.' },
];

export default function ProductDetailPage({ productId, products, isLoading, error }) {
  const index = getProductIndex(products, productId);
  const product = index >= 0 ? products[index] : null;

  usePageTitle(
    product
      ? `${product.name} — RUKA Motorworks`
      : 'Build Not Found — RUKA Motorworks',
  );

  if (isLoading) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="rm-container rm-detail-state">
          <p className="rm-meta">Loading build</p>
          <h1 className="rm-h1">Preparing details...</h1>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="rm-container rm-detail-state">
          <p className="rm-meta">404 / Build Not Found</p>
          <h1 className="rm-h1">
            {error || 'This build is not in the catalog.'}
          </h1>
          <p className="rm-detail-state__copy">
            Return to the catalog to browse available builds, or start with a
            consultation if you already have a direction in mind.
          </p>
          <div className="rm-detail-state__actions">
            <Button to="/katalog" variant="primary" icon={<Icon name="arrow-up-right" size={18} />}>
              Back to Catalog
            </Button>
            <Button to={getConsultationPath(products[0]?.id)} variant="outline">
              Discuss a Build
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const productImage = getCatalogProductImage(product, index);
  const buildCode = getProductBuildCode(product) || String(product.id).toUpperCase();
  const buildName = getProductBuildName(product) || 'Custom build';
  const basis = product.basis || getProductBasis(product);
  const isSilverlineExample = String(product.id) === 'prod_1';
  const usesPdfSpecExample = isSilverlineExample
    && ['engine', 'transmission', 'cockpit', 'finishing'].some((field) => !product[field]);
  const description = product.description
    || (isSilverlineExample
      ? 'Clean lines. A crouched stance. A café racer interpretation of an engine you already know.'
      : 'Build details will be confirmed during consultation.');
  const specs = getProductSpecifications(product);

  return (
    <main id="main-content" tabIndex={-1}>
      <nav aria-label="Breadcrumb" className="rm-breadcrumb">
        <div className="rm-container rm-breadcrumb__inner">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link to="/katalog">Catalog</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </div>
      </nav>

      <section className="rm-detail-hero">
        <img
          alt={product.imageAlt || product.name}
          className="rm-detail-hero__image"
          src={productImage}
        />
        <div className="rm-detail-hero__shade" />
        <div className="rm-container rm-detail-hero__content">
          <p className="rm-eyebrow">
            {buildCode} / {product.categoryName || 'Custom'} / {basis || 'Motor basis to be discussed during consultation'}
          </p>
          <h1>{product.name}</h1>
          <p className="rm-detail-hero__series">{buildName}</p>
          <p className="rm-detail-hero__description">{description}</p>
        </div>
      </section>

      <section className="rm-price-bar">
        <div className="rm-container rm-price-bar__inner">
          <div className="rm-price-bar__price-block">
            <p className="rm-meta">Build price</p>
            <p className="rm-price-bar__price">{formatRupiah(product.price)}</p>
          </div>
          <p className="rm-price-bar__note">
            {product.canPurchase === 1
              ? `The price and specifications for this build are set for direct purchase.${product.purchaseType === 'made_to_order' && product.estimatedBuildDays ? ` Estimated build time: ${product.estimatedBuildDays} days.` : ''}`
              : 'The catalog price is an initial reference. The scope of work and donor motorcycle condition will be confirmed during consultation.'}
          </p>
          <div className="rm-price-bar__actions">
            {product.canPurchase === 1 ? (
              <>
                <Button
                  to={`/checkout/${encodeURIComponent(product.id)}`}
                  icon={<Icon name="arrow-up-right" size={18} />}
                  variant="primary"
                >
                  Order via Web
                </Button>
                <WhatsAppOrderForm
                  className="rm-button rm-button--outline rm-price-bar__whatsapp-order"
                  product={product}
                  specifications={specs}
                />
              </>
            ) : (
              <p className="rm-price-bar__unavailable">
                Direct purchase is not available for this build.
              </p>
            )}
            <Button
              href={`#${CONSULTATION_FORM_ID}`}
              icon={<Icon name="arrow-down" size={18} />}
              variant="outline"
            >
              Discuss Your Build
            </Button>
          </div>
        </div>
      </section>

      <section className="rm-specs">
        <div className="rm-container rm-specs__grid">
          <div className="rm-specs__media">
            <img
              alt={`Detail ${product.name}`}
              loading="lazy"
              src={productImage}
            />
            <p className="rm-meta">Details / {product.name} — {product.categoryName || 'Custom'}</p>
          </div>

          <div className="rm-specs__body">
            <p className="rm-eyebrow">01 / Beneath the silhouette</p>
            <h2 className="rm-h2">Technical specifications</h2>

            <dl className="rm-spec-list">
              {specs.map(([label, value]) => (
                <div className="rm-spec-list__row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <p className="rm-specs__note">
              {usesPdfSpecExample
                ? 'Example specifications, not verified technical data. All details will be confirmed during consultation.'
                : product.specNotes || 'Specification details will be confirmed during consultation.'}
            </p>
            <p className="rm-specs__caption">
              {buildName} / Proportions and details discussed together
            </p>
          </div>
        </div>
      </section>

      <section className="rm-detail-stages">
        <div className="rm-container">
          <div className="rm-detail-stages__heading">
            <p className="rm-eyebrow">02 / From concept to road</p>
            <h2 className="rm-h2">Start with a conversation.</h2>
          </div>
          <ol className="rm-stage-list">
            {STAGES.map((stage) => (
              <li key={stage.number}>
                <span className="rm-stage-list__number">{stage.number}</span>
                <h3>{stage.title}</h3>
                <p>{stage.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rm-detail-consult theme-editorial" id={CONSULTATION_FORM_ID}>
        <div className="rm-container rm-detail-consult__grid">
          <div className="rm-detail-consult__intro">
            <p className="rm-eyebrow">03 / Your story starts here</p>
            <h2 className="rm-h2">Start a build consultation.</h2>
            <p>
              Found a direction? Tell us what you need. We will
              contact you on WhatsApp to discuss your build options
              {product.name === 'Thunder' ? '' : ` for ${product.name}`}.
            </p>
          </div>

          <div className="rm-detail-consult__form">
            <ConsultationForm
              basis={basis}
              buildCode={buildCode}
              buildName={buildName}
              key={product.id}
              product={product}
              products={products}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
