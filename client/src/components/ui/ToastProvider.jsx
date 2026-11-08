import { useCallback, useState } from 'react';
import { ToastContext } from './ToastContext';
import './ToastProvider.css';

let nextToastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message, type = 'success') => {
    const id = ++nextToastId;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-live="polite" aria-relevant="additions text" className="rm-toast-region">
        {toasts.map((toast) => (
          <div
            className={`rm-toast rm-toast--${toast.type}`}
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
          >
            <span>{toast.message}</span>
            <button aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} type="button">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
