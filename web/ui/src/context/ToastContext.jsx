import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext(null)

let idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const push = useCallback(
    (message, { type = 'info', duration = 4000 } = {}) => {
      const id = ++idCounter
      setToasts((prev) => [...prev, { id, message, type }])
      if (duration > 0) {
        timers.current[id] = setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss]
  )

  const toast = {
    info: (msg, opts) => push(msg, { ...opts, type: 'info' }),
    success: (msg, opts) => push(msg, { ...opts, type: 'success' }),
    error: (msg, opts) => push(msg, { ...opts, type: 'error' }),
    warning: (msg, opts) => push(msg, { ...opts, type: 'warning' }),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`animate-slide-up cursor-pointer rounded-xl px-4 py-3 shadow-card-hover text-sm font-medium border backdrop-blur-sm ${
              t.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
                : t.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-800'
                : t.type === 'warning'
                ? 'bg-amber-50/95 border-amber-200 text-amber-800'
                : 'bg-white/95 border-slate-200 text-slate-700'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
