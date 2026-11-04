import { useMemo, useState } from 'react';
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
    quality: 'Rendah. Ringkas. Fokus.',
    description: 'Siluet merunduk, garis tangki tegas, dan semangat balap jalanan klasik.',
  },
  {
    id: 'chopper',
    number: '02',
    name: 'Chopper',
    basis: 'Yamaha Scorpio',
    quality: 'Panjang. Bebas. Berani.',
    description: 'Rake memanjang, jok rendah, dan posisi berkendara yang lebih santai.',
  },
  {
    id: 'british-style',
    number: '03',
    name: 'British Style',
    basis: 'Honda Tiger',
    quality: 'Tenang. Klasik. Bersahaja.',
    description: 'Proporsi klasik, tangki membulat, dan detail yang tak lekang zaman.',
  },
];

const BUILD_DETAILS = [
  {
    number: '01',
    title: 'Tangki berkarakter',
    description: 'Finishing brushed metal, bentuk ramping, garis visual tegas.',
  },
  {
    number: '02',
    title: 'Postur yang terarah',
    description: 'Clip-on bar dan jok tunggal membentuk siluet merunduk.',
  },
  {
    number: '03',
    title: 'Mesin sebagai pusat desain',
    description: 'Basis Suzuki Thunder tetap menjadi jantung karakter build.',
  },
];

const WORKSHOP_VALUES = [
  'Proporsi lebih dulu',
  'Fungsi tetap utama',
  'Detail tanpa berlebih',
];

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Pilih arah',
    description: 'Jelajahi katalog. Simpan gaya, bentuk, atau detail yang paling kamu suka.',
    link: '/katalog',
    linkLabel: 'Katalog & referensi',
  },
  {
    number: '02',
    title: 'Duduk bersama',
    description: 'Bahas motor donor, kebutuhan berkendara, serta kisaran anggaranmu.',
    link: 'consultation',
    linkLabel: 'Konsultasi awal',
  },
  {
    number: '03',
    title: 'Sepakati rencana',
    description: 'Tinjau konsep, lingkup pekerjaan, estimasi biaya, dan jadwal sebelum mulai.',
    link: 'consultation',
    linkLabel: 'Konsep & estimasi',
  },
  {
    number: '04',
    title: 'Wujudkan build',
    description: 'Fabrikasi, perakitan, finishing, lalu pemeriksaan dan penyesuaian akhir.',
    link: 'consultation',
    linkLabel: 'Pengerjaan & serah terima',
  },
];

const PERSONALIZATION = [
  {
    title: 'Warna & finish',
    description: 'Pilih nuansa tangki dan karakter permukaan yang ingin ditonjolkan.',
    detail: 'Solid / Metallic / Raw finish',
  },
  {
    title: 'Jok & jahitan',
    description: 'Sesuaikan bentuk, material pelapis, dan pola jahitan dengan gaya build.',
    detail: 'Tan / Tobacco / Black',
  },
  {
    title: 'Posisi berkendara',
    description: 'Diskusikan setang, jok, dan footstep agar posturnya terasa pas.',
    detail: 'Clip-on / Upright / High bar',
  },
  {
    title: 'Detail personal',
    description: 'Lampu, spakbor, dan aksen kecil yang membuat motormu terasa milikmu.',
    detail: 'Fungsional, bukan berlebihan',
  },
];

const FAQS = [
  {
    question: 'Bisa pakai motor donor sendiri?',
    answer: 'Bisa dibahas. Kondisi mesin, rangka, kelengkapan, dan dokumen motor donor perlu ditinjau sebelum konsep ditentukan.',
  },
  {
    question: 'Berapa biaya dan lama pengerjaannya?',
    answer: 'Tergantung kondisi donor, lingkup fabrikasi, pilihan komponen, dan finishing. Estimasi diberikan setelah konsultasi, bukan disamaratakan.',
  },
  {
    question: 'Apakah detail katalog bisa diubah?',
    answer: 'Bisa didiskusikan. Warna, jok, setang, serta detail lain disesuaikan selama tetap selaras dengan fungsi dan konsep build.',
  },
];

