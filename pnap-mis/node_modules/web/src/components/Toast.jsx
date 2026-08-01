import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastCtx = createContext(null);

const ICONS = {
  success: '✓',
  error: '!',
  warning: '!',
  info: 'i',
};

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
      const tm = timersRef.current.get(id);
      if (tm) { clearTimeout(tm); timersRef.current.delete(id); }
    }, 200);
  }, []);

  const push = useCallback((opts) => {
    const id = ++idSeq;
    const toast = {
      id,
      type: opts.type || 'info',
      title: opts.title,
      message: opts.message,
      duration: opts.duration ?? 4000,
    };
    setToasts((list) => [...list, toast]);
    if (toast.duration > 0) {
      const tm = setTimeout(() => dismiss(id), toast.duration);
      timersRef.current.set(id, tm);
    }
    return id;
  }, [dismiss]);

  const api = {
    show: push,
    success: (message, opts = {}) => push({ ...opts, message, type: 'success' }),
    error: (message, opts = {}) => push({ ...opts, message, type: 'error' }),
    warning: (message, opts = {}) => push({ ...opts, message, type: 'warning' }),
    info: (message, opts = {}) => push({ ...opts, message, type: 'info' }),
    dismiss,
  };

  useEffect(() => () => {
    timersRef.current.forEach((tm) => clearTimeout(tm));
    timersRef.current.clear();
  }, []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.type}${t.leaving ? ' leaving' : ''}`}
            style={{ '--toast-duration': `${t.duration}ms` }}
            role={t.type === 'error' ? 'alert' : 'status'}
          >
            <div className="toast-icon" aria-hidden="true">{ICONS[t.type]}</div>
            <div className="toast-body">
              {t.title && <div className="toast-title">{t.title}</div>}
              <div className="toast-msg">{t.message}</div>
            </div>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
            {t.duration > 0 && <div className="toast-progress" />}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}
