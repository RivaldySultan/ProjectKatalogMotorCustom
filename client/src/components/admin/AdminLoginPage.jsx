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

  usePageTitle('Masuk Admin — RUKA Motorworks');

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
      setError('Email dan kata sandi wajib diisi.');
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
        setError(result?.message || `Login gagal (${response.status}).`);
        return;
      }

      saveAdminSession(result.token, result.user);
      navigate('/admin/dashboard');
    } catch (requestError) {
      console.error('Gagal menghubungi layanan login admin:', requestError);
      setError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="rm-admin-login">
      <Logo className="rm-admin-login__brand" />

      <section aria-labelledby="rm-admin-login-title" className="rm-admin-login__panel">
        <p className="rm-admin-meta">RUANG KERJA / ADMIN</p>
        <h1 id="rm-admin-login-title">MASUK ADMIN.</h1>
        <p className="rm-admin-login__description">
          Masuk untuk mengelola ringkasan build dan permintaan konsultasi Ruka.
        </p>

        {sessionExpired ? (
          <p className="rm-admin-notice" role="status">
            Sesi admin berakhir. Silakan masuk kembali.
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
            <span>Kata sandi</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Memeriksa sesi...' : 'Masuk'}
            {!isSubmitting ? <Icon name="arrow-up-right" size={18} /> : null}
          </button>
        </form>

        <a className="rm-admin-login__back" href="/">
          Kembali ke Ruka Motorworks
        </a>
      </section>
    </main>
  );
}
