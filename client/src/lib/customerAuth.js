import { useEffect, useSyncExternalStore } from 'react';

const SESSION_EVENT = 'rm:customer-session-change';
let session = { status: 'unknown', user: null };
let verification = null;
let generation = 0;

function publish(nextSession) {
  session = nextSession;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function subscribe(callback) {
  window.addEventListener(SESSION_EVENT, callback);
  return () => window.removeEventListener(SESSION_EVENT, callback);
}

function getSnapshot() {
  return session;
}

export async function customerRequest(url, options = {}) {
  try {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
    const result = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        unauthorized: true,
        message: result?.message || 'Silakan masuk ke akun pelanggan.',
      };
    }
    if (!response.ok || !result?.success) {
      return {
        ok: false,
        unauthorized: false,
        message: result?.message || `Permintaan gagal (${response.status}).`,
      };
    }
    return { ok: true, unauthorized: false, data: result.data };
  } catch (error) {
    return {
      ok: false,
      unauthorized: false,
      message: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.',
      error,
    };
  }
}

export function establishCustomerSession(user) {
  generation += 1;
  verification = null;
  publish({ status: 'authenticated', user });
}

export function clearCustomerSession() {
  generation += 1;
  verification = null;
  publish({ status: 'unauthenticated', user: null });
}

export async function verifyCustomerSession() {
  if (verification) return verification;
  const currentGeneration = generation;
  publish({ status: 'checking', user: null });
  const promise = customerRequest('/api/customers/me')
    .then((result) => {
      if (currentGeneration !== generation) return session;
      if (result.unauthorized) {
        publish({ status: 'unauthenticated', user: null });
        return session;
      }
      if (!result.ok) {
        publish({ status: 'unavailable', user: null });
        return session;
      }
      publish({ status: 'authenticated', user: result.data });
      return session;
    })
    .finally(() => {
      if (verification === promise) verification = null;
    });
  verification = promise;
  return promise;
}

export async function logoutCustomer() {
  const result = await customerRequest('/api/customers/logout', { method: 'POST' });
  if (result.ok || result.unauthorized) clearCustomerSession();
  if (result.unauthorized) return { ...result, ok: true };
  return result;
}

export function useCustomerSession() {
  const currentSession = useSyncExternalStore(subscribe, getSnapshot, () => ({
    status: 'unknown',
    user: null,
  }));
  useEffect(() => {
    if (currentSession.status === 'unknown') void verifyCustomerSession();
  }, [currentSession.status]);
  return currentSession;
}
