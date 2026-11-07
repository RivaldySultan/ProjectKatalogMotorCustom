import { useEffect, useMemo, useState } from 'react';
import Link from '../components/ui/Link';
import { customerRequest, useCustomerSession, establishCustomerSession } from '../lib/customerAuth';
import { formatRupiah, getCatalogProductImage } from '../lib/products';
import { usePageTitle } from '../lib/usePageTitle';
import OrderChat from '../components/ui/OrderChat';
import './CustomerAccountPage.css';

const STATUS_LABELS = {
  pending_approval: 'Awaiting admin approval',
  waiting_shipping_quote: 'Awaiting shipping quote',
  pending_payment: 'Awaiting payment',
  waiting_verification: 'Awaiting payment verification',
  payment_rejected: 'Payment rejected',
  rejected: 'Order not approved',
  paid: 'Payment confirmed',
  processing: 'In progress',
  ready: 'Order delivery / ready for pickup',
  delivered: 'Order arrived at destination',
  completed: 'Completed',
  expired: 'Expired',
  cancelled: 'Cancelled',
};
const PAYMENT_LABELS = {
  pending_payment: 'Awaiting payment',
  waiting_verification: 'Awaiting verification',
  paid: 'Confirmed',
  rejected: 'Rejected',
  expired: 'Expired',
};
const WORK_LABELS = {
  awaiting_payment: 'Awaiting payment',
  awaiting_shipping_quote: 'Awaiting shipping quote',
  processing: 'In progress',
  ready_for_pickup: 'Ready for pickup',
  ready_to_ship: 'Order delivery',
  delivered: 'Order arrived at destination',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formattedDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusFor(order) {
  if (order.cancelledByAdmin) return 'cancelled';
  if (order.approvalStatus === 'rejected') return 'rejected';
  if (order.orderStatus === 'cancelled') return 'cancelled';
  if (order.approvalStatus === 'pending_approval') {
    return order.orderStatus === 'awaiting_shipping_quote' ? 'waiting_shipping_quote' : 'pending_approval';
  }
  if (order.paymentStatus === 'expired') return 'expired';
  if (order.paymentStatus === 'waiting_verification') return 'waiting_verification';
  if (order.paymentStatus === 'rejected') return 'payment_rejected';
  if (order.paymentStatus === 'paid') {
    if (order.orderStatus === 'processing') return 'processing';
    if (order.orderStatus === 'delivered') return 'delivered';
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
    console.error('Invalid order specification snapshot:', error);
    return [];
  }
}

function AccountNavigation({ selected }) {
  return (
    <nav aria-label="Account navigation" className="rm-account__nav">
      <Link aria-current={selected === 'profile' ? 'page' : undefined} to="/akun">Profile</Link>
      <Link aria-current={selected === 'orders' || selected === 'detail' ? 'page' : undefined} to="/akun/pesanan">My Orders</Link>
    </nav>
  );
}

function AccountGate() {
  return (
    <section className="rm-account__panel">
      <h1>Log in to continue</h1>
      <p>Account information and purchase history are only available to the account owner.</p>
      <div className="rm-account__actions">
        <Link className="rm-button rm-button--primary" to="/login">Customer Log In</Link>
        <Link className="rm-account__text-link" to="/register">Create Account</Link>
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
      setError(result.message || 'Profile could not be updated.');
      return;
    }
    establishCustomerSession(result.data);
    setEditing(false);
    setNotice('Profile updated.');
  };

  return (
    <section className="rm-account__panel">
      <div className="rm-account__panel-heading">
        <div><p className="rm-meta">CUSTOMER INFORMATION</p><h2>My Profile</h2></div>
        {!editing ? <button className="rm-account__secondary" onClick={() => setEditing(true)} type="button">Edit Profile</button> : null}
      </div>
      {editing ? (
        <form className="rm-account__form" onSubmit={save}>
          <label><span>Full name</span><input autoComplete="name" maxLength={120} onChange={(event) => setValues((current) => ({ ...current, fullName: event.target.value }))} required value={values.fullName} /></label>
          <label><span>Email</span><input autoComplete="email" maxLength={254} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} required type="email" value={values.email} /></label>
          <label><span>WhatsApp number</span><input autoComplete="tel" maxLength={24} onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))} required type="tel" value={values.phone} /></label>
          {error ? <p className="rm-account__error" role="alert">{error}</p> : null}
          <div className="rm-account__actions">
            <button className="rm-button rm-button--primary" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save Profile'}</button>
            <button className="rm-account__secondary" onClick={() => {
              setValues({ fullName: user.fullName || '', email: user.email || '', phone: user.phone || '' });
              setEditing(false);
              setError('');
            }} type="button">Cancel</button>
          </div>
        </form>
      ) : (
        <dl className="rm-account__fields">
          <div><dt>Full name</dt><dd>{user.fullName}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>WhatsApp number</dt><dd>{user.phone}</dd></div>
          <div><dt>Joined</dt><dd>{formattedDate(user.createdAt)}</dd></div>
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
        if (!result.ok) setError(result.message || 'Order history could not be loaded.');
        else setOrders(result.data.data || []);
      });
    return () => { active = false; };
  }, []);

  return (
    <>
      <header className="rm-account__welcome"><p className="rm-eyebrow">CUSTOMER AREA</p><h1>Hello, {user.fullName}</h1><p>Manage your account information and track your purchases.</p></header>
      <AccountNavigation selected="profile" />
      <ProfilePage user={user} />
      <section className="rm-account__panel">
        <div className="rm-account__panel-heading"><div><p className="rm-meta">PURCHASE HISTORY</p><h2>Recent Orders</h2></div><Link className="rm-account__text-link" to="/akun/pesanan">All Orders</Link></div>
        {error ? <p className="rm-account__error" role="alert">{error}</p> : orders.length ? (
          <ul className="rm-account__recent">
            {orders.map((order) => <li key={order.id}><Link to={`/akun/pesanan/${encodeURIComponent(order.id)}`}><span>{order.orderNumber} · {order.buildName}</span><strong>{STATUS_LABELS[order.status] || order.status}</strong></Link></li>)}
          </ul>
        ) : <p className="rm-account__muted">No purchase history is linked to this account yet.</p>}
      </section>
    </>
  );
}

