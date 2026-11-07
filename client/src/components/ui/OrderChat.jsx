import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest, clearAdminSession } from '../../lib/adminAuth';
import { customerRequest } from '../../lib/customerAuth';
import { navigate } from '../../lib/router';
import './OrderChat.css';

function formatMessageDate(value) {
  const date = new Date(`${String(value || '').replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function updateMessages(setMessages, incoming) {
  setMessages((current) => {
    const lastCurrent = current.at(-1)?.id;
    const lastIncoming = incoming.at(-1)?.id;
    return current.length === incoming.length && lastCurrent === lastIncoming
      ? current
      : incoming;
  });
}

export default function OrderChat({ orderId, viewer, accessToken = '', conversationType = 'order' }) {
  const isAdmin = viewer === 'admin';
  const isConsultation = conversationType === 'consultation';
  const endpoint = isAdmin
    ? isConsultation
      ? `/api/consultations/${encodeURIComponent(orderId)}/messages`
      : `/api/purchases/admin/${encodeURIComponent(orderId)}/messages`
    : isConsultation
      ? `/api/customers/consultations/${encodeURIComponent(orderId)}/messages`
      : `/api/purchases/${encodeURIComponent(orderId)}/messages`;
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  const loadMessages = useCallback(async (active = () => true) => {
    let result;
    if (isAdmin) {
      result = await adminRequest(endpoint);
      if (result.unauthorized) {
        clearAdminSession();
        navigate('/admin/login#session-expired');
      }
      if (result.ok && active()) {
        updateMessages(setMessages, result.data?.messages || []);
        setError('');
      }
      if (!result.ok && active()) setError(result.message || 'Messages could not be loaded.');
    } else if (isConsultation) {
      result = await customerRequest(endpoint);
      if (result.ok && active()) {
        updateMessages(setMessages, result.data?.messages || []);
        setError('');
      }
      if (!result.ok && active()) setError(result.message || 'Messages could not be loaded.');
    } else {
      try {
        const headers = {};
        if (accessToken) headers['X-Order-Access-Token'] = accessToken;
        const response = await fetch(endpoint, { headers, credentials: 'same-origin' });
        const body = await response.json().catch(() => null);
        result = response.ok && body?.success
          ? { ok: true, data: body.data }
          : { ok: false, message: body?.message || `Messages could not be loaded (${response.status}).` };
        if (result.ok && active()) {
          updateMessages(setMessages, result.data?.messages || []);
          setError('');
        }
        if (!result.ok && active()) setError(result.message);
      } catch (requestError) {
        console.error('Failed to load order messages:', requestError);
        if (active()) setError('Unable to connect to the server. Messages could not be loaded.');
      }
    }
    if (active()) setLoading(false);
  }, [accessToken, endpoint, isAdmin, isConsultation]);

  useEffect(() => {
    let active = true;
    let timer;
    const poll = async () => {
      await loadMessages(() => active);
      if (active) timer = window.setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError('');
    let result;
    if (isAdmin) {
      result = await adminRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      if (result.unauthorized) {
        clearAdminSession();
        navigate('/admin/login#session-expired');
      }
    } else if (isConsultation) {
      result = await customerRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
    } else {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (accessToken) headers['X-Order-Access-Token'] = accessToken;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify({ message }),
        });
        const body = await response.json().catch(() => null);
        result = response.ok && body?.success
          ? { ok: true, data: body.data }
          : { ok: false, message: body?.message || `Message could not be sent (${response.status}).` };
      } catch (requestError) {
        console.error('Failed to send order message:', requestError);
        result = { ok: false, message: 'Unable to connect to the server. Message was not sent.' };
      }
    }

    setSending(false);
    if (!result.ok) {
      setError(result.message || 'Message could not be sent.');
      return;
    }
    setMessages((current) => current.some((item) => item.id === result.data.id)
      ? current
      : [...current, result.data]);
    setDraft('');
  };

  return (
    <section aria-labelledby={`rm-order-chat-title-${orderId}`} className={`rm-order-chat${isAdmin ? ' rm-order-chat--admin' : ''}`}>
      <header className="rm-order-chat__heading">
        <div>
          <p className="rm-order-chat__eyebrow">
            {isConsultation ? 'BUILD CONSULTATION' : isAdmin ? 'CUSTOMER SUPPORT' : 'ORDER SUPPORT'}
          </p>
          <h2 id={`rm-order-chat-title-${orderId}`}>
            {isConsultation ? 'Chat about this consultation' : 'Chat about this order'}
          </h2>
        </div>
        <p>Replies refresh automatically.</p>
      </header>
      {error ? <p className="rm-order-chat__error" role="alert">{error}</p> : null}
      <ol aria-label="Order messages" aria-live="polite" className="rm-order-chat__messages" role="log">
        {loading ? <li className="rm-order-chat__empty">Loading messages...</li> : null}
        {!loading && messages.length === 0 ? (
          <li className="rm-order-chat__empty">No messages yet. Ask a question about this order.</li>
        ) : null}
        {messages.map((item) => {
          const ownMessage = item.actorType === viewer;
          return (
            <li className={`rm-order-chat__message${ownMessage ? ' is-own' : ''}`} key={item.id}>
              <div className="rm-order-chat__bubble">
                <p className="rm-order-chat__sender">{ownMessage ? 'You' : isAdmin ? 'Customer' : 'Ruka Support'}</p>
                <p className="rm-order-chat__text">{item.message}</p>
                <time dateTime={item.createdAt}>{formatMessageDate(item.createdAt)}</time>
              </div>
            </li>
          );
        })}
        <li aria-hidden="true" className="rm-order-chat__end" ref={bottomRef} />
      </ol>
      <form className="rm-order-chat__form" onSubmit={sendMessage}>
        <label htmlFor={`rm-order-chat-input-${orderId}`}>Your message</label>
        <textarea
          id={`rm-order-chat-input-${orderId}`}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={isConsultation ? 'Ask us about your build...' : 'Ask us about this order...'}
          required
          rows={3}
          value={draft}
        />
        <div className="rm-order-chat__form-footer">
          <span>{draft.length}/2000</span>
          <button disabled={sending || !draft.trim()} type="submit">
            {sending ? 'Sending...' : 'Send message'}
          </button>
        </div>
      </form>
    </section>
  );
}
