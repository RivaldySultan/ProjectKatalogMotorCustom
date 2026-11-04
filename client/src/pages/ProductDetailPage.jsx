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
} from '../lib/products';
import { usePageTitle } from '../lib/usePageTitle';
import { CONSULTATION_FORM_ID, getConsultationPath } from '../lib/router';
import './ProductDetailPage.css';

const STAGES = [
  { number: '01', title: 'Konsultasi', description: 'Ceritakan kebutuhan, motor donor, dan kisaran anggaran.' },
  { number: '02', title: 'Konsep & rencana', description: 'Sepakati desain, lingkup pekerjaan, biaya, dan jadwal.' },
  { number: '03', title: 'Pengerjaan', description: 'Fabrikasi, perakitan, serta finishing sesuai konsep.' },
  { number: '04', title: 'Pemeriksaan akhir', description: 'Pemeriksaan fungsi, penyesuaian, lalu serah terima.' },
];

const SILVERLINE_EXAMPLE_SPECS = {
  engine: '125 cc · 1 silinder · 4 tak',
  transmission: 'Manual · 5 percepatan',
  cockpit: 'Setang clip-on · panel ringkas',
  finishing: 'Jok tunggal · perak sikat',
};

export default function ProductDetailPage({ productId, products, isLoading, error }) {
  const index = getProductIndex(products, productId);
  const product = index >= 0 ? products[index] : null;

  usePageTitle(
    product
      ? `${product.name} — RUKA Motorworks`
      : 'Build tidak ditemukan — RUKA Motorworks',
  );

  if (isLoading) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="rm-container rm-detail-state">
          <p className="rm-meta">Memuat build</p>
          <h1 className="rm-h1">Menyiapkan detail...</h1>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="rm-container rm-detail-state">
          <p className="rm-meta">404 / Build tidak ditemukan</p>
          <h1 className="rm-h1">
            {error || 'Build ini tidak ada di katalog.'}
          </h1>
          <p className="rm-detail-state__copy">
            Kembali ke katalog untuk melihat build yang tersedia, atau mulai
            dari konsultasi bila Anda punya arah sendiri.
          </p>
          <div className="rm-detail-state__actions">
            <Button to="/katalog" variant="primary" icon={<Icon name="arrow-up-right" size={18} />}>
              Kembali ke katalog
            </Button>
            <Button to={getConsultationPath(products[0]?.id)} variant="outline">
              Konsultasi build
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
      ? 'Garis bersih. Sikap merunduk. Interpretasi café racer untuk mesin yang sudah kamu kenal.'
      : 'Detail build dikonfirmasi saat konsultasi.');
  const confirmedLater = 'Dikonfirmasi saat konsultasi';
  const fixedSpecifications = String(product.fixedSpecifications || '')
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.indexOf(':');
      return separator > 0
        ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
        : null;
    })
    .filter(Boolean);
  const specs = [
    ['Basis motor', basis || confirmedLater],
    ['Arah desain', product.categoryName || confirmedLater],
    [
      'Mesin',
      product.engine || (isSilverlineExample ? SILVERLINE_EXAMPLE_SPECS.engine : confirmedLater),
    ],
    [
      'Transmisi',
      product.transmission || (isSilverlineExample ? SILVERLINE_EXAMPLE_SPECS.transmission : confirmedLater),
    ],
    [
      'Kokpit',
      product.cockpit || (isSilverlineExample ? SILVERLINE_EXAMPLE_SPECS.cockpit : confirmedLater),
    ],
    [
      'Jok & finishing',
      product.finishing || (isSilverlineExample ? SILVERLINE_EXAMPLE_SPECS.finishing : confirmedLater),
    ],
    ...fixedSpecifications,
  ];

  return (
    <main id="main-content" tabIndex={-1}>
      <nav aria-label="Jejak navigasi" className="rm-breadcrumb">
        <div className="rm-container rm-breadcrumb__inner">
          <Link to="/">Beranda</Link>
          <span aria-hidden="true">/</span>
          <Link to="/katalog">Katalog</Link>
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
            {buildCode} / {product.categoryName || 'Custom'} / {basis || 'Basis dibahas saat konsultasi'}
          </p>
          <h1>{product.name}</h1>
          <p className="rm-detail-hero__series">{buildName}</p>
          <p className="rm-detail-hero__description">{description}</p>
        </div>
      </section>

      <section className="rm-price-bar">
        <div className="rm-container rm-price-bar__inner">
          <div className="rm-price-bar__price-block">
            <p className="rm-meta">Harga build</p>
            <p className="rm-price-bar__price">{formatRupiah(product.price)}</p>
          </div>
          <p className="rm-price-bar__note">
            {product.canPurchase === 1
              ? `Harga dan spesifikasi build ini sudah ditetapkan untuk pembelian langsung.${product.purchaseType === 'made_to_order' && product.estimatedBuildDays ? ` Estimasi pengerjaan ${product.estimatedBuildDays} hari.` : ''}`
              : 'Harga katalog sebagai acuan awal. Lingkup pekerjaan dan kondisi motor donor dikonfirmasi saat konsultasi.'}
          </p>
          <div className="rm-price-bar__actions">
            {product.canPurchase === 1 ? (
              <Button
                to={`/checkout/${encodeURIComponent(product.id)}`}
                icon={<Icon name="arrow-up-right" size={18} />}
                variant="primary"
              >
                Pesan Sekarang
              </Button>
            ) : (
              <p className="rm-price-bar__unavailable">
                Pembelian langsung belum tersedia untuk build ini.
              </p>
            )}
            <Button
              href={`#${CONSULTATION_FORM_ID}`}
              icon={<Icon name="arrow-down" size={18} />}
              variant="outline"
            >
              Konsultasi Dulu
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
            <p className="rm-meta">Detail / {product.name} — {product.categoryName || 'Custom'}</p>
          </div>

          <div className="rm-specs__body">
            <p className="rm-eyebrow">01 / Di balik siluet</p>
            <h2 className="rm-h2">Spesifikasi teknis</h2>

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
                ? 'Contoh spesifikasi, bukan data teknis terverifikasi. Seluruh detail dikonfirmasi saat konsultasi.'
                : product.specNotes || 'Detail spesifikasi dikonfirmasi saat konsultasi.'}
            </p>
            <p className="rm-specs__caption">
              {buildName} / Proporsi dan detail yang dibahas bersama
            </p>
          </div>
        </div>
      </section>

      <section className="rm-detail-stages">
        <div className="rm-container">
          <div className="rm-detail-stages__heading">
            <p className="rm-eyebrow">02 / Dari ide ke jalan</p>
            <h2 className="rm-h2">Mulai dari obrolan.</h2>
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
            <p className="rm-eyebrow">03 / Ceritamu dimulai di sini</p>
            <h2 className="rm-h2">Mulai konsultasi build.</h2>
            <p>
              Sudah menemukan arah? Ceritakan kebutuhanmu. Kami akan
              menghubungi lewat WhatsApp untuk membahas kemungkinan build{' '}
              {product.name}.
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