function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('desc');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmingOrderId, setConfirmingOrderId] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState('');

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ page: String(pagination.page), pageSize: '10', sort });
    if (status) query.set('status', status);
    customerRequest(`/api/customers/orders?${query}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.message || 'Order list could not be loaded.');
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

  const confirmReceived = async (order) => {
    if (!window.confirm(`Confirm that you have received motorcycle ${order.orderNumber}?`)) return;
    setConfirmingOrderId(order.id);
    setError('');
    try {
      const result = await customerRequest(
        `/api/customers/orders/${encodeURIComponent(order.id)}/confirm-received`,
        { method: 'POST' },
      );
      if (!result.ok) {
        setError(result.message || 'Order receipt could not be confirmed.');
        return;
      }
      setOrders((current) => current.map((item) => (
        item.id === order.id
          ? { ...item, customerReceivedAt: result.data.customerReceivedAt }
          : item
      )));
    } catch (requestError) {
      console.error('Failed to confirm customer order receipt:', requestError);
      setError('Unable to connect to the server. Order receipt was not confirmed.');
    } finally {
      setConfirmingOrderId('');
    }
  };

  const deleteOrderHistory = async (order) => {
    if (!window.confirm(`Remove order ${order.orderNumber} from your history?`)) return;
    setDeletingOrderId(order.id);
    setError('');
    try {
      const result = await customerRequest(
        `/api/customers/orders/${encodeURIComponent(order.id)}`,
        { method: 'DELETE' },
      );
      if (!result.ok) {
        setError(result.message || 'Order history could not be removed.');
        return;
      }
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setPagination((current) => {
        const total = Math.max(0, current.total - 1);
        const totalPages = Math.ceil(total / current.pageSize);
        return {
          ...current,
          total,
          totalPages,
          page: Math.min(current.page, Math.max(1, totalPages)),
        };
      });
    } catch (requestError) {
      console.error('Failed to remove customer order history:', requestError);
      setError('Unable to connect to the server. Order history was not removed.');
    } finally {
      setDeletingOrderId('');
    }
  };

  return (
    <>
      <header className="rm-account__welcome"><p className="rm-eyebrow">CUSTOMER AREA</p><h1>MY ORDERS</h1><p>Purchase history and status linked to your account.</p></header>
      <AccountNavigation selected="orders" />
      <section className="rm-account__panel">
        <div className="rm-account__filters">
          <label>Status
            <select onChange={(event) => updateFilter(setStatus, event.target.value)} value={status}>
              <option value="">All statuses</option>
              <option value="pending_approval">Awaiting approval</option>
              <option value="waiting_shipping_quote">Awaiting shipping quote</option>
              <option value="pending_payment">Awaiting payment</option>
              <option value="waiting_verification">Awaiting verification</option>
              <option value="payment_rejected">Payment rejected</option>
              <option value="paid">Payment confirmed</option>
              <option value="processing">In progress</option>
              <option value="ready">Order delivery / ready for pickup</option>
              <option value="delivered">Order arrived at destination</option>
              <option value="completed">Completed</option>
              <option value="rejected">Order not approved</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>Sort by date
            <select onChange={(event) => updateFilter(setSort, event.target.value)} value={sort}>
              <option value="desc">Newest first</option><option value="asc">Oldest first</option>
            </select>
          </label>
        </div>
        {error ? <p className="rm-account__error" role="alert">{error}</p> : null}
        {loading ? <p className="rm-account__muted">Loading orders...</p> : orders.length ? (
          <div className="rm-account__table-wrap">
            <table className="rm-account__table">
              <thead><tr><th>Order</th><th>Build</th><th>Basis</th><th>Price</th><th>Date</th><th>Method</th><th>Payment status</th><th>Build status</th><th>Actions</th></tr></thead>
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
                  <td className="rm-account__order-actions">
                    <Link to={`/akun/pesanan/${encodeURIComponent(order.id)}`}>View details</Link>
                    {order.paymentStatus === 'paid'
                      && ['delivered', 'ready_for_pickup'].includes(order.orderStatus)
                      && !order.customerReceivedAt ? (
                        <button
                          className="rm-account__secondary"
                          disabled={Boolean(confirmingOrderId)}
                          onClick={() => void confirmReceived(order)}
                          type="button"
                        >
                          {confirmingOrderId === order.id ? 'Confirming...' : 'Confirm received'}
                        </button>
                      ) : null}
                    {order.customerReceivedAt ? <span>Receipt confirmed</span> : null}
                    {['completed', 'cancelled'].includes(order.orderStatus) ? (
                      <button
                        className="rm-account__secondary rm-account__secondary--danger"
                        disabled={Boolean(deletingOrderId)}
                        onClick={() => void deleteOrderHistory(order)}
                        type="button"
                      >
                        {deletingOrderId === order.id ? 'Deleting...' : 'Delete history'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="rm-account__muted">No orders match this filter.</p>}
        <div className="rm-account__pagination">
          <button className="rm-account__secondary" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} type="button">Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
          <button className="rm-account__secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} type="button">Next</button>
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

  usePageTitle(order?.orderNumber ? `${order.orderNumber} — My Orders` : 'Order Details — RUKA Motorworks');

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(`${label} copied.`);
    } catch {
      setCopied(`Unable to copy ${label.toLowerCase()} on this device.`);
    }
  };

  useEffect(() => {
    let active = true;
    customerRequest(`/api/customers/orders/${encodeURIComponent(orderId)}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) setError(result.message || 'Order details could not be loaded.');
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
        console.error('Failed to load customer payment proof:', requestError);
        if (active) setError('Payment proof could not be loaded.');
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
      setError('Payment proof must be a JPG or PNG image.');
      event.target.value = '';
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Payment proof must not exceed 5 MB.');
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
        setError(result?.message || 'Payment proof could not be submitted.');
        return;
      }
      setOrder(result.data);
      setFile(null);
      setPreview('');
      setNotice('Payment proof updated and awaiting admin review.');
    } catch (requestError) {
      console.error('Failed to submit customer payment proof:', requestError);
      setError('Unable to connect to the server. Payment proof was not submitted.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <p className="rm-account__muted">Loading order details...</p>;
  if (!order) return <section className="rm-account__panel"><p className="rm-account__error" role="alert">{error || 'Order not found.'}</p><Link to="/akun/pesanan">Back to My Orders</Link></section>;

  return (
    <>
      <header className="rm-account__welcome"><p className="rm-eyebrow">MY ORDERS / DETAILS</p><h1>{order.orderNumber}</h1><p>{STATUS_LABELS[detailStatus] || detailStatus}</p></header>
      <AccountNavigation selected="detail" />
      {order.approvalRejectionReason ? (
        <section className="rm-account__panel rm-account__alert" role="alert">
          <p className="rm-meta">REJECTION NOTE</p>
          <p><strong>Reason:</strong> {order.approvalRejectionReason}</p>
        </section>
      ) : null}
      {order.cancelledByAdmin ? (
        <section className="rm-account__panel rm-account__alert" role="status">
          <p className="rm-meta">ORDER CANCELLED</p>
          <p>This order was cancelled by Ruka.</p>
        </section>
      ) : order.approvalStatus === 'pending_approval' ? (
        <section className="rm-account__panel">
          <p className="rm-meta">ORDER STATUS</p>
          <p className="rm-account__muted">{order.orderStatus === 'awaiting_shipping_quote' ? 'Shipping cost has not been set. Ruka will confirm it before payment.' : 'Ruka will review build availability before showing payment instructions.'}</p>
        </section>
      ) : null}
      {order.paymentInstructions ? (
        <section className="rm-account__panel">
          <p className="rm-meta">MANUAL TRANSFER</p>
          <h2>Payment instructions</h2>
          <dl className="rm-account__fields">
            <div><dt>Method</dt><dd>{order.paymentInstructions.label}</dd></div>
            <div><dt>Account number</dt><dd>{order.paymentInstructions.recipientNumber}</dd></div>
            <div><dt>Account name</dt><dd>{order.paymentInstructions.recipientName}</dd></div>
            <div><dt>Transfer amount</dt><dd>{formatRupiah(order.paymentInstructions.amount)}</dd></div>
            <div><dt>Order number</dt><dd>{order.paymentInstructions.orderNumber}</dd></div>
          </dl>
          <div className="rm-account__actions" style={{ marginTop: '16px' }}>
            <button className="rm-account__secondary" onClick={() => void copyText(order.paymentInstructions.recipientNumber, 'Account number')} type="button">Copy account number</button>
            <button className="rm-account__secondary" onClick={() => void copyText(order.paymentInstructions.amount, 'Payment amount')} type="button">Copy transfer amount</button>
          </div>
          {copied ? <p className="rm-account__notice" role="status">{copied}</p> : null}
          <p className="rm-account__muted" style={{ marginTop: '12px', fontSize: '0.875rem' }}>Manual transfer. Payment is confirmed after an admin verifies receipt of funds.</p>
        </section>
      ) : null}
      <div className="rm-account__detail-grid">
        <section className="rm-account__panel">
          <p className="rm-meta">BUILD DETAILS</p><h2>{order.buildName}</h2>
          <img alt={order.buildName} className="rm-account__hero-image" src={getCatalogProductImage({ image: order.imageSnapshot, name: order.productName })} />
          <dl className="rm-account__fields">
            <div><dt>Motorcycle basis</dt><dd>{order.basis}</dd></div>
            <div><dt>Category</dt><dd>{order.categoryName}</dd></div>
            {specifications.map(({ label, value }, index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}
            <div><dt>Price snapshot</dt><dd>{formatRupiah(order.price)}</dd></div>
            <div><dt>Pickup / delivery</dt><dd>{order.shippingMethod === 'pickup' ? 'Pickup' : 'Delivery'}</dd></div>
            {order.deliveryAddress ? <div><dt>Delivery address</dt><dd>{order.deliveryAddress}</dd></div> : null}
            <div><dt>Shipping</dt><dd>{order.shippingCost == null ? 'Awaiting confirmation' : formatRupiah(order.shippingCost)}</dd></div>
            <div><dt>Total</dt><dd>{formatRupiah(order.totalAmount)}</dd></div>
            <div><dt>Payment method</dt><dd>{order.paymentMethod === 'gopay' ? 'GoPay' : 'SeaBank'}</dd></div>
            <div><dt>Payment status</dt><dd>{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}</dd></div>
            <div><dt>Build status</dt><dd>{WORK_LABELS[order.orderStatus] || order.orderStatus}</dd></div>
            <div><dt>Customer name</dt><dd>{order.customerName}</dd></div>
            <div><dt>Customer WhatsApp</dt><dd>{order.phone}</dd></div>
            {order.email ? <div><dt>Customer email</dt><dd>{order.email}</dd></div> : null}
            <div><dt>City</dt><dd>{order.city}</dd></div>
            <div><dt>Order date</dt><dd>{formattedDate(order.createdAt)}</dd></div>
          </dl>
        </section>
        <section className="rm-account__panel">
          <p className="rm-meta">ORDER HISTORY</p><h2>Recorded Activity</h2>
          {order.timeline?.length ? (
            <ol className="rm-account__timeline">
              {order.timeline.map((item) => <li key={item.id}><strong>{item.eventType === 'order_ready_to_ship' ? 'Order delivery' : item.label}</strong><time>{formattedDate(item.createdAt)}</time>{item.details ? <p>{item.details}</p> : null}</li>)}
            </ol>
          ) : <p className="rm-account__muted">No additional status changes have been recorded.</p>}
        </section>
        <section className="rm-account__panel rm-account__proof">
          <p className="rm-meta">PAYMENT PROOF</p><h2>Transfer Proof History</h2>
          {proofs.length ? proofs.map((proof, index) => (
            <figure key={proof.id}>
              <img alt={`Payment proof ${index + 1}${proof.isCurrent ? ', latest' : ''}`} src={proof.url} />
              <figcaption>{proof.isCurrent ? 'Latest proof' : `Previous proof ${index + 1}`} · {formattedDate(proof.createdAt)}</figcaption>
            </figure>
          )) : <p className="rm-account__muted">No payment proof has been submitted yet.</p>}
          {canReplaceProof ? (
            <form className="rm-account__form" onSubmit={uploadProof}>
              <label><span>{order.paymentStatus === 'pending_payment' ? 'Upload transfer proof' : 'Replace / re-upload proof'} (JPG/PNG, max. 5 MB)</span><input accept="image/jpeg,image/png" onChange={selectProof} type="file" /></label>
              {preview ? <img alt="New payment proof preview" className="rm-account__proof-preview" src={preview} /> : null}
              {error ? <p className="rm-account__error" role="alert">{error}</p> : null}
              <button className="rm-button rm-button--primary" disabled={!file || uploading} type="submit">{uploading ? 'Uploading...' : order.paymentStatus === 'pending_payment' ? 'Submit Proof' : 'Update Proof'}</button>
            </form>
          ) : order.paymentStatus === 'paid' ? <p className="rm-account__muted">Payment has been confirmed; the transfer proof is locked and cannot be replaced.</p> : null}
          {notice ? <p className="rm-account__notice" role="status">{notice}</p> : null}
          {error && canReplaceProof ? <p className="rm-account__error" role="alert">{error}</p> : null}
        </section>
      </div>
      <OrderChat orderId={order.id} viewer="customer" />
    </>
  );
}

export default function CustomerAccountPage({ route }) {
  const { status, user } = useCustomerSession();
  const mode = route.mode || 'profile';
  usePageTitle(mode === 'orders' ? 'My Orders — RUKA Motorworks' : 'My Account — RUKA Motorworks');

  return (
    <main className="rm-account rm-container" id="main-content" tabIndex={-1}>
      {status === 'unknown' || status === 'checking' ? <p className="rm-account__muted">Checking account session...</p> : null}
      {status === 'unavailable' ? <section className="rm-account__panel"><p role="alert">Customer account could not be verified. Check your connection and reload the page.</p></section> : null}
      {status === 'unauthenticated' ? <AccountGate /> : null}
      {status === 'authenticated' && mode === 'profile' ? <AccountHome user={user} /> : null}
      {status === 'authenticated' && mode === 'orders' ? <OrdersPage /> : null}
      {status === 'authenticated' && mode === 'detail' ? <OrderDetailPage orderId={route.id} /> : null}
    </main>
  );
}
