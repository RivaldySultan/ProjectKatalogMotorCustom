import { useEffect, useRef, useState } from 'react';
import Icon from '../components/ui/Icon';
import Link from '../components/ui/Link';
import {
  formatRupiah,
  getCatalogProductImage,
  getProductBasis,
  getProductBuildName,
} from '../lib/products';
import { getWhatsAppLink } from '../lib/whatsapp';
import { navigate } from '../lib/router';
import { usePageTitle } from '../lib/usePageTitle';
import { customerRequest } from '../lib/customerAuth';
import './CheckoutPage.css';

const EMPTY_CUSTOMER = {
  customerName: '',
  phone: '',
  email: '',
  city: '',
  shippingMethod: 'pickup',
  deliveryAddress: '',
  paymentMethod: '',
};

function createSecret(byteLength) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getLocalOrderKey(id) {
  return `ruka_purchase_access_${id}`;
}

function getFixedSpecifications(product, order) {
  if (order?.specifications) {
    try {
      return JSON.parse(order.specifications).map(({ label, value }) => [label, value]);
    } catch (snapshotError) {
      console.error('Snapshot spesifikasi pesanan tidak valid:', snapshotError);
      return [];
    }
  }
  return String(product?.fixedSpecifications || '')
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.indexOf(':');
      return separator > 0
        ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
        : null;
    })
    .filter(Boolean);
}

function paymentLabel(method) {
  return method === 'gopay' ? 'GoPay' : method === 'seabank' ? 'SeaBank' : '—';
}

