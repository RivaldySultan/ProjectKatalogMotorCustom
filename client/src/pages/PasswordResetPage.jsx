import { useEffect, useState } from 'react';
import Link from '../components/ui/Link';
import { customerRequest } from '../lib/customerAuth';
import { navigate } from '../lib/router';
import { SECURITY_QUESTIONS } from '../lib/securityQuestions';
import { usePageTitle } from '../lib/usePageTitle';
import './PasswordResetPage.css';

export default function PasswordResetPage() {
  const [stage, setStage] = useState('email');
  const [resetToken, setResetToken] = useState('');
  const [email, setEmail] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [answer, setAnswer] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  usePageTitle('Forgot Password — Customer — RUKA Motorworks');

  useEffect(() => {
    if (!complete) return undefined;
    const timer = window.setTimeout(() => navigate('/login'), 2500);
    return () => window.clearTimeout(timer);
  }, [complete]);

  const advanceToQuestion = (event) => {
    event.preventDefault();
    setError('');
    setStage('question');
  };

  const verifyAnswer = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const result = await customerRequest('/api/customers/forgot-password/verify', {
      method: 'POST',
      body: JSON.stringify({ email, questionId, answer }),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message || 'The information could not be verified. Check your details and try again.');
      return;
    }
    setResetToken(result.data.resetToken);
    setAnswer('');
    setStage('password');
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
    const result = await customerRequest('/api/customers/forgot-password/reset', {
      method: 'POST',
      body: JSON.stringify({ resetToken, password, confirmPassword }),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message || 'The password could not be reset.');
      return;
    }
    setResetToken('');
    setComplete(true);
    setNotice(result.data.message);
  };

  const title = complete
    ? 'PASSWORD UPDATED.'
    : stage === 'password'
      ? 'SET NEW PASSWORD.'
      : stage === 'question'
        ? 'VERIFY YOUR ANSWER.'
        : 'FORGOT PASSWORD.';
  const description = complete
    ? 'Your account is protected with the new password. You will be redirected to login.'
    : stage === 'password'
      ? 'Choose a new password for your customer account.'
      : stage === 'question'
        ? 'Choose the question you selected when you registered and enter your answer.'
        : 'Enter the email address registered to your customer account.';

  return (
    <main className="rm-password-reset-page rm-container" id="main-content" tabIndex={-1}>
      <section className="rm-password-reset">
        <header className="rm-password-reset__heading">
          <p className="rm-password-reset__eyebrow">CUSTOMER PORTAL / RUKA MOTORWORKS</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>

        {notice ? <p className="rm-password-reset__notice" role="status">{notice}</p> : null}
        {error ? <p className="rm-password-reset__error" role="alert">{error}</p> : null}

        {stage === 'email' && !complete ? (
          <form className="rm-password-reset__form" onSubmit={advanceToQuestion}>
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <button type="submit">Continue</button>
          </form>
        ) : null}

        {stage === 'question' && !complete ? (
          <form className="rm-password-reset__form" onSubmit={verifyAnswer}>
            <label>
              <span>Security question</span>
              <select onChange={(event) => setQuestionId(event.target.value)} required value={questionId}>
                <option value="">Choose your registered question</option>
                {SECURITY_QUESTIONS.map((question) => (
                  <option key={question.id} value={question.id}>{question.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Your answer</span>
              <input
                autoComplete="off"
                maxLength={72}
                onChange={(event) => setAnswer(event.target.value)}
                required
                spellCheck="false"
                value={answer}
              />
            </label>
            <button disabled={submitting} type="submit">
              {submitting ? 'Verifying...' : 'Verify answer'}
            </button>
            <button className="rm-password-reset__secondary" onClick={() => {
              setStage('email');
              setError('');
            }} type="button">Back</button>
          </form>
        ) : null}

        {stage === 'password' && !complete ? (
          <form className="rm-password-reset__form" onSubmit={resetPassword}>
            <label>
              <span>New password</span>
              <input
                autoComplete="new-password"
                maxLength={1024}
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
                maxLength={1024}
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
            <button disabled={submitting} type="submit">
              {submitting ? 'Updating...' : 'Update password'}
            </button>
          </form>
        ) : null}

        <p className="rm-password-reset__back">
          <Link to="/login">Back to customer login</Link>
        </p>
      </section>
    </main>
  );
}
