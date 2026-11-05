import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';
import Link from '../ui/Link';
import Logo from '../ui/Logo';
import { clearAdminSession, useAdminSession } from '../../lib/adminAuth';
import { navigate } from '../../lib/router';
import '../../pages/AdminDashboardPage.css';

const navigation = [
  { id: 'dashboard', index: '01', label: 'Dashboard', to: '/admin/dashboard' },
  { id: 'catalog', index: '02', label: 'Catalog', to: '/admin/catalog' },
  { id: 'purchases', index: '03', label: 'Purchase Orders', to: '/admin/purchases' },
  { id: 'orders', index: '04', label: 'Consultation Requests', to: '/admin/orders' },
  { id: 'public', index: '05', label: 'View Public Website', to: '/' },
];

export default function AdminLayout({ active, children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const adminSession = useAdminSession();
  const admin = adminSession.status === 'authenticated' ? adminSession.user : null;

  useEffect(() => {
    if (adminSession.status === 'unauthenticated') {
      navigate('/admin/login');
    }
  }, [adminSession.status]);

  const handleLogout = () => {
    clearAdminSession();
    navigate('/');
  };

  if (adminSession.status !== 'authenticated') {
    return (
      <div className="rm-admin">
        <main className="rm-admin__session-state" id="main-content">
          <p aria-live="polite" role="status">
            {adminSession.status === 'checking' || adminSession.status === 'unknown'
              ? 'Checking admin session...'
              : adminSession.status === 'unavailable'
                ? 'The admin session could not be verified. Reload the page to try again.'
                : 'Redirecting to the admin login page...'}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="rm-admin">
      <button
        aria-label={isMenuOpen ? 'Close admin navigation' : 'Open admin navigation'}
        aria-expanded={isMenuOpen}
        className="rm-admin__mobile-toggle"
        onClick={() => setIsMenuOpen((open) => !open)}
        type="button"
      >
        <span aria-hidden="true">{isMenuOpen ? '×' : '☰'}</span>
        <span>{isMenuOpen ? 'Close menu' : 'Menu'}</span>
      </button>
      {isMenuOpen ? (
        <button
          aria-label="Close navigation menu"
          className="rm-admin__scrim"
          onClick={() => setIsMenuOpen(false)}
          type="button"
        />
      ) : null}

      <aside className={`rm-admin__sidebar${isMenuOpen ? ' is-open' : ''}`}>
        <div className="rm-admin__sidebar-brand">
          <Logo href="/admin/dashboard" />
          <span className="rm-admin__workspace">WORKSPACE</span>
        </div>

        <nav aria-label="Admin navigation" className="rm-admin__navigation">
          {navigation.map((item) => (
            <Link
              aria-current={active === item.id ? 'page' : undefined}
              className={active === item.id ? 'is-active' : undefined}
              key={item.id}
              onClick={() => setIsMenuOpen(false)}
              to={item.to}
            >
              <span className="rm-admin__nav-index">{item.index}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="rm-admin__sidebar-footer">
          {admin?.name ? <p>{admin.name}</p> : null}
          <button onClick={handleLogout} type="button">
            <span className="rm-admin__nav-index">
              <Icon name="arrow-up-right" size={14} />
            </span>
            Logout
          </button>
        </div>
      </aside>

      <main className="rm-admin__main" id="main-content" tabIndex={-1}>
        <header className="rm-admin__header">
          <p>RUKA MOTORWORKS <span>/</span> WORKSPACE</p>
          <span>ADMINISTRATOR</span>
        </header>
        <div className="rm-admin__content">
          {children}
          <footer className="rm-admin__footer">
            <span>OLD MACHINES. NEW PERSPECTIVES.</span>
            <span>© 2026 RUKA MOTORWORKS / ADMIN WORKSPACE</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
