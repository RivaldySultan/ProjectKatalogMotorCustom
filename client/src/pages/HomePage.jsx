import { useMemo, useState } from 'react';
import HeroCarousel from '../components/catalog/HeroCarousel';
import ProductCard from '../components/catalog/ProductCard';
import Icon from '../components/ui/Icon';
import Link from '../components/ui/Link';
import {
  categoryOptions,
  getCategoryKey,
} from '../lib/products';
import { getConsultationPath } from '../lib/router';
import { getWhatsAppLink, WHATSAPP_MESSAGE } from '../lib/whatsapp';
import { usePageTitle } from '../lib/usePageTitle';
import './HomePage.css';

const STYLES = [
  {
    id: 'cafe-racer',
    number: '01',
    name: 'Café Racer',
    basis: 'Suzuki Thunder',
    quality: 'Low. Compact. Focused.',
    description: 'A crouched silhouette, crisp tank lines, and the spirit of classic street racing.',
  },
  {
    id: 'chopper',
    number: '02',
    name: 'Chopper',
    basis: 'Yamaha Scorpio',
    quality: 'Long. Free. Bold.',
    description: 'Extended rake, a low seat, and a more relaxed riding position.',
  },
  {
    id: 'british-style',
    number: '03',
    name: 'British Style',
    basis: 'Honda Tiger',
    quality: 'Calm. Classic. Understated.',
    description: 'Classic proportions, a rounded tank, and details that never age.',
  },
];

const BUILD_DETAILS = [
  {
    number: '01',
    title: 'A tank with character',
    description: 'Brushed metal finish, a slim shape, and confident visual lines.',
  },
  {
    number: '02',
    title: 'A purposeful posture',
    description: 'Clip-on bars and a single seat create the crouched silhouette.',
  },
  {
    number: '03',
    title: 'The engine at the center',
    description: 'The Suzuki Thunder platform remains the heart of the build.',
  },
];

const WORKSHOP_VALUES = [
  'Proportion comes first',
  'Function stays essential',
  'Detail without excess',
];

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Choose a direction',
    description: 'Browse the catalog. Save the style, shape, or details you like most.',
    link: '/katalog',
    linkLabel: 'Catalog & references',
  },
  {
    number: '02',
    title: 'Sit down together',
    description: 'Talk through your donor bike, riding needs, and budget range.',
    link: 'consultation',
    linkLabel: 'Initial consultation',
  },
  {
    number: '03',
    title: 'Agree on the plan',
    description: 'Review the concept, scope of work, cost estimate, and schedule before we begin.',
    link: 'consultation',
    linkLabel: 'Concept & estimate',
  },
  {
    number: '04',
    title: 'Bring the build to life',
    description: 'Fabrication, assembly, finishing, then final inspection and adjustments.',
    link: 'consultation',
    linkLabel: 'Build & handover',
  },
];

const PERSONALIZATION = [
  {
    title: 'Color & finish',
    description: 'Choose the tank tone and surface character you want to highlight.',
    detail: 'Solid / Metallic / Raw finish',
  },
  {
    title: 'Seat & stitching',
    description: 'Adjust the shape, upholstery material, and stitching pattern to suit the build.',
    detail: 'Tan / Tobacco / Black',
  },
  {
    title: 'Riding position',
    description: 'Discuss handlebars, seat, and footpegs so the posture feels just right.',
    detail: 'Clip-on / Upright / High bar',
  },
  {
    title: 'Personal details',
    description: 'Lights, fenders, and small accents that make the bike feel truly yours.',
    detail: 'Functional, never excessive',
  },
];

const FAQS = [
  {
    question: 'Can I use my own donor bike?',
    answer: 'Absolutely — let\'s discuss it. Engine condition, frame, completeness, and paperwork need to be reviewed before we settle on a concept.',
  },
  {
    question: 'How much does it cost and how long does it take?',
    answer: 'It depends on the condition of the donor, the fabrication scope, component choices, and finishing. We give an estimate after consultation rather than a one-size-fits-all number.',
  },
  {
    question: 'Can catalog details be changed?',
    answer: 'Yes, we can discuss it. Color, seat, handlebars, and other details can be adjusted as long as they stay aligned with the function and concept of the build.',
  },
];

