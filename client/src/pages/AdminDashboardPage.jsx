import { useEffect, useState } from 'react';
import Icon from '../components/ui/Icon';
import AdminLayout from '../components/admin/AdminLayout';
import { formatRupiah, getCatalogProductImage, getProductBuildName } from '../lib/products';
import {
  adminRequest,
  clearAdminSession,
  getAdminToken,
  useAdminSession,
} from '../lib/adminAuth';
import { navigate } from '../lib/router';
import { usePageTitle } from '../lib/usePageTitle';
import Link from '../components/ui/Link';
import './AdminDashboardPage.css';

function formatRequestDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getRequestBuild(request) {
  return [
    request.buildName || request.buildInterest,
    request.productName || request.basis || request.donorMotor,
  ].filter(Boolean).join(' / ') || 'Build belum ditentukan';
}

function getPurchaseStatusLabel(status) {
  const labels = {
    pending_approval: 'Menunggu persetujuan',
    waiting_shipping_quote: 'Menunggu konfirmasi ongkir',
    pending_payment: 'Menunggu pembayaran',
    waiting_verification: 'Menunggu verifikasi',
    payment_rejected: 'Bukti ditolak',
    paid: 'Lunas',
    processing: 'Sedang dikerjakan',
    ready: 'Siap diambil / dikirim',
    completed: 'Selesai',
    rejected: 'Ditolak',
  };
  return labels[status] || status;
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const adminSession = useAdminSession();
  const admin = adminSession.status === 'authenticated' ? adminSession.user : null;

  usePageTitle('Dashboard Admin — RUKA Motorworks');

  const loadSummary = () => {
    if (!getAdminToken()) {
      navigate('/admin/login');
      return;
    }

    adminRequest('/api/dashboard/summary')
      .then((result) => {
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

        setSummary(result.data);
        setIsLoading(false);
      })
      .catch((requestError) => {
        console.error('Gagal memuat ringkasan dashboard:', requestError);
        setError('Ringkasan dashboard belum dapat dimuat.');
        setIsLoading(false);
      });
  };

  const handleRetry = () => {
    setIsLoading(true);
    setError('');
    loadSummary();
  };

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    if (adminSession.status === 'unauthenticated') {
      navigate('/admin/login');
    }
  }, [adminSession.status]);

  const products = summary?.products || [];
  const latestConsultations = summary?.latestConsultations || [];
  const stats = [
    { label: 'Motor dalam katalog', value: summary ? products.length : '—', index: '01' },
    { label: 'Kategori gaya', value: summary?.categories ?? '—', index: '02' },
    { label: 'Permintaan konsultasi', value: summary?.consultations ?? '—', index: '03' },
    { label: 'Pesanan pembelian', value: summary?.purchaseOrders ?? '—', index: '04' },
  ];

  return (
    <AdminLayout active="dashboard">
          <section aria-labelledby="rm-admin-title" className="rm-admin__intro">
            <div>
              <p className="rm-admin-meta">RUANG KERJA / RINGKASAN</p>
              <h1 id="rm-admin-title">DASHBOARD</h1>
              <p className="rm-admin__welcome">
                Selamat datang, {admin?.name || 'Admin Ruka'}. Semua build dalam satu kendali.
              </p>
            </div>
            <Link className="rm-admin__public-link" to="/">
              Lihat Website Publik
              <Icon name="arrow-up-right" size={16} />
            </Link>
          </section>

          {error ? (
            <div className="rm-admin__error" role="alert">
              <p>{error}</p>
              <button onClick={handleRetry} type="button">Coba lagi</button>
            </div>
          ) : null}

          <section aria-label="Statistik ringkasan" className="rm-admin__stats">
            {stats.map((stat) => (
              <article aria-busy={isLoading} className="rm-admin-stat" key={stat.index}>
                <p className="rm-admin-meta">{stat.index} / {stat.label}</p>
                <p className="rm-admin-stat__value">
                  {isLoading ? <span className="rm-admin-stat__loading">—</span> : stat.value}
                </p>
                <p className="rm-admin-stat__note">
                  {stat.index === '01'
                    ? 'Build tersimpan di katalog publik'
                    : stat.index === '02'
                      ? 'Kategori yang tersedia'
                      : stat.index === '03'
                        ? 'Permintaan konsultasi build tersimpan'
                        : 'Pesanan pembelian langsung tersimpan'}
                </p>
              </article>
            ))}
          </section>

          <section aria-labelledby="rm-admin-orders-title" className="rm-admin-panel" id="pesanan">
            <div className="rm-admin-panel__heading">
              <div>
                <p className="rm-admin-meta">AKTIVITAS / KONSULTASI</p>
                <h2 id="rm-admin-orders-title">PESANAN TERBARU</h2>
                <p>Permintaan konsultasi build yang tercatat — bukan transaksi atau pembayaran.</p>
              </div>
              <Link className="rm-admin-panel__action" to="/admin/orders">
                Buka halaman Pesanan
                <Icon name="arrow-up-right" size={16} />
              </Link>
            </div>

            {isLoading ? (
              <div aria-live="polite" className="rm-admin-orders-state">
                Memuat permintaan konsultasi...
              </div>
            ) : error ? (
              <p className="rm-admin-orders-state">Data permintaan konsultasi belum dapat ditampilkan.</p>
            ) : latestConsultations.length ? (
              <div className="rm-admin-orders">
                {latestConsultations.map((request) => (
                  <article className="rm-admin-order" key={request.id}>
                    <div className="rm-admin-order__customer">
                      <p className="rm-admin-meta">NAMA PELANGGAN</p>
                      <h3>{request.customerName || 'Nama tidak tersedia'}</h3>
                    </div>
                    <div className="rm-admin-order__build">
                      <p className="rm-admin-meta">REFERENSI BUILD</p>
                      <p>{getRequestBuild(request)}</p>
                    </div>
                    <div className="rm-admin-order__date">
                      <p className="rm-admin-meta">TANGGAL PERMINTAAN</p>
                      <p>{formatRequestDate(request.createdAt)}</p>
                    </div>
                    <span className="rm-admin-order__status">
                      {request.status || 'Tercatat'}
                    </span>
                    <Link
                      aria-label={`Detail konsultasi ${request.customerName || 'pelanggan'}`}
                      className="rm-admin-order__detail"
                      to={`/admin/orders/${encodeURIComponent(request.id)}`}
                    >
                      Detail
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rm-admin-empty">
                <span aria-hidden="true" className="rm-admin-empty__mark">/</span>
                <h3>Belum ada pesanan.</h3>
                <p>
                  Pesanan yang tercatat akan muncul di sini. Belum ada aktivitas
                  penjualan untuk diringkas.
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="rm-admin-purchases-title" className="rm-admin-panel">
            <div className="rm-admin-panel__heading">
              <div>
                <p className="rm-admin-meta">PEMBELIAN / TRANSFER MANUAL</p>
                <h2 id="rm-admin-purchases-title">PESANAN PEMBELIAN TERBARU</h2>
                <p>Transaksi pembelian langsung, terpisah dari permintaan konsultasi.</p>
              </div>
              <Link className="rm-admin-panel__action" to="/admin/purchases">
                Buka Pesanan Pembelian
                <Icon name="arrow-up-right" size={16} />
              </Link>
            </div>
            {isLoading ? (
              <div aria-live="polite" className="rm-admin-orders-state">Memuat pesanan pembelian...</div>
            ) : error ? (
              <p className="rm-admin-orders-state">Data pesanan pembelian belum dapat ditampilkan.</p>
            ) : summary?.latestPurchaseOrders?.length ? (
              <div className="rm-admin-orders">
                {summary.latestPurchaseOrders.map((purchase) => (
                  <article className="rm-admin-order" key={purchase.id}>
                    <div className="rm-admin-order__customer">
                      <p className="rm-admin-meta">NOMOR PESANAN</p>
                      <h3>{purchase.orderNumber}</h3>
                    </div>
                    <div className="rm-admin-order__build">
                      <p className="rm-admin-meta">PELANGGAN / BUILD</p>
                      <p>{purchase.customerName} / {purchase.productName}</p>
                    </div>
                    <div className="rm-admin-order__date">
                      <p className="rm-admin-meta">TANGGAL</p>
                      <p>{formatRequestDate(purchase.createdAt)}</p>
                    </div>
                    <span className="rm-admin-order__status">{getPurchaseStatusLabel(purchase.status)}</span>
                    <Link
                      aria-label={`Detail pesanan ${purchase.orderNumber}`}
                      className="rm-admin-order__detail"
                      to={`/admin/purchases/${encodeURIComponent(purchase.id)}`}
                    >
                      Detail
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rm-admin-empty">
                <span aria-hidden="true" className="rm-admin-empty__mark">/</span>
                <h3>Belum ada pesanan.</h3>
                <p>Pesanan pembelian yang tercatat akan muncul di sini.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="rm-admin-builds-title" className="rm-admin-panel rm-admin-builds">
            <div className="rm-admin-panel__heading">
              <div>
                <p className="rm-admin-meta">KATALOG / INVENTARIS</p>
                <h2 id="rm-admin-builds-title">KELOLA BUILD</h2>
                <p>
                  {isLoading
                    ? 'Memuat katalog...'
                    : `${products.length} motor saat ini ditampilkan di katalog publik.`}
                </p>
              </div>
              <div className="rm-admin-builds__actions">
                <Link className="rm-admin-button rm-admin-button--outline" to="/admin/catalog/new">
                  <span aria-hidden="true">+</span>
                  Tambah Motor Baru
                </Link>
                <Link className="rm-admin-button rm-admin-button--outline" to="/admin/catalog">
                  Kelola Katalog
                  <Icon name="arrow-up-right" size={15} />
                </Link>
              </div>
            </div>

            {isLoading ? (
              <div aria-live="polite" className="rm-admin-orders-state">
                Memuat data katalog...
              </div>
            ) : error ? (
              <p className="rm-admin-orders-state">Data katalog belum dapat ditampilkan.</p>
            ) : products.length ? (
              <div className="rm-admin-product-list">
                {products.map((product, index) => {
                  const image = getCatalogProductImage(product, index);
                  const buildName = getProductBuildName(product);
                  return (
                    <article className="rm-admin-product" key={product.id}>
                      {image ? (
                        <img alt="" loading="lazy" src={image} />
                      ) : (
                        <span aria-hidden="true" className="rm-admin-product__placeholder">RUKA</span>
                      )}
                      <div className="rm-admin-product__identity">
                        <p className="rm-admin-meta">
                          {product.categoryName || 'CUSTOM BUILD'}
                        </p>
                        <h3>{product.name}</h3>
                        <p>{buildName || 'Build khusus'}</p>
                      </div>
                      <p className="rm-admin-product__price">{formatRupiah(product.price)}</p>
                      <span className="rm-admin-product__status">
                        {product.stockStatus || 'Tersimpan'}
                      </span>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rm-admin-empty rm-admin-empty--compact">
                <h3>Belum ada motor di katalog.</h3>
                <p>Motor yang tersimpan akan ditampilkan di sini.</p>
              </div>
            )}
          </section>

    </AdminLayout>
  );
}