export default function CheckoutPage({ productId, products, isLoading }) {
  const product = products.find((item) => String(item.id) === String(productId));
  const [values, setValues] = useState(EMPTY_CUSTOMER);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [order, setOrder] = useState(null);
  const [proof, setProof] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoadingMethods, setIsLoadingMethods] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [copied, setCopied] = useState('');
  const idempotencyKey = useRef(window.crypto.randomUUID());
  const accessToken = useRef(createSecret(32));

  usePageTitle(order?.orderNumber ? `${order.orderNumber} — RUKA Motorworks` : 'Checkout — RUKA Motorworks');

  useEffect(() => {
    let active = true;
    customerRequest('/api/customers/me').then((result) => {
      if (!active || !result.ok) return;
      setValues((previous) => ({
        ...previous,
        customerName: previous.customerName || result.data.fullName || '',
        phone: previous.phone || result.data.phone || '',
        email: previous.email || result.data.email || '',
      }));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/purchases/payment-methods')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) {
          throw new Error(result.message || 'Metode pembayaran belum dapat dimuat.');
        }
        if (active) {
          setPaymentMethods(result.data);
          setValues((previous) => ({
            ...previous,
            paymentMethod: previous.paymentMethod || result.data[0]?.method || '',
          }));
        }
      })
      .catch((requestError) => {
        console.error('Gagal memuat metode pembayaran:', requestError);
        if (active) setError(requestError.message || 'Metode pembayaran belum dapat dimuat.');
      })
      .finally(() => {
        if (active) setIsLoadingMethods(false);
      });

    const savedOrder = sessionStorage.getItem(getLocalOrderKey(productId));
    if (savedOrder) {
      try {
        const { orderId, token } = JSON.parse(savedOrder);
        if (!orderId || !token) throw new Error('Informasi akses pesanan tidak valid.');
        fetch(`/api/purchases/${encodeURIComponent(orderId)}`, {
          headers: { 'X-Order-Access-Token': token },
        })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'Pesanan tidak ditemukan.');
          if (active) {
            accessToken.current = token;
            setOrder(result.data);
          }
        })
        .catch((requestError) => {
          console.error('Gagal memuat pesanan:', requestError);
          if (active) {
            sessionStorage.removeItem(getLocalOrderKey(productId));
            setError('Pesanan tersimpan belum dapat dimuat. Periksa kembali tautan dan sesi browser Anda.');
          }
        });
      } catch (storageError) {
        console.error('Informasi akses pesanan tidak valid:', storageError);
        sessionStorage.removeItem(getLocalOrderKey(productId));
      }
    }

    return () => {
      active = false;
    };
  }, [productId]);

  useEffect(() => () => {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
  }, [proofPreview]);

  const fixedSpecifications = getFixedSpecifications(product, order);

  const setField = (field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
  };

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!product || product.canPurchase !== 1) {
      setError('Build ini tidak tersedia untuk pembelian langsung.');
      return;
    }
    if (!paymentMethods.some(({ method }) => method === values.paymentMethod)) {
      setError('Belum ada metode transfer yang dikonfigurasi. Pesanan belum dibuat.');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...values,
          productId: product.id,
          idempotencyKey: idempotencyKey.current,
          accessToken: accessToken.current,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Pesanan belum dapat dibuat.');
      sessionStorage.setItem(
        getLocalOrderKey(productId),
        JSON.stringify({ orderId: result.data.id, token: result.data.accessToken }),
      );
      navigate(`/pesanan/${encodeURIComponent(result.data.id)}#${result.data.accessToken}`);
    } catch (requestError) {
      console.error('Gagal membuat pesanan pembelian:', requestError);
      setError(requestError.message || 'Pesanan belum dapat dibuat. Data formulir tetap tersimpan.');
    } finally {
      setIsCreating(false);
    }
  };

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

  const handleProofUpload = async (event) => {
    event.preventDefault();
    if (!proof || !order) return;
    setIsUploading(true);
    setError('');
    setNotice('');
    try {
      const body = new FormData();
      body.append('proof', proof);
      const response = await fetch(`/api/purchases/${encodeURIComponent(order.id)}/payment-proof`, {
        method: 'POST',
        headers: { 'X-Order-Access-Token': accessToken.current },
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
      setIsUploading(false);
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

  const refreshOrder = async () => {
    try {
      const response = await fetch(`/api/purchases/${encodeURIComponent(order.id)}`, {
        headers: { 'X-Order-Access-Token': accessToken.current },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setError(result.message || 'Status pesanan belum dapat diperbarui.');
        return;
      }
      setOrder(result.data);
      setError('');
    } catch (requestError) {
      console.error('Gagal memperbarui status pesanan:', requestError);
      setError('Status pesanan belum dapat diperbarui. Periksa koneksi lalu coba lagi.');
    }
  };

  const startNewOrder = () => {
    sessionStorage.removeItem(getLocalOrderKey(productId));
    idempotencyKey.current = window.crypto.randomUUID();
    accessToken.current = createSecret(32);
    setOrder(null);
    setValues(EMPTY_CUSTOMER);
    setProof(null);
    setProofPreview('');
    setNotice('');
    setError('');
  };

  if (isLoading) {
    return <main className="rm-checkout rm-container"><p>Memuat build...</p></main>;
  }
  if (!product) {
    return (
      <main className="rm-checkout rm-container">
        <h1>Build tidak ditemukan</h1>
        <Link to="/katalog">Kembali ke katalog</Link>
      </main>
    );
  }
  if (!order && product.canPurchase !== 1) {
    return (
      <main className="rm-checkout rm-container" id="main-content" tabIndex={-1}>
        <p className="rm-eyebrow">PEMBELIAN LANGSUNG BELUM TERSEDIA</p>
        <h1>Build ini belum dapat dipesan.</h1>
        <p className="rm-checkout__note">Hubungi kami melalui konsultasi untuk membahas build ini.</p>
        <Link className="rm-button rm-button--primary" to={`/motor/${encodeURIComponent(product.id)}#consultation-form`}>
          Konsultasi Dulu
        </Link>
      </main>
    );
  }

  const orderWhatsapp = order ? getWhatsAppLink([
    `Halo Ruka Motorworks, saya ingin menanyakan pesanan ${order.orderNumber}.`,
    `Nama: ${order.customerName}`,
    `Build: ${order.buildName}`,
    `Harga: ${formatRupiah(order.totalAmount)}`,
    `Metode pembayaran: ${paymentLabel(order.paymentMethod)}`,
    `Status pembayaran: ${order.paymentStatus}`,
  ].join('\n')) : '';

  return (
    <main className="rm-checkout rm-container" id="main-content" tabIndex={-1}>
      <nav aria-label="Jejak navigasi" className="rm-checkout__breadcrumb">
        <Link to={`/motor/${encodeURIComponent(product.id)}`}>Detail motor</Link>
        <span aria-hidden="true">/</span>
        <span>{order ? 'Pesanan' : 'Checkout'}</span>
      </nav>
      <header className="rm-checkout__heading">
        <p className="rm-eyebrow">RUANG ORDER / PEMBELIAN LANGSUNG</p>
        <h1>{order ? order.orderNumber : 'CHECKOUT'}</h1>
        <p>{order ? 'Pesanan tercatat terpisah dari permintaan konsultasi custom.' : 'Pesan build dengan spesifikasi katalog yang sudah ditetapkan.'}</p>
      </header>

      {error ? <p className="rm-checkout__message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="rm-checkout__message" role="status">{notice}</p> : null}

      <div className="rm-checkout__layout">
        <section aria-labelledby="rm-checkout-summary-title" className="rm-checkout__panel">
          <p className="rm-meta">RINGKASAN BUILD</p>
          <h2 id="rm-checkout-summary-title">{order?.buildName || getProductBuildName(product) || product.name}</h2>
          <img
            alt={product.imageAlt || product.name}
            className="rm-checkout__image"
            src={getCatalogProductImage(order?.imageSnapshot ? { ...product, image: order.imageSnapshot } : product)}
          />
          <dl className="rm-checkout__fields">
            <div><dt>Basis motor</dt><dd>{order?.basis || getProductBasis(product) || '—'}</dd></div>
            <div><dt>Kategori</dt><dd>{order?.categoryName || product.categoryName || '—'}</dd></div>
            {fixedSpecifications.map(([label, value], index) => (
              <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
            <div><dt>Harga build</dt><dd>{formatRupiah(order?.price ?? product.price)}</dd></div>
            {order ? (
              <div>
                <dt>{order.shippingMethod === 'delivery' && order.shippingCost == null ? 'Harga build (belum termasuk ongkir)' : 'Total pembayaran'}</dt>
                <dd>{formatRupiah(order.totalAmount)}</dd>
              </div>
            ) : null}
          </dl>
          {order?.shippingMethod === 'delivery' && order.orderStatus === 'awaiting_shipping_quote' ? (
            <p className="rm-checkout__note">Biaya pengiriman belum ditentukan. Ruka akan mengonfirmasi ongkir sebelum instruksi pembayaran tersedia.</p>
          ) : null}
          {!order && product.purchaseType === 'made_to_order' && product.estimatedBuildDays ? (
            <p className="rm-checkout__note">Estimasi pengerjaan: {product.estimatedBuildDays} hari.</p>
          ) : null}
        </section>

        {!order ? (
          <form className="rm-checkout__panel rm-checkout__form" onSubmit={handleCreateOrder}>
            <fieldset>
              <legend>INFORMASI PELANGGAN</legend>
              <label><span>Nama lengkap</span><input autoComplete="name" maxLength={120} onChange={(event) => setField('customerName', event.target.value)} required value={values.customerName} /></label>
              <label><span>Nomor WhatsApp</span><input autoComplete="tel" maxLength={24} onChange={(event) => setField('phone', event.target.value)} required type="tel" value={values.phone} /></label>
              <label><span>Email <small>Opsional</small></span><input autoComplete="email" maxLength={254} onChange={(event) => setField('email', event.target.value)} type="email" value={values.email} /></label>
              <label><span>Kota</span><input autoComplete="address-level2" maxLength={120} onChange={(event) => setField('city', event.target.value)} required value={values.city} /></label>
            </fieldset>
            <fieldset>
              <legend>PENGAMBILAN / PENGIRIMAN</legend>
              <label><span>Metode</span>
                <select onChange={(event) => setField('shippingMethod', event.target.value)} value={values.shippingMethod}>
                  <option value="pickup">Pengambilan langsung</option>
                  <option value="delivery">Pengiriman — ongkir dikonfirmasi kemudian</option>
                </select>
              </label>
              {values.shippingMethod === 'delivery' ? (
                <label><span>Alamat pengiriman</span><textarea maxLength={1000} onChange={(event) => setField('deliveryAddress', event.target.value)} required rows={3} value={values.deliveryAddress} /></label>
              ) : null}
            </fieldset>
            <fieldset>
              <legend>TRANSFER MANUAL</legend>
              {isLoadingMethods ? <p>Memeriksa metode pembayaran...</p> : paymentMethods.length ? (
                <label><span>Metode pembayaran</span>
                  <select onChange={(event) => setField('paymentMethod', event.target.value)} required value={values.paymentMethod}>
                    {paymentMethods.map((method) => <option key={method.method} value={method.method}>{method.label}</option>)}
                  </select>
                </label>
              ) : <p className="rm-checkout__note">GoPay/SeaBank belum dikonfigurasi oleh server. Checkout tidak akan membuat pesanan hingga tujuan transfer tersedia.</p>}
            </fieldset>
            <p className="rm-checkout__note">Harga produk diambil dan divalidasi dari server. Tidak ada perubahan custom pada jalur pembelian.</p>
            <button className="rm-button rm-button--primary" disabled={isCreating || isLoadingMethods || !paymentMethods.length} type="submit">
              {isCreating ? 'Membuat pesanan...' : 'Buat Pesanan'}
              <Icon name="arrow-up-right" size={18} />
            </button>
          </form>
        ) : (
          <section aria-labelledby="rm-payment-title" className="rm-checkout__panel">
            <p className="rm-meta">PEMBAYARAN / {order.paymentStatus}</p>
            <h2 id="rm-payment-title">Instruksi pembayaran</h2>
            {order.paymentInstructions ? (
              <>
                <dl className="rm-checkout__fields rm-checkout__payment">
                  <div><dt>Metode</dt><dd>{order.paymentInstructions.label}</dd></div>
                  <div><dt>Nomor tujuan</dt><dd>{order.paymentInstructions.recipientNumber}</dd></div>
                  <div><dt>Nama penerima</dt><dd>{order.paymentInstructions.recipientName}</dd></div>
                  <div><dt>Nominal transfer</dt><dd>{formatRupiah(order.paymentInstructions.amount)}</dd></div>
                  <div><dt>Nomor pesanan</dt><dd>{order.orderNumber}</dd></div>
                  <div><dt>Batas pembayaran</dt><dd>{order.paymentInstructions.deadline || 'Tidak ditentukan'}</dd></div>
                </dl>
                <div className="rm-checkout__copy">
                  <button onClick={() => copyText(order.paymentInstructions.recipientNumber, 'Nomor pembayaran')} type="button">Salin nomor pembayaran</button>
                  <button onClick={() => copyText(order.paymentInstructions.amount, 'Nominal')} type="button">Salin nominal</button>
                </div>
                {copied ? <p aria-live="polite" className="rm-checkout__note">{copied}</p> : null}
              </>
            ) : (
              <p className="rm-checkout__note">
                {order.shippingMethod === 'delivery' && order.orderStatus === 'awaiting_shipping_quote'
                  ? 'Menunggu admin mengonfirmasi biaya pengiriman. Total final dan instruksi transfer akan muncul setelah konfirmasi.'
                  : 'Instruksi metode pembayaran belum tersedia. Hubungi Ruka untuk memastikan konfigurasi transfer.'}
              </p>
            )}
            {order.paymentStatus === 'pending_payment' || order.paymentStatus === 'rejected' ? (
              <form className="rm-checkout__proof" onSubmit={handleProofUpload}>
                <label>
                  <span>Unggah bukti transfer (JPG/PNG, maksimal 5 MB)</span>
                  <input accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={handleProofChange} type="file" />
                </label>
                {proofPreview ? <img alt="Pratinjau bukti transfer" src={proofPreview} /> : null}
                <button className="rm-button rm-button--primary" disabled={!proof || !order.paymentInstructions || isUploading} type="submit">
                  {isUploading ? 'Mengirim...' : 'Kirim Bukti Pembayaran'}
                </button>
              </form>
            ) : (
              <p className="rm-checkout__note">
                {order.paymentStatus === 'waiting_verification'
                  ? 'Bukti pembayaran sedang diperiksa admin. Unggahan bukti tidak otomatis menandai pembayaran lunas.'
                  : order.paymentStatus === 'paid'
                    ? 'Pembayaran telah dikonfirmasi admin.'
                    : `Status pembayaran: ${order.paymentStatus}.`}
              </p>
            )}
            <button className="rm-checkout__refresh" onClick={refreshOrder} type="button">Perbarui status pesanan</button>
            <a className="rm-button rm-button--outline" href={orderWhatsapp} rel="noopener noreferrer" target="_blank">
              Hubungi Ruka melalui WhatsApp
              <Icon name="arrow-up-right" size={18} />
            </a>
            <button className="rm-checkout__refresh" onClick={startNewOrder} type="button">Buat pesanan baru untuk build ini</button>
          </section>
        )}
      </div>
    </main>
  );
}
