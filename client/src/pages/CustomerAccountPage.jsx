import { useEffect, useMemo, useState } from 'react';
import Link from '../components/ui/Link';
import { customerRequest, useCustomerSession, establishCustomerSession } from '../lib/customerAuth';
import { formatRupiah, getCatalogProductImage } from '../lib/products';
import { usePageTitle } from '../lib/usePageTitle';
import './CustomerAccountPage.css';

const STATUS_LABELS = {
  pending_approval: 'Menunggu persetujuan admin',
  waiting_shipping_quote: 'Menunggu konfirmasi ongkir',
  pending_payment: 'Menunggu pembayaran',
  waiting_verification: 'Menunggu verifikasi pembayaran',
  payment_rejected: 'Pembayaran ditolak',
  rejected: 'Pesanan tidak disetujui',
  paid: 'Pembayaran dikonfirmasi',
  processing: 'Sedang diproses',
  ready: 'Siap diambil / dikirim',
  completed: 'Selesai',
  expired: 'Kedaluwarsa',
  cancelled: 'Dibatalkan',
};
const PAYMENT_LABELS = {
  pending_payment: 'Menunggu pembayaran',
  waiting_verification: 'Menunggu verifikasi',
  paid: 'Terkonfirmasi',
  rejected: 'Ditolak',
  expired: 'Kedaluwarsa',
};
const WORK_LABELS = {
  awaiting_payment: 'Menunggu pembayaran',
  awaiting_shipping_quote: 'Menunggu konfirmasi ongkir',
  processing: 'Sedang diproses',
  ready_for_pickup: 'Siap diambil',
  ready_to_ship: 'Siap dikirim',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

function formattedDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusFor(order) {
  if (order.approvalStatus === 'pending_approval') {
    return order.orderStatus === 'awaiting_shipping_quote' ? 'waiting_shipping_quote' : 'pending_approval';
  }
  if (order.approvalStatus === 'rejected') return 'rejected';
  if (order.orderStatus === 'cancelled') return 'cancelled';
  if (order.paymentStatus === 'expired') return 'expired';
  if (order.paymentStatus === 'waiting_verification') return 'waiting_verification';
  if (order.paymentStatus === 'rejected') return 'payment_rejected';
  if (order.paymentStatus === 'paid') {
    if (order.orderStatus === 'processing') return 'processing';
    if (['ready_for_pickup', 'ready_to_ship'].includes(order.orderStatus)) return 'ready';
    if (order.orderStatus === 'completed') return 'completed';
  }
  return 'pending_payment';
}

function parseSpecifications(value) {
  try {
    const specifications = JSON.parse(value || '[]');
    return Array.isArray(specifications) ? specifications : [];
  } catch (error) {
    console.error('Snapshot spesifikasi pesanan tidak valid:', error);
    return [];
  }
}

function AccountNavigation({ selected }) {
  return (
    <nav aria-label="Navigasi akun" className="rm-account__nav">
      <Link aria-current={selected === 'profile' ? 'page' : undefined} to="/akun">Profil</Link>
      <Link aria-current={selected === 'orders' || selected === 'detail' ? 'page' : undefined} to="/akun/pesanan">Pesanan Saya</Link>
    </nav>
  );
}

function AccountGate() {
  return (
    <section className="rm-account__panel">
      <h1>Login untuk melanjutkan</h1>
      <p>Informasi akun dan riwayat pembelian hanya tersedia untuk pemilik akun.</p>
      <div className="rm-account__actions">
        <Link className="rm-button rm-button--primary" to="/login">Login Pelanggan</Link>
        <Link className="rm-account__text-link" to="/register">Buat akun</Link>
      </div>
    </section>
  );
}

function ProfilePage({ user }) {
  const [values, setValues] = useState({
    fullName: user.fullName || '',
    email: user.email || '',
    phone: user.phone || '',
  });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const result = await customerRequest('/api/customers/me', {
      method: 'PATCH',
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message || 'Profil belum dapat diperbarui.');
      return;
    }
    establishCustomerSession(result.data);
    setEditing(false);
    setNotice('Profil berhasil diperbarui.');
  };

  return (
    <section className="rm-account__panel">
      <div className="rm-account__panel-heading">
        <div><p className="rm-meta">INFORMASI PELANGGAN</p><h2>Profil saya</h2></div>
        {!editing ? <button className="rm-account__secondary" onClick={() => setEditing(true)} type="button">Edit profil</button> : null}
      </div>
      {editing ? (
        <form className="rm-account__form" onSubmit={save}>
          <label><span>Nama lengkap</span><input autoComplete="name" maxLength={120} onChange={(event) => setValues((current) => ({ ...current, fullName: event.target.value }))} required value={values.fullName} /></label>
          <label><span>Email</span><input autoComplete="email" maxLength={254} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} required type="email" value={values.email} /></label>
          <label><span>Nomor WhatsApp</span><input autoComplete="tel" maxLength={24} onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))} required type="tel" value={values.phone} /></label>
          {error ? <p className="rm-account__error" role="alert">{error}</p> : null}
          <div className="rm-account__actions">
            <button className="rm-button rm-button--primary" disabled={saving} type="submit">{saving ? 'Menyimpan...' : 'Simpan profil'}</button>
            <button className="rm-account__secondary" onClick={() => {
              setValues({ fullName: user.fullName || '', email: user.email || '', phone: user.phone || '' });
              setEditing(false);
              setError('');
            }} type="button">Batal</button>
          </div>
        </form>
      ) : (
        <dl className="rm-account__fields">
          <div><dt>Nama lengkap</dt><dd>{user.fullName}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Nomor WhatsApp</dt><dd>{user.phone}</dd></div>
          <div><dt>Bergabung</dt><dd>{formattedDate(user.createdAt)}</dd></div>
        </dl>
      )}
      {notice ? <p className="rm-account__notice" role="status">{notice}</p> : null}
    </section>
  );
}

