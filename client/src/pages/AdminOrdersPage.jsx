import { useEffect, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import Icon from '../components/ui/Icon';
import Link from '../components/ui/Link';
import { adminRequest, clearAdminSession, getAdminToken } from '../lib/adminAuth';
import { formatRupiah } from '../lib/products';
import { navigate } from '../lib/router';
import { usePageTitle } from '../lib/usePageTitle';
import { getWhatsAppLink, WHATSAPP_MESSAGE } from '../lib/whatsapp';
import './AdminOrdersPage.css';

const PAGE_SIZE = 10;

function formatRequestDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getBuildName(request) {
  return request.buildName
    || request.buildInterest
    || request.productName
    || request.basis
    || 'Build belum ditentukan';
}

function getAdminError(result, fallback) {
  if (result.unauthorized) {
    clearAdminSession();
    navigate('/admin/login#session-expired');
    return '';
  }
  return result.message || fallback;
}

function OrdersListPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [productId, setProductId] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loadedQuery, setLoadedQuery] = useState('');
  const [loadResult, setLoadResult] = useState({ query: '', error: '' });

  usePageTitle('Pesanan — RUKA Motorworks');

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      name: name.trim(),
      phone: phone.trim(),
      productId,
      sort,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    const query = params.toString();

    adminRequest(`/api/consultations?${query}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setLoadResult({
            query,
            error: getAdminError(result, 'Daftar pesanan belum dapat dimuat.'),
          });
          return;
        }
        setOrders(result.data.data);
        setProducts(result.data.products);
        setPagination(result.data.pagination);
        setLoadResult({ query, error: '' });
      })
      .catch((requestError) => {
        console.error('Gagal memuat daftar pesanan:', requestError);
        if (active) setLoadResult({ query, error: 'Daftar pesanan belum dapat dimuat.' });
      })
      .finally(() => {
        if (active) setLoadedQuery(query);
      });

    return () => {
      active = false;
    };
  }, [name, phone, productId, sort, page]);

  const handleFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  const isLoading = loadedQuery !== new URLSearchParams({
    name: name.trim(),
    phone: phone.trim(),
    productId,
    sort,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  }).toString();
  const error = loadResult.query === loadedQuery ? loadResult.error : '';

  return (
    <AdminLayout active="orders">
      <section aria-labelledby="rm-admin-orders-title" className="rm-admin__intro">
        <div>
          <p className="rm-admin-meta">RUANG KERJA / KONSULTASI</p>
          <h1 id="rm-admin-orders-title">PESANAN</h1>
          <p className="rm-admin__welcome">
            Kelola permintaan konsultasi build yang masuk dari pelanggan.
          </p>
        </div>
        <Link className="rm-admin__public-link" to="/admin/dashboard">
          Kembali ke Dashboard
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>

      <section aria-label="Filter pesanan" className="rm-admin-orders__filters">
        <label>
          <span>Nama pelanggan</span>
          <input
            autoComplete="off"
            onChange={handleFilterChange(setName)}
            placeholder="Cari nama..."
            type="search"
            value={name}
          />
        </label>
        <label>
          <span>Nomor WhatsApp</span>
          <input
            autoComplete="off"
            onChange={handleFilterChange(setPhone)}
            placeholder="Cari nomor..."
            type="search"
            value={phone}
          />
        </label>
        <label>
          <span>Motor atau build</span>
          <select onChange={handleFilterChange(setProductId)} value={productId}>
            <option value="">Semua build</option>
            {products.map((product) => (
              <option key={`${product.id}-${product.name}`} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Urutkan tanggal</span>
          <select onChange={handleFilterChange(setSort)} value={sort}>
            <option value="desc">Terbaru</option>
            <option value="asc">Terlama</option>
          </select>
        </label>
      </section>

      {error ? <p className="rm-admin-orders__error" role="alert">{error}</p> : null}

      <section aria-label="Daftar permintaan konsultasi" className="rm-admin-panel rm-admin-orders">
        <div className="rm-admin-orders__summary">
          <p className="rm-admin-meta">PERMINTAAN TERCATAT</p>
          <p aria-live="polite">{pagination.total} permintaan</p>
        </div>
        {isLoading ? (
          <p aria-live="polite" className="rm-admin-orders__state">Memuat permintaan konsultasi...</p>
        ) : error ? (
          <p className="rm-admin-orders__state">Data pesanan belum dapat ditampilkan.</p>
        ) : orders.length ? (
          <>
            <div className="rm-admin-orders__scroll" role="region" aria-label="Tabel daftar pesanan" tabIndex={0}>
              <table className="rm-admin-orders__table">
                <thead>
                  <tr>
                    <th scope="col">Nama pelanggan</th>
                    <th scope="col">Nomor WhatsApp</th>
                    <th scope="col">Motor / build</th>
                    <th scope="col">Kota domisili</th>
                    <th scope="col">Kisaran anggaran</th>
                    <th scope="col">Tanggal permintaan</th>
                    <th scope="col">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <th scope="row">{order.customerName || 'Nama tidak tersedia'}</th>
                      <td>{order.phone || '—'}</td>
                      <td>
                        <span>{getBuildName(order)}</span>
                        {order.basis ? <small>{order.basis}</small> : null}
                      </td>
                      <td>{order.city || '—'}</td>
                      <td>{order.budgetRange || '—'}</td>
                      <td>{formatRequestDate(order.createdAt)}</td>
                      <td>
                        <Link
                          aria-label={`Detail konsultasi ${order.customerName || 'pelanggan'}`}
                          className="rm-admin-orders__detail-link"
                          to={`/admin/orders/${encodeURIComponent(order.id)}`}
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="Navigasi halaman pesanan" className="rm-admin-orders__pagination">
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Sebelumnya
              </button>
              <span>Halaman {pagination.page} dari {Math.max(1, pagination.totalPages)}</span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Berikutnya
              </button>
            </nav>
          </>
        ) : (
          <div className="rm-admin-empty">
            <span aria-hidden="true" className="rm-admin-empty__mark">/</span>
            <h2>{name || phone || productId ? 'Tidak ada pesanan yang sesuai.' : 'Belum ada pesanan.'}</h2>
            <p>
              {name || phone || productId
                ? 'Ubah pencarian atau filter motor untuk melihat permintaan lain.'
                : 'Pesanan yang tercatat akan muncul di sini. Belum ada aktivitas penjualan untuk diringkas.'}
            </p>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

function ConsultationDetailPage({ id }) {
  const [consultation, setConsultation] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [loadedId, setLoadedId] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [loadResult, setLoadResult] = useState({ id: '', error: '' });
  const [photoError, setPhotoError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  usePageTitle('Detail Pesanan — RUKA Motorworks');

  useEffect(() => {
    let active = true;
    adminRequest(`/api/consultations/${encodeURIComponent(id)}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setLoadResult({
            id,
            error: getAdminError(result, 'Detail konsultasi belum dapat dimuat.'),
          });
          return;
        }
        setConsultation(result.data);
        setSelectedStatus(result.data.status || '');
        setLoadResult({ id, error: '' });
      })
      .catch((requestError) => {
        console.error('Gagal memuat detail pesanan:', requestError);
        if (active) setLoadResult({ id, error: 'Detail konsultasi belum dapat dimuat.' });
      })
      .finally(() => {
        if (active) setLoadedId(id);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const isLoading = loadedId !== id;
  const error = loadResult.id === id ? loadResult.error : '';

  const photoPaths = consultation?.photos?.join('|') || '';
  useEffect(() => {
    let active = true;
    const objectUrls = [];

    const loadPhotos = async () => {
      if (!photoPaths) {
        setPhotos([]);
        setPhotoError('');
        return;
      }

      setPhotos([]);
      setPhotoError('');
      const token = getAdminToken();
      try {
        const loaded = await Promise.all(photoPaths.split('|').map(async (url) => {
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.status === 401 || response.status === 403) {
            clearAdminSession();
            navigate('/admin/login#session-expired');
            throw new Error('Sesi admin telah berakhir.');
          }
          if (!response.ok) throw new Error('Foto referensi belum dapat dimuat.');
          const objectUrl = URL.createObjectURL(await response.blob());
          objectUrls.push(objectUrl);
          return objectUrl;
        }));
        if (active) setPhotos(loaded);
      } catch (requestError) {
        console.error('Gagal memuat foto konsultasi:', requestError);
        if (active) setPhotoError(requestError.message || 'Foto referensi belum dapat dimuat.');
      }
    };

    void loadPhotos();
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPaths]);

  const handleStatusSave = async () => {
    setIsSavingStatus(true);
    setStatusMessage('');
    const result = await adminRequest(`/api/consultations/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: selectedStatus }),
    });
    if (!result.ok) {
      setLoadResult({
        id,
        error: getAdminError(result, 'Status konsultasi belum dapat diperbarui.'),
      });
    } else {
      setConsultation(result.data);
      setSelectedStatus(result.data.status);
      setStatusMessage(result.message || 'Status konsultasi berhasil diperbarui.');
      setLoadResult({ id, error: '' });
    }
    setIsSavingStatus(false);
  };

  const whatsappUrl = getWhatsAppLink(WHATSAPP_MESSAGE);

  return (
    <AdminLayout active="orders">
      <section aria-labelledby="rm-admin-detail-title" className="rm-admin__intro">
        <div>
          <p className="rm-admin-meta">RUANG KERJA / PESANAN / DETAIL</p>
          <h1 id="rm-admin-detail-title">DETAIL KONSULTASI</h1>
          <p className="rm-admin__welcome">Tinjau permintaan build dan data pelanggan.</p>
        </div>
        <Link className="rm-admin__public-link" to="/admin/orders">
          Kembali ke Pesanan
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>

      {error ? <p className="rm-admin-orders__error" role="alert">{error}</p> : null}
      {isLoading ? (
        <p aria-live="polite" className="rm-admin-orders__state">Memuat detail konsultasi...</p>
      ) : consultation ? (
        <>
          <section aria-label="Status konsultasi" className="rm-admin-order-detail__status">
            <div>
              <p className="rm-admin-meta">STATUS PERMINTAAN</p>
              <p className="rm-admin-order-detail__current-status">{consultation.status || '—'}</p>
            </div>
            <label>
              <span>Perbarui status</span>
              <select
                disabled={!consultation.statusOptions?.length || isSavingStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                value={selectedStatus}
              >
                {consultation.statusOptions?.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <button
              className="rm-admin-orders__button"
              disabled={
                isSavingStatus
                || !selectedStatus
                || selectedStatus === consultation.status
                || !consultation.statusOptions?.length
              }
              onClick={handleStatusSave}
              type="button"
            >
              {isSavingStatus ? 'Menyimpan...' : 'Simpan status'}
            </button>
            <p className="rm-admin-order-detail__status-note">
              Pilihan hanya menggunakan status yang sudah tersimpan di database; tidak ada status atau alur baru yang ditambahkan.
            </p>
            {statusMessage ? <p className="rm-admin-order-detail__notice" role="status">{statusMessage}</p> : null}
          </section>

          <div className="rm-admin-order-detail__grid">
            <section aria-labelledby="rm-admin-customer-title" className="rm-admin-panel">
              <p className="rm-admin-meta">A / IDENTITAS PELANGGAN</p>
              <h2 id="rm-admin-customer-title">DATA PELANGGAN</h2>
              <dl className="rm-admin-order-detail__fields">
                <div><dt>Nama lengkap</dt><dd>{consultation.customerName || '—'}</dd></div>
                <div><dt>Nomor WhatsApp</dt><dd>{consultation.phone || '—'}</dd></div>
                <div><dt>Email</dt><dd>{consultation.email || 'Tidak tersedia'}</dd></div>
                <div><dt>Kota domisili</dt><dd>{consultation.city || '—'}</dd></div>
              </dl>
              <a
                className="rm-admin-orders__whatsapp"
                href={whatsappUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                WhatsApp Ruka Motorworks
                <Icon name="arrow-up-right" size={16} />
              </a>
            </section>

            <section aria-labelledby="rm-admin-build-title" className="rm-admin-panel">
              <p className="rm-admin-meta">B / REFERENSI BUILD</p>
              <h2 id="rm-admin-build-title">MOTOR YANG DIMINATI</h2>
              <dl className="rm-admin-order-detail__fields">
                <div><dt>Nama produk / build</dt><dd>{getBuildName(consultation)}</dd></div>
                <div><dt>Basis motor</dt><dd>{consultation.basis || 'Tidak tersedia'}</dd></div>
                <div><dt>Kategori custom</dt><dd>{consultation.categoryName || 'Tidak tersedia'}</dd></div>
                <div>
                  <dt>Harga katalog saat permintaan</dt>
                  <dd>{consultation.price == null ? 'Tidak tersedia' : formatRupiah(consultation.price)}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="rm-admin-requirements-title" className="rm-admin-panel">
              <p className="rm-admin-meta">C / KEBUTUHAN KONSULTASI</p>
              <h2 id="rm-admin-requirements-title">CERITA BUILD</h2>
              <dl className="rm-admin-order-detail__fields">
                <div><dt>Motor donor</dt><dd>{consultation.donorMotor || '—'}</dd></div>
                <div><dt>Kisaran anggaran</dt><dd>{consultation.budgetRange || '—'}</dd></div>
                <div><dt>Tanggal permintaan</dt><dd>{formatRequestDate(consultation.createdAt)}</dd></div>
              </dl>
              <p className="rm-admin-order-detail__requirements">{consultation.requirements || 'Tidak ada deskripsi kebutuhan.'}</p>
            </section>

            <section aria-labelledby="rm-admin-photos-title" className="rm-admin-panel">
              <p className="rm-admin-meta">D / FOTO REFERENSI</p>
              <h2 id="rm-admin-photos-title">FOTO DONOR / REFERENSI</h2>
              {photoError ? (
                <p className="rm-admin-order-detail__note" role="alert">{photoError}</p>
              ) : consultation.photos.length ? photos.length ? (
                <div className="rm-admin-order-detail__photos">
                  {photos.map((photo, index) => (
                    <a
                      aria-label={`Buka preview foto referensi ${index + 1}`}
                      href={photo}
                      key={photo}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <img alt={`Foto referensi konsultasi ${index + 1}`} loading="lazy" src={photo} />
                      <span>Preview {index + 1}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p aria-live="polite" className="rm-admin-order-detail__note">Memuat foto referensi...</p>
              ) : (
                <p className="rm-admin-order-detail__note">Tidak ada foto yang diunggah.</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </AdminLayout>
  );
}

export default function AdminOrdersPage({ route }) {
  return route.mode === 'detail'
    ? <ConsultationDetailPage id={route.id} />
    : <OrdersListPage />;
}
