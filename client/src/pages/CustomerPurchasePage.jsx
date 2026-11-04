import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from '../components/ui/Link';
import { formatRupiah, getCatalogProductImage } from '../lib/products';
import { getWhatsAppLink } from '../lib/whatsapp';
import { usePageTitle } from '../lib/usePageTitle';
import { customerRequest, useCustomerSession } from '../lib/customerAuth';
import { navigate } from '../lib/router';
import './CustomerPurchasePage.css';

const STATUS_LABELS = {
  pending_approval: 'Menunggu persetujuan Ruka',
  waiting_shipping_quote: 'Menunggu konfirmasi ongkir',
  pending_payment: 'Menunggu pembayaran',
  waiting_verification: 'Menunggu verifikasi pembayaran',
  payment_rejected: 'Bukti pembayaran ditolak',
  paid: 'Pembayaran terkonfirmasi',
  processing: 'Sedang dikerjakan',
  ready: 'Siap diambil / dikirim',
  completed: 'Pesanan selesai',
  rejected: 'Pesanan tidak disetujui',
};

function getStatus(order) {
  if (order.approvalStatus === 'pending_approval') {
    return order.orderStatus === 'awaiting_shipping_quote' ? 'waiting_shipping_quote' : 'pending_approval';
  }
  if (order.approvalStatus === 'rejected') return 'rejected';
  if (order.paymentStatus === 'waiting_verification') return 'waiting_verification';
  if (order.paymentStatus === 'rejected') return 'payment_rejected';
  if (order.paymentStatus === 'paid') {
    if (order.orderStatus === 'processing') return 'processing';
    if (['ready_for_pickup', 'ready_to_ship'].includes(order.orderStatus)) return 'ready';
    if (order.orderStatus === 'completed') return 'completed';
  }
  return 'pending_payment';
}