const HOME_IMAGES = {
  hero: '/images/home/ruka-hero.jpg',
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
  usePageTitle('RUKA Motorworks — Motor Custom, Dibuat dengan Tujuan');
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
        <img
          alt=""
          aria-hidden="true"
          className="rm-home__hero-image"
          fetchPriority="high"
          src={HOME_IMAGES.hero}
        />
        <div aria-hidden="true" className="rm-home__hero-shade" />
        <div className="rm-container rm-home__hero-inner">
          <div className="rm-home__hero-copy">
            <p className="rm-home__eyebrow">
              <span aria-hidden="true" />
              Bengkel independen / Bandung
            </p>
            <h1 id="rm-home-hero-title">Bukan sekadar<br />motor biasa.</h1>
            <p className="rm-home__hero-description">
              Mesin yang kamu kenal. Karakter yang sepenuhnya baru. Jelajahi
              motor custom dengan sudut pandangmu sendiri.
            </p>
            <div className="rm-home__hero-actions">
              <Link className="rm-home__button rm-home__button--primary" to="/katalog">
                Jelajahi katalog
                <Icon name="arrow-up-right" size={18} />
              </Link>
              <a className="rm-home__text-link" href="#gaya">
                Temukan gayamu
                <Icon name="arrow-down" size={16} />
              </a>
            </div>
          </div>
          <p className="rm-home__hero-caption">
            <span>Thunder / The Silverline</span>
            <span>Café Racer · Suzuki Thunder</span>
          </p>
        </div>
      </section>

      <section aria-labelledby="rm-home-style-strip-title" className="rm-home__style-strip" id="gaya">
        <div className="rm-container rm-home__style-strip-inner">
          <h2 id="rm-home-style-strip-title">Tiga gaya. Satu sikap.</h2>
          <nav aria-label="Pilih gaya motor">
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
              <SectionLabel number="01">Karakter pilihan</SectionLabel>
              <h2 id="rm-home-categories-title">Pilih garis besarmu.</h2>
            </div>
            <p>
              Mulai dari gaya yang paling dekat denganmu. Setiap platform punya
              bahasa desainnya sendiri.
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
                  aria-label={`Lihat katalog ${style.name}`}
                  className="rm-home__style-link"
                  onClick={() => setActiveCategory(style.id)}
                  to="/#builds"
                >
                  <span>Lihat build</span>
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
              <SectionLabel number="02">Katalog motor</SectionLabel>
              <h2 id="rm-home-builds-title">Tiga build. Tiga karakter.</h2>
            </div>
            <p className="rm-home__build-count">
              {isLoading ? 'Memuat katalog...' : `Menampilkan ${visibleProducts.length} build`}
              <Icon name="arrow-down" size={14} />
            </p>
          </div>

          <div aria-label="Filter kategori motor" className="rm-home__filters" role="group">
            {categoryOptions.map((category) => (
              <button
                aria-pressed={activeCategory === category.id}
                className={`rm-home__filter${activeCategory === category.id ? ' is-active' : ''}`}
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                type="button"
              >
                {category.id === 'all' ? 'Semua gaya' : category.label}
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
                ? 'Memuat build pilihan...'
                : error || (activeCategory === 'all'
                  ? 'Belum ada motor di katalog.'
                  : 'Belum ada build untuk kategori ini.')}
            </div>
          )}

          <p className="rm-home__catalog-note">
            Katalog ini adalah titik awal desain, bukan stok siap kirim.
            Spesifikasi akhir, biaya, dan waktu pengerjaan dibahas sesuai
            motor donor serta kebutuhanmu.
            <Link to="/katalog">Buka katalog lengkap <Icon name="arrow-up-right" size={14} /></Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="rm-home-silverline-title" className="rm-home__silverline" id="tentang">
        <div className="rm-container rm-home__silverline-inner">
          <figure className="rm-home__silverline-image">
            <img
              alt="Detail tangki perak brushed dan mesin The Silverline"
              loading="lazy"
              src={HOME_IMAGES.detail}
            />
            <figcaption>RK-01 / Studi detail — Suzuki Thunder</figcaption>
          </figure>

          <div className="rm-home__silverline-copy">
            <SectionLabel number="03">Di balik siluet</SectionLabel>
            <h2 id="rm-home-silverline-title">Karakter ada<br />di setiap detail.</h2>
            <p className="rm-home__silverline-intro">
              The Silverline merangkum café racer dalam garis yang bersih.
              Bukan sekadar mengganti komponen, tetapi menyatukan proporsi.
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
              Kenali The Silverline
              <Icon name="arrow-up-right" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="rm-home-workshop-title" className="rm-home__workshop theme-editorial">
        <div className="rm-container">
          <div className="rm-home__section-heading rm-home__workshop-heading">
            <div>
              <SectionLabel number="04">Dari meja kerja Ruka</SectionLabel>
              <h2 id="rm-home-workshop-title">Dibentuk tangan.<br />Dipikirkan matang.</h2>
            </div>
            <div>
              <p>
                Ruka adalah ruang untuk merakit ulang cara melihat motor.
                Kami menyukai sambungan yang rapi, material yang jujur, dan
                desain yang tetap masuk akal untuk dikendarai.
              </p>
              <ul>
                {WORKSHOP_VALUES.map((value) => <li key={value}>{value}</li>)}
              </ul>
            </div>
          </div>

          <div className="rm-home__workshop-gallery">
            <figure className="rm-home__workshop-photo rm-home__workshop-photo--wide">
              <img
                alt="Fabrikasi rangka motor custom di meja kerja bengkel"
                loading="lazy"
                src={HOME_IMAGES.fabrication}
              />
              <figcaption>Fabrikasi / Dari bahan mentah menjadi bentuk</figcaption>
            </figure>
            <figure className="rm-home__workshop-photo">
              <img
                alt="Pengerjaan finishing jok motor secara teliti"
                loading="lazy"
                src={HOME_IMAGES.finishing}
              />
              <figcaption>Finishing / Sentuhan yang terasa</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section aria-labelledby="rm-home-process-title" className="rm-home__process theme-editorial" id="process">
        <div className="rm-container">
          <div className="rm-home__process-heading">
            <div>
              <SectionLabel number="05">Dari ide ke jalan</SectionLabel>
              <h2 id="rm-home-process-title">Mulai dari obrolan.</h2>
            </div>
            <Link className="rm-home__button rm-home__button--outline" to={consultationPath}>
              Bicarakan idemu
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
              <SectionLabel number="06">Ruang untuk seleramu</SectionLabel>
              <h2 id="rm-home-personal-title">Basis sama. Cerita berbeda.</h2>
            </div>
            <p>
              Katalog memberi arah. Keputusan detail dibuat bersama, sesuai
              konsep dan kondisi motor donor.
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
            <SectionLabel number="07">Sebelum memulai</SectionLabel>
            <h2 id="rm-home-faq-title">Yang sering<br />ditanyakan.</h2>
            <p>Belum pernah membangun motor custom? Mulai dengan hal-hal mendasar ini.</p>
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
            <SectionLabel number="08">Sampai ketemu di bengkel</SectionLabel>
            <h2 id="rm-home-contact-title">Motor berikutnya.<br />Ceritamu sendiri.</h2>
            <p>
              Sudah menemukan arah? Bawa referensi, ceritakan motor donormu,
              dan mari bahas kemungkinan build-nya.
            </p>
            <div className="rm-home__contact-actions">
              <Link className="rm-home__button rm-home__button--primary" to={consultationPath}>
                Mulai konsultasi
                <Icon name="arrow-up-right" size={18} />
              </Link>
              <Link className="rm-home__button rm-home__button--outline" to="/katalog">
                Kembali ke katalog
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
              {' / Kunjungan dengan janji temu'}
            </p>
          </div>
          <figure className="rm-home__contact-image">
            <img
              alt="Motor custom klasik di ruang bengkel Ruka Motorworks"
              loading="lazy"
              src={HOME_IMAGES.nextBuild}
            />
          </figure>
        </div>
      </section>
    </main>
  );
}
