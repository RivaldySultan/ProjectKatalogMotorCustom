import { useEffect, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import Icon from '../components/ui/Icon';
import Link from '../components/ui/Link';
import OrderChat from '../components/ui/OrderChat';
import { adminRequest, clearAdminSession, getAdminToken } from '../lib/adminAuth';
import { formatRupiah } from '../lib/products';
import { navigate } from '../lib/router';
import { usePageTitle } from '../lib/usePageTitle';
import { getWhatsAppLink, WHATSAPP_MESSAGE } from '../lib/whatsapp';
import './AdminOrdersPage.css';

const PAGE_SIZE = 10;

function formatRequestDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getBuildName(request) {
  return request.buildName
    || request.buildInterest
    || request.productName
    || request.basis
    || 'Build not specified';
}

function getReferenceMotor(consultation) {
  if (consultation.referenceMotorSelected === 1) {
    if (!consultation.referenceMotorId && !consultation.referenceMotorName) return null;
    return {
      name: consultation.referenceMotorBuildName
        || consultation.referenceMotorName
        || 'Reference motorcycle',
      basis: consultation.referenceMotorBasis || '',
      image: consultation.referenceMotorImage || '',
    };
  }

  if (consultation.productId || consultation.productName) {
    return {
      name: getBuildName(consultation),
      basis: consultation.basis || '',
      image: '',
    };
  }

  return null;
}

function getAdminError(result, fallback) {
  if (result.unauthorized) {
    clearAdminSession();
    navigate('/admin/login#session-expired');
    return '';
  }
  return result.message || fallback;
}

function OrdersListPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [productId, setProductId] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loadedQuery, setLoadedQuery] = useState('');
  const [loadResult, setLoadResult] = useState({ query: '', error: '' });

  usePageTitle('Consultation Requests — RUKA Motorworks');

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      name: name.trim(),
      phone: phone.trim(),
      productId,
      sort,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    const query = params.toString();

    adminRequest(`/api/consultations?${query}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setLoadResult({
            query,
            error: getAdminError(result, 'Consultation requests could not be loaded.'),
          });
          return;
        }
        setOrders(result.data.data);
        setProducts(result.data.products);
        setPagination(result.data.pagination);
        setLoadResult({ query, error: '' });
      })
      .catch((requestError) => {
        console.error('Failed to load consultation requests:', requestError);
        if (active) setLoadResult({ query, error: 'Consultation requests could not be loaded.' });
      })
      .finally(() => {
        if (active) setLoadedQuery(query);
      });

    return () => {
      active = false;
    };
  }, [name, phone, productId, sort, page]);

  const handleFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  const isLoading = loadedQuery !== new URLSearchParams({
    name: name.trim(),
    phone: phone.trim(),
    productId,
    sort,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  }).toString();
  const error = loadResult.query === loadedQuery ? loadResult.error : '';

  return (
    <AdminLayout active="orders">
      <section aria-labelledby="rm-admin-orders-title" className="rm-admin__intro">
        <div>
          <p className="rm-admin-meta">WORKSPACE / CONSULTATIONS</p>
          <h1 id="rm-admin-orders-title">CONSULTATION REQUESTS</h1>
          <p className="rm-admin__welcome">
            Manage build consultation requests submitted by customers.
          </p>
        </div>
        <Link className="rm-admin__public-link" to="/admin/dashboard">
          Back to Dashboard
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>

      <section aria-label="Filter consultation requests" className="rm-admin-orders__filters">
        <label>
          <span>Customer name</span>
          <input
            autoComplete="off"
            onChange={handleFilterChange(setName)}
            placeholder="Search names..."
            type="search"
            value={name}
          />
        </label>
        <label>
          <span>WhatsApp number</span>
          <input
            autoComplete="off"
            onChange={handleFilterChange(setPhone)}
            placeholder="Search numbers..."
            type="search"
            value={phone}
          />
        </label>
        <label>
          <span>Motorcycle or build</span>
          <select onChange={handleFilterChange(setProductId)} value={productId}>
            <option value="">All builds</option>
            {products.map((product) => (
              <option key={`${product.id}-${product.name}`} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort by date</span>
          <select onChange={handleFilterChange(setSort)} value={sort}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
      </section>

      {error ? <p className="rm-admin-orders__error" role="alert">{error}</p> : null}

      <section aria-label="Consultation request list" className="rm-admin-panel rm-admin-orders">
        <div className="rm-admin-orders__summary">
          <p className="rm-admin-meta">RECORDED REQUESTS</p>
          <p aria-live="polite">{pagination.total} requests</p>
        </div>
        {isLoading ? (
          <p aria-live="polite" className="rm-admin-orders__state">Loading consultation requests...</p>
        ) : error ? (
          <p className="rm-admin-orders__state">Request data could not be displayed.</p>
        ) : orders.length ? (
          <>
            <div className="rm-admin-orders__scroll" role="region" aria-label="Consultation request table" tabIndex={0}>
              <table className="rm-admin-orders__table">
                <thead>
                  <tr>
                    <th scope="col">Customer name</th>
                    <th scope="col">WhatsApp number</th>
                    <th scope="col">Motorcycle / build</th>
                    <th scope="col">City</th>
                    <th scope="col">Budget range</th>
                    <th scope="col">Request date</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <th scope="row">{order.customerName || 'Name unavailable'}</th>
                      <td>{order.phone || '—'}</td>
                      <td>
                        <span>{getBuildName(order)}</span>
                        {order.basis ? <small>{order.basis}</small> : null}
                      </td>
                      <td>{order.city || '—'}</td>
                      <td>{order.budgetRange || '—'}</td>
                      <td>{formatRequestDate(order.createdAt)}</td>
                      <td>
                        <Link
                          aria-label={`Consultation details for ${order.customerName || 'customer'}`}
                          className="rm-admin-orders__detail-link"
                          to={`/admin/orders/${encodeURIComponent(order.id)}`}
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="Consultation request pagination" className="rm-admin-orders__pagination">
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Previous
              </button>
              <span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Next
              </button>
            </nav>
          </>
        ) : (
          <div className="rm-admin-empty">
            <span aria-hidden="true" className="rm-admin-empty__mark">/</span>
            <h2>{name || phone || productId ? 'No matching requests.' : 'No requests yet.'}</h2>
            <p>
              {name || phone || productId
                ? 'Change your search or motorcycle filter to see other requests.'
                : 'Recorded requests will appear here. There is no sales activity to summarize yet.'}
            </p>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

function ConsultationDetailPage({ id }) {
  const [consultation, setConsultation] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [loadedId, setLoadedId] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [loadResult, setLoadResult] = useState({ id: '', error: '' });
  const [photoError, setPhotoError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  usePageTitle('Consultation Details — RUKA Motorworks');

  useEffect(() => {
    let active = true;
    adminRequest(`/api/consultations/${encodeURIComponent(id)}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setLoadResult({
            id,
            error: getAdminError(result, 'Consultation details could not be loaded.'),
          });
          return;
        }
        setConsultation(result.data);
        setSelectedStatus(result.data.status || '');
        setLoadResult({ id, error: '' });
      })
      .catch((requestError) => {
        console.error('Failed to load consultation details:', requestError);
        if (active) setLoadResult({ id, error: 'Consultation details could not be loaded.' });
      })
      .finally(() => {
        if (active) setLoadedId(id);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const isLoading = loadedId !== id;
  const error = loadResult.id === id ? loadResult.error : '';

  const photoPaths = consultation?.photos?.join('|') || '';
  useEffect(() => {
    let active = true;
    const objectUrls = [];

    const loadPhotos = async () => {
      if (!photoPaths) {
        setPhotos([]);
        setPhotoError('');
        return;
      }

      setPhotos([]);
      setPhotoError('');
      const token = getAdminToken();
      try {
        const loaded = await Promise.all(photoPaths.split('|').map(async (url) => {
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.status === 401 || response.status === 403) {
            clearAdminSession();
            navigate('/admin/login#session-expired');
            throw new Error('Your admin session has expired.');
          }
          if (!response.ok) throw new Error('Reference photos could not be loaded.');
          const objectUrl = URL.createObjectURL(await response.blob());
          objectUrls.push(objectUrl);
          return objectUrl;
        }));
        if (active) setPhotos(loaded);
      } catch (requestError) {
        console.error('Failed to load consultation photos:', requestError);
        if (active) setPhotoError(requestError.message || 'Reference photos could not be loaded.');
      }
    };

    void loadPhotos();
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPaths]);

  const handleStatusSave = async () => {
    setIsSavingStatus(true);
    setStatusMessage('');
    const result = await adminRequest(`/api/consultations/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: selectedStatus }),
    });
    if (!result.ok) {
      setLoadResult({
        id,
        error: getAdminError(result, 'Consultation status could not be updated.'),
      });
    } else {
      setConsultation(result.data);
      setSelectedStatus(result.data.status);
      setStatusMessage(result.message || 'Consultation status updated.');
      setLoadResult({ id, error: '' });
    }
    setIsSavingStatus(false);
  };

  const whatsappUrl = getWhatsAppLink(WHATSAPP_MESSAGE);
  const referenceMotor = consultation ? getReferenceMotor(consultation) : null;

  return (
    <AdminLayout active="orders">
      <section aria-labelledby="rm-admin-detail-title" className="rm-admin__intro">
        <div>
          <p className="rm-admin-meta">WORKSPACE / CONSULTATIONS / DETAILS</p>
          <h1 id="rm-admin-detail-title">CONSULTATION DETAILS</h1>
          <p className="rm-admin__welcome">Review the build request and customer details.</p>
        </div>
        <Link className="rm-admin__public-link" to="/admin/orders">
          Back to Requests
          <Icon name="arrow-up-right" size={16} />
        </Link>
      </section>

      {error ? <p className="rm-admin-orders__error" role="alert">{error}</p> : null}
      {isLoading ? (
        <p aria-live="polite" className="rm-admin-orders__state">Loading consultation details...</p>
      ) : consultation ? (
        <>
          <section aria-label="Consultation status" className="rm-admin-order-detail__status">
            <div>
              <p className="rm-admin-meta">REQUEST STATUS</p>
              <p className="rm-admin-order-detail__current-status">{consultation.status || '—'}</p>
            </div>
            <label>
              <span>Update status</span>
              <select
                disabled={!consultation.statusOptions?.length || isSavingStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                value={selectedStatus}
              >
                {consultation.statusOptions?.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <button
              className="rm-admin-orders__button"
              disabled={
                isSavingStatus
                || !selectedStatus
                || selectedStatus === consultation.status
                || !consultation.statusOptions?.length
              }
              onClick={handleStatusSave}
              type="button"
            >
              {isSavingStatus ? 'Saving...' : 'Save status'}
            </button>
            <p className="rm-admin-order-detail__status-note">
              Only statuses already saved in the database are available; no new statuses or workflows are added.
            </p>
            {statusMessage ? <p className="rm-admin-order-detail__notice" role="status">{statusMessage}</p> : null}
          </section>

          <div className="rm-admin-order-detail__grid">
            <section aria-labelledby="rm-admin-customer-title" className="rm-admin-panel">
              <p className="rm-admin-meta">A / CUSTOMER IDENTITY</p>
              <h2 id="rm-admin-customer-title">CUSTOMER DETAILS</h2>
              <dl className="rm-admin-order-detail__fields">
                <div><dt>Full name</dt><dd>{consultation.customerName || '—'}</dd></div>
                <div><dt>WhatsApp number</dt><dd>{consultation.phone || '—'}</dd></div>
                <div><dt>Email</dt><dd>{consultation.email || 'Unavailable'}</dd></div>
                <div><dt>City</dt><dd>{consultation.city || '—'}</dd></div>
              </dl>
              <a
                className="rm-admin-orders__whatsapp"
                href={whatsappUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                WhatsApp Ruka Motorworks
                <Icon name="arrow-up-right" size={16} />
              </a>
            </section>

            <section aria-labelledby="rm-admin-build-title" className="rm-admin-panel">
              <p className="rm-admin-meta">B / BUILD REFERENCE</p>
              <h2 id="rm-admin-build-title">MOTORCYCLE OF INTEREST</h2>
              <dl className="rm-admin-order-detail__fields">
                <div><dt>Product / build name</dt><dd>{getBuildName(consultation)}</dd></div>
                <div>
                  <dt>Consultation reference motorcycle</dt>
                  <dd>
                    {referenceMotor
                      ? referenceMotor.name
                      : 'Not selected / start with a consultation'}
                  </dd>
                </div>
                <div>
                  <dt>Reference motorcycle basis</dt>
                  <dd>{referenceMotor?.basis || 'Unavailable'}</dd>
                </div>
                <div><dt>Motorcycle basis</dt><dd>{consultation.basis || 'Unavailable'}</dd></div>
                <div><dt>Custom category</dt><dd>{consultation.categoryName || 'Unavailable'}</dd></div>
                <div>
                  <dt>Catalog price at request</dt>
                  <dd>{consultation.price == null ? 'Unavailable' : formatRupiah(consultation.price)}</dd>
                </div>
              </dl>
              {referenceMotor?.image ? (
                <div className="rm-admin-order-detail__reference">
                  <img
                    alt={`Reference photo of ${referenceMotor.name}`}
                    loading="lazy"
                    src={referenceMotor.image}
                  />
                  <span>Catalog snapshot when request was submitted</span>
                </div>
              ) : null}
            </section>

            <section aria-labelledby="rm-admin-requirements-title" className="rm-admin-panel">
              <p className="rm-admin-meta">C / CONSULTATION REQUIREMENTS</p>
              <h2 id="rm-admin-requirements-title">BUILD STORY</h2>
              <dl className="rm-admin-order-detail__fields">
                <div><dt>Donor motorcycle</dt><dd>{consultation.donorMotor || '—'}</dd></div>
                <div><dt>Budget range</dt><dd>{consultation.budgetRange || '—'}</dd></div>
                <div><dt>Request date</dt><dd>{formatRequestDate(consultation.createdAt)}</dd></div>
              </dl>
              <p className="rm-admin-order-detail__requirements">{consultation.requirements || 'No requirements provided.'}</p>
            </section>

            <section aria-labelledby="rm-admin-photos-title" className="rm-admin-panel">
              <p className="rm-admin-meta">D / REFERENCE PHOTOS</p>
              <h2 id="rm-admin-photos-title">DONOR / REFERENCE PHOTOS</h2>
              {photoError ? (
                <p className="rm-admin-order-detail__note" role="alert">{photoError}</p>
              ) : consultation.photos.length ? photos.length ? (
                <div className="rm-admin-order-detail__photos">
                  {photos.map((photo, index) => (
                    <a
                      aria-label={`Open reference photo preview ${index + 1}`}
                      href={photo}
                      key={photo}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <img alt={`Consultation reference photo ${index + 1}`} loading="lazy" src={photo} />
                      <span>Preview {index + 1}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p aria-live="polite" className="rm-admin-order-detail__note">Loading reference photos...</p>
              ) : (
                <p className="rm-admin-order-detail__note">No photos uploaded.</p>
              )}
            </section>
          </div>
          <section aria-label="Consultation chat" className="rm-admin-panel">
            <OrderChat conversationType="consultation" orderId={consultation.id} viewer="admin" />
          </section>
        </>
      ) : null}
    </AdminLayout>
  );
}

export default function AdminOrdersPage({ route }) {
  return route.mode === 'detail'
    ? <ConsultationDetailPage id={route.id} />
    : <OrdersListPage />;
}