export default function CustomerPurchasePage({ orderId, accessToken }) {
  const hasValidAccessToken = /^[a-f0-9]{64}$/i.test(accessToken || '');
  const [order, setOrder] = useState(null);
  const [proof, setProof] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [currentProofUrl, setCurrentProofUrl] = useState('');
  const [loading, setLoading] = useState(hasValidAccessToken);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(hasValidAccessToken
    ? ''
    : 'Tautan akses pesanan tidak valid. Gunakan tautan status yang diberikan setelah membuat pesanan.');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const customerSession = useCustomerSession();
  const orderStatus = getStatus(order || {});
  const whatsappLink = useMemo(() => order && getWhatsAppLink([
    `Halo Ruka Motorworks, saya ingin menanyakan pesanan ${order.orderNumber}.`,
    `Nama: ${order.customerName}`,
    `Build: ${order.buildName}`,
    `Harga: ${formatRupiah(order.totalAmount)}`,
    `Metode pembayaran: ${order.paymentMethod === 'gopay' ? 'GoPay' : 'SeaBank'}`,
    `Status pesanan: ${STATUS_LABELS[orderStatus] || orderStatus}`,
    `Status pembayaran: ${order.paymentStatus}`,
  ].join('\n')), [order, orderStatus]);

  usePageTitle(order?.orderNumber ? `${order.orderNumber} — Status Pesanan RUKA` : 'Status Pesanan — RUKA Motorworks');

  const fetchOrder = useCallback(async () => {
    const response = await fetch(`/api/purchases/${encodeURIComponent(orderId)}`, {
      headers: { 'X-Order-Access-Token': accessToken },
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Status pesanan belum dapat dimuat.');
    return result.data;
  }, [accessToken, orderId]);

  useEffect(() => {
    if (!hasValidAccessToken) return undefined;
    let active = true;
    fetchOrder()
      .then((data) => {
        if (!active) return;
        setOrder(data);
        setError('');
      })
      .catch((requestError) => {
        console.error('Gagal memuat status pesanan:', requestError);
        if (active) setError(requestError.message || 'Status pesanan belum dapat dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchOrder, hasValidAccessToken]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      setOrder(await fetchOrder());
      setError('');
    } catch (requestError) {
      console.error('Gagal memuat status pesanan:', requestError);
      setError(requestError.message || 'Status pesanan belum dapat dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
  }, [proofPreview]);

  useEffect(() => {
    if (!order?.hasPaymentProof || !accessToken || !orderId) return undefined;
    let active = true;
    fetch(`/api/purchases/${encodeURIComponent(orderId)}/proof`, {
      headers: { 'X-Order-Access-Token': accessToken },
    })
      .then(async (response) => {
        if (!response.ok) return;
        const blob = await response.blob();
        if (active) {
          setCurrentProofUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      })
      .catch((proofError) => {
        console.error('Gagal memuat bukti pembayaran:', proofError);
      });
    return () => {
      active = false;
    };
  }, [order?.hasPaymentProof, order?.updatedAt, accessToken, orderId]);

  useEffect(() => () => {
    if (currentProofUrl) URL.revokeObjectURL(currentProofUrl);
  }, [currentProofUrl]);

  const handleProofChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setProof(null);
    setProofPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return '';
    });
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
    setProof(selected);
    setProofPreview(URL.createObjectURL(selected));
  };

  const uploadProof = async (event) => {
    event.preventDefault();
    if (!proof || !order || !accessToken) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const body = new FormData();
      body.append('proof', proof);
      const response = await fetch(`/api/purchases/${encodeURIComponent(order.id)}/payment-proof`, {
        method: 'POST',
        headers: { 'X-Order-Access-Token': accessToken },
        body,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Bukti pembayaran belum dapat dikirim.');
      setOrder(result.data);
      setProof(null);
      setProofPreview('');
      setNotice('Bukti pembayaran diterima dan menunggu pemeriksaan admin. Status belum menjadi lunas.');
    } catch (requestError) {
      console.error('Gagal mengirim bukti pembayaran:', requestError);
      setError(requestError.message || 'Bukti pembayaran belum dapat dikirim.');
    } finally {
      setUploading(false);
    }
  };

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(`${label} berhasil disalin.`);
    } catch (copyError) {
      console.error(`Gagal menyalin ${label.toLowerCase()}:`, copyError);
      setCopied(`Tidak dapat menyalin ${label.toLowerCase()} pada perangkat ini.`);
    }
  };

  const claimOrder = async () => {
    setClaiming(true);
    setClaimError('');
    const result = await customerRequest(`/api/customers/claims/${encodeURIComponent(order.id)}`, {
      method: 'POST',
      headers: { 'X-Order-Access-Token': accessToken },
    });
    setClaiming(false);
    if (!result.ok) {
      setClaimError(result.message || 'Pesanan belum dapat ditautkan ke akun.');
      return;
    }
    navigate(`/akun/pesanan/${encodeURIComponent(order.id)}`);
  };

  if (loading) {
    return <main className="rm-customer-order rm-container"><p>Memuat status pesanan...</p></main>;
  }

  return (
    <main className="rm-customer-order rm-container" id="main-content" tabIndex={-1}>
      <nav aria-label="Jejak navigasi" className="rm-customer-order__breadcrumb">
        <Link to="/katalog">Katalog</Link><span aria-hidden="true">/</span><span>Status pesanan</span>
      </nav>
      {error && !order ? <section className="rm-customer-order__panel"><h1>Status pesanan belum tersedia</h1><p role="alert">{error}</p><Link to="/katalog">Kembali ke katalog</Link></section> : null}
      {notice ? <p className="rm-customer-order__message" role="status">{notice}</p> : null}
      {order ? (
        <>
          <header className="rm-customer-order__heading">
            <p className="rm-eyebrow">RUANG ORDER / STATUS PESANAN</p>
            <h1>{order.orderNumber}</h1>
            <p>Pesanan pembelian langsung ini tersimpan terpisah dari konsultasi custom.</p>
            {customerSession.status === 'authenticated' ? (
              order.isClaimed ? (
                <div className="rm-customer-order__claim">
                  <p>Pesanan ini sudah terhubung ke akun Anda.</p>
                  <Link className="rm-customer-order__secondary" to={`/akun/pesanan/${encodeURIComponent(order.id)}`}>
                    Buka di Pesanan Saya
                  </Link>
                </div>
              ) : (
                <div className="rm-customer-order__claim">
                  <button className="rm-customer-order__secondary" disabled={claiming} onClick={() => void claimOrder()} type="button">
                    {claiming ? 'Menautkan...' : 'Tambahkan pesanan ini ke akun'}
                  </button>
                  <p>Penautan memerlukan email dan nomor WhatsApp yang cocok dengan data pesanan.</p>
                  {claimError ? <p role="alert">{claimError}</p> : null}
                </div>
              )
            ) : customerSession.status === 'unauthenticated' ? (
              <p className="rm-customer-order__claim">Punya akun? <a href={`/login?return=${encodeURIComponent(`${window.location.pathname}${window.location.hash}`)}`}>Login untuk menautkan pesanan</a>.</p>
            ) : null}
          </header>
          <section aria-label="Status pesanan" className="rm-customer-order__status">
            <p className="rm-meta">STATUS TERKINI</p>
            <h2>{STATUS_LABELS[orderStatus] || 'Status diperbarui'}</h2>
            {order.approvalRejectionReason ? <p>Alasan: {order.approvalRejectionReason}</p> : null}
            {orderStatus === 'pending_approval' ? <p>Ruka akan meninjau ketersediaan build sebelum menampilkan instruksi pembayaran.</p> : null}
            {orderStatus === 'waiting_shipping_quote' ? <p>Ongkir belum ditentukan. Ruka akan mengonfirmasi biaya pengiriman sebelum pembayaran.</p> : null}
            {orderStatus === 'waiting_verification' ? <p>Bukti transfer diterima; admin perlu memeriksa dana masuk. Unggah bukti tidak otomatis mengonfirmasi pembayaran.</p> : null}
            <button className="rm-customer-order__secondary" onClick={() => void loadOrder()} type="button">Perbarui status</button>
          </section>
          <div className="rm-customer-order__layout">
            <section className="rm-customer-order__panel">
              <p className="rm-meta">RINGKASAN BUILD</p>
              <h2>{order.buildName}</h2>
              <img alt={order.buildName} className="rm-customer-order__image" src={getCatalogProductImage({ image: order.imageSnapshot, name: order.productName })} />
              <dl className="rm-customer-order__fields">
                <div><dt>Basis motor</dt><dd>{order.basis}</dd></div>
                <div><dt>Kategori</dt><dd>{order.categoryName}</dd></div>
                {JSON.parse(order.specifications || '[]').map(({ label, value }, index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}
                <div><dt>Harga build</dt><dd>{formatRupiah(order.price)}</dd></div>
                <div><dt>Ongkir</dt><dd>{order.shippingCost == null ? 'Menunggu konfirmasi' : formatRupiah(order.shippingCost)}</dd></div>
                <div><dt>Total</dt><dd>{formatRupiah(order.totalAmount)}</dd></div>
                <div><dt>Nama pelanggan</dt><dd>{order.customerName}</dd></div>
                <div><dt>Nomor pesanan</dt><dd>{order.orderNumber}</dd></div>
              </dl>
            </section>
            <section className="rm-customer-order__panel">
              <p className="rm-meta">TRANSFER MANUAL</p>
              <h2>Instruksi pembayaran</h2>
              {order.paymentInstructions ? (
                <>
                  <dl className="rm-customer-order__fields">
                    <div><dt>Metode</dt><dd>{order.paymentInstructions.label}</dd></div>
                    <div><dt>Nomor tujuan</dt><dd>{order.paymentInstructions.recipientNumber}</dd></div>
                    <div><dt>Nama penerima</dt><dd>{order.paymentInstructions.recipientName}</dd></div>
                    <div><dt>Nominal</dt><dd>{formatRupiah(order.paymentInstructions.amount)}</dd></div>
                    <div><dt>Nomor pesanan</dt><dd>{order.paymentInstructions.orderNumber}</dd></div>
                    <div><dt>Batas pembayaran</dt><dd>{order.paymentInstructions.deadline || 'Tidak ditentukan'}</dd></div>
                  </dl>
                  <div className="rm-customer-order__actions">
                    <button className="rm-customer-order__secondary" onClick={() => void copyText(order.paymentInstructions.recipientNumber, 'Nomor pembayaran')} type="button">Salin nomor pembayaran</button>
                    <button className="rm-customer-order__secondary" onClick={() => void copyText(order.paymentInstructions.amount, 'Nominal pembayaran')} type="button">Salin nominal</button>
                  </div>
                  <p className="rm-customer-order__note">Transfer manual. Pembayaran dikonfirmasi setelah admin memeriksa dana masuk.</p>
                </>
              ) : <p className="rm-customer-order__note">Instruksi pembayaran akan tersedia setelah pesanan disetujui admin.</p>}
              {copied ? <p role="status">{copied}</p> : null}
              {order.hasPaymentProof ? (
                <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                  <p className="rm-meta">BUKTI TRANSFER TERKIRIM</p>
                  {currentProofUrl ? (
                    <img alt="Bukti transfer terkirim" className="rm-customer-order__proof-preview" src={currentProofUrl} />
                  ) : (
                    <p className="rm-customer-order__note">Bukti pembayaran tersimpan dan sedang diverifikasi admin.</p>
                  )}
                </div>
              ) : null}
              {order.approvalStatus === 'approved' && ['pending_payment', 'waiting_verification', 'rejected'].includes(order.paymentStatus) ? (
                <form className="rm-customer-order__upload" onSubmit={uploadProof}>
                  <label htmlFor="rm-customer-order-proof">
                    {order.hasPaymentProof ? 'Ganti / unggah ulang bukti transfer (JPG/PNG, maks. 5 MB)' : 'Unggah bukti transfer (JPG/PNG, maks. 5 MB)'}
                  </label>
                  <input accept="image/jpeg,image/png" id="rm-customer-order-proof" onChange={handleProofChange} type="file" />
                  {proofPreview ? <img alt="Pratinjau bukti transfer baru" className="rm-customer-order__proof-preview" src={proofPreview} /> : null}
                  {error ? <p role="alert">{error}</p> : null}
                  <button className="rm-customer-order__primary" disabled={!proof || uploading} type="submit">
                    {uploading ? 'Mengirim...' : order.hasPaymentProof ? 'Perbarui bukti pembayaran' : 'Kirim bukti pembayaran'}
                  </button>
                </form>
              ) : order.paymentStatus === 'paid' ? (
                <p className="rm-customer-order__note" style={{ color: 'var(--rm-accent)' }}>Pembayaran telah dikonfirmasi oleh admin. Bukti transfer terkunci.</p>
              ) : null}
            </section>
          </div>
          {error && order ? <p className="rm-customer-order__message is-error" role="alert">{error}</p> : null}
          <a className="rm-customer-order__whatsapp" href={whatsappLink} rel="noopener noreferrer" target="_blank">Hubungi Ruka melalui WhatsApp</a>
        </>
      ) : null}
    </main>
  );
}
