import { useMemo, useState } from 'react';
import ProductCard from '../components/catalog/ProductCard';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import {
  categoryOptions,
  getCategoryKey,
  getProductBasis,
  getProductBuildName,
  sortProducts,
} from '../lib/products';
import { usePageTitle } from '../lib/usePageTitle';
import { getConsultationPath } from '../lib/router';
import Link from '../components/ui/Link';
import './CatalogPage.css';

export default function CatalogPage({ products, isLoading, error }) {
  usePageTitle('Katalog Motor — RUKA Motorworks');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sort, setSort] = useState('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const filtered = products.filter((product) => {
      const categoryMatch = activeCategory === 'all'
        || getCategoryKey(product) === activeCategory;

      if (!categoryMatch) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        product.name,
        product.categoryName,
        product.description,
        getProductBuildName(product),
        getProductBasis(product),
      ]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return sortProducts(filtered, sort);
  }, [products, activeCategory, query, sort]);

  const selectedCategory = categoryOptions.find(
    (category) => category.id === activeCategory,
  ) || categoryOptions[0];

  const resetFilters = () => {
    setQuery('');
    setActiveCategory('all');
    setSort('featured');
    setFiltersOpen(false);
  };

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="rm-page-intro">
        <div className="rm-container rm-page-intro__inner">
          <nav aria-label="Breadcrumb" className="rm-catalog__breadcrumb">
            <ol>
              <li><Link to="/">Beranda</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">Katalog motor</li>
            </ol>
          </nav>

          <p className="rm-eyebrow rm-page-intro__eyebrow">01 / Seri Ruka</p>

          <div className="rm-page-intro__heading">
            <h1>Tiga build.<br />Tiga karakter.</h1>
          </div>
          <div className="rm-page-intro__aside">
            <p>Mesin yang kamu kenal. Karakter yang sepenuhnya baru. Pilih titik awal untuk cerita motormu.</p>
            <p className="rm-page-intro__indicator">
              <span aria-hidden="true" />
              {isLoading ? 'Memuat katalog...' : `${products.length} build / dibuat sesuai pesanan`}
            </p>
          </div>
        </div>
      </section>

      <section className="rm-catalog">
        <div className="rm-container">
          <div className="rm-catalog__controls">
            <label className="rm-search">
              <Icon name="search" size={18} />
              <span className="rm-visually-hidden">Cari nama atau basis motor</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama atau basis motor"
                type="search"
                value={query}
              />
            </label>

            <div className="rm-filter-area">
              <button
                aria-controls="rm-catalog-filters"
                aria-expanded={filtersOpen}
                className="rm-filter-toggle"
                onClick={() => setFiltersOpen((open) => !open)}
                type="button"
              >
                <span className="rm-filter-toggle__selection">
                  {selectedCategory.id === 'all' ? 'Semua gaya' : selectedCategory.label}
                  <span aria-hidden="true"> / {String(products.length).padStart(2, '0')}</span>
                </span>
                <span>Filter</span>
                <Icon name="sliders" size={16} />
              </button>
              <div
                aria-label="Filter kategori motor"
                className={`rm-filter${filtersOpen ? ' is-open' : ''}`}
                id="rm-catalog-filters"
                role="group"
              >
                {categoryOptions.map((category) => {
                  const label = category.id === 'all' ? 'Semua gaya' : category.label;

                  return (
                    <button
                      aria-pressed={activeCategory === category.id}
                      className={`rm-filter__button${activeCategory === category.id ? ' is-active' : ''}`}
                      key={category.id}
                      onClick={() => {
                        setActiveCategory(category.id);
                        setFiltersOpen(false);
                      }}
                      type="button"
                    >
                      <span className="rm-filter__number">{category.number}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rm-catalog__meta">
            <p aria-live="polite" className="rm-meta">
              {isLoading
                ? 'Memuat katalog...'
                : `Menampilkan ${visibleProducts.length} dari ${products.length} build`}
            </p>
            <label className="rm-sort">
              <span className="rm-meta">Urutkan</span>
              <span className="rm-sort__control">
                <select
                  onChange={(event) => setSort(event.target.value)}
                  value={sort}
                >
                  <option value="featured">Pilihan Ruka</option>
                  <option value="newest">Terbaru</option>
                  <option value="price-asc">Harga terendah</option>
                  <option value="price-desc">Harga tertinggi</option>
                </select>
                <Icon name="chevron-down" size={14} />
              </span>
            </label>
          </div>

          {visibleProducts.length ? (
            <div aria-busy={isLoading} className="rm-catalog__grid">
              {visibleProducts.map((product, index) => (
                <ProductCard index={index} key={product.id} product={product} />
              ))}
            </div>
          ) : isLoading ? (
            <div aria-live="polite" className="rm-catalog__empty">
              <p className="rm-meta">Memuat katalog</p>
              <h2 className="rm-h2">Menyiapkan pilihan build...</h2>
            </div>
          ) : error ? (
            <div aria-live="assertive" className="rm-catalog__empty" role="alert">
              <p className="rm-meta">Katalog tidak tersedia</p>
              <h2 className="rm-h2">{error}</h2>
            </div>
          ) : (
            <div aria-live="polite" className="rm-catalog__empty">
              <p className="rm-meta">Tidak ada hasil</p>
              <h2 className="rm-h2">Coba kata kunci atau kategori lain.</h2>
              <button className="rm-button rm-button--outline" onClick={resetFilters} type="button">
                <span>Reset filter</span>
                <span aria-hidden="true" className="rm-button__icon">
                  <Icon name="close" size={16} />
                </span>
              </button>
            </div>
          )}

          <p className="rm-catalog__note">
            Katalog ini adalah titik awal desain, bukan stok siap kirim.
            Spesifikasi akhir, biaya, dan waktu pengerjaan dibahas sesuai
            motor donor serta kebutuhanmu.
          </p>
        </div>
      </section>

      <section className="rm-consult-bar">
        <div className="rm-container rm-consult-bar__inner">
          <div className="rm-consult-bar__copy">
            <h2 className="rm-h2">Basis sama. Cerita berbeda.</h2>
            <p>Warna, jok, dan posisi berkendara. Mari bentuk detail yang terasa milikmu.</p>
          </div>
          <Button
            icon={<Icon name="arrow-up-right" size={18} />}
            to={getConsultationPath(products[0]?.id)}
            variant="primary"
          >
            Bicarakan idemu
          </Button>
        </div>
      </section>
    </main>
  );
}
