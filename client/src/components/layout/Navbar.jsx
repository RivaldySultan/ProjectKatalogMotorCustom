import { useEffect, useRef, useState } from 'react';
import { useRoute } from '../../lib/router';
import { clearAdminSession, useAdminSession } from '../../lib/adminAuth';
import { logoutCustomer, useCustomerSession } from '../../lib/customerAuth';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Link from '../ui/Link';
import Logo from '../ui/Logo';
import { getConsultationPath } from '../../lib/router';
import './Navbar.css';

const VISITOR_LINKS = [
  { to: '/katalog', label: 'Motorcycle Catalog' },
  { to: '/#gaya', label: 'Custom Styles' },
  { to: '/#process', label: 'Process' },
  { to: '/#tentang', label: 'About Ruka' },
];

const CUSTOMER_LINKS = [
  { to: '/', label: 'Home' },
  ...VISITOR_LINKS,
  { to: '/akun/pesanan', label: 'My Orders' },
  { to: '/akun', label: 'My Account' },
];

const ADMIN_LINKS = [
  { to: '/katalog', label: 'Motorcycle Catalog' },
  { to: '/admin/dashboard', label: 'Admin Dashboard' },
];

function isLinkActive(link, route) {
  if (link.to === '/') {
    return route.name === 'home' && !route.hash;
  }
  if (link.to === '/katalog') {
    return route.name === 'catalog' || route.name === 'detail';
  }
  if (link.to === '/akun/pesanan') {
    return route.name === 'customer-account' && (route.mode === 'orders' || route.mode === 'detail');
  }
  if (link.to === '/akun') {
    return route.name === 'customer-account' && route.mode === 'profile';
  }
  if (link.to === '/admin/dashboard') {
    return route.name === 'admin' || route.name === 'admin-catalog' || route.name === 'admin-orders' || route.name === 'admin-purchases';
  }
  return false;
}

export default function Navbar() {
  const route = useRoute();
  const adminSession = useAdminSession();
  const customerSession = useCustomerSession();
  const [openLocation, setOpenLocation] = useState(null);
  const [logoutError, setLogoutError] = useState('');
  const isOpen = openLocation === route.location;
  const isAdmin = adminSession.status === 'authenticated';
  const isCustomer = !isAdmin && customerSession.status === 'authenticated';

  const navLinks = isAdmin
    ? ADMIN_LINKS
    : isCustomer
      ? CUSTOMER_LINKS
      : VISITOR_LINKS;

  const consultationPath = getConsultationPath(route.name === 'detail' ? route.id : undefined);
  const headerRef = useRef(null);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenLocation(null);
        menuButtonRef.current?.focus();
      }
    };

    const handlePointerDown = (event) => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setOpenLocation(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  const closeMenu = () => setOpenLocation(null);
  const toggleMenu = () => setOpenLocation(isOpen ? null : route.location);

  const handleCustomerLogout = async () => {
    setLogoutError('');
    const result = await logoutCustomer();
    if (!result.ok) {
      setLogoutError(result.message || 'Unable to log out.');
      return;
    }
    closeMenu();
    window.location.assign('/');
  };

  const handleAdminLogout = () => {
    setLogoutError('');
    clearAdminSession();
    closeMenu();
    window.location.assign('/');
  };

  return (
    <header className="rm-navbar" ref={headerRef}>
      <div className="rm-navbar__inner">
        <Logo className="rm-navbar__brand" onClick={closeMenu} />

        <nav aria-label="Main navigation" className="rm-navbar__nav">
          {navLinks.map((link) => {
            const isActive = isLinkActive(link, route);

            return (
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={`rm-navbar__link${isActive ? ' is-active' : ''}`}
                key={link.to}
                to={link.to}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="rm-navbar__actions">
          {isAdmin ? (
            <button className="rm-navbar__admin-link rm-navbar__logout" onClick={handleAdminLogout} type="button">Logout</button>
          ) : isCustomer ? (
            <button className="rm-navbar__admin-link rm-navbar__logout" onClick={handleCustomerLogout} type="button">Logout</button>
          ) : (
            <>
              <Link className="rm-navbar__admin-link" to="/login">Log In / Register</Link>
            </>
          )}

          <Button
            className="rm-navbar__cta"
            icon={<Icon name="arrow-up-right" size={18} />}
            to={consultationPath}
            variant="outline"
          >
            Discuss a Build
          </Button>

          <button
            aria-controls="rm-mobile-menu"
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            className="rm-navbar__menu-button"
            onClick={toggleMenu}
            ref={menuButtonRef}
            type="button"
          >
            <span>{isOpen ? 'Close' : 'Menu'}</span>
            <Icon name={isOpen ? 'close' : 'menu'} size={24} />
          </button>
        </div>
      </div>

      <div className="rm-navbar__panel" hidden={!isOpen} id="rm-mobile-menu">
        <nav aria-label="Mobile navigation" className="rm-navbar__panel-nav">
          {navLinks.map((link) => {
            const isActive = isLinkActive(link, route);

            return (
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={`rm-navbar__panel-link${isActive ? ' is-active' : ''}`}
                key={link.to}
                onClick={closeMenu}
                to={link.to}
              >
                <span>{link.label}</span>
                <Icon name="arrow-up-right" size={16} />
              </Link>
            );
          })}
          {isAdmin ? (
            <button className="rm-navbar__panel-link rm-navbar__admin-link-mobile rm-navbar__logout-mobile" onClick={handleAdminLogout} type="button">
              <span>Logout</span><Icon name="arrow-up-right" size={16} />
            </button>
          ) : isCustomer ? (
            <button className="rm-navbar__panel-link rm-navbar__admin-link-mobile rm-navbar__logout-mobile" onClick={handleCustomerLogout} type="button">
              <span>Logout</span><Icon name="arrow-up-right" size={16} />
            </button>
          ) : (
            <>
              <Link className="rm-navbar__panel-link rm-navbar__admin-link-mobile" onClick={closeMenu} to="/login">
                <span>Log In / Register</span><Icon name="arrow-up-right" size={16} />
              </Link>
            </>
          )}
        </nav>

        {logoutError ? <p className="rm-navbar__logout-error" role="alert">{logoutError}</p> : null}
        <Button
          className="rm-navbar__panel-cta"
          icon={<Icon name="arrow-up-right" size={18} />}
          onClick={closeMenu}
          to={consultationPath}
          variant="primary"
        >
          Discuss a Build
        </Button>
      </div>
    </header>
  );
}
