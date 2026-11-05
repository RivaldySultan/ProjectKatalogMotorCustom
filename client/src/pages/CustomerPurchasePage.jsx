import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from '../components/ui/Link';
import { formatRupiah, getCatalogProductImage } from '../lib/products';
import { getWhatsAppLink } from '../lib/whatsapp';
import { usePageTitle } from '../lib/usePageTitle';
import { customerRequest, useCustomerSession } from '../lib/customerAuth';
import { navigate } from '../lib/router';
import './CustomerPurchasePage.css';

const STATUS_LABELS = {
  pending_approval: 'Awaiting Ruka approval',
  waiting_shipping_quote: 'Awaiting shipping quote',
  pending_payment: 'Awaiting payment',
  waiting_verification: 'Awaiting payment verification',
  payment_rejected: 'Payment proof rejected',
  paid: 'Payment confirmed',
  processing: 'In progress',
  ready: 'Ready for pickup / shipping',
  completed: 'Order completed',
  rejected: 'Order not approved',
  cancelled: 'Order cancelled',
};

function getStatus(order) {
  if (order.cancelledByAdmin) return 'cancelled';
  if (order.approvalStatus === 'rejected') return 'rejected';
  if (order.orderStatus === 'cancelled') return 'cancelled';
  if (order.approvalStatus === 'pending_approval') {
    return order.orderStatus === 'awaiting_shipping_quote' ? 'waiting_shipping_quote' : 'pending_approval';
  }
  if (order.paymentStatus === 'waiting_verification') return 'waiting_verification';
  if (order.paymentStatus === 'rejected') return 'payment_rejected';
  if (order.paymentStatus === 'paid') {
    if (order.orderStatus === 'processing') return 'processing';
    if (['ready_for_pickup', 'ready_to_ship'].includes(order.orderStatus)) return 'ready';
    if (order.orderStatus === 'completed') return 'completed';
  }
  return 'pending_payment';
}

