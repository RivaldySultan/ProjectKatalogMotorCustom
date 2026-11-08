import { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import Icon from '../components/ui/Icon';
import Link from '../components/ui/Link';
import { adminRequest, clearAdminSession } from '../lib/adminAuth';
import { navigate } from '../lib/router';
import {
  getCatalogProductImage,
  getProductBasis,
  getProductBuildName,
} from '../lib/products';
import { usePageTitle } from '../lib/usePageTitle';
import { useToast } from '../components/ui/useToast';
import './AdminCatalogPage.css';

const EMPTY_PRODUCT = {
  name: '',
  buildName: '',
  basis: '',
  categoryId: '',
  price: '',
  description: '',
  engine: '',
  transmission: '',
  cockpit: '',
  finishing: '',
  specNotes: '',
  imageAlt: '',
  stockStatus: 'Tersedia',
  purchaseType: 'consultation_only',
  purchaseEnabled: false,
  fixedSpecifications: '',
  estimatedBuildDays: '',
  purchaseStockQuantity: 0,
};

const FIELDS = [
  ['name', 'Build name'],
  ['buildName', 'Series name'],
  ['basis', 'Motorcycle basis'],
  ['categoryId', 'Style category'],
  ['price', 'Build price (Rupiah)'],
  ['description', 'Build description'],
  ['engine', 'Engine'],
  ['transmission', 'Transmission'],
  ['cockpit', 'Cockpit'],
  ['finishing', 'Seat and finish'],
  ['specNotes', 'Specification notes'],
  ['imageAlt', 'Image alt text'],
];

export default function AdminProductForm({ mode, id }) {
  const isEditing = mode === 'edit';
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [values, setValues] = useState(EMPTY_PRODUCT);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const notify = useToast();
  const previewUrlRef = useRef('');

  usePageTitle(`${isEditing ? 'Edit Motorcycle' : 'Add Motorcycle'} — RUKA Motorworks`);

  useEffect(() => {
    let active = true;
    const loadForm = async () => {
      try {
        const categoryResponse = await fetch('/api/categories');
        const categoryResult = await categoryResponse.json();
        if (!categoryResponse.ok || !categoryResult.success || !Array.isArray(categoryResult.data)) {
          throw new Error(categoryResult.message || 'Style categories could not be loaded.');
        }

        let currentProduct = null;
        if (isEditing) {
          const result = await adminRequest(`/api/products/${encodeURIComponent(id)}`);
          if (result.unauthorized) {
            clearAdminSession();
            navigate('/admin/login#session-expired');
            return;
          }
          if (!result.ok) throw new Error(result.message);
          currentProduct = result.data;
          setProduct(currentProduct);
        }

        if (active) {
          setCategories(categoryResult.data);
          if (currentProduct) {
            setValues({
              ...EMPTY_PRODUCT,
              ...currentProduct,
              buildName: getProductBuildName(currentProduct),
              basis: getProductBasis(currentProduct),
              price: String(currentProduct.price),
              imageAlt: currentProduct.imageAlt || currentProduct.name,
            });
          } else if (categoryResult.data[0]) {
            setValues((previous) => ({ ...previous, categoryId: categoryResult.data[0].id }));
          }
          setError('');
        }
      } catch (loadError) {
        if (active) {
          console.error('Failed to load motorcycle form data:', loadError);
          setError(loadError.message || 'Form data could not be loaded.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadForm();
    return () => {
      active = false;
    };
  }, [id, isEditing]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const currentImage = useMemo(
    () => (product ? getCatalogProductImage(product) : ''),
    [product],
  );
  const displayedImage = previewUrl || currentImage;

  const setField = (field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
  };

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setFileError('');
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    if (!selected) {
      setFile(null);
      setPreviewUrl('');
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setFileError('Choose a JPG or PNG file.');
      event.target.value = '';
      setFile(null);
      setPreviewUrl('');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setFileError('The main photo must not exceed 5 MB.');
      event.target.value = '';
      setFile(null);
      setPreviewUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(selected);
    previewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setFile(selected);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!isEditing && !file) {
      setFileError('A main photo is required when adding a new motorcycle.');
      notify('A main photo is required when adding a new motorcycle.', 'error');
      return;
    }
    if (fileError) {
      notify(fileError, 'error');
      return;
    }

    setIsSaving(true);
    const body = new FormData();
    for (const [field] of FIELDS) body.append(field, values[field] ?? '');
    body.append('stockStatus', values.stockStatus || 'Tersedia');
    body.append('purchaseType', values.purchaseType || 'consultation_only');
    body.append('purchaseEnabled', String(Boolean(values.purchaseEnabled)));
    body.append('fixedSpecifications', values.fixedSpecifications || '');
    body.append('estimatedBuildDays', values.estimatedBuildDays || '');
    body.append('purchaseStockQuantity', String(values.purchaseStockQuantity || 0));
    if (file) body.append('image', file);

    try {
      const result = await adminRequest(
        isEditing ? `/api/products/${encodeURIComponent(id)}` : '/api/products',
        { method: isEditing ? 'PUT' : 'POST', body },
      );
      if (result.unauthorized) {
        clearAdminSession();
        navigate('/admin/login#session-expired');
        return;
      }
      if (!result.ok) {
        setError(result.message);
        notify(result.message || 'Motorcycle could not be saved.', 'error');
        return;
      }
      notify(isEditing ? 'Motorcycle updated successfully.' : 'Motorcycle added successfully.');
      navigate('/admin/catalog');
    } catch (requestError) {
      console.error('Failed to save motorcycle:', requestError);
      setError('Unable to connect to the server. Motorcycle was not saved.');
      notify('Unable to connect. Motorcycle was not saved.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const title = isEditing ? 'EDIT MOTORCYCLE' : 'ADD MOTORCYCLE';

  return (
    <AdminLayout active="catalog">
      <section className="rm-admin__intro">
        <div>
          <nav aria-label="Breadcrumb" className="rm-admin-catalog__breadcrumb">
            <Link to="/admin/dashboard">Dashboard</Link>
            <span aria-hidden="true">/</span>
            <Link to="/admin/catalog">Manage Catalog</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{isEditing ? 'Edit motorcycle' : 'Add motorcycle'}</span>
          </nav>
          <p className="rm-admin-meta">CATALOG / {isEditing ? 'EDIT DETAILS' : 'NEW BUILD'}</p>
          <h1 id="rm-admin-form-title">{title}</h1>
          <p className="rm-admin__welcome">
            {isEditing
              ? 'Update the information shown in the public catalog.'
              : 'Add a new build to the public catalog.'}
          </p>
        </div>
        <Link className="rm-admin__public-link" to="/">
          View Public Website
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>

      {isLoading ? (
        <p aria-live="polite" className="rm-admin-catalog__state">Loading motorcycle data...</p>
      ) : error && !product && isEditing ? (
        <div className="rm-admin__error" role="alert">
          <p>{error}</p>
          <Link to="/admin/catalog">Back to catalog</Link>
        </div>
      ) : (
        <form className="rm-admin-form" onSubmit={handleSubmit}>
          {error ? <p className="rm-admin__error" role="alert">{error}</p> : null}
          <fieldset className="rm-admin-form__section">
            <legend>MAIN INFORMATION</legend>
            <div className="rm-admin-form__grid">
              <label className="rm-admin-form__field">
                <span>Build name <b>*</b></span>
                <input
                  autoComplete="off"
                  maxLength={120}
                  onChange={(event) => setField('name', event.target.value)}
                  required
                  value={values.name}
                />
              </label>
              <label className="rm-admin-form__field">
                <span>Series name <small>Optional</small></span>
                <input
                  maxLength={120}
                  onChange={(event) => setField('buildName', event.target.value)}
                  value={values.buildName || ''}
                />
              </label>
              <label className="rm-admin-form__field">
                <span>Motorcycle basis <b>*</b></span>
                <input
                  maxLength={160}
                  onChange={(event) => setField('basis', event.target.value)}
                  required
                  value={values.basis}
                />
              </label>
              <label className="rm-admin-form__field">
                <span>Style category <b>*</b></span>
                <select
                  onChange={(event) => setField('categoryId', event.target.value)}
                  required
                  value={values.categoryId}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="rm-admin-form__field">
                <span>Build price (Rupiah) <b>*</b></span>
                <input
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => setField('price', event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={values.price}
                />
              </label>
              <label className="rm-admin-form__field rm-admin-form__field--wide">
                <span>Build description <b>*</b></span>
                <textarea
                  maxLength={3000}
                  onChange={(event) => setField('description', event.target.value)}
                  required
                  rows={5}
                  value={values.description || ''}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="rm-admin-form__section">
            <legend>DIRECT PURCHASE AVAILABILITY</legend>
            <div className="rm-admin-form__grid">
              <label className="rm-admin-form__field">
                <span>Availability type</span>
                <select
                  onChange={(event) => setField('purchaseType', event.target.value)}
                  value={values.purchaseType || 'consultation_only'}
                >
                  <option value="consultation_only">Consultation only</option>
                  <option value="ready_stock">Ready stock</option>
                  <option value="made_to_order">Made to order — fixed specifications</option>
                </select>
              </label>
              <label className="rm-admin-form__field rm-admin-form__field--checkbox">
                <span>Enable direct purchase</span>
                <input
                  checked={Boolean(values.purchaseEnabled)}
                  onChange={(event) => setField('purchaseEnabled', event.target.checked)}
                  type="checkbox"
                />
              </label>
              <label className="rm-admin-form__field rm-admin-form__field--wide">
                <span>Final specifications <small>Required when purchase is enabled</small></span>
                <textarea
                  maxLength={3000}
                  onChange={(event) => setField('fixedSpecifications', event.target.value)}
                  placeholder={'Engine: 250 cc\nTransmission: 5-speed\nFinish: Matte black'}
                  rows={4}
                  value={values.fixedSpecifications || ''}
                />
                <small>One specification per line, in Label: value format. These become the order snapshot.</small>
              </label>
              {values.purchaseType === 'ready_stock' ? (
                <label className="rm-admin-form__field">
                  <span>Ready stock quantity</span>
                  <input
                    max="10000"
                    min="0"
                    onChange={(event) => setField('purchaseStockQuantity', event.target.value)}
                    step="1"
                    type="number"
                    value={values.purchaseStockQuantity ?? 0}
                  />
                </label>
              ) : null}
              {values.purchaseType === 'made_to_order' ? (
                <label className="rm-admin-form__field">
                  <span>Estimated build time (days) <small>Optional</small></span>
                  <input
                    max="365"
                    min="1"
                    onChange={(event) => setField('estimatedBuildDays', event.target.value)}
                    step="1"
                    type="number"
                    value={values.estimatedBuildDays || ''}
                  />
                </label>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="rm-admin-form__section">
            <legend>TECHNICAL SPECIFICATIONS</legend>
            <div className="rm-admin-form__grid">
              {FIELDS.slice(6, 11).map(([field, label]) => (
                <label className={`rm-admin-form__field${field === 'specNotes' ? ' rm-admin-form__field--wide' : ''}`} key={field}>
                  <span>{label}</span>
                  {field === 'specNotes' ? (
                    <textarea
                      maxLength={3000}
                      onChange={(event) => setField(field, event.target.value)}
                      rows={3}
                      value={values[field] || ''}
                    />
                  ) : (
                    <input
                      maxLength={240}
                      onChange={(event) => setField(field, event.target.value)}
                      value={values[field] || ''}
                    />
                  )}
                </label>
              ))}
              <label className="rm-admin-form__field">
                <span>Catalog status</span>
                <select
                  onChange={(event) => setField('stockStatus', event.target.value)}
                  value={values.stockStatus || 'Tersedia'}
                >
                  <option value="Tersedia">Available</option>
                  <option value="Habis">Out of stock</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="rm-admin-form__section">
            <legend>MOTORCYCLE IMAGES</legend>
            {displayedImage ? (
              <div className="rm-admin-form__current-image">
                <img alt={values.imageAlt || 'Current main motorcycle photo'} src={displayedImage} />
                <span>{file ? 'New photo preview' : 'Current main photo'}</span>
              </div>
            ) : null}
            <div className="rm-admin-form__grid">
              <label className="rm-admin-form__field">
                <span>Main motorcycle photo {isEditing ? <small>Replace if needed</small> : <b>*</b>}</span>
                <input
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  onChange={handleFileChange}
                  required={!isEditing}
                  type="file"
                />
                <small>JPG or PNG, up to 5 MB.</small>
                {fileError ? <small className="rm-admin-form__error">{fileError}</small> : null}
              </label>
              <label className="rm-admin-form__field">
                <span>Image alt text <b>*</b></span>
                <input
                  maxLength={180}
                  onChange={(event) => setField('imageAlt', event.target.value)}
                  required
                  value={values.imageAlt || ''}
                />
              </label>
            </div>
          </fieldset>

          <div className="rm-admin-form__actions">
            <Link className="rm-admin-button rm-admin-button--outline" to="/admin/catalog">Cancel</Link>
            <button className="rm-admin-button rm-admin-button--primary" disabled={isSaving} type="submit">
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Motorcycle'}
            </button>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
