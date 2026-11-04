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
  ['name', 'Nama build'],
  ['buildName', 'Nama seri'],
  ['basis', 'Basis motor'],
  ['categoryId', 'Kategori gaya'],
  ['price', 'Harga build (Rupiah)'],
  ['description', 'Deskripsi build'],
  ['engine', 'Mesin'],
  ['transmission', 'Transmisi'],
  ['cockpit', 'Kokpit'],
  ['finishing', 'Jok dan finishing'],
  ['specNotes', 'Catatan spesifikasi'],
  ['imageAlt', 'Teks alternatif gambar'],
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
  const previewUrlRef = useRef('');

  usePageTitle(`${isEditing ? 'Edit Motor' : 'Tambah Motor'} — RUKA Motorworks`);

  useEffect(() => {
    let active = true;
    const loadForm = async () => {
      try {
        const categoryResponse = await fetch('/api/categories');
        const categoryResult = await categoryResponse.json();
        if (!categoryResponse.ok || !categoryResult.success || !Array.isArray(categoryResult.data)) {
          throw new Error(categoryResult.message || 'Kategori gaya belum dapat dimuat.');
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
          console.error('Gagal memuat data form motor:', loadError);
          setError(loadError.message || 'Data form belum dapat dimuat.');
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
      setFileError('Pilih file JPG atau PNG.');
      event.target.value = '';
      setFile(null);
      setPreviewUrl('');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setFileError('Ukuran foto utama maksimal 5 MB.');
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
      setFileError('Foto utama wajib diunggah saat membuat motor baru.');
      return;
    }
    if (fileError) return;

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
        return;
      }
      navigate('/admin/catalog');
    } finally {
      setIsSaving(false);
    }
  };

  const title = isEditing ? 'EDIT MOTOR' : 'TAMBAH MOTOR BARU';

  return (
    <AdminLayout active="catalog">
      <section className="rm-admin__intro">
        <div>
          <nav aria-label="Breadcrumb" className="rm-admin-catalog__breadcrumb">
            <Link to="/admin/dashboard">Dashboard</Link>
            <span aria-hidden="true">/</span>
            <Link to="/admin/catalog">Kelola Katalog</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{isEditing ? 'Edit motor' : 'Tambah motor'}</span>
          </nav>
          <p className="rm-admin-meta">KATALOG / {isEditing ? 'EDIT DATA' : 'BUILD BARU'}</p>
          <h1 id="rm-admin-form-title">{title}</h1>
          <p className="rm-admin__welcome">
            {isEditing
              ? 'Perbarui informasi yang tersimpan di katalog publik.'
              : 'Tambahkan build baru agar tampil di katalog publik.'}
          </p>
        </div>
        <Link className="rm-admin__public-link" to="/">
          Lihat Website Publik
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>

      {isLoading ? (
        <p aria-live="polite" className="rm-admin-catalog__state">Memuat data motor...</p>
      ) : error && !product && isEditing ? (
        <div className="rm-admin__error" role="alert">
          <p>{error}</p>
          <Link to="/admin/catalog">Kembali ke katalog</Link>
        </div>
      ) : (
        <form className="rm-admin-form" onSubmit={handleSubmit}>
          {error ? <p className="rm-admin__error" role="alert">{error}</p> : null}
          <fieldset className="rm-admin-form__section">
            <legend>INFORMASI UTAMA</legend>
            <div className="rm-admin-form__grid">
              <label className="rm-admin-form__field">
                <span>Nama build <b>*</b></span>
                <input
                  autoComplete="off"
                  maxLength={120}
                  onChange={(event) => setField('name', event.target.value)}
                  required
                  value={values.name}
                />
              </label>
              <label className="rm-admin-form__field">
                <span>Nama seri <small>Opsional</small></span>
                <input
                  maxLength={120}
                  onChange={(event) => setField('buildName', event.target.value)}
                  value={values.buildName || ''}
                />
              </label>
              <label className="rm-admin-form__field">
                <span>Basis motor <b>*</b></span>
                <input
                  maxLength={160}
                  onChange={(event) => setField('basis', event.target.value)}
                  required
                  value={values.basis}
                />
              </label>
              <label className="rm-admin-form__field">
                <span>Kategori gaya <b>*</b></span>
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
                <span>Harga build (Rupiah) <b>*</b></span>
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
                <span>Deskripsi build <b>*</b></span>
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
            <legend>KETERSEDIAAN PEMBELIAN LANGSUNG</legend>
            <div className="rm-admin-form__grid">
              <label className="rm-admin-form__field">
                <span>Jenis ketersediaan</span>
                <select
                  onChange={(event) => setField('purchaseType', event.target.value)}
                  value={values.purchaseType || 'consultation_only'}
                >
                  <option value="consultation_only">Konsultasi saja</option>
                  <option value="ready_stock">Ready stock</option>
                  <option value="made_to_order">Made to order — spesifikasi tetap</option>
                </select>
              </label>
              <label className="rm-admin-form__field rm-admin-form__field--checkbox">
                <span>Aktifkan pembelian langsung</span>
                <input
                  checked={Boolean(values.purchaseEnabled)}
                  onChange={(event) => setField('purchaseEnabled', event.target.checked)}
                  type="checkbox"
                />
              </label>
              <label className="rm-admin-form__field rm-admin-form__field--wide">
                <span>Spesifikasi final <small>Wajib jika pembelian aktif</small></span>
                <textarea
                  maxLength={3000}
                  onChange={(event) => setField('fixedSpecifications', event.target.value)}
                  placeholder={'Mesin: 250 cc\nTransmisi: 5 percepatan\nFinishing: Matte black'}
                  rows={4}
                  value={values.fixedSpecifications || ''}
                />
                <small>Satu spesifikasi per baris, format Label: nilai. Ini menjadi snapshot pesanan.</small>
              </label>
              {values.purchaseType === 'ready_stock' ? (
                <label className="rm-admin-form__field">
                  <span>Jumlah ready stock</span>
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
                  <span>Estimasi pengerjaan (hari) <small>Opsional</small></span>
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
            <legend>SPESIFIKASI TEKNIS</legend>
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
                <span>Status katalog</span>
                <select
                  onChange={(event) => setField('stockStatus', event.target.value)}
                  value={values.stockStatus || 'Tersedia'}
                >
                  <option value="Tersedia">Tersedia</option>
                  <option value="Habis">Habis</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="rm-admin-form__section">
            <legend>GAMBAR MOTOR</legend>
            {displayedImage ? (
              <div className="rm-admin-form__current-image">
                <img alt={values.imageAlt || 'Foto utama motor saat ini'} src={displayedImage} />
                <span>{file ? 'Pratinjau foto baru' : 'Foto utama saat ini'}</span>
              </div>
            ) : null}
            <div className="rm-admin-form__grid">
              <label className="rm-admin-form__field">
                <span>Foto utama motor {isEditing ? <small>Ganti jika diperlukan</small> : <b>*</b>}</span>
                <input
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  onChange={handleFileChange}
                  required={!isEditing}
                  type="file"
                />
                <small>JPG atau PNG, maksimal 5 MB.</small>
                {fileError ? <small className="rm-admin-form__error">{fileError}</small> : null}
              </label>
              <label className="rm-admin-form__field">
                <span>Teks alternatif gambar <b>*</b></span>
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
            <Link className="rm-admin-button rm-admin-button--outline" to="/admin/catalog">Batal</Link>
            <button className="rm-admin-button rm-admin-button--primary" disabled={isSaving} type="submit">
              {isSaving ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Simpan Motor'}
            </button>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
