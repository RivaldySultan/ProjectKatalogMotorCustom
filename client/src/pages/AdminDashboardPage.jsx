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
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getRequestBuild(request) {
  return [
    request.buildName || request.buildInterest,
    request.productName || request.basis || request.donorMotor,
  ].filter(Boolean).join(' / ') || 'Build not specified';
}

function isCompletedConsultation(request) {
  return String(request.status || '').trim().toLowerCase() === 'completed';
}

function getConsultationStatusLabel(status) {
  if (!status) return 'Recorded';
  return String(status).trim().toLowerCase() === 'completed' ? 'Completed' : status;
}

function getPurchaseStatusLabel(status) {
  const labels = {
    pending_approval: 'Awaiting approval',
    waiting_shipping_quote: 'Awaiting shipping quote',
    pending_payment: 'Awaiting payment',
    waiting_verification: 'Awaiting verification',
    payment_rejected: 'Proof rejected',
    paid: 'Paid',
    processing: 'In progress',
    ready: 'Ready for pickup / shipping',
    completed: 'Completed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchaseActionError, setPurchaseActionError] = useState('');
  const [deletingPurchaseId, setDeletingPurchaseId] = useState('');
  const [isDeletingAllPurchases, setIsDeletingAllPurchases] = useState(false);
  const [consultationActionError, setConsultationActionError] = useState('');
  const [activeConsultationActionId, setActiveConsultationActionId] = useState('');
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
        console.error('Failed to load dashboard summary:', requestError);
        setError('The dashboard summary could not be loaded.');
        setIsLoading(false);
      });
  };

  const handleRetry = () => {
    setIsLoading(true);
    setError('');
    loadSummary();
  };

  const refreshSummary = () => {
    setIsLoading(true);
    setError('');
    loadSummary();
  };

  const updateConsultationStatus = async (request, status) => {
    if (activeConsultationActionId) return;
    if (status === 'completed' && !window.confirm(`Mark ${request.customerName || 'this consultation request'} as completed?`)) return;
    setActiveConsultationActionId(request.id);
    setConsultationActionError('');
    try {
      const result = await adminRequest(`/api/consultations/${encodeURIComponent(request.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!result.ok) {
        if (result.unauthorized) {
          clearAdminSession();
          navigate('/admin/login#session-expired');
          return;
        }
        setConsultationActionError(result.message || 'The consultation status could not be updated.');
        return;
      }
      refreshSummary();
    } catch (requestError) {
      console.error('Failed to update consultation status from the dashboard:', requestError);
      setConsultationActionError('The consultation status could not be updated.');
    } finally {
      setActiveConsultationActionId('');
    }
  };

  const deleteCompletedConsultation = async (request) => {
    if (activeConsultationActionId || !isCompletedConsultation(request)) return;
    if (!window.confirm(`Delete the completed consultation request from ${request.customerName || 'this customer'}?`)) return;
    setActiveConsultationActionId(request.id);
    setConsultationActionError('');
    try {
      const result = await adminRequest(`/api/consultations/${encodeURIComponent(request.id)}`, {
        method: 'DELETE',
      });
      if (!result.ok) {
        if (result.unauthorized) {
          clearAdminSession();
          navigate('/admin/login#session-expired');
          return;
        }
        setConsultationActionError(result.message || 'The completed consultation request could not be deleted.');
        return;
      }
      refreshSummary();
    } catch (requestError) {
      console.error('Failed to delete completed consultation from the dashboard:', requestError);
      setConsultationActionError('The completed consultation request could not be deleted.');
    } finally {
      setActiveConsultationActionId('');
    }
  };

  const deletePurchaseOrder = async (purchase) => {
    if (deletingPurchaseId || isDeletingAllPurchases) return;
    if (!window.confirm(`Cancel order ${purchase.orderNumber} and remove it from admin purchase history? It will remain in the customer's account as cancelled.`)) return;
    setDeletingPurchaseId(purchase.id);
    setPurchaseActionError('');
    try {
      const result = await adminRequest(`/api/purchases/admin/${encodeURIComponent(purchase.id)}`, {
        method: 'DELETE',
      });
      if (!result.ok) {
        if (result.unauthorized) {
          clearAdminSession();
          navigate('/admin/login#session-expired');
          return;
        }
        setPurchaseActionError(result.message || 'The purchase order could not be cancelled.');
        return;
      }
      refreshSummary();
    } catch (requestError) {
      console.error('Failed to cancel purchase order from the dashboard:', requestError);
      setPurchaseActionError('The purchase order could not be cancelled.');
    } finally {
      setDeletingPurchaseId('');
    }
  };

  const deleteAllPurchaseOrders = async () => {
    if (deletingPurchaseId || isDeletingAllPurchases) return;
    if (!window.confirm('Cancel and remove all purchase order history from admin views? Every affected order will remain in the customer account as cancelled.')) return;
    setIsDeletingAllPurchases(true);
    setPurchaseActionError('');
    try {
      const result = await adminRequest('/api/purchases/admin', { method: 'DELETE' });
      if (!result.ok) {
        if (result.unauthorized) {
          clearAdminSession();
          navigate('/admin/login#session-expired');
          return;
        }
        setPurchaseActionError(result.message || 'Purchase order history could not be cancelled.');
        return;
      }
      refreshSummary();
    } catch (requestError) {
      console.error('Failed to cancel all purchase order history from the dashboard:', requestError);
      setPurchaseActionError('Purchase order history could not be cancelled.');
    } finally {
      setIsDeletingAllPurchases(false);
    }
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
    { label: 'Motorcycles in catalog', value: summary ? products.length : '—', index: '01' },
    { label: 'Style categories', value: summary?.categories ?? '—', index: '02' },
    { label: 'Consultation requests', value: summary?.consultations ?? '—', index: '03' },
    { label: 'Purchase orders', value: summary?.purchaseOrders ?? '—', index: '04' },
  ];

  return (
    <AdminLayout active="dashboard">
          <section aria-labelledby="rm-admin-title" className="rm-admin__intro">
            <div>
              <p className="rm-admin-meta">WORKSPACE / OVERVIEW</p>
              <h1 id="rm-admin-title">DASHBOARD</h1>
              <p className="rm-admin__welcome">
                Welcome, {admin?.name || 'Ruka Admin'}. All builds, in one place.
              </p>
            </div>
            <Link className="rm-admin__public-link" to="/">
              View Public Website
              <Icon name="arrow-up-right" size={16} />
            </Link>
          </section>

          {error ? (
            <div className="rm-admin__error" role="alert">
              <p>{error}</p>
              <button onClick={handleRetry} type="button">Try again</button>
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
                    ? 'Builds saved in the public catalog'
                    : stat.index === '02'
                      ? 'Available categories'
                      : stat.index === '03'
                        ? 'Saved build consultation requests'
                        : 'Saved direct purchase orders'}
                </p>
              </article>
            ))}
          </section>

          <section aria-labelledby="rm-admin-orders-title" className="rm-admin-panel" id="pesanan">
            <div className="rm-admin-panel__heading">
              <div>
                <p className="rm-admin-meta">ACTIVITY / CONSULTATIONS</p>
                <h2 id="rm-admin-orders-title">LATEST REQUESTS</h2>
                <p>Recorded build consultation requests — not transactions or payments.</p>
              </div>
              <Link className="rm-admin-panel__action" to="/admin/orders">
                View Consultation Requests
                <Icon name="arrow-up-right" size={16} />
              </Link>
            </div>

            {isLoading ? (
              <div aria-live="polite" className="rm-admin-orders-state">
                Loading consultation requests...
              </div>
            ) : error ? (
              <p className="rm-admin-orders-state">Consultation request data could not be displayed.</p>
            ) : latestConsultations.length ? (
              <>
                {consultationActionError ? <p className="rm-admin-purchase-action-error" role="alert">{consultationActionError}</p> : null}
                <div className="rm-admin-orders">
                  {latestConsultations.map((request) => {
                    const isCompleted = isCompletedConsultation(request);
                    return (
                      <article className="rm-admin-order" key={request.id}>
                        <div className="rm-admin-order__customer">
                          <p className="rm-admin-meta">CUSTOMER NAME</p>
                          <h3>{request.customerName || 'Name unavailable'}</h3>
                        </div>
                        <div className="rm-admin-order__build">
                          <p className="rm-admin-meta">BUILD REFERENCE</p>
                          <p>{getRequestBuild(request)}</p>
                        </div>
                        <div className="rm-admin-order__date">
                          <p className="rm-admin-meta">REQUEST DATE</p>
                          <p>{formatRequestDate(request.createdAt)}</p>
                        </div>
                        <span className="rm-admin-order__status">
                          {getConsultationStatusLabel(request.status)}
                        </span>
                        <div className="rm-admin-order__actions">
                          <Link
                            aria-label={`Consultation details for ${request.customerName || 'customer'}`}
                            className="rm-admin-order__detail"
                            to={`/admin/orders/${encodeURIComponent(request.id)}`}
                          >
                            Details
                          </Link>
                          {isCompleted ? (
                            <button
                              className="rm-admin-order__delete"
                              disabled={Boolean(activeConsultationActionId)}
                              onClick={() => void deleteCompletedConsultation(request)}
                              type="button"
                            >
                              {activeConsultationActionId === request.id ? 'Deleting...' : 'Delete'}
                            </button>
                          ) : (
                            <button
                              className="rm-admin-consultation__complete"
                              disabled={Boolean(activeConsultationActionId)}
                              onClick={() => void updateConsultationStatus(request, 'completed')}
                              type="button"
                            >
                              {activeConsultationActionId === request.id ? 'Saving...' : 'Mark Completed'}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rm-admin-empty">
                <span aria-hidden="true" className="rm-admin-empty__mark">/</span>
                <h3>No requests yet.</h3>
                <p>
                  Recorded requests will appear here. There is no sales activity
                  to summarize yet.
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="rm-admin-purchases-title" className="rm-admin-panel">
            <div className="rm-admin-panel__heading">
              <div>
                <p className="rm-admin-meta">PURCHASES / MANUAL TRANSFER</p>
                <h2 id="rm-admin-purchases-title">LATEST PURCHASE ORDERS</h2>
                <p>Direct purchase transactions, separate from consultation requests.</p>
              </div>
              <div className="rm-admin-purchases__heading-actions">
                <button
                  className="rm-admin-purchases__delete-all"
                  disabled={!summary?.purchaseOrders || isLoading || Boolean(deletingPurchaseId) || isDeletingAllPurchases}
                  onClick={() => void deleteAllPurchaseOrders()}
                  type="button"
                >
                  {isDeletingAllPurchases ? 'Deleting history...' : 'Delete All History'}
                </button>
                <Link className="rm-admin-panel__action" to="/admin/purchases">
                  View Purchase Orders
                  <Icon name="arrow-up-right" size={16} />
                </Link>
              </div>
            </div>
            {purchaseActionError ? <p className="rm-admin-purchase-action-error" role="alert">{purchaseActionError}</p> : null}
            {isLoading ? (
              <div aria-live="polite" className="rm-admin-orders-state">Loading purchase orders...</div>
            ) : error ? (
              <p className="rm-admin-orders-state">Purchase order data could not be displayed.</p>
            ) : summary?.latestPurchaseOrders?.length ? (
              <div className="rm-admin-orders">
                {summary.latestPurchaseOrders.map((purchase) => (
                  <article className="rm-admin-order" key={purchase.id}>
                    <div className="rm-admin-order__customer">
                      <p className="rm-admin-meta">ORDER NUMBER</p>
                      <h3>{purchase.orderNumber}</h3>
                    </div>
                    <div className="rm-admin-order__build">
                      <p className="rm-admin-meta">CUSTOMER / BUILD</p>
                      <p>{purchase.customerName} / {purchase.productName}</p>
                    </div>
                    <div className="rm-admin-order__date">
                      <p className="rm-admin-meta">DATE</p>
                      <p>{formatRequestDate(purchase.createdAt)}</p>
                    </div>
                    <span className="rm-admin-order__status">{getPurchaseStatusLabel(purchase.status)}</span>
                    <div className="rm-admin-order__actions">
                      <Link
                        aria-label={`Order details for ${purchase.orderNumber}`}
                        className="rm-admin-order__detail"
                        to={`/admin/purchases/${encodeURIComponent(purchase.id)}`}
                      >
                        Details
                      </Link>
                      <button
                        className="rm-admin-order__delete"
                        disabled={isLoading || Boolean(deletingPurchaseId) || isDeletingAllPurchases}
                        onClick={() => void deletePurchaseOrder(purchase)}
                        type="button"
                      >
                        {deletingPurchaseId === purchase.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rm-admin-empty">
                <span aria-hidden="true" className="rm-admin-empty__mark">/</span>
                <h3>No orders yet.</h3>
                <p>Recorded purchase orders will appear here.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="rm-admin-builds-title" className="rm-admin-panel rm-admin-builds">
            <div className="rm-admin-panel__heading">
              <div>
                <p className="rm-admin-meta">CATALOG / INVENTORY</p>
                <h2 id="rm-admin-builds-title">MANAGE BUILDS</h2>
                <p>
                  {isLoading
                    ? 'Loading catalog...'
                    : `${products.length} motorcycles currently shown in the public catalog.`}
                </p>
              </div>
              <div className="rm-admin-builds__actions">
                <Link className="rm-admin-button rm-admin-button--outline" to="/admin/catalog/new">
                  <span aria-hidden="true">+</span>
                  Add Motorcycle
                </Link>
                <Link className="rm-admin-button rm-admin-button--outline" to="/admin/catalog">
                  Manage Catalog
                  <Icon name="arrow-up-right" size={15} />
                </Link>
              </div>
            </div>

            {isLoading ? (
              <div aria-live="polite" className="rm-admin-orders-state">
                Loading catalog data...
              </div>
            ) : error ? (
              <p className="rm-admin-orders-state">Catalog data could not be displayed.</p>
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
                        <p>{buildName || 'Custom build'}</p>
                      </div>
                      <p className="rm-admin-product__price">{formatRupiah(product.price)}</p>
                      <span className="rm-admin-product__status">
                        {product.stockStatus === 'Tersedia' ? 'Available' : product.stockStatus === 'Habis' ? 'Out of stock' : product.stockStatus || 'Saved'}
                      </span>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rm-admin-empty rm-admin-empty--compact">
                <h3>No motorcycles in the catalog yet.</h3>
                <p>Saved motorcycles will appear here.</p>
              </div>
            )}
          </section>

    </AdminLayout>
  );
}
