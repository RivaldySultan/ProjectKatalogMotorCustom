import { useEffect, useSyncExternalStore } from 'react';

const NAVIGATE_EVENT = 'rm:navigate';
export const CONSULTATION_FORM_ID = 'consultation-form';

export function getConsultationPath(productId = 'prod_1') {
  return `/motor/${encodeURIComponent(String(productId || 'prod_1'))}#${CONSULTATION_FORM_ID}`;
}

function getLocation() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function subscribe(callback) {
  window.addEventListener('popstate', callback);
  window.addEventListener('hashchange', callback);
  window.addEventListener(NAVIGATE_EVENT, callback);

  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener('hashchange', callback);
    window.removeEventListener(NAVIGATE_EVENT, callback);
  };
}

export function navigate(to) {
  const url = new URL(to, window.location.origin);
  const target = `${url.pathname}${url.search}${url.hash}`;
  const current = getLocation();

  if (target === current) {
    if (url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      window.requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
      });
    }
    emitNavigate();
    return;
  }

  window.history.pushState({}, '', target);
  emitNavigate();
}

function emitNavigate() {
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function useLocation() {
  return useSyncExternalStore(subscribe, getLocation, () => '/');
}

export function parseLocation(location) {
  const [pathAndQuery = '/', hash = ''] = location.split('#');
  const [rawPathname = '/', search = ''] = pathAndQuery.split('?');
  const pathname = rawPathname.replace(/\/+$/, '') || '/';
  const base = {
    location,
    pathname,
    search: search ? `?${search}` : '',
    hash: hash ? `#${hash}` : '',
  };

  if (pathname === '/') {
    return { ...base, name: 'home' };
  }

  if (pathname === '/katalog') {
    return { ...base, name: 'catalog' };
  }

  if (pathname === '/login' || pathname === '/register') {
    return { ...base, name: 'customer-auth', mode: pathname.slice(1) };
  }

  if (pathname === '/lupa-password') {
    return { ...base, name: 'password-reset', accountType: 'customer' };
  }

  if (pathname === '/akun') {
    return { ...base, name: 'customer-account', mode: 'profile' };
  }

  if (pathname === '/akun/pesanan') {
    return { ...base, name: 'customer-account', mode: 'orders' };
  }

  const accountOrderMatch = pathname.match(/^\/akun\/pesanan\/([^/]+)$/);
  if (accountOrderMatch) {
    return {
      ...base,
      name: 'customer-account',
      mode: 'detail',
      id: decodeURIComponent(accountOrderMatch[1]),
    };
  }

  if (pathname === '/admin') {
    return { ...base, name: 'admin-login' };
  }

  if (pathname === '/admin/dashboard') {
    return { ...base, name: 'admin' };
  }

  if (pathname === '/admin/login') {
    return { ...base, name: 'admin-login' };
  }

  if (pathname === '/admin/catalog') {
    return { ...base, name: 'admin-catalog', mode: 'list' };
  }

  if (pathname === '/admin/catalog/new') {
    return { ...base, name: 'admin-catalog', mode: 'create' };
  }

  if (pathname === '/admin/orders') {
    return { ...base, name: 'admin-orders', mode: 'list' };
  }

  if (pathname === '/admin/purchases') {
    return { ...base, name: 'admin-purchases', mode: 'list' };
  }

  const adminPurchaseMatch = pathname.match(/^\/admin\/purchases\/([^/]+)$/);
  if (adminPurchaseMatch) {
    return {
      ...base,
      name: 'admin-purchases',
      mode: 'detail',
      id: decodeURIComponent(adminPurchaseMatch[1]),
    };
  }

  const checkoutMatch = pathname.match(/^\/checkout\/([^/]+)$/);
  if (checkoutMatch) {
    return { ...base, name: 'checkout', id: decodeURIComponent(checkoutMatch[1]) };
  }

  const customerPurchaseMatch = pathname.match(/^\/pesanan\/([^/]+)$/);
  if (customerPurchaseMatch) {
    return { ...base, name: 'customer-purchase', id: decodeURIComponent(customerPurchaseMatch[1]) };
  }

  const adminOrderMatch = pathname.match(/^\/admin\/orders\/([^/]+)$/);
  if (adminOrderMatch) {
    return {
      ...base,
      name: 'admin-orders',
      mode: 'detail',
      id: decodeURIComponent(adminOrderMatch[1]),
    };
  }

  const adminProductMatch = pathname.match(/^\/admin\/catalog\/([^/]+)\/edit$/);
  if (adminProductMatch) {
    return {
      ...base,
      name: 'admin-catalog',
      mode: 'edit',
      id: decodeURIComponent(adminProductMatch[1]),
    };
  }

  const detailMatch = pathname.match(/^\/motor\/([^/]+)$/);
  if (detailMatch) {
    return { ...base, name: 'detail', id: decodeURIComponent(detailMatch[1]) };
  }

  return { ...base, name: 'not-found' };
}

export function useRoute() {
  return parseLocation(useLocation());
}

export function useRouteScroll(location) {
  useEffect(() => {
    if (!location) return;
    if (/^\/pesanan\/[^/#?]+/.test(location)) return;

    const hash = location.includes('#') ? location.slice(location.indexOf('#')) : '';
    let observer;
    let timeout;

    if (hash.length > 1) {
      let id;
      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        return undefined;
      }

      const scrollToTarget = () => {
        const target = document.getElementById(id);
        if (!target) return false;
        target.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
        observer?.disconnect();
        window.clearTimeout(timeout);
        return true;
      };

      const frame = window.requestAnimationFrame(() => {
        if (scrollToTarget()) return;
        observer = new MutationObserver(scrollToTarget);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        timeout = window.setTimeout(() => observer?.disconnect(), 10000);
      });

      return () => {
        window.cancelAnimationFrame(frame);
        observer?.disconnect();
        window.clearTimeout(timeout);
      };
    }

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location]);
}