function getOrderSpecifications(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const specifications = JSON.parse(value);
    return Array.isArray(specifications)
      ? specifications.filter((item) => item && typeof item.label === 'string')
      : [];
  } catch (parseError) {
    console.error('Invalid order specifications:', parseError);
    return [];
  }
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
    : 'Invalid order access link. Use the status link provided after placing your order.');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const customerSession = useCustomerSession();
  const orderStatus = getStatus(order || {});
  const whatsappLink = useMemo(() => order && getWhatsAppLink([
    `Hello Ruka Motorworks, I have a question about order ${order.orderNumber}.`,
    `Name: ${order.customerName}`,
    `Build: ${order.buildName}`,
    `Price: ${formatRupiah(order.totalAmount)}`,
    `Payment method: ${order.paymentMethod === 'gopay' ? 'GoPay' : 'SeaBank'}`,
    `Order status: ${STATUS_LABELS[orderStatus] || orderStatus}`,
    `Payment status: ${order.paymentStatus}`,
  ].join('\n')), [order, orderStatus]);

  usePageTitle(order?.orderNumber ? `${order.orderNumber} — RUKA Order Status` : 'Order Status — RUKA Motorworks');

  const fetchOrder = useCallback(async () => {
    const response = await fetch(`/api/purchases/${encodeURIComponent(orderId)}`, {
      headers: { 'X-Order-Access-Token': accessToken },
    });
    const result = await response.json();
    if (!response.ok || !result?.success || !result.data || typeof result.data !== 'object') {
      throw new Error(result?.message || `Order status could not be loaded (${response.status}).`);
    }
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
        console.error('Failed to load order status:', requestError);
        if (active) setError(requestError.message || 'Order status could not be loaded.');
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
      console.error('Failed to load order status:', requestError);
      setError(requestError.message || 'Order status could not be loaded.');
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
        console.error('Failed to load payment proof:', proofError);
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
      setError('Payment proof must be a JPG or PNG image.');
      event.target.value = '';
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Payment proof must not exceed 5 MB.');
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
      if (!response.ok || !result.success) throw new Error(result.message || 'Payment proof could not be submitted.');
      setOrder(result.data);
      setProof(null);
      setProofPreview('');
      setNotice('Payment proof received and awaiting admin review. This does not mark the order as paid.');
    } catch (requestError) {
      console.error('Failed to submit payment proof:', requestError);
      setError(requestError.message || 'Payment proof could not be submitted.');
    } finally {
      setUploading(false);
    }
  };

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(`${label} copied.`);
    } catch (copyError) {
      console.error(`Failed to copy ${label.toLowerCase()}:`, copyError);
      setCopied(`Unable to copy ${label.toLowerCase()} on this device.`);
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
      setClaimError(result.message || 'The order could not be linked to your account.');
      return;
    }
    navigate(`/akun/pesanan/${encodeURIComponent(order.id)}`);
  };

  if (loading) {
    return <main className="rm-customer-order rm-container"><p>Loading order status...</p></main>;
  }

  return (
    <main className="rm-customer-order rm-container" id="main-content" tabIndex={-1}>
      <nav aria-label="Jejak navigasi" className="rm-customer-order__breadcrumb">
        <Link to="/katalog">Catalog</Link><span aria-hidden="true">/</span><span>Order status</span>
      </nav>
      {error && !order ? <section className="rm-customer-order__panel"><h1>Order status unavailable</h1><p role="alert">{error}</p><Link to="/katalog">Back to catalog</Link></section> : null}
      {notice ? <p className="rm-customer-order__message" role="status">{notice}</p> : null}
      {order ? (
        <>
          <header className="rm-customer-order__heading">
            <p className="rm-eyebrow">RUANG ORDER / STATUS PESANAN</p>
            <h1>{order.orderNumber}</h1>
            <p>This direct purchase order is recorded separately from custom consultations.</p>
            {customerSession.status === 'authenticated' ? (
              order.isClaimed ? (
                <div className="rm-customer-order__claim">
                  <p>This order is already linked to your account.</p>
                  <Link className="rm-customer-order__secondary" to={`/akun/pesanan/${encodeURIComponent(order.id)}`}>
                    View in My Orders
                  </Link>
                </div>
              ) : (
                <div className="rm-customer-order__claim">
                  <button className="rm-customer-order__secondary" disabled={claiming} onClick={() => void claimOrder()} type="button">
                    {claiming ? 'Linking...' : 'Link this order to your account'}
                  </button>
                  <p>To link this order, the email and WhatsApp number must match the order details.</p>
                  {claimError ? <p role="alert">{claimError}</p> : null}
                </div>
              )
            ) : customerSession.status === 'unauthenticated' ? (
              <p className="rm-customer-order__claim">Have an account? <a href={`/login?return=${encodeURIComponent(`${window.location.pathname}${window.location.hash}`)}`}>Log in to link this order</a>.</p>
            ) : null}
          </header>
          <section aria-label="Order status" className="rm-customer-order__status">
            <p className="rm-meta">CURRENT STATUS</p>
            <h2>{STATUS_LABELS[orderStatus] || 'Status updated'}</h2>
            {order.approvalRejectionReason ? <p>Reason: {order.approvalRejectionReason}</p> : null}
            {orderStatus === 'pending_approval' ? <p>Ruka will review build availability before showing payment instructions.</p> : null}
            {orderStatus === 'waiting_shipping_quote' ? <p>Shipping cost has not been set. Ruka will confirm it before payment.</p> : null}
            {orderStatus === 'waiting_verification' ? <p>Transfer proof received; an admin must verify the funds. Uploading proof does not automatically confirm payment.</p> : null}
            <button className="rm-customer-order__secondary" onClick={() => void loadOrder()} type="button">Refresh status</button>
          </section>
          <div className="rm-customer-order__layout">
            <section className="rm-customer-order__panel">
              <p className="rm-meta">BUILD SUMMARY</p>
              <h2>{order.buildName}</h2>
              <img alt={order.buildName} className="rm-customer-order__image" src={getCatalogProductImage({ image: order.imageSnapshot, name: order.productName })} />
              <dl className="rm-customer-order__fields">
                <div><dt>Motorcycle basis</dt><dd>{order.basis}</dd></div>
                <div><dt>Category</dt><dd>{order.categoryName}</dd></div>
                {getOrderSpecifications(order.specifications).map(({ label, value }, index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
                <div><dt>Build price</dt><dd>{formatRupiah(order.price)}</dd></div>
                <div><dt>Shipping</dt><dd>{order.shippingCost == null ? 'Awaiting confirmation' : formatRupiah(order.shippingCost)}</dd></div>
                <div><dt>Total</dt><dd>{formatRupiah(order.totalAmount)}</dd></div>
                <div><dt>Customer name</dt><dd>{order.customerName}</dd></div>
                <div><dt>Order number</dt><dd>{order.orderNumber}</dd></div>
              </dl>
            </section>
            <section className="rm-customer-order__panel">
              <p className="rm-meta">MANUAL TRANSFER</p>
              <h2>Payment instructions</h2>
              {order.paymentInstructions ? (
                <>
                  <dl className="rm-customer-order__fields">
                    <div><dt>Method</dt><dd>{order.paymentInstructions.label}</dd></div>
                    <div><dt>Account number</dt><dd>{order.paymentInstructions.recipientNumber}</dd></div>
                    <div><dt>Account name</dt><dd>{order.paymentInstructions.recipientName}</dd></div>
                    <div><dt>Amount</dt><dd>{formatRupiah(order.paymentInstructions.amount)}</dd></div>
                    <div><dt>Order number</dt><dd>{order.paymentInstructions.orderNumber}</dd></div>
                    <div><dt>Payment deadline</dt><dd>{order.paymentInstructions.deadline || 'Not specified'}</dd></div>
                  </dl>
                  <div className="rm-customer-order__actions">
                    <button className="rm-customer-order__secondary" onClick={() => void copyText(order.paymentInstructions.recipientNumber, 'Account number')} type="button">Copy account number</button>
                    <button className="rm-customer-order__secondary" onClick={() => void copyText(order.paymentInstructions.amount, 'Payment amount')} type="button">Copy amount</button>
                  </div>
                  <p className="rm-customer-order__note">Manual transfer. Payment is confirmed after an admin verifies receipt of funds.</p>
                </>
              ) : <p className="rm-customer-order__note">Payment instructions will be available once the order is approved by an admin.</p>}
              {copied ? <p role="status">{copied}</p> : null}
              {order.hasPaymentProof ? (
                <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                  <p className="rm-meta">SUBMITTED TRANSFER PROOF</p>
                  {currentProofUrl ? (
                    <img alt="Submitted transfer proof" className="rm-customer-order__proof-preview" src={currentProofUrl} />
                  ) : (
                    <p className="rm-customer-order__note">Payment proof saved and awaiting admin verification.</p>
                  )}
                </div>
              ) : null}
              {order.orderStatus !== 'cancelled' && order.approvalStatus === 'approved' && ['pending_payment', 'waiting_verification', 'rejected'].includes(order.paymentStatus) ? (
                <form className="rm-customer-order__upload" onSubmit={uploadProof}>
                  <label htmlFor="rm-customer-order-proof">
                    {order.hasPaymentProof ? 'Replace / re-upload transfer proof (JPG/PNG, max. 5 MB)' : 'Upload transfer proof (JPG/PNG, max. 5 MB)'}
                  </label>
                  <input accept="image/jpeg,image/png" id="rm-customer-order-proof" onChange={handleProofChange} type="file" />
                  {proofPreview ? <img alt="New transfer proof preview" className="rm-customer-order__proof-preview" src={proofPreview} /> : null}
                  {error ? <p role="alert">{error}</p> : null}
                  <button className="rm-customer-order__primary" disabled={!proof || uploading} type="submit">
                    {uploading ? 'Uploading...' : order.hasPaymentProof ? 'Update payment proof' : 'Submit payment proof'}
                  </button>
                </form>
              ) : order.paymentStatus === 'paid' ? (
                <p className="rm-customer-order__note" style={{ color: 'var(--rm-accent)' }}>Payment has been confirmed by an admin. The transfer proof is locked.</p>
              ) : null}
            </section>
          </div>
          {error && order ? <p className="rm-customer-order__message is-error" role="alert">{error}</p> : null}
          <a className="rm-customer-order__whatsapp" href={whatsappLink} rel="noopener noreferrer" target="_blank">Contact Ruka on WhatsApp</a>
        </>
      ) : null}
    </main>
  );
}
