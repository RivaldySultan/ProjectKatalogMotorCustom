import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';
import Logo from '../ui/Logo';
import { navigate } from '../../lib/router';
import { saveAdminSession, useAdminSession } from '../../lib/adminAuth';
import { usePageTitle } from '../../lib/usePageTitle';
import './AdminLoginPage.css';

export default function AdminLoginPage({ sessionExpired = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const adminSession = useAdminSession();

  usePageTitle('Admin Login — RUKA Motorworks');

  useEffect(() => {
    if (adminSession.status === 'authenticated') {
      navigate('/admin/dashboard');
    }
  }, [adminSession.status]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success || !result.token || !result.user) {
        setError(result?.message || `Login failed (${response.status}).`);
        return;
      }

      saveAdminSession(result.token, result.user);
      navigate('/admin/dashboard');
    } catch (requestError) {
      console.error('Failed to reach the admin login service:', requestError);
      setError('Unable to connect to the server. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="rm-admin-login">
      <Logo className="rm-admin-login__brand" />

      <section aria-labelledby="rm-admin-login-title" className="rm-admin-login__panel">
        <p className="rm-admin-meta">WORKSPACE / ADMIN</p>
        <h1 id="rm-admin-login-title">ADMIN LOGIN.</h1>
        <p className="rm-admin-login__description">
          Log in to manage Ruka's build overview and consultation requests.
        </p>

        {sessionExpired ? (
          <p className="rm-admin-notice" role="status">
            Your admin session has expired. Please log in again.
          </p>
        ) : null}
        {error ? <p className="rm-admin-error" role="alert">{error}</p> : null}

        <form className="rm-admin-login__form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="username"
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Signing in...' : 'Log in'}
            {!isSubmitting ? <Icon name="arrow-up-right" size={18} /> : null}
          </button>
        </form>

        <a className="rm-admin-login__back" href="/admin/forgot-password">
          Forgot password?
        </a>
        <a className="rm-admin-login__back" href="/">
          Back to Ruka Motorworks
        </a>
      </section>
    </main>
  );
}
