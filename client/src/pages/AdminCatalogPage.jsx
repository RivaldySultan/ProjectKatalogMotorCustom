import { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import Icon from '../components/ui/Icon';
import Link from '../components/ui/Link';
import { adminRequest, clearAdminSession } from '../lib/adminAuth';
import { navigate } from '../lib/router';
import {
  formatRupiah,
  getCatalogProductImage,
  getProductBasis,
  getProductBuildCode,
  getProductBuildName,
} from '../lib/products';
import { usePageTitle } from '../lib/usePageTitle';
import AdminProductForm from './AdminProductForm';
import './AdminCatalogPage.css';
import { useToast } from '../components/ui/useToast';

function ProductTable({ products, onDelete }) {
  return (
    <div className="rm-admin-catalog__scroll">
      <table className="rm-admin-catalog__table">
        <thead>
          <tr>
            <th scope="col">Image</th>
            <th className="is-sticky" scope="col">Name</th>
            <th scope="col">Basis</th>
            <th scope="col">Price</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const image = getCatalogProductImage(product);
            return (
              <tr key={product.id}>
                <td>
                  {image ? (
                    <img
                      alt={product.imageAlt || product.name}
                      className="rm-admin-catalog__image"
                      loading="lazy"
                      src={image}
                    />
                  ) : (
                    <span className="rm-admin-catalog__image-placeholder">RUKA</span>
                  )}
                </td>
                <th className="is-sticky rm-admin-catalog__identity" scope="row">
                  <span className="rm-admin-catalog__name">{product.name}</span>
                  <span className="rm-admin-meta">
                    {getProductBuildCode(product) || 'BUILD'} / {getProductBuildName(product) || 'Custom build'}
                  </span>
                  <span className="rm-admin-catalog__category">{product.categoryName || 'Category unavailable'}</span>
                </th>
                <td>{getProductBasis(product) || '—'}</td>
                <td className="rm-admin-catalog__price">{formatRupiah(product.price)}</td>
                <td>
                  <div className="rm-admin-catalog__actions">
                    <Link
                      aria-label={`Edit ${product.name}`}
                      className="rm-admin-button rm-admin-button--outline"
                      to={`/admin/catalog/${encodeURIComponent(product.id)}/edit`}
                    >
                      Edit
                    </Link>
                    <button
                      aria-label={`Delete ${product.name}`}
                      className="rm-admin-button rm-admin-button--danger"
                      onClick={() => onDelete(product)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeleteDialog({ product, isDeleting, error, onCancel, onConfirm }) {
  const cancelButton = useRef(null);

  useEffect(() => {
    cancelButton.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isDeleting) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, onCancel]);

  return (
    <div className="rm-admin-catalog__overlay">
      <section
        aria-labelledby="rm-admin-delete-title"
        aria-modal="true"
        className="rm-admin-catalog__dialog"
        role="alertdialog"
      >
        <p className="rm-admin-meta">CONFIRM / DELETE MOTORCYCLE</p>
        <h2 id="rm-admin-delete-title">Delete {product.name}?</h2>
        <p>
          This motorcycle will no longer appear in the public catalog. Historical
          consultation requests will remain saved.
        </p>
        {error ? <p className="rm-admin-form__error" role="alert">{error}</p> : null}
        <div className="rm-admin-catalog__dialog-actions">
          <button
            className="rm-admin-button rm-admin-button--outline"
            disabled={isDeleting}
            onClick={onCancel}
            ref={cancelButton}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rm-admin-button rm-admin-button--danger"
            disabled={isDeleting}
            onClick={onConfirm}
            type="button"
          >
            {isDeleting ? 'Deleting...' : 'Delete motorcycle'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AdminCatalogPage({ route }) {
  if (route.mode !== 'list') {
    return <AdminProductForm id={route.id} mode={route.mode} />;
  }
  return <AdminCatalogListPage />;
}

function AdminCatalogListPage() {
  const notify = useToast();
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  usePageTitle('Manage Catalog — RUKA Motorworks');

  const loadProducts = async () => {
    const result = await adminRequest('/api/products');
    if (result.unauthorized) {
      clearAdminSession();
      navigate('/admin/login#session-expired');
      return;
    }
    if (!result.ok) {
      setError(result.message);
      setIsLoading(false);
      return;
    }
    if (!Array.isArray(result.data)) {
      setError('The catalog data received from the server is invalid.');
      setIsLoading(false);
      return;
    }
    setProducts(result.data);
    setError('');
    setIsLoading(false);
  };

  const handleRetry = () => {
    setIsLoading(true);
    setError('');
    loadProducts();
  };

  useEffect(() => {
    void Promise.resolve().then(loadProducts);
  }, []);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('id');
    if (!normalizedQuery) return products;
    return products.filter((product) => [
      product.name,
      product.basis,
      product.categoryName,
      getProductBuildName(product),
      getProductBuildCode(product),
    ].filter(Boolean).join(' ').toLocaleLowerCase('id').includes(normalizedQuery));
  }, [products, query]);

  const handleDelete = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    setDeleteError('');
    const result = await adminRequest(
      `/api/products/${encodeURIComponent(productToDelete.id)}`,
      { method: 'DELETE' },
    );
    setIsDeleting(false);
    if (result.unauthorized) {
      clearAdminSession();
      navigate('/admin/login#session-expired');
      return;
    }
    if (!result.ok) {
      setDeleteError(result.message);
      notify(result.message || 'Motorcycle could not be deleted.', 'error');
      return;
    }
    setProducts((current) => current.filter((product) => product.id !== productToDelete.id));
    setNotice(`${productToDelete.name} was removed from the catalog.`);
    notify(`${productToDelete.name} was removed from the catalog.`);
    setProductToDelete(null);
  };

  const setDeleteTarget = (product) => {
    setDeleteError('');
    setProductToDelete(product);
  };

  return (
    <AdminLayout active="catalog">
      <section className="rm-admin__intro">
        <div>
          <nav aria-label="Breadcrumb" className="rm-admin-catalog__breadcrumb">
            <Link to="/admin/dashboard">Dashboard</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Manage Catalog</span>
          </nav>
          <p className="rm-admin-meta">CATALOG / INVENTORY</p>
          <h1>MANAGE CATALOG</h1>
          <p className="rm-admin__welcome">
            Manage the names, photos, and prices of builds shown in the public catalog.
          </p>
        </div>
        <div className="rm-admin-catalog__intro-actions">
          <Link className="rm-admin__public-link" to="/">
            View Public Website
            <Icon name="arrow-up-right" size={16} />
          </Link>
          <Link className="rm-admin-button rm-admin-button--primary" to="/admin/catalog/new">
            <span aria-hidden="true">+</span>
            Add Motorcycle
          </Link>
        </div>
      </section>

      {notice ? (
        <p aria-live="polite" className="rm-admin-catalog__notice" role="status">{notice}</p>
      ) : null}
      <section aria-labelledby="rm-admin-catalog-title" className="rm-admin-panel rm-admin-catalog">
        <div className="rm-admin-panel__heading">
          <div>
            <p className="rm-admin-meta">CATALOG / {String(products.length).padStart(2, '0')} MOTORCYCLES</p>
            <h2 id="rm-admin-catalog-title">LISTED MOTORCYCLES</h2>
          </div>
          <label className="rm-admin-catalog__search">
            <Icon name="search" size={16} />
            <span className="rm-visually-hidden">Search by name or motorcycle basis</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or motorcycle basis"
              type="search"
              value={query}
            />
          </label>
        </div>
        <p aria-live="polite" className="rm-admin-catalog__count">
          {isLoading
            ? 'Loading catalog...'
            : `Showing ${visibleProducts.length} of ${products.length} listed motorcycles.`}
        </p>
        {error ? (
          <div className="rm-admin__error" role="alert">
            <p>{error}</p>
            <button onClick={handleRetry} type="button">Try again</button>
          </div>
        ) : isLoading ? (
          <p aria-live="polite" className="rm-admin-catalog__state">Loading motorcycles from the database...</p>
        ) : visibleProducts.length ? (
          <ProductTable onDelete={setDeleteTarget} products={visibleProducts} />
        ) : (
          <div className="rm-admin-empty rm-admin-catalog__empty">
            <h3>{products.length ? 'No matching motorcycles.' : 'No motorcycles in the catalog yet.'}</h3>
            <p>
              {products.length
                ? 'Try another name, series, category, or basis keyword.'
                : 'Saved motorcycles will appear here and in the public catalog.'}
            </p>
          </div>
        )}
      </section>

      {productToDelete ? (
        <DeleteDialog
          error={deleteError}
          isDeleting={isDeleting}
          onCancel={() => !isDeleting && setProductToDelete(null)}
          onConfirm={handleDelete}
          product={productToDelete}
        />
      ) : null}
    </AdminLayout>
  );
}
