import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import Icon from '../components/ui/Icon';
import Link from '../components/ui/Link';
import { adminRequest, clearAdminSession, getAdminToken } from '../lib/adminAuth';
import { formatRupiah } from '../lib/products';
import { navigate } from '../lib/router';
import { usePageTitle } from '../lib/usePageTitle';
import './AdminPurchasesPage.css';

const PAGE_SIZE = 10;

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Tanggal tidak tersedia'
    : new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function getAdminError(result, fallback) {
  if (result.unauthorized) {
    clearAdminSession();
    navigate('/admin/login#session-expired');
    return '';
  }
  return result.message || fallback;
}

const ORDER_STATUS_LABELS = {
  pending_approval: 'Menunggu persetujuan',
  waiting_shipping_quote: 'Menunggu ongkir',
  pending_payment: 'Menunggu pembayaran',
  waiting_verification: 'Menunggu verifikasi',
  payment_rejected: 'Bukti ditolak',
  paid: 'Lunas',
  processing: 'Sedang dikerjakan',
  ready: 'Siap diambil / dikirim',
  completed: 'Selesai',
  rejected: 'Ditolak',
};

function PurchaseList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  usePageTitle('Pesanan Pembelian — RUKA Motorworks');

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      search: search.trim(),
      status,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    adminRequest(`/api/purchases/admin?${query}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(getAdminError(result, 'Daftar pesanan pembelian belum dapat dimuat.'));
        } else {
          setError('');
          setOrders(result.data?.data || []);
          setPagination(result.data?.pagination || { page: 1, total: 0, totalPages: 0 });
        }
        setLoading(false);
      })
      .catch((requestError) => {
        console.error('Gagal memuat pesanan pembelian:', requestError);
        if (active) {
          setError('Daftar pesanan pembelian belum dapat dimuat.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [search, status, page]);

  return (
    <AdminLayout active="purchases">
      <section aria-labelledby="rm-admin-purchases-title" className="rm-admin__intro">
        <div>
          <p className="rm-admin-meta">RUANG KERJA / PEMBELIAN LANGSUNG</p>
          <h1 id="rm-admin-purchases-title">PESANAN PEMBELIAN</h1>
          <p className="rm-admin__welcome">Tinjau pembayaran dan progres pesanan build yang dibeli langsung.</p>
        </div>
        <Link className="rm-admin__public-link" to="/admin/dashboard">
          Kembali ke Dashboard
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>

      <section aria-label="Filter pesanan pembelian" className="rm-admin-purchases__filters">
        <label>
          <span>Cari pesanan atau pelanggan</span>
          <input onChange={(event) => { setLoading(true); setSearch(event.target.value); setPage(1); }} placeholder="Nomor, nama, telepon, build" type="search" value={search} />
        </label>
        <label>
          <span>Status pesanan</span>
          <select onChange={(event) => { setLoading(true); setStatus(event.target.value); setPage(1); }} value={status}>
            <option value="">Semua status</option>
            <option value="pending_approval">Menunggu persetujuan</option>
            <option value="waiting_shipping_quote">Menunggu konfirmasi ongkir</option>
            <option value="pending_payment">Menunggu pembayaran</option>
            <option value="waiting_verification">Menunggu verifikasi</option>
            <option value="payment_rejected">Bukti pembayaran ditolak</option>
            <option value="paid">Lunas</option>
            <option value="processing">Sedang dikerjakan</option>
            <option value="ready">Siap diambil / dikirim</option>
            <option value="completed">Selesai</option>
            <option value="rejected">Pesanan ditolak</option>
          </select>
        </label>
      </section>

      {error ? <p className="rm-admin-purchases__error" role="alert">{error}</p> : null}
      <section aria-label="Daftar pesanan pembelian" className="rm-admin-panel rm-admin-purchases">
        <div className="rm-admin-purchases__summary">
          <p className="rm-admin-meta">DATA PEMBELIAN / TRANSFER MANUAL</p>
          <p>{pagination.total} pesanan tercatat</p>
        </div>
        {loading ? (
          <p aria-live="polite" className="rm-admin-purchases__state">Memuat pesanan pembelian...</p>
        ) : error ? (
          <p className="rm-admin-purchases__state">Daftar belum dapat ditampilkan.</p>
        ) : orders.length ? (
          <>
            <div className="rm-admin-purchases__scroll" role="region" aria-label="Tabel pesanan pembelian" tabIndex={0}>
              <table className="rm-admin-purchases__table">
                <thead><tr>
                  <th scope="col">Nomor pesanan</th><th scope="col">Pelanggan</th>
                  <th scope="col">Motor / build</th><th scope="col">Harga</th>
                  <th scope="col">Metode</th><th scope="col">Status</th>
                  <th scope="col">Tanggal</th><th scope="col">Aksi</th>
                </tr></thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <th scope="row">{order.orderNumber}</th>
                      <td>{order.customerName}</td>
                      <td>{order.buildName || order.productName}</td>
                      <td>{formatRupiah(order.price)}</td>
                      <td>{order.paymentMethod === 'gopay' ? 'GoPay' : 'SeaBank'}</td>
                      <td>{ORDER_STATUS_LABELS[order.status] || order.status}</td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td><Link className="rm-admin-purchases__detail-link" to={`/admin/purchases/${encodeURIComponent(order.id)}`}>Detail</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="Navigasi halaman pesanan pembelian" className="rm-admin-purchases__pagination">
              <button disabled={page <= 1} onClick={() => { setLoading(true); setPage((current) => current - 1); }} type="button">Sebelumnya</button>
              <span>Halaman {pagination.page} / {Math.max(pagination.totalPages, 1)}</span>
              <button disabled={page >= pagination.totalPages} onClick={() => { setLoading(true); setPage((current) => current + 1); }} type="button">Berikutnya</button>
            </nav>
          </>
        ) : (
          <div className="rm-admin-purchases__empty">
            <h2>Belum ada pesanan.</h2>
            <p>Pesanan pembelian langsung yang tercatat akan muncul di sini.</p>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

function PurchaseDetail({ id }) {
  const [order, setOrder] = useState(null);
  const [proofUrl, setProofUrl] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  usePageTitle(order?.orderNumber ? `${order.orderNumber} — Pesanan RUKA` : 'Detail Pesanan — RUKA Motorworks');

  const loadOrder = useCallback(async () => {
    const result = await adminRequest(`/api/purchases/admin/${encodeURIComponent(id)}`);
    if (!result.ok) {
      setError(getAdminError(result, 'Detail pesanan belum dapat dimuat.'));
      setLoading(false);
      return;
    }
    const detail = result.data;
    setError('');
    setOrder(detail);
    setNextStatus(detail.orderStatus);
    setShippingCost(detail.shippingCost == null ? '' : String(detail.shippingCost));
    if (detail.paymentProofUrl) {
      try {
        const response = await fetch(detail.paymentProofUrl, {
          headers: { Authorization: `Bearer ${getAdminToken()}` },
        });
        if (!response.ok) throw new Error(`Bukti pembayaran tidak dapat dimuat (${response.status}).`);
        const imageUrl = URL.createObjectURL(await response.blob());
        setProofUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return imageUrl;
        });
      } catch (proofError) {
        console.error('Gagal memuat bukti pembayaran privat:', proofError);
        setError(proofError.message || 'Bukti pembayaran belum dapat dimuat.');
      }
    } else {
      setProofUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return '';
      });
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    adminRequest(`/api/purchases/admin/${encodeURIComponent(id)}`)
      .then(async (result) => {
        if (!active) return;
        if (!result.ok) {
          setError(getAdminError(result, 'Detail pesanan belum dapat dimuat.'));
          setLoading(false);
          return;
        }
        const detail = result.data;
        setError('');
        setOrder(detail);
        setNextStatus(detail.orderStatus);
        setShippingCost(detail.shippingCost == null ? '' : String(detail.shippingCost));
        if (detail.paymentProofUrl) {
          try {
            const response = await fetch(detail.paymentProofUrl, {
              headers: { Authorization: `Bearer ${getAdminToken()}` },
            });
            if (!response.ok) throw new Error(`Bukti pembayaran tidak dapat dimuat (${response.status}).`);
            const imageUrl = URL.createObjectURL(await response.blob());
            if (active) {
              setProofUrl((previous) => {
                if (previous) URL.revokeObjectURL(previous);
                return imageUrl;
              });
            } else {
              URL.revokeObjectURL(imageUrl);
            }
          } catch (proofError) {
            console.error('Gagal memuat bukti pembayaran privat:', proofError);
            if (active) setError(proofError.message || 'Bukti pembayaran belum dapat dimuat.');
          }
        } else {
          setProofUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return '';
          });
        }
        if (active) setLoading(false);
      })
      .catch((requestError) => {
        console.error('Gagal memuat detail pesanan:', requestError);
        if (active) {
          setError('Detail pesanan belum dapat dimuat.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => () => {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
  }, [proofUrl]);

  const performAction = async (url, options, successMessage) => {
    setSaving(true);
    setError('');
    setNotice('');
    const result = await adminRequest(url, options);
    if (!result.ok) {
      setError(getAdminError(result, 'Perubahan pesanan belum dapat disimpan.'));
      setSaving(false);
      return;
    }
    setNotice(successMessage);
    await loadOrder();
    setSaving(false);
  };

  const shippingStatuses = order?.shippingMethod === 'pickup'
    ? ['processing', 'ready_for_pickup', 'completed', 'cancelled']
    : ['processing', 'ready_to_ship', 'completed', 'cancelled'];

  return (
    <AdminLayout active="purchases">
      <section aria-labelledby="rm-admin-purchase-detail-title" className="rm-admin__intro">
        <div>
          <p className="rm-admin-meta">RUANG KERJA / PEMBELIAN / DETAIL</p>
          <h1 id="rm-admin-purchase-detail-title">DETAIL PESANAN</h1>
          <p className="rm-admin__welcome">{order?.orderNumber || 'Periksa snapshot dan status pesanan.'}</p>
        </div>
        <Link className="rm-admin__public-link" to="/admin/purchases">
          Kembali ke Pesanan Pembelian
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>
      {error ? <p className="rm-admin-purchases__error" role="alert">{error}</p> : null}
      {notice ? <p className="rm-admin-purchases__notice" role="status">{notice}</p> : null}
      {loading ? <p className="rm-admin-purchases__state">Memuat detail pesanan...</p> : order ? (
        <>
          <section aria-label="Status pembayaran dan pekerjaan" className="rm-admin-purchase-detail__status">
            <div><p className="rm-admin-meta">PERSETUJUAN</p><p>{order.approvalStatus === 'approved' ? 'Disetujui' : order.approvalStatus === 'rejected' ? 'Ditolak' : 'Menunggu keputusan'}</p></div>
            <div><p className="rm-admin-meta">PEMBAYARAN</p><p>{order.paymentStatus}</p></div>
            <div><p className="rm-admin-meta">PENGERJAAN</p><p>{order.approvalStatus === 'pending_approval' ? 'Menunggu persetujuan admin' : order.orderStatus}</p></div>
            {order.approvalRejectionReason ? <div><p className="rm-admin-meta">ALASAN PENOLAKAN</p><p>{order.approvalRejectionReason}</p></div> : null}
            {order.approvalStatus === 'pending_approval' ? (
              <div className="rm-admin-purchase-detail__actions rm-admin-purchase-detail__approval">
                <button
                  disabled={saving || (order.shippingMethod === 'delivery' && order.shippingCost == null)}
                  onClick={() => void performAction(
                    `/api/purchases/admin/${encodeURIComponent(id)}/approval`,
                    { method: 'PATCH', body: JSON.stringify({ decision: 'approved' }) },
                    'Pesanan disetujui. Instruksi pembayaran tersedia setelah keputusan tersimpan.',
                  )}
                  type="button"
                >
                  Setujui dan buka pembayaran
                </button>
                <label>Alasan penolakan
                  <textarea maxLength={1000} minLength={10} onChange={(event) => setRejectionReason(event.target.value)} required rows={3} value={rejectionReason} />
                </label>
                <button
                  disabled={saving || rejectionReason.trim().length < 10}
                  onClick={() => void performAction(
                    `/api/purchases/admin/${encodeURIComponent(id)}/approval`,
                    { method: 'PATCH', body: JSON.stringify({ decision: 'rejected', reason: rejectionReason }) },
                    'Pesanan ditolak dan alasan tersimpan.',
                  )}
                  type="button"
                >
                  Tolak pesanan
                </button>
              </div>
            ) : null}
            {order.paymentStatus === 'waiting_verification' ? (
              <div className="rm-admin-purchase-detail__actions">
                <button disabled={saving} onClick={() => void performAction(`/api/purchases/admin/${encodeURIComponent(id)}/payment-review`, { method: 'POST', body: JSON.stringify({ decision: 'paid' }) }, 'Pembayaran dikonfirmasi dan tersimpan.')} type="button">Konfirmasi pembayaran masuk</button>
                <button disabled={saving} onClick={() => void performAction(`/api/purchases/admin/${encodeURIComponent(id)}/payment-review`, { method: 'POST', body: JSON.stringify({ decision: 'rejected' }) }, 'Bukti ditolak. Pelanggan dapat mengunggah ulang.')} type="button">Tolak bukti</button>
              </div>
            ) : null}
          </section>

          <div className="rm-admin-purchase-detail__grid">
            <section className="rm-admin-panel">
              <p className="rm-admin-meta">A / IDENTITAS PELANGGAN</p><h2>DATA PELANGGAN</h2>
              <dl className="rm-admin-purchase-detail__fields">
                <div><dt>Nama</dt><dd>{order.customerName}</dd></div>
                <div><dt>WhatsApp</dt><dd>{order.phone}</dd></div>
                <div><dt>Email</dt><dd>{order.email || 'Tidak tersedia'}</dd></div>
                <div><dt>Kota</dt><dd>{order.city}</dd></div>
                <div><dt>Pengambilan / pengiriman</dt><dd>{order.shippingMethod === 'pickup' ? 'Pengambilan langsung' : 'Pengiriman'}</dd></div>
                {order.shippingMethod === 'delivery' ? <div><dt>Alamat</dt><dd>{order.deliveryAddress}</dd></div> : null}
              </dl>
            </section>
            <section className="rm-admin-panel">
              <p className="rm-admin-meta">B / SNAPSHOT BUILD</p><h2>{order.buildName}</h2>
              {order.imageSnapshot ? <img alt={`Foto snapshot ${order.buildName}`} className="rm-admin-purchase-detail__product-image" src={order.imageSnapshot} /> : null}
              <dl className="rm-admin-purchase-detail__fields">
                <div><dt>Produk</dt><dd>{order.productName}</dd></div>
                <div><dt>Basis motor</dt><dd>{order.basis}</dd></div>
                <div><dt>Kategori</dt><dd>{order.categoryName}</dd></div>
                <div><dt>Spesifikasi tetap</dt><dd>{JSON.parse(order.specifications || '[]').map(({ label, value }) => `${label}: ${value}`).join(' · ') || '—'}</dd></div>
                <div><dt>Snapshot harga</dt><dd>{formatRupiah(order.price)}</dd></div>
                <div><dt>Ongkir</dt><dd>{order.shippingCost == null ? 'Menunggu konfirmasi' : formatRupiah(order.shippingCost)}</dd></div>
                <div><dt>Total</dt><dd>{formatRupiah(order.totalAmount)}</dd></div>
                <div><dt>Metode pembayaran</dt><dd>{order.paymentMethod === 'gopay' ? 'GoPay' : 'SeaBank'}</dd></div>
                <div><dt>Tanggal pesanan</dt><dd>{formatDate(order.createdAt)}</dd></div>
              </dl>
            </section>
            {order.orderStatus === 'awaiting_shipping_quote' ? (
              <section className="rm-admin-panel rm-admin-purchase-detail__quote">
                <p className="rm-admin-meta">ONGKIR / KONFIRMASI ADMIN</p><h2>Konfirmasi biaya pengiriman</h2>
                <label>Biaya ongkir (Rupiah)
                  <input min="0" onChange={(event) => setShippingCost(event.target.value)} step="1" type="number" value={shippingCost} />
                </label>
                <p>Masukkan ongkir yang sudah dikonfirmasi dengan pelanggan. Total dan instruksi transfer baru akan tersedia sesudah disimpan.</p>
                <button disabled={saving || !Number.isSafeInteger(Number(shippingCost)) || Number(shippingCost) < 0} onClick={() => void performAction(`/api/purchases/admin/${encodeURIComponent(id)}/shipping-quote`, { method: 'POST', body: JSON.stringify({ shippingCost: Number(shippingCost) }) }, 'Biaya pengiriman berhasil disimpan.')} type="button">Simpan biaya pengiriman</button>
              </section>
            ) : null}
            <section className="rm-admin-panel">
              <p className="rm-admin-meta">C / BUKTI TRANSFER PRIVAT</p><h2>BUKTI PEMBAYARAN</h2>
              {proofUrl ? <a href={proofUrl} rel="noreferrer noopener" target="_blank"><img alt={`Bukti pembayaran ${order.orderNumber}`} className="rm-admin-purchase-detail__proof" src={proofUrl} /></a> : <p className="rm-admin-purchases__state">Belum ada bukti pembayaran.</p>}
            </section>
            {order.paymentStatus === 'paid' ? (
              <section className="rm-admin-panel rm-admin-purchase-detail__status-form">
                <p className="rm-admin-meta">D / PROGRES PESANAN</p><h2>PERBARUI PENGERJAAN</h2>
                <label>Status pengerjaan
                  <select onChange={(event) => setNextStatus(event.target.value)} value={nextStatus}>
                    {shippingStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <button disabled={saving || nextStatus === order.orderStatus} onClick={() => void performAction(`/api/purchases/admin/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) }, 'Status pengerjaan berhasil disimpan.')} type="button">Simpan status pengerjaan</button>
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </AdminLayout>
  );
}

export default function AdminPurchasesPage({ route }) {
  return route.mode === 'detail' ? <PurchaseDetail id={route.id} /> : <PurchaseList />;
}
