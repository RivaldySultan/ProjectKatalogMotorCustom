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
import { customerRequest, useCustomerSession } from '../lib/customerAuth';
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
      console.error('Invalid order specification snapshot:', snapshotError);
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
  const customerSession = useCustomerSession();
  const checkoutPath = `/checkout/${encodeURIComponent(productId)}`;
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
          throw new Error(result.message || 'Payment methods could not be loaded.');
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
        console.error('Failed to load payment methods:', requestError);
        if (active) setError(requestError.message || 'Payment methods could not be loaded.');
      })
      .finally(() => {
        if (active) setIsLoadingMethods(false);
      });

    const savedOrder = sessionStorage.getItem(getLocalOrderKey(productId));
    if (savedOrder) {
      try {
        const { orderId, token } = JSON.parse(savedOrder);
        if (!orderId || !token) throw new Error('Invalid order access information.');
        fetch(`/api/purchases/${encodeURIComponent(orderId)}`, {
          headers: { 'X-Order-Access-Token': token },
        })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'Order not found.');
          if (active) {
            accessToken.current = token;
            setOrder(result.data);
          }
        })
        .catch((requestError) => {
          console.error('Failed to load order:', requestError);
          if (active) {
            sessionStorage.removeItem(getLocalOrderKey(productId));
            setError('The saved order could not be loaded. Check the link and your browser session.');
          }
        });
      } catch (storageError) {
        console.error('Invalid order access information:', storageError);
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
      setError('This build is not available for direct purchase.');
      return;
    }
    if (!paymentMethods.some(({ method }) => method === values.paymentMethod)) {
      setError('No transfer methods are configured. The order was not created.');
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
      if (!response.ok || !result.success) throw new Error(result.message || 'The order could not be created.');
      sessionStorage.setItem(
        getLocalOrderKey(productId),
        JSON.stringify({ orderId: result.data.id, token: result.data.accessToken }),
      );
      navigate(`/pesanan/${encodeURIComponent(result.data.id)}#${result.data.accessToken}`);
    } catch (requestError) {
      console.error('Failed to create purchase order:', requestError);
      setError(requestError.message || 'The order could not be created. Your form data is still saved.');
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
      if (!response.ok || !result.success) throw new Error(result.message || 'Payment proof could not be submitted.');
      setOrder(result.data);
      setProof(null);
      setProofPreview('');
      setNotice('Payment proof received and awaiting admin review. This does not mark the order as paid.');
    } catch (requestError) {
      console.error('Failed to submit payment proof:', requestError);
      setError(requestError.message || 'Payment proof could not be submitted.');
    } finally {
      setIsUploading(false);
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

  const refreshOrder = async () => {
    try {
      const response = await fetch(`/api/purchases/${encodeURIComponent(order.id)}`, {
        headers: { 'X-Order-Access-Token': accessToken.current },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setError(result.message || 'Order status could not be updated.');
        return;
      }
      setOrder(result.data);
      setError('');
    } catch (requestError) {
      console.error('Failed to update order status:', requestError);
      setError('Order status could not be updated. Check your connection and try again.');
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
    return <main className="rm-checkout rm-container"><p>Loading build...</p></main>;
  }
  if (!product) {
    return (
      <main className="rm-checkout rm-container">
        <h1>Build not found</h1>
        <Link to="/katalog">Back to catalog</Link>
      </main>
    );
  }
  if (!order && product.canPurchase !== 1) {
    return (
      <main className="rm-checkout rm-container" id="main-content" tabIndex={-1}>
        <p className="rm-eyebrow">DIRECT PURCHASE UNAVAILABLE</p>
        <h1>This build cannot be ordered yet.</h1>
        <p className="rm-checkout__note">Contact us to discuss this build.</p>
        <Link className="rm-button rm-button--primary" to={`/motor/${encodeURIComponent(product.id)}#consultation-form`}>
          Start a Consultation
        </Link>
      </main>
    );
  }
  if (!order && customerSession.status !== 'authenticated') {
    if (customerSession.status === 'unauthenticated') {
      const returnQuery = `?return=${encodeURIComponent(checkoutPath)}`;
      return (
        <main className="rm-checkout rm-container" id="main-content" tabIndex={-1}>
          <p className="rm-eyebrow">CUSTOMER ACCOUNT REQUIRED</p>
          <h1>Create an account to order directly.</h1>
          <p className="rm-checkout__note">
            Sign in or create a customer account before placing a direct order. Your account lets you follow your build progress.
          </p>
          <div className="rm-checkout__actions">
            <Link className="rm-button rm-button--primary" to={`/register${returnQuery}`}>
              Create Account
            </Link>
            <Link className="rm-button rm-button--outline" to={`/login${returnQuery}`}>
              Log In
            </Link>
          </div>
        </main>
      );
    }

    return (
      <main className="rm-checkout rm-container" id="main-content" tabIndex={-1}>
        <p role={customerSession.status === 'unavailable' ? 'alert' : 'status'}>
          {customerSession.status === 'unavailable'
            ? 'Your customer account could not be verified. Please reload and try again.'
            : 'Checking customer account...'}
        </p>
        {customerSession.status === 'unavailable' ? (
          <button className="rm-button rm-button--outline" onClick={() => window.location.reload()} type="button">
            Reload
          </button>
        ) : null}
      </main>
    );
  }

  const orderWhatsapp = order ? getWhatsAppLink([
    `Hello Ruka Motorworks, I have a question about order ${order.orderNumber}.`,
    `Name: ${order.customerName}`,
    `Build: ${order.buildName}`,
    `Price: ${formatRupiah(order.totalAmount)}`,
    `Payment method: ${paymentLabel(order.paymentMethod)}`,
    `Payment status: ${order.paymentStatus}`,
  ].join('\n')) : '';

  return (
    <main className="rm-checkout rm-container" id="main-content" tabIndex={-1}>
      <nav aria-label="Breadcrumb" className="rm-checkout__breadcrumb">
        <Link to={`/motor/${encodeURIComponent(product.id)}`}>Motorcycle details</Link>
        <span aria-hidden="true">/</span>
        <span>{order ? 'Order' : 'Checkout'}</span>
      </nav>
      <header className="rm-checkout__heading">
        <p className="rm-eyebrow">ORDER / DIRECT PURCHASE</p>
        <h1>{order ? order.orderNumber : 'CHECKOUT'}</h1>
        <p>{order ? 'This purchase order is recorded separately from custom consultation requests.' : 'Order a build with catalog specifications already defined.'}</p>
      </header>

      {error ? <p className="rm-checkout__message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="rm-checkout__message" role="status">{notice}</p> : null}

      <div className="rm-checkout__layout">
        <section aria-labelledby="rm-checkout-summary-title" className="rm-checkout__panel">
          <p className="rm-meta">BUILD SUMMARY</p>
          <h2 id="rm-checkout-summary-title">{order?.buildName || getProductBuildName(product) || product.name}</h2>
          <img
            alt={product.imageAlt || product.name}
            className="rm-checkout__image"
            src={getCatalogProductImage(order?.imageSnapshot ? { ...product, image: order.imageSnapshot } : product)}
          />
          <dl className="rm-checkout__fields">
            <div><dt>Motorcycle basis</dt><dd>{order?.basis || getProductBasis(product) || '—'}</dd></div>
            <div><dt>Category</dt><dd>{order?.categoryName || product.categoryName || '—'}</dd></div>
            {fixedSpecifications.map(([label, value], index) => (
              <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
            <div><dt>Build price</dt><dd>{formatRupiah(order?.price ?? product.price)}</dd></div>
            {order ? (
              <div>
                <dt>{order.shippingMethod === 'delivery' && order.shippingCost == null ? 'Build price (shipping not included)' : 'Total'}</dt>
                <dd>{formatRupiah(order.totalAmount)}</dd>
              </div>
            ) : null}
          </dl>
          {order?.shippingMethod === 'delivery' && order.orderStatus === 'awaiting_shipping_quote' ? (
            <p className="rm-checkout__note">Shipping cost has not been set. Ruka will confirm it before payment instructions are available.</p>
          ) : null}
          {!order && product.purchaseType === 'made_to_order' && product.estimatedBuildDays ? (
            <p className="rm-checkout__note">Estimated build time: {product.estimatedBuildDays} days.</p>
          ) : null}
        </section>

        {!order ? (
          <form className="rm-checkout__panel rm-checkout__form" onSubmit={handleCreateOrder}>
            <fieldset>
              <legend>CUSTOMER INFORMATION</legend>
              <label><span>Full name</span><input autoComplete="name" maxLength={120} onChange={(event) => setField('customerName', event.target.value)} required value={values.customerName} /></label>
              <label><span>WhatsApp number</span><input autoComplete="tel" maxLength={24} onChange={(event) => setField('phone', event.target.value)} required type="tel" value={values.phone} /></label>
              <label><span>Email <small>Optional</small></span><input autoComplete="email" maxLength={254} onChange={(event) => setField('email', event.target.value)} type="email" value={values.email} /></label>
              <label><span>City</span><input autoComplete="address-level2" maxLength={120} onChange={(event) => setField('city', event.target.value)} required value={values.city} /></label>
            </fieldset>
            <fieldset>
              <legend>PICKUP / DELIVERY</legend>
              <label><span>Method</span>
                <select onChange={(event) => setField('shippingMethod', event.target.value)} value={values.shippingMethod}>
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery — shipping cost to be confirmed</option>
                </select>
              </label>
              {values.shippingMethod === 'delivery' ? (
                <label><span>Delivery address</span><textarea maxLength={1000} onChange={(event) => setField('deliveryAddress', event.target.value)} required rows={3} value={values.deliveryAddress} /></label>
              ) : null}
            </fieldset>
            <fieldset>
              <legend>MANUAL TRANSFER</legend>
              {isLoadingMethods ? <p>Checking payment methods...</p> : paymentMethods.length ? (
                <label><span>Payment method</span>
                  <select onChange={(event) => setField('paymentMethod', event.target.value)} required value={values.paymentMethod}>
                    {paymentMethods.map((method) => <option key={method.method} value={method.method}>{method.label}</option>)}
                  </select>
                </label>
              ) : <p className="rm-checkout__note">GoPay/SeaBank has not been configured on the server. Checkout will not create an order until a transfer destination is available.</p>}
            </fieldset>
            <p className="rm-checkout__note">Product prices are retrieved and validated by the server. Custom changes are not available through the purchase flow.</p>
            <button className="rm-button rm-button--primary" disabled={isCreating || isLoadingMethods || !paymentMethods.length} type="submit">
              {isCreating ? 'Creating order...' : 'Place Order'}
              <Icon name="arrow-up-right" size={18} />
            </button>
          </form>
        ) : (
          <section aria-labelledby="rm-payment-title" className="rm-checkout__panel">
            <p className="rm-meta">PAYMENT / {order.paymentStatus}</p>
            <h2 id="rm-payment-title">Payment instructions</h2>
            {order.paymentInstructions ? (
              <>
                <dl className="rm-checkout__fields rm-checkout__payment">
                  <div><dt>Method</dt><dd>{order.paymentInstructions.label}</dd></div>
                  <div><dt>Account number</dt><dd>{order.paymentInstructions.recipientNumber}</dd></div>
                  <div><dt>Account name</dt><dd>{order.paymentInstructions.recipientName}</dd></div>
                  <div><dt>Transfer amount</dt><dd>{formatRupiah(order.paymentInstructions.amount)}</dd></div>
                  <div><dt>Order number</dt><dd>{order.orderNumber}</dd></div>
                  <div><dt>Payment deadline</dt><dd>{order.paymentInstructions.deadline || 'Not specified'}</dd></div>
                </dl>
                <div className="rm-checkout__copy">
                  <button onClick={() => copyText(order.paymentInstructions.recipientNumber, 'Account number')} type="button">Copy account number</button>
                  <button onClick={() => copyText(order.paymentInstructions.amount, 'Amount')} type="button">Copy amount</button>
                </div>
                {copied ? <p aria-live="polite" className="rm-checkout__note">{copied}</p> : null}
              </>
            ) : (
              <p className="rm-checkout__note">
                {order.shippingMethod === 'delivery' && order.orderStatus === 'awaiting_shipping_quote'
                  ? 'Waiting for an admin to confirm the shipping cost. The final total and transfer instructions will appear after confirmation.'
                  : 'Payment instructions are not available yet. Contact Ruka to confirm the transfer setup.'}
              </p>
            )}
            {order.paymentStatus === 'pending_payment' || order.paymentStatus === 'rejected' ? (
              <form className="rm-checkout__proof" onSubmit={handleProofUpload}>
                <label>
                  <span>Upload transfer proof (JPG/PNG, up to 5 MB)</span>
                  <input accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={handleProofChange} type="file" />
                </label>
                {proofPreview ? <img alt="Transfer proof preview" src={proofPreview} /> : null}
                <button className="rm-button rm-button--primary" disabled={!proof || !order.paymentInstructions || isUploading} type="submit">
                  {isUploading ? 'Uploading...' : 'Submit Payment Proof'}
                </button>
              </form>
            ) : (
              <p className="rm-checkout__note">
                {order.paymentStatus === 'waiting_verification'
                  ? 'An admin is reviewing your payment proof. Uploading proof does not automatically mark the order as paid.'
                  : order.paymentStatus === 'paid'
                    ? 'Payment has been confirmed by an admin.'
                    : `Payment status: ${order.paymentStatus}.`}
              </p>
            )}
            <button className="rm-checkout__refresh" onClick={refreshOrder} type="button">Refresh order status</button>
            <a className="rm-button rm-button--outline" href={orderWhatsapp} rel="noopener noreferrer" target="_blank">
              Contact Ruka on WhatsApp
              <Icon name="arrow-up-right" size={18} />
            </a>
            <button className="rm-checkout__refresh" onClick={startNewOrder} type="button">Create a new order for this build</button>
          </section>
        )}
      </div>
    </main>
  );
}
