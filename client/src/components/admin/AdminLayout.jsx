import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';
import Link from '../ui/Link';
import Logo from '../ui/Logo';
import { clearAdminSession, useAdminSession } from '../../lib/adminAuth';
import { navigate } from '../../lib/router';
import '../../pages/AdminDashboardPage.css';

const navigation = [
  { id: 'dashboard', index: '01', label: 'Dashboard', to: '/admin/dashboard' },
  { id: 'catalog', index: '02', label: 'Katalog', to: '/admin/catalog' },
  { id: 'purchases', index: '03', label: 'Pesanan Pembelian', to: '/admin/purchases' },
  { id: 'orders', index: '04', label: 'Permintaan Konsultasi', to: '/admin/orders' },
  { id: 'public', index: '05', label: 'Lihat Website Publik', to: '/' },
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
              ? 'Memeriksa sesi admin...'
              : adminSession.status === 'unavailable'
                ? 'Sesi admin belum dapat diverifikasi. Muat ulang halaman untuk mencoba kembali.'
                : 'Mengalihkan ke halaman login admin...'}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="rm-admin">
      <button
        aria-label={isMenuOpen ? 'Tutup navigasi admin' : 'Buka navigasi admin'}
        aria-expanded={isMenuOpen}
        className="rm-admin__mobile-toggle"
        onClick={() => setIsMenuOpen((open) => !open)}
        type="button"
      >
        <span aria-hidden="true">{isMenuOpen ? '×' : '☰'}</span>
        <span>{isMenuOpen ? 'Tutup menu' : 'Menu'}</span>
      </button>
      {isMenuOpen ? (
        <button
          aria-label="Tutup menu navigasi"
          className="rm-admin__scrim"
          onClick={() => setIsMenuOpen(false)}
          type="button"
        />
      ) : null}

      <aside className={`rm-admin__sidebar${isMenuOpen ? ' is-open' : ''}`}>
        <div className="rm-admin__sidebar-brand">
          <Logo href="/admin/dashboard" />
          <span className="rm-admin__workspace">RUANG KERJA</span>
        </div>

        <nav aria-label="Navigasi admin" className="rm-admin__navigation">
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
          <p>RUKA MOTORWORKS <span>/</span> RUANG KERJA</p>
          <span>ADMINISTRATOR</span>
        </header>
        <div className="rm-admin__content">
          {children}
          <footer className="rm-admin__footer">
            <span>MESIN LAMA. SUDUT PANDANG BARU.</span>
            <span>© 2026 RUKA MOTORWORKS / RUANG ADMIN</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
