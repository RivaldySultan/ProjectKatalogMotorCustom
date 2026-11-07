import { useState } from 'react';
import Link from '../components/ui/Link';
import { establishCustomerSession, customerRequest } from '../lib/customerAuth';
import { navigate } from '../lib/router';
import { usePageTitle } from '../lib/usePageTitle';
import './CustomerAuthPage.css';

const EMPTY_VALUES = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  privacyConsent: false,
};

export default function CustomerAuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [values, setValues] = useState(EMPTY_VALUES);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  usePageTitle(`${isRegister ? 'Create Account' : 'Customer Login'} — RUKA Motorworks`);

  const setField = (field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (isRegister && values.password !== values.confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setSubmitting(true);
    const result = await customerRequest(`/api/customers/${isRegister ? 'register' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(isRegister ? values : {
        email: values.email,
        password: values.password,
      }),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message || 'Your account could not be processed.');
      return;
    }
    establishCustomerSession(result.data);
    const returnTo = new URLSearchParams(window.location.search).get('return');
    navigate(returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/akun');
  };

  return (
    <main className="rm-customer-auth rm-container" id="main-content" tabIndex={-1}>
      <header className="rm-customer-auth__heading">
        <p className="rm-eyebrow">CUSTOMER PORTAL / RUKA MOTORWORKS</p>
        <h1>{isRegister ? 'CREATE CUSTOMER ACCOUNT' : 'CUSTOMER LOGIN'}</h1>
        <p>{isRegister ? 'Save and track your purchase history.' : 'Log in to view your orders and account information.'}</p>
      </header>

      <form className="rm-customer-auth__form" onSubmit={submit}>
        {isRegister ? (
          <>
            <label>
              <span>Full name</span>
              <input autoComplete="name" maxLength={120} onChange={(event) => setField('fullName', event.target.value)} required value={values.fullName} />
            </label>
            <label>
              <span>WhatsApp number</span>
              <input autoComplete="tel" maxLength={24} onChange={(event) => setField('phone', event.target.value)} required type="tel" value={values.phone} />
            </label>
          </>
        ) : null}
        <label>
          <span>Email</span>
          <input autoComplete="email" maxLength={254} onChange={(event) => setField('email', event.target.value)} required type="email" value={values.email} />
        </label>
        <label>
          <span>Password</span>
          <span className="rm-customer-auth__password">
            <input autoComplete={isRegister ? 'new-password' : 'current-password'} onChange={(event) => setField('password', event.target.value)} required type={showPassword ? 'text' : 'password'} value={values.password} />
            <button onClick={() => setShowPassword((visible) => !visible)} type="button">{showPassword ? 'Hide' : 'Show'}</button>
          </span>
        </label>
        {isRegister ? (
          <>
            <label>
              <span>Confirm password</span>
              <input autoComplete="new-password" onChange={(event) => setField('confirmPassword', event.target.value)} required type={showPassword ? 'text' : 'password'} value={values.confirmPassword} />
            </label>
            <label className="rm-customer-auth__consent">
              <input checked={values.privacyConsent} onChange={(event) => setField('privacyConsent', event.target.checked)} required type="checkbox" />
              <span>I agree to the use of my account data to manage orders and customer service.</span>
            </label>
          </>
        ) : null}
        {error ? <p className="rm-customer-auth__error" role="alert">{error}</p> : null}
        <button className="rm-button rm-button--primary" disabled={submitting} type="submit">
          {submitting ? 'Processing...' : isRegister ? 'Create account' : 'Log in'}
        </button>
        {!isRegister ? (
          <p className="rm-customer-auth__switch">
            <Link to="/lupa-password">Forgot your password?</Link>
          </p>
        ) : null}
        <p className="rm-customer-auth__switch">
          {isRegister ? 'Already have an account?' : 'Do not have an account yet?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Log In' : 'Register'}</Link>
        </p>
        <p className="rm-customer-auth__guest">Create a customer account to place a direct order and track your build progress.</p>
      </form>
    </main>
  );
}