function AccountHome({ user }) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    customerRequest('/api/customers/orders?page=1&pageSize=5')
      .then((result) => {
        if (!active) return;
        if (!result.ok) setError(result.message || 'Riwayat pesanan belum dapat dimuat.');
        else setOrders(result.data.data || []);
      });
    return () => { active = false; };
  }, []);

  return (
    <>
      <header className="rm-account__welcome"><p className="rm-eyebrow">RUANG PELANGGAN</p><h1>Halo, {user.fullName}</h1><p>Kelola informasi akun dan pantau pembelian Anda.</p></header>
      <AccountNavigation selected="profile" />
      <ProfilePage user={user} />
      <section className="rm-account__panel">
        <div className="rm-account__panel-heading"><div><p className="rm-meta">RIWAYAT PEMBELIAN</p><h2>Pesanan terbaru</h2></div><Link className="rm-account__text-link" to="/akun/pesanan">Semua pesanan</Link></div>
        {error ? <p className="rm-account__error" role="alert">{error}</p> : orders.length ? (
          <ul className="rm-account__recent">
            {orders.map((order) => <li key={order.id}><Link to={`/akun/pesanan/${encodeURIComponent(order.id)}`}><span>{order.orderNumber} · {order.buildName}</span><strong>{STATUS_LABELS[order.status] || order.status}</strong></Link></li>)}
          </ul>
        ) : <p className="rm-account__muted">Belum ada riwayat pembelian yang tertaut ke akun ini.</p>}
      </section>
    </>
  );
}

