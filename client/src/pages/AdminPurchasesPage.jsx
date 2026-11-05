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
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', {
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
  pending_approval: 'Awaiting approval',
  waiting_shipping_quote: 'Awaiting shipping quote',
  pending_payment: 'Awaiting payment',
  waiting_verification: 'Awaiting verification',
  payment_rejected: 'Payment proof rejected',
  paid: 'Paid',
  processing: 'In progress',
  ready: 'Order delivery / ready for pickup',
  ready_for_pickup: 'Ready for pickup',
  ready_to_ship: 'Order delivery',
  delivered: 'Order arrived at destination',
  completed: 'Completed',
  rejected: 'Rejected',
};

function PurchaseList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState('');

  usePageTitle('Purchase Orders — RUKA Motorworks');

  const deleteOrder = async (order) => {
    if (!window.confirm(`Cancel order ${order.orderNumber} and remove it from Purchase Orders? The customer will see it as cancelled.`)) return;
    setDeletingOrderId(order.id);
    setError('');
    const result = await adminRequest(`/api/purchases/admin/${encodeURIComponent(order.id)}`, {
      method: 'DELETE',
    });
    setDeletingOrderId('');
    if (!result.ok) {
      setError(getAdminError(result, 'The order could not be cancelled.'));
      return;
    }
    setOrders((current) => current.filter((item) => item.id !== order.id));
    setPagination((current) => ({ ...current, total: Math.max(0, current.total - 1) }));
    if (orders.length === 1 && page > 1) {
      setLoading(true);
      setPage((current) => current - 1);
    }
  };

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
          setError(getAdminError(result, 'Purchase orders could not be loaded.'));
        } else {
          setError('');
          setOrders(result.data?.data || []);
          setPagination(result.data?.pagination || { page: 1, total: 0, totalPages: 0 });
        }
        setLoading(false);
      })
      .catch((requestError) => {
        console.error('Failed to load purchase orders:', requestError);
        if (active) {
          setError('Purchase orders could not be loaded.');
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
          <p className="rm-admin-meta">WORKSPACE / DIRECT PURCHASES</p>
          <h1 id="rm-admin-purchases-title">PURCHASE ORDERS</h1>
          <p className="rm-admin__welcome">Review payments and progress for directly purchased builds.</p>
        </div>
        <Link className="rm-admin__public-link" to="/admin/dashboard">
          Back to Dashboard
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>

      <section aria-label="Filter purchase orders" className="rm-admin-purchases__filters">
        <label>
          <span>Search orders or customers</span>
          <input onChange={(event) => { setLoading(true); setSearch(event.target.value); setPage(1); }} placeholder="Number, name, phone, build" type="search" value={search} />
        </label>
        <label>
          <span>Order status</span>
          <select onChange={(event) => { setLoading(true); setStatus(event.target.value); setPage(1); }} value={status}>
            <option value="">All statuses</option>
            <option value="pending_approval">Awaiting approval</option>
            <option value="waiting_shipping_quote">Awaiting shipping quote</option>
            <option value="pending_payment">Awaiting payment</option>
            <option value="waiting_verification">Awaiting verification</option>
            <option value="payment_rejected">Payment proof rejected</option>
            <option value="paid">Paid</option>
            <option value="processing">In progress</option>
            <option value="ready">Order delivery / ready for pickup</option>
            <option value="delivered">Order arrived at destination</option>
            <option value="rejected">Order rejected</option>
          </select>
        </label>
      </section>

      {error ? <p className="rm-admin-purchases__error" role="alert">{error}</p> : null}
      <section aria-label="Purchase order list" className="rm-admin-panel rm-admin-purchases">
        <div className="rm-admin-purchases__summary">
          <p className="rm-admin-meta">PURCHASE DATA / MANUAL TRANSFER</p>
          <p>{pagination.total} recorded orders</p>
        </div>
        {loading ? (
          <p aria-live="polite" className="rm-admin-purchases__state">Loading purchase orders...</p>
        ) : error ? (
          <p className="rm-admin-purchases__state">The list could not be displayed.</p>
        ) : orders.length ? (
          <>
            <div className="rm-admin-purchases__scroll" role="region" aria-label="Purchase orders table" tabIndex={0}>
              <table className="rm-admin-purchases__table">
                <thead><tr>
                  <th scope="col">Order number</th><th scope="col">Customer</th>
                  <th scope="col">Motorcycle / build</th><th scope="col">Price</th>
                  <th scope="col">Method</th><th scope="col">Status</th>
                  <th scope="col">Date</th><th scope="col">Actions</th>
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
                      <td className="rm-admin-purchases__actions">
                        <Link className="rm-admin-purchases__detail-link" to={`/admin/purchases/${encodeURIComponent(order.id)}`}>Details</Link>
                        <button
                          className="rm-admin-purchases__delete-button"
                          disabled={Boolean(deletingOrderId)}
                          onClick={() => void deleteOrder(order)}
                          type="button"
                        >
                          {deletingOrderId === order.id ? 'Cancelling...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="Purchase order pagination" className="rm-admin-purchases__pagination">
              <button disabled={page <= 1} onClick={() => { setLoading(true); setPage((current) => current - 1); }} type="button">Previous</button>
              <span>Page {pagination.page} / {Math.max(pagination.totalPages, 1)}</span>
              <button disabled={page >= pagination.totalPages} onClick={() => { setLoading(true); setPage((current) => current + 1); }} type="button">Next</button>
            </nav>
          </>
        ) : (
          <div className="rm-admin-purchases__empty">
            <h2>No orders yet.</h2>
            <p>Recorded direct purchase orders will appear here.</p>
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

  usePageTitle(order?.orderNumber ? `${order.orderNumber} — RUKA Order` : 'Order Details — RUKA Motorworks');

  const loadOrder = useCallback(async () => {
    const result = await adminRequest(`/api/purchases/admin/${encodeURIComponent(id)}`);
    if (!result.ok) {
      setError(getAdminError(result, 'Order details could not be loaded.'));
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
        if (!response.ok) throw new Error(`Payment proof could not be loaded (${response.status}).`);
        const imageUrl = URL.createObjectURL(await response.blob());
        setProofUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return imageUrl;
        });
      } catch (proofError) {
        console.error('Failed to load private payment proof:', proofError);
        setError(proofError.message || 'Payment proof could not be loaded.');
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
          setError(getAdminError(result, 'Order details could not be loaded.'));
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
            if (!response.ok) throw new Error(`Payment proof could not be loaded (${response.status}).`);
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
            console.error('Failed to load private payment proof:', proofError);
            if (active) setError(proofError.message || 'Payment proof could not be loaded.');
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
        console.error('Failed to load order details:', requestError);
        if (active) {
          setError('Order details could not be loaded.');
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

  const performAction = async (url, options, successMessage, redirectToList = false) => {
    setSaving(true);
    setError('');
    setNotice('');
    const result = await adminRequest(url, options);
    if (!result.ok) {
      setError(getAdminError(result, 'Order changes could not be saved.'));
      setSaving(false);
      return;
    }
    setNotice(successMessage);
    if (redirectToList) {
      setSaving(false);
      navigate('/admin/purchases');
      return;
    }
    await loadOrder();
    setSaving(false);
  };

  const shippingStatuses = order?.orderStatus === 'processing'
    ? order.shippingMethod === 'pickup'
      ? ['processing', 'ready_for_pickup', 'cancelled']
      : ['processing', 'ready_to_ship', 'cancelled']
    : order?.orderStatus === 'ready_to_ship'
      ? ['ready_to_ship', 'delivered']
      : order?.orderStatus === 'ready_for_pickup'
        ? ['ready_for_pickup']
        : order?.orderStatus === 'delivered'
          ? ['delivered']
          : [order?.orderStatus || ''];
  if (order?.canAdminComplete) shippingStatuses.push('completed');

  return (
    <AdminLayout active="purchases">
      <section aria-labelledby="rm-admin-purchase-detail-title" className="rm-admin__intro">
        <div>
          <p className="rm-admin-meta">WORKSPACE / PURCHASES / DETAILS</p>
          <h1 id="rm-admin-purchase-detail-title">ORDER DETAILS</h1>
          <p className="rm-admin__welcome">{order?.orderNumber || 'Review the order snapshot and status.'}</p>
        </div>
        <Link className="rm-admin__public-link" to="/admin/purchases">
          Back to Purchase Orders
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>
      {error ? <p className="rm-admin-purchases__error" role="alert">{error}</p> : null}
      {notice ? <p className="rm-admin-purchases__notice" role="status">{notice}</p> : null}
      {loading ? <p className="rm-admin-purchases__state">Loading order details...</p> : order ? (
        <>
          <section aria-label="Payment and build status" className="rm-admin-purchase-detail__status">
            <div><p className="rm-admin-meta">APPROVAL</p><p>{order.approvalStatus === 'approved' ? 'Approved' : order.approvalStatus === 'rejected' ? 'Rejected' : 'Awaiting decision'}</p></div>
            <div><p className="rm-admin-meta">PAYMENT</p><p>{order.paymentStatus}</p></div>
            <div><p className="rm-admin-meta">BUILD PROGRESS</p><p>{order.approvalStatus === 'pending_approval' ? 'Awaiting admin approval' : order.orderStatus}</p></div>
            {order.shippingMethod === 'delivery' && order.orderStatus === 'ready_to_ship' ? (
              <div><p className="rm-admin-meta">DELIVERY STATUS</p><p>
                Mark “Order arrived at destination” when the motorcycle reaches the customer. The three-day period starts at that time.
              </p></div>
            ) : null}
            {order.orderStatus === 'delivered' || (order.shippingMethod === 'pickup' && order.orderStatus === 'ready_for_pickup') ? (
              <div><p className="rm-admin-meta">CUSTOMER RECEIPT</p><p>
                {order.customerReceivedAt
                  ? `Confirmed ${formatDate(order.customerReceivedAt)}`
                  : order.canAdminComplete
                    ? 'Three-day waiting period passed; admin may complete this order.'
                    : `Awaiting customer confirmation. Admin completion is available three days after ${order.shippingMethod === 'delivery' ? 'arrival at the destination' : 'the order was ready'} (${formatDate(order.readyAt)}).`}
              </p></div>
            ) : null}
            {order.approvalRejectionReason ? <div><p className="rm-admin-meta">REJECTION REASON</p><p>{order.approvalRejectionReason}</p></div> : null}
            {order.approvalStatus === 'pending_approval' ? (
              <div className="rm-admin-purchase-detail__actions rm-admin-purchase-detail__approval">
                <button
                  disabled={saving || (order.shippingMethod === 'delivery' && order.shippingCost == null)}
                  onClick={() => void performAction(
                    `/api/purchases/admin/${encodeURIComponent(id)}/approval`,
                    { method: 'PATCH', body: JSON.stringify({ decision: 'approved' }) },
                    'Order approved. Payment instructions are available once the decision is saved.',
                  )}
                  type="button"
                >
                  Approve and enable payment
                </button>
                <label>Reason for rejection
                  <textarea maxLength={1000} minLength={10} onChange={(event) => setRejectionReason(event.target.value)} required rows={3} value={rejectionReason} />
                </label>
                <button
                  disabled={saving || rejectionReason.trim().length < 10}
                  onClick={() => void performAction(
                    `/api/purchases/admin/${encodeURIComponent(id)}/approval`,
                    { method: 'PATCH', body: JSON.stringify({ decision: 'rejected', reason: rejectionReason }) },
                    'Order rejected and reason saved.',
                  )}
                  type="button"
                >
                  Reject order
                </button>
              </div>
            ) : null}
            {order.paymentStatus === 'waiting_verification' ? (
              <div className="rm-admin-purchase-detail__actions">
                <button disabled={saving} onClick={() => void performAction(`/api/purchases/admin/${encodeURIComponent(id)}/payment-review`, { method: 'POST', body: JSON.stringify({ decision: 'paid' }) }, 'Payment confirmed and saved.')} type="button">Confirm payment received</button>
                <button disabled={saving} onClick={() => void performAction(`/api/purchases/admin/${encodeURIComponent(id)}/payment-review`, { method: 'POST', body: JSON.stringify({ decision: 'rejected' }) }, 'Payment proof rejected. The customer can upload a new one.')} type="button">Reject proof</button>
              </div>
            ) : null}
          </section>

          <div className="rm-admin-purchase-detail__grid">
            <section className="rm-admin-panel">
              <p className="rm-admin-meta">A / CUSTOMER IDENTITY</p><h2>CUSTOMER DETAILS</h2>
              <dl className="rm-admin-purchase-detail__fields">
                <div><dt>Name</dt><dd>{order.customerName}</dd></div>
                <div><dt>WhatsApp</dt><dd>{order.phone}</dd></div>
                <div><dt>Email</dt><dd>{order.email || 'Unavailable'}</dd></div>
                <div><dt>City</dt><dd>{order.city}</dd></div>
                <div><dt>Pickup / delivery</dt><dd>{order.shippingMethod === 'pickup' ? 'Pickup' : 'Delivery'}</dd></div>
                {order.shippingMethod === 'delivery' ? <div><dt>Address</dt><dd>{order.deliveryAddress}</dd></div> : null}
              </dl>
            </section>
            <section className="rm-admin-panel">
              <p className="rm-admin-meta">B / BUILD SNAPSHOT</p><h2>{order.buildName}</h2>
              {order.imageSnapshot ? <img alt={`Build snapshot for ${order.buildName}`} className="rm-admin-purchase-detail__product-image" src={order.imageSnapshot} /> : null}
              <dl className="rm-admin-purchase-detail__fields">
                <div><dt>Product</dt><dd>{order.productName}</dd></div>
                <div><dt>Motorcycle basis</dt><dd>{order.basis}</dd></div>
                <div><dt>Category</dt><dd>{order.categoryName}</dd></div>
                <div><dt>Fixed specifications</dt><dd>{JSON.parse(order.specifications || '[]').map(({ label, value }) => `${label}: ${value}`).join(' · ') || '—'}</dd></div>
                <div><dt>Price snapshot</dt><dd>{formatRupiah(order.price)}</dd></div>
                <div><dt>Shipping</dt><dd>{order.shippingCost == null ? 'Awaiting confirmation' : formatRupiah(order.shippingCost)}</dd></div>
                <div><dt>Total</dt><dd>{formatRupiah(order.totalAmount)}</dd></div>
                <div><dt>Payment method</dt><dd>{order.paymentMethod === 'gopay' ? 'GoPay' : 'SeaBank'}</dd></div>
                <div><dt>Order date</dt><dd>{formatDate(order.createdAt)}</dd></div>
              </dl>
            </section>
            {order.orderStatus === 'awaiting_shipping_quote' ? (
              <section className="rm-admin-panel rm-admin-purchase-detail__quote">
                <p className="rm-admin-meta">SHIPPING / ADMIN CONFIRMATION</p><h2>Confirm shipping cost</h2>
                <label>Shipping cost (Rupiah)
                  <input min="0" onChange={(event) => setShippingCost(event.target.value)} step="1" type="number" value={shippingCost} />
                </label>
                <p>Enter the shipping cost confirmed with the customer. The total and transfer instructions will be available once saved.</p>
                <button disabled={saving || !Number.isSafeInteger(Number(shippingCost)) || Number(shippingCost) < 0} onClick={() => void performAction(`/api/purchases/admin/${encodeURIComponent(id)}/shipping-quote`, { method: 'POST', body: JSON.stringify({ shippingCost: Number(shippingCost) }) }, 'Shipping cost saved.')} type="button">Save shipping cost</button>
              </section>
            ) : null}
            <section className="rm-admin-panel">
              <p className="rm-admin-meta">C / PRIVATE TRANSFER PROOF</p><h2>PAYMENT PROOF</h2>
              {proofUrl ? <a href={proofUrl} rel="noreferrer noopener" target="_blank"><img alt={`Payment proof for ${order.orderNumber}`} className="rm-admin-purchase-detail__proof" src={proofUrl} /></a> : <p className="rm-admin-purchases__state">No payment proof yet.</p>}
            </section>
            {order.paymentStatus === 'paid' ? (
              <section className="rm-admin-panel rm-admin-purchase-detail__status-form">
                <p className="rm-admin-meta">D / ORDER PROGRESS</p><h2>UPDATE BUILD PROGRESS</h2>
                <label>Build status
                  <select onChange={(event) => setNextStatus(event.target.value)} value={nextStatus}>
                    {shippingStatuses.map((status) => (
                      <option key={status} value={status}>
                        {{
                          ready_to_ship: 'Order delivery',
                          delivered: 'Order arrived at destination',
                        }[status] || status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={saving || nextStatus === order.orderStatus}
                  onClick={() => void performAction(
                    `/api/purchases/admin/${encodeURIComponent(id)}/status`,
                    { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) },
                    nextStatus === 'completed'
                      ? 'Order completed and removed from Purchase Orders.'
                      : 'Build status saved.',
                    nextStatus === 'completed',
                  )}
                  type="button"
                >
                  Save build status
                </button>
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