const HOME_IMAGES = {
  detail: '/images/home/the-silverline-detail.jpg',
  fabrication: '/images/home/ruka-fabrication.jpg',
  finishing: '/images/home/ruka-finishing.jpg',
  nextBuild: '/images/home/ruka-next-build.jpg',
};

function SectionLabel({ number, children }) {
  return (
    <p className="rm-home__label">
      <span>{number} /</span>
      {children}
    </p>
  );
}

export default function HomePage({ products, isLoading, error }) {
  usePageTitle('RUKA Motorworks — Custom Motorcycles, Built with Purpose');
  const [activeCategory, setActiveCategory] = useState('all');
  const consultationPath = getConsultationPath(products[0]?.id);

  const visibleProducts = useMemo(() => (
    activeCategory === 'all'
      ? products
      : products.filter((product) => getCategoryKey(product) === activeCategory)
  ), [activeCategory, products]);

  return (
    <main className="rm-home" id="main-content" tabIndex={-1}>
      <section aria-labelledby="rm-home-hero-title" className="rm-home__hero" id="home">
        <HeroCarousel error={error} isLoading={isLoading} products={products} />
        <div className="rm-container rm-home__hero-inner">
          <div className="rm-home__hero-copy">
            <p className="rm-home__eyebrow">
              <span aria-hidden="true" />
              Independent workshop / Bandung
            </p>
            <h1 id="rm-home-hero-title">WHERE CLASSIC<br />MEETS CHARACTER</h1>
            <p className="rm-home__hero-description">
              Engines you know. Character that is entirely new. Explore custom
              motorcycles through your own point of view.
            </p>
            <div className="rm-home__hero-actions">
              <Link className="rm-home__button rm-home__button--primary" to="/katalog">
                Explore the catalog
                <Icon name="arrow-up-right" size={18} />
              </Link>
              <a className="rm-home__text-link" href="#gaya">
                Find your style
                <Icon name="arrow-down" size={16} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="rm-home-style-strip-title" className="rm-home__style-strip" id="gaya">
        <div className="rm-container rm-home__style-strip-inner">
          <h2 id="rm-home-style-strip-title">Three styles. One attitude.</h2>
          <nav aria-label="Choose a motorcycle style">
            {STYLES.map((style) => (
              <a href="#categories" key={style.id}>
                <span>{style.number} /</span>
                {style.name}
                <Icon name="arrow-down" size={14} />
              </a>
            ))}
          </nav>
          <span aria-hidden="true" className="rm-home__style-mark">↘</span>
        </div>
      </section>

      <section aria-labelledby="rm-home-categories-title" className="rm-home__categories theme-editorial" id="categories">
        <div className="rm-container">
          <div className="rm-home__section-heading rm-home__categories-heading">
            <div>
              <SectionLabel number="01">Curated character</SectionLabel>
              <h2 id="rm-home-categories-title">Explore Our Custom Motorcycle Collection</h2>
            </div>
            <p>
              Start with the style that feels closest to you. Every platform has
              its own design language.
            </p>
          </div>

          <div className="rm-home__style-grid">
            {STYLES.map((style) => (
              <article className="rm-home__style-card" key={style.id}>
                <p className="rm-home__style-quality">{style.quality}</p>
                <h3>{style.name}</h3>
                <p className="rm-home__style-basis">{style.basis}</p>
                <p className="rm-home__style-description">{style.description}</p>
                <Link
                  aria-label={`View the ${style.name} catalog`}
                  className="rm-home__style-link"
                  onClick={() => setActiveCategory(style.id)}
                  to="/#builds"
                >
                  <span>View build</span>
                  <Icon name="arrow-up-right" size={16} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="rm-home-builds-title" className="rm-home__builds theme-editorial" id="builds">
        <div className="rm-container">
          <div className="rm-home__section-heading rm-home__builds-heading">
            <div>
              <SectionLabel number="02">Motorcycle catalog</SectionLabel>
              <h2 id="rm-home-builds-title">RIDE YOUR OWN LEGEND</h2>
            </div>
            <p className="rm-home__build-count">
              {isLoading ? 'Loading catalog...' : `Showing ${visibleProducts.length} builds`}
              <Icon name="arrow-down" size={14} />
            </p>
          </div>

          <div aria-label="Filter motorcycle categories" className="rm-home__filters" role="group">
            {categoryOptions.map((category) => (
              <button
                aria-pressed={activeCategory === category.id}
                className={`rm-home__filter${activeCategory === category.id ? ' is-active' : ''}`}
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                type="button"
              >
                {category.id === 'all' ? 'All styles' : category.label}
                <span aria-hidden="true">
                  {category.id === 'all'
                    ? ` / ${String(products.length).padStart(2, '0')}`
                    : ''}
                </span>
              </button>
            ))}
          </div>

          {visibleProducts.length ? (
            <div aria-busy={isLoading} className="rm-home__product-grid">
              {visibleProducts.map((product, index) => (
                <ProductCard index={index} key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div aria-live="polite" className="rm-home__catalog-state">
              {isLoading
                ? 'Loading featured builds...'
                : error || (activeCategory === 'all'
                  ? 'No motorcycles in the catalog yet.'
                  : 'No builds in this category yet.')}
            </div>
          )}

          <p className="rm-home__catalog-note">
            This catalog is a design starting point, not ready-to-ship stock.
            Final specifications, cost, and build time are discussed around your
            donor bike and needs.
            <Link to="/katalog">Open the full catalog <Icon name="arrow-up-right" size={14} /></Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="rm-home-silverline-title" className="rm-home__silverline" id="tentang">
        <div className="rm-container rm-home__silverline-inner">
          <figure className="rm-home__silverline-image">
            <img
              alt="Brushed silver tank and engine detail of The Silverline"
              loading="lazy"
              src={HOME_IMAGES.detail}
            />
            <figcaption>RK-01 / Detail study — Suzuki Thunder</figcaption>
          </figure>

          <div className="rm-home__silverline-copy">
            <SectionLabel number="03">Behind the silhouette</SectionLabel>
            <h2 id="rm-home-silverline-title">Character lives<br />in every detail.</h2>
            <p className="rm-home__silverline-intro">
              The Silverline distills the café racer into clean lines. It is not
              simply a parts swap — it is a study in uniting proportion.
            </p>
            <ol className="rm-home__detail-list">
              {BUILD_DETAILS.map((detail) => (
                <li key={detail.number}>
                  <span>{detail.number}</span>
                  <div>
                    <h3>{detail.title}</h3>
                    <p>{detail.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link className="rm-home__text-link" to="/motor/prod_1">
              Get to know The Silverline
              <Icon name="arrow-up-right" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="rm-home-workshop-title" className="rm-home__workshop theme-editorial">
        <div className="rm-container">
          <div className="rm-home__section-heading rm-home__workshop-heading">
            <div>
              <SectionLabel number="04">From the Ruka workbench</SectionLabel>
              <h2 id="rm-home-workshop-title">Shaped by hand.<br />Thought through.</h2>
            </div>
            <div>
              <p>
                Ruka is a space for rethinking the way we see motorcycles. We
                love clean joints, honest materials, and design that still makes
                sense to ride.
              </p>
              <ul>
                {WORKSHOP_VALUES.map((value) => <li key={value}>{value}</li>)}
              </ul>
            </div>
          </div>

          <div className="rm-home__workshop-gallery">
            <figure className="rm-home__workshop-photo rm-home__workshop-photo--wide">
              <img
                alt="Custom motorcycle frame fabrication on the workshop bench"
                loading="lazy"
                src={HOME_IMAGES.fabrication}
              />
              <figcaption>Fabrication / From raw material to form</figcaption>
            </figure>
            <figure className="rm-home__workshop-photo">
              <img
                alt="Careful finishing work on a motorcycle seat"
                loading="lazy"
                src={HOME_IMAGES.finishing}
              />
              <figcaption>Finishing / A touch you can feel</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section aria-labelledby="rm-home-process-title" className="rm-home__process theme-editorial" id="process">
        <div className="rm-container">
          <div className="rm-home__process-heading">
            <div>
              <SectionLabel number="05">From idea to the road</SectionLabel>
              <h2 id="rm-home-process-title">It starts with a conversation.</h2>
            </div>
            <Link className="rm-home__button rm-home__button--outline" to={consultationPath}>
              Talk about your idea
              <Icon name="arrow-up-right" size={18} />
            </Link>
          </div>
          <ol className="rm-home__process-grid">
            {PROCESS_STEPS.map((step) => (
              <li key={step.number}>
                <span className="rm-home__process-number">{step.number} /</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <Link to={step.link === 'consultation' ? consultationPath : step.link}>
                  {step.linkLabel}
                  <Icon name="arrow-up-right" size={14} />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="rm-home-personal-title" className="rm-home__personal">
        <div className="rm-container">
          <div className="rm-home__personal-heading">
            <div>
              <SectionLabel number="06">Room for your taste</SectionLabel>
              <h2 id="rm-home-personal-title">Same platform. Different story.</h2>
            </div>
            <p>
              The catalog sets a direction. Detail decisions are made together,
              shaped by the concept and the condition of your donor bike.
            </p>
          </div>
          <div className="rm-home__personal-grid">
            {PERSONALIZATION.map((item, index) => (
              <article key={item.title}>
                <span className="rm-home__personal-mark" aria-hidden="true">
                  {['◌', '▤', '⌁', '＋'][index]}
                </span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className="rm-home__personal-detail">{item.detail}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="rm-home-faq-title" className="rm-home__faq theme-editorial" id="faq">
        <div className="rm-container rm-home__faq-inner">
          <div className="rm-home__faq-heading">
            <SectionLabel number="07">Before you begin</SectionLabel>
            <h2 id="rm-home-faq-title">Frequently asked<br />questions.</h2>
            <p>New to custom motorcycles? Start with these fundamentals.</p>
          </div>
          <div className="rm-home__faq-list">
            {FAQS.map((item) => (
              <details key={item.question}>
                <summary>
                  <span>{item.question}</span>
                  <span aria-hidden="true" className="rm-home__faq-toggle">+</span>
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="rm-home-contact-title" className="rm-home__contact" id="contact">
        <div className="rm-container rm-home__contact-inner">
          <div className="rm-home__contact-copy">
            <SectionLabel number="08">See you at the workshop</SectionLabel>
            <h2 id="rm-home-contact-title">Your next motorcycle.<br />Your own story.</h2>
            <p>
              Found a direction? Bring references, tell us about your donor bike,
              and let&apos;s explore what the build could become.
            </p>
            <div className="rm-home__contact-actions">
              <Link className="rm-home__button rm-home__button--primary" to={consultationPath}>
                Start a consultation
                <Icon name="arrow-up-right" size={18} />
              </Link>
              <Link className="rm-home__button rm-home__button--outline" to="/katalog">
                Back to the catalog
                <Icon name="arrow-up-right" size={18} />
              </Link>
            </div>
            <p className="rm-home__contact-note">
              <a
                href={getWhatsAppLink(WHATSAPP_MESSAGE)}
                rel="noopener noreferrer"
                target="_blank"
              >
                Via WhatsApp
              </a>
              {' / Visits by appointment'}
            </p>
          </div>
          <figure className="rm-home__contact-image">
            <img
              alt="Classic custom motorcycle in the Ruka Motorworks workshop"
              loading="lazy"
              src={HOME_IMAGES.nextBuild}
            />
          </figure>
        </div>
      </section>
    </main>
  );
}