function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0 });
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('desc');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ page: String(pagination.page), pageSize: '10', sort });
    if (status) query.set('status', status);
    customerRequest(`/api/customers/orders?${query}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.message || 'Daftar pesanan belum dapat dimuat.');
          return;
        }
        setOrders(result.data.data || []);
        setPagination(result.data.pagination);
        setError('');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pagination.page, sort, status]);

  const updateFilter = (setter, value) => {
    setter(value);
    setPagination((current) => ({ ...current, page: 1 }));
  };

  return (
    <>
      <header className="rm-account__welcome"><p className="rm-eyebrow">RUANG PELANGGAN</p><h1>PESANAN SAYA</h1><p>Riwayat dan status pembelian yang terhubung ke akun Anda.</p></header>
      <AccountNavigation selected="orders" />
      <section className="rm-account__panel">
        <div className="rm-account__filters">
          <label>Status
            <select onChange={(event) => updateFilter(setStatus, event.target.value)} value={status}>
              <option value="">Semua status</option>
              <option value="pending_approval">Menunggu persetujuan</option>
              <option value="waiting_shipping_quote">Menunggu konfirmasi ongkir</option>
              <option value="pending_payment">Menunggu pembayaran</option>
              <option value="waiting_verification">Menunggu verifikasi</option>
              <option value="payment_rejected">Pembayaran ditolak</option>
              <option value="paid">Pembayaran dikonfirmasi</option>
              <option value="processing">Sedang diproses</option>
              <option value="ready">Siap diambil / dikirim</option>
              <option value="completed">Selesai</option>
              <option value="rejected">Pesanan tidak disetujui</option>
              <option value="expired">Kedaluwarsa</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </label>
          <label>Urutkan tanggal
            <select onChange={(event) => updateFilter(setSort, event.target.value)} value={sort}>
              <option value="desc">Terbaru</option><option value="asc">Terlama</option>
            </select>
          </label>
        </div>
        {error ? <p className="rm-account__error" role="alert">{error}</p> : null}
        {loading ? <p className="rm-account__muted">Memuat pesanan...</p> : orders.length ? (
          <div className="rm-account__table-wrap">
            <table className="rm-account__table">
              <thead><tr><th>Pesanan</th><th>Build</th><th>Basis</th><th>Harga</th><th>Tanggal</th><th>Metode</th><th>Status pembayaran</th><th>Status pengerjaan</th><th>Aksi</th></tr></thead>
              <tbody>{orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.orderNumber}</td>
                  <td><span className="rm-account__build"><img alt="" src={getCatalogProductImage({ image: order.imageSnapshot, name: order.productName })} />{order.buildName}</span></td>
                  <td>{order.basis || '—'}</td>
                  <td>{formatRupiah(order.totalAmount)}</td>
                  <td>{formattedDate(order.createdAt)}</td>
                  <td>{order.paymentMethod === 'gopay' ? 'GoPay' : 'SeaBank'}</td>
                  <td>{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}</td>
                  <td>{WORK_LABELS[order.orderStatus] || order.orderStatus}</td>
                  <td><Link to={`/akun/pesanan/${encodeURIComponent(order.id)}`}>Lihat detail</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="rm-account__muted">Belum ada pesanan untuk filter ini.</p>}
        <div className="rm-account__pagination">
          <button className="rm-account__secondary" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} type="button">Sebelumnya</button>
          <span>Halaman {pagination.page} dari {pagination.totalPages || 1}</span>
          <button className="rm-account__secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} type="button">Berikutnya</button>
        </div>
      </section>
    </>
  );
}

function OrderDetailPage({ orderId }) {
  const [order, setOrder] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const detailStatus = statusFor(order || {});
  const specifications = useMemo(() => parseSpecifications(order?.specifications), [order?.specifications]);

  usePageTitle(order?.orderNumber ? `${order.orderNumber} — Pesanan Saya` : 'Detail Pesanan — RUKA Motorworks');

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(`${label} berhasil disalin.`);
    } catch {
      setCopied(`Tidak dapat menyalin ${label.toLowerCase()} pada perangkat ini.`);
    }
  };

  useEffect(() => {
    let active = true;
    customerRequest(`/api/customers/orders/${encodeURIComponent(orderId)}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) setError(result.message || 'Detail pesanan belum dapat dimuat.');
        else setOrder(result.data);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId]);

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    Promise.all((order?.paymentProofHistory || []).map(async (proof) => {
      const response = await fetch(`/api/customers/orders/${encodeURIComponent(order.id)}/proofs/${encodeURIComponent(proof.id)}`, { credentials: 'same-origin' });
      if (!response.ok) return null;
      const url = URL.createObjectURL(await response.blob());
      objectUrls.push(url);
      return { ...proof, url };
    }))
      .then((loaded) => { if (active) setProofs(loaded.filter(Boolean)); })
      .catch((requestError) => {
        console.error('Gagal memuat bukti pembayaran pelanggan:', requestError);
        if (active) setError('Bukti pembayaran belum dapat dimuat.');
      });
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [order]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const canReplaceProof = order
    && order.approvalStatus === 'approved'
    && order.orderStatus === 'awaiting_payment'
    && ['pending_payment', 'waiting_verification', 'rejected'].includes(order.paymentStatus);

  const selectProof = (event) => {
    const selected = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
    setError('');
    if (!selected) return;
    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setError('Bukti pembayaran hanya boleh berupa JPG atau PNG.');
      event.target.value = '';
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Ukuran bukti pembayaran maksimal 5 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const uploadProof = async (event) => {
    event.preventDefault();
    if (!file || !order || !canReplaceProof) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const body = new FormData();
      body.append('proof', file);
      const response = await fetch(`/api/purchases/${encodeURIComponent(order.id)}/payment-proof`, {
        method: 'POST',
        credentials: 'same-origin',
        body,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        setError(result?.message || 'Bukti pembayaran belum dapat dikirim.');
        return;
      }
      setOrder(result.data);
      setFile(null);
      setPreview('');
      setNotice('Bukti pembayaran diperbarui dan menunggu pemeriksaan admin.');
    } catch (requestError) {
      console.error('Gagal mengirim bukti pembayaran pelanggan:', requestError);
      setError('Tidak dapat terhubung ke server. Bukti pembayaran belum dikirim.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <p className="rm-account__muted">Memuat detail pesanan...</p>;
  if (!order) return <section className="rm-account__panel"><p className="rm-account__error" role="alert">{error || 'Pesanan tidak ditemukan.'}</p><Link to="/akun/pesanan">Kembali ke Pesanan Saya</Link></section>;

  return (
    <>
      <header className="rm-account__welcome"><p className="rm-eyebrow">PESANAN SAYA / DETAIL</p><h1>{order.orderNumber}</h1><p>{STATUS_LABELS[detailStatus] || detailStatus}</p></header>
      <AccountNavigation selected="detail" />
      {order.approvalRejectionReason ? (
        <section className="rm-account__panel rm-account__alert" role="alert">
          <p className="rm-meta">CATATAN PENOLAKAN</p>
          <p><strong>Alasan:</strong> {order.approvalRejectionReason}</p>
        </section>
      ) : null}
      {order.approvalStatus === 'pending_approval' ? (
        <section className="rm-account__panel">
          <p className="rm-meta">STATUS PROSES</p>
          <p className="rm-account__muted">{order.orderStatus === 'awaiting_shipping_quote' ? 'Ongkir belum ditentukan. Ruka akan mengonfirmasi biaya pengiriman sebelum pembayaran.' : 'Ruka akan meninjau ketersediaan build sebelum menampilkan instruksi pembayaran.'}</p>
        </section>
      ) : null}
      {order.paymentInstructions ? (
        <section className="rm-account__panel">
          <p className="rm-meta">TRANSFER MANUAL</p>
          <h2>Instruksi pembayaran</h2>
          <dl className="rm-account__fields">
            <div><dt>Metode</dt><dd>{order.paymentInstructions.label}</dd></div>
            <div><dt>Nomor tujuan</dt><dd>{order.paymentInstructions.recipientNumber}</dd></div>
            <div><dt>Nama penerima</dt><dd>{order.paymentInstructions.recipientName}</dd></div>
            <div><dt>Nominal transfer</dt><dd>{formatRupiah(order.paymentInstructions.amount)}</dd></div>
            <div><dt>Nomor pesanan</dt><dd>{order.paymentInstructions.orderNumber}</dd></div>
          </dl>
          <div className="rm-account__actions" style={{ marginTop: '16px' }}>
            <button className="rm-account__secondary" onClick={() => void copyText(order.paymentInstructions.recipientNumber, 'Nomor pembayaran')} type="button">Salin nomor rekening/tujuan</button>
            <button className="rm-account__secondary" onClick={() => void copyText(order.paymentInstructions.amount, 'Nominal pembayaran')} type="button">Salin nominal transfer</button>
          </div>
          {copied ? <p className="rm-account__notice" role="status">{copied}</p> : null}
          <p className="rm-account__muted" style={{ marginTop: '12px', fontSize: '0.875rem' }}>Transfer manual. Pembayaran dikonfirmasi setelah admin memeriksa dana masuk.</p>
        </section>
      ) : null}
      <div className="rm-account__detail-grid">
        <section className="rm-account__panel">
          <p className="rm-meta">DETAIL BUILD</p><h2>{order.buildName}</h2>
          <img alt={order.buildName} className="rm-account__hero-image" src={getCatalogProductImage({ image: order.imageSnapshot, name: order.productName })} />
          <dl className="rm-account__fields">
            <div><dt>Basis motor</dt><dd>{order.basis}</dd></div>
            <div><dt>Kategori</dt><dd>{order.categoryName}</dd></div>
            {specifications.map(({ label, value }, index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}
            <div><dt>Harga snapshot</dt><dd>{formatRupiah(order.price)}</dd></div>
            <div><dt>Pengambilan / pengiriman</dt><dd>{order.shippingMethod === 'pickup' ? 'Pengambilan langsung' : 'Pengiriman'}</dd></div>
            {order.deliveryAddress ? <div><dt>Alamat pengiriman</dt><dd>{order.deliveryAddress}</dd></div> : null}
            <div><dt>Ongkir</dt><dd>{order.shippingCost == null ? 'Belum dikonfirmasi' : formatRupiah(order.shippingCost)}</dd></div>
            <div><dt>Total pembayaran</dt><dd>{formatRupiah(order.totalAmount)}</dd></div>
            <div><dt>Metode pembayaran</dt><dd>{order.paymentMethod === 'gopay' ? 'GoPay' : 'SeaBank'}</dd></div>
            <div><dt>Status pembayaran</dt><dd>{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}</dd></div>
            <div><dt>Status pengerjaan</dt><dd>{WORK_LABELS[order.orderStatus] || order.orderStatus}</dd></div>
            <div><dt>Nama pemesan</dt><dd>{order.customerName}</dd></div>
            <div><dt>WhatsApp pemesan</dt><dd>{order.phone}</dd></div>
            {order.email ? <div><dt>Email pemesan</dt><dd>{order.email}</dd></div> : null}
            <div><dt>Kota</dt><dd>{order.city}</dd></div>
            <div><dt>Tanggal pesanan</dt><dd>{formattedDate(order.createdAt)}</dd></div>
          </dl>
        </section>
        <section className="rm-account__panel">
          <p className="rm-meta">RIWAYAT PESANAN</p><h2>Aktivitas tercatat</h2>
          {order.timeline?.length ? (
            <ol className="rm-account__timeline">
              {order.timeline.map((item) => <li key={item.id}><strong>{item.label}</strong><time>{formattedDate(item.createdAt)}</time>{item.details ? <p>{item.details}</p> : null}</li>)}
            </ol>
          ) : <p className="rm-account__muted">Belum ada perubahan status tambahan yang tercatat.</p>}
        </section>
        <section className="rm-account__panel rm-account__proof">
          <p className="rm-meta">BUKTI PEMBAYARAN</p><h2>Riwayat bukti transfer</h2>
          {proofs.length ? proofs.map((proof, index) => (
            <figure key={proof.id}>
              <img alt={`Bukti pembayaran ${index + 1}${proof.isCurrent ? ', terbaru' : ''}`} src={proof.url} />
              <figcaption>{proof.isCurrent ? 'Bukti terbaru' : `Bukti sebelumnya ${index + 1}`} · {formattedDate(proof.createdAt)}</figcaption>
            </figure>
          )) : <p className="rm-account__muted">Belum ada bukti pembayaran yang dikirim.</p>}
          {canReplaceProof ? (
            <form className="rm-account__form" onSubmit={uploadProof}>
              <label><span>{order.paymentStatus === 'pending_payment' ? 'Unggah bukti transfer' : 'Ganti / unggah ulang bukti'} (JPG/PNG, maks. 5 MB)</span><input accept="image/jpeg,image/png" onChange={selectProof} type="file" /></label>
              {preview ? <img alt="Pratinjau bukti pembayaran baru" className="rm-account__proof-preview" src={preview} /> : null}
              {error ? <p className="rm-account__error" role="alert">{error}</p> : null}
              <button className="rm-button rm-button--primary" disabled={!file || uploading} type="submit">{uploading ? 'Mengirim...' : order.paymentStatus === 'pending_payment' ? 'Kirim bukti' : 'Perbarui bukti'}</button>
            </form>
          ) : order.paymentStatus === 'paid' ? <p className="rm-account__muted">Pembayaran telah dikonfirmasi; bukti transfer terkunci dan tidak dapat diganti.</p> : null}
          {notice ? <p className="rm-account__notice" role="status">{notice}</p> : null}
          {error && canReplaceProof ? <p className="rm-account__error" role="alert">{error}</p> : null}
        </section>
      </div>
    </>
  );
}

export default function CustomerAccountPage({ route }) {
  const { status, user } = useCustomerSession();
  const mode = route.mode || 'profile';
  usePageTitle(mode === 'orders' ? 'Pesanan Saya — RUKA Motorworks' : 'Akun Saya — RUKA Motorworks');

  return (
    <main className="rm-account rm-container" id="main-content" tabIndex={-1}>
      {status === 'unknown' || status === 'checking' ? <p className="rm-account__muted">Memeriksa sesi akun...</p> : null}
      {status === 'unavailable' ? <section className="rm-account__panel"><p role="alert">Akun pelanggan belum dapat diverifikasi. Periksa koneksi lalu muat ulang halaman.</p></section> : null}
      {status === 'unauthenticated' ? <AccountGate /> : null}
      {status === 'authenticated' && mode === 'profile' ? <AccountHome user={user} /> : null}
      {status === 'authenticated' && mode === 'orders' ? <OrdersPage /> : null}
      {status === 'authenticated' && mode === 'detail' ? <OrderDetailPage orderId={route.id} /> : null}
    </main>
  );
}
