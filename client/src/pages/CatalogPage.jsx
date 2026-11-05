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
  usePageTitle('Motorcycle Catalog — RUKA Motorworks');
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
              <li><Link to="/">Home</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">Motorcycle Catalog</li>
            </ol>
          </nav>

          <p className="rm-eyebrow rm-page-intro__eyebrow">01 / Ruka Series</p>

          <div className="rm-page-intro__heading">
            <h1>FIND YOUR STYLE</h1>
          </div>
          <div className="rm-page-intro__aside">
            <p>Engines you know. A character that is entirely new. Choose a starting point for your motorcycle story.</p>
            <p className="rm-page-intro__indicator">
              <span aria-hidden="true" />
              {isLoading ? 'Loading catalog...' : `${products.length} builds / made to order`}
            </p>
          </div>
        </div>
      </section>

      <section className="rm-catalog">
        <div className="rm-container">
          <div className="rm-catalog__controls">
            <label className="rm-search">
              <Icon name="search" size={18} />
              <span className="rm-visually-hidden">Search by build name or donor motorcycle</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by build name or donor motorcycle"
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
                  {selectedCategory.id === 'all' ? 'All styles' : selectedCategory.label}
                  <span aria-hidden="true"> / {String(products.length).padStart(2, '0')}</span>
                </span>
                <span>Filter</span>
                <Icon name="sliders" size={16} />
              </button>
              <div
                aria-label="Filter motorcycle categories"
                className={`rm-filter${filtersOpen ? ' is-open' : ''}`}
                id="rm-catalog-filters"
                role="group"
              >
                {categoryOptions.map((category) => {
                  const label = category.id === 'all' ? 'All styles' : category.label;

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
                ? 'Loading catalog...'
                : `Showing ${visibleProducts.length} of ${products.length} builds`}
            </p>
            <label className="rm-sort">
              <span className="rm-meta">Sort by</span>
              <span className="rm-sort__control">
                <select
                  onChange={(event) => setSort(event.target.value)}
                  value={sort}
                >
                  <option value="featured">Ruka's Picks</option>
                  <option value="newest">Newest</option>
                  <option value="price-asc">Lowest price</option>
                  <option value="price-desc">Highest price</option>
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
              <p className="rm-meta">Loading catalog</p>
              <h2 className="rm-h2">Preparing build selections...</h2>
            </div>
          ) : error ? (
            <div aria-live="assertive" className="rm-catalog__empty" role="alert">
              <p className="rm-meta">Catalog unavailable</p>
              <h2 className="rm-h2">{error}</h2>
            </div>
          ) : (
            <div aria-live="polite" className="rm-catalog__empty">
              <p className="rm-meta">No results</p>
              <h2 className="rm-h2">Try another keyword or category.</h2>
              <button className="rm-button rm-button--outline" onClick={resetFilters} type="button">
                <span>Reset filter</span>
                <span aria-hidden="true" className="rm-button__icon">
                  <Icon name="close" size={16} />
                </span>
              </button>
            </div>
          )}

          <p className="rm-catalog__note">
            This catalog is a starting point for design, not ready-to-ship inventory.
            Final specifications, cost, and build time are discussed based on
            the donor motorcycle and your needs.
          </p>
        </div>
      </section>

      <section className="rm-consult-bar">
        <div className="rm-container rm-consult-bar__inner">
          <div className="rm-consult-bar__copy">
            <h2 className="rm-h2">Same basis. A different story.</h2>
            <p>Color, seat, and riding position. Let's shape the details to make it yours.</p>
          </div>
          <Button
            icon={<Icon name="arrow-up-right" size={18} />}
            to={getConsultationPath(products[0]?.id)}
            variant="primary"
          >
            Discuss Your Idea
          </Button>
        </div>
      </section>
    </main>
  );
}
