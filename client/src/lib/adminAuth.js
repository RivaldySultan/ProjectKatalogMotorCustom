import { useEffect, useSyncExternalStore } from 'react';

const TOKEN_KEY = 'ruka_admin_token';
const ADMIN_KEY = 'ruka_admin_user';
const SESSION_EVENT = 'rm:admin-session-change';

let session = { status: 'unknown', user: null };
let verification = null;
let generation = 0;

function publish(nextSession) {
  session = nextSession;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function subscribe(callback) {
  window.addEventListener(SESSION_EVENT, callback);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(SESSION_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
}

function getSnapshot() {
  return session;
}

function handleStorage(event) {
  if (event.key === TOKEN_KEY || event.key === null) {
    void verifyAdminSession();
  }
}

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function saveAdminSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ADMIN_KEY, JSON.stringify({
    name: user.name,
    email: user.email,
  }));
  generation += 1;
  verification = null;
  publish({ status: 'checking', user: null });
  void verifyAdminSession();
}

export function getAdminUser() {
  try {
    const stored = localStorage.getItem(ADMIN_KEY);
    if (!stored) return null;
    const user = JSON.parse(stored);
    return typeof user.name === 'string' && typeof user.email === 'string'
      ? user
      : null;
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_KEY);
  generation += 1;
  verification = null;
  publish({ status: 'unauthenticated', user: null });
}

export async function adminRequest(url, options = {}) {
  const token = getAdminToken();
  if (!token) {
    return { ok: false, unauthorized: true, message: 'Sesi admin tidak ditemukan.' };
  }

  let response;
  try {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    return {
      ok: false,
      unauthorized: false,
      message: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.',
      error,
    };
  }

  const result = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      unauthorized: true,
      message: result?.message || 'Sesi admin telah berakhir. Silakan masuk kembali.',
    };
  }

  if (!response.ok || !result?.success) {
    return {
      ok: false,
      unauthorized: false,
      message: result?.message || `Permintaan gagal (${response.status}).`,
    };
  }

  return { ok: true, data: result.data };
}

export async function verifyAdminSession() {
  const token = getAdminToken();
  if (!token) {
    verification = null;
    publish({ status: 'unauthenticated', user: null });
    return session;
  }

  if (verification?.token === token) return verification.promise;

  const currentGeneration = generation;
  publish({ status: 'checking', user: null });
  const promise = adminRequest('/api/auth/me')
    .then((result) => {
      if (currentGeneration !== generation || token !== getAdminToken()) {
        return session;
      }

      if (result.unauthorized) {
        clearAdminSession();
        return session;
      }

      if (!result.ok) {
        publish({ status: 'unavailable', user: null });
        return session;
      }

      if (!result.data?.id || !result.data?.email) {
        publish({ status: 'unauthenticated', user: null });
        return session;
      }

      const user = {
        id: result.data.id,
        name: result.data.name || '',
        email: result.data.email,
      };
      localStorage.setItem(ADMIN_KEY, JSON.stringify(user));
      publish({ status: 'authenticated', user });
      return session;
    })
    .finally(() => {
      if (verification?.promise === promise) {
        verification = null;
      }
    });

  verification = { token, promise };
  return promise;
}

export function useAdminSession() {
  const currentSession = useSyncExternalStore(subscribe, getSnapshot, () => ({
    status: 'unknown',
    user: null,
  }));

  useEffect(() => {
    void verifyAdminSession();
  }, []);

  return currentSession;
}
