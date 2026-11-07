import { useState } from 'react';
import Logo from '../components/ui/Logo';
import Link from '../components/ui/Link';
import { customerRequest } from '../lib/customerAuth';
import { usePageTitle } from '../lib/usePageTitle';
import './PasswordResetPage.css';

export default function PasswordResetPage({ accountType }) {
  const isAdmin = accountType === 'admin';
  const loginPath = isAdmin ? '/admin/login' : '/login';
  const endpoint = isAdmin ? '/api/auth' : '/api/customers';
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requested, setRequested] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  usePageTitle(`Reset Password — ${isAdmin ? 'Admin' : 'Customer'} — RUKA Motorworks`);

  const requestCode = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setNotice('');
    setSubmitting(true);

    let result;
    if (isAdmin) {
      try {
        const response = await fetch(`${endpoint}/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        const body = await response.json().catch(() => null);
        result = response.ok && body?.success
          ? { ok: true, data: body }
          : { ok: false, message: body?.message || `Request failed (${response.status}).` };
      } catch (requestError) {
        console.error('Failed to request an admin password reset:', requestError);
        result = { ok: false, message: 'Unable to connect to the server. Check your connection and try again.' };
      }
    } else {
      result = await customerRequest(`${endpoint}/forgot-password`, {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
    }

    setSubmitting(false);
    if (!result.ok) {
      setError(result.message || 'The reset code could not be requested.');
      return;
    }
    setRequested(true);
    setNotice(result.data.message);
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }
    setSubmitting(true);

    let result;
    if (isAdmin) {
      try {
        const response = await fetch(`${endpoint}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, otp, password, confirmPassword }),
        });
        const body = await response.json().catch(() => null);
        result = response.ok && body?.success
          ? { ok: true, data: body }
          : { ok: false, message: body?.message || `Request failed (${response.status}).` };
      } catch (requestError) {
        console.error('Failed to reset the admin password:', requestError);
        result = { ok: false, message: 'Unable to connect to the server. Check your connection and try again.' };
      }
    } else {
      result = await customerRequest(`${endpoint}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ phone, otp, password, confirmPassword }),
      });
    }

    setSubmitting(false);
    if (!result.ok) {
      setError(result.message || 'The password could not be reset.');
      return;
    }
    setComplete(true);
    setNotice(result.data.message);
  };

  const content = (
    <section className={`rm-password-reset${isAdmin ? ' rm-password-reset--admin' : ''}`}>
      {isAdmin ? <Logo className="rm-password-reset__brand" /> : null}
      <header className="rm-password-reset__heading">
        <p className="rm-password-reset__eyebrow">{isAdmin ? 'WORKSPACE / ADMIN' : 'CUSTOMER PORTAL / RUKA MOTORWORKS'}</p>
        <h1>{complete ? 'PASSWORD UPDATED.' : 'RESET PASSWORD.'}</h1>
        <p>
          {complete
            ? 'Your account is protected with the new password.'
            : 'Request a six-digit code to the WhatsApp number registered to your account.'}
        </p>
      </header>

      {notice ? <p className="rm-password-reset__notice" role="status">{notice}</p> : null}
      {error ? <p className="rm-password-reset__error" role="alert">{error}</p> : null}

      {!complete ? (
        <form className="rm-password-reset__form" onSubmit={requested ? resetPassword : requestCode}>
          <label>
            <span>WhatsApp number</span>
            <input
              autoComplete="tel"
              maxLength={24}
              onChange={(event) => setPhone(event.target.value)}
              required
              type="tel"
              value={phone}
            />
          </label>
          {requested ? (
            <>
              <label>
                <span>Six-digit code</span>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                  pattern="\d{6}"
                  required
                  value={otp}
                />
              </label>
              <label>
                <span>New password</span>
                <input
                  autoComplete="new-password"
                  maxLength={isAdmin ? 72 : 1024}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <label>
                <span>Confirm new password</span>
                <input
                  autoComplete="new-password"
                  maxLength={isAdmin ? 72 : 1024}
                  minLength={8}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              </label>
            </>
          ) : null}
          <button disabled={submitting} type="submit">
            {submitting ? 'Processing...' : requested ? 'Reset password' : 'Send WhatsApp code'}
          </button>
          {requested && !complete ? (
            <button className="rm-password-reset__secondary" disabled={submitting} onClick={requestCode} type="button">
              Send another code
            </button>
          ) : null}
        </form>
      ) : null}

      <p className="rm-password-reset__back">
        {isAdmin
          ? <a href={loginPath}>Back to admin login</a>
          : <Link to={loginPath}>Back to customer login</Link>}
      </p>
    </section>
  );

  if (isAdmin) {
    return <main className="rm-password-reset-page rm-password-reset-page--admin">{content}</main>;
  }
  return <main className="rm-password-reset-page rm-container" id="main-content" tabIndex={-1}>{content}</main>;
}
