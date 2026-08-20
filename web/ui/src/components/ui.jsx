import React from 'react'

export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-100 shadow-card p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function StatCard({ label, value, sub, accent = 'brand', icon: Icon }) {
  const accentMap = {
    brand: 'from-brand-500 to-brand-600',
    emerald: 'from-emerald-500 to-emerald-600',
    rose: 'from-rose-500 to-rose-600',
    amber: 'from-amber-500 to-amber-600',
    cyan: 'from-cyan-500 to-cyan-600',
  }
  return (
    <Card className="flex items-center gap-4">
      {Icon && (
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accentMap[accent]} flex items-center justify-center text-white shrink-0 shadow-sm`}>
          <Icon />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500 truncate">{label}</div>
        <div className="text-2xl font-bold text-slate-800 tabular-nums leading-tight mt-0.5">{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5 truncate">{sub}</div>}
      </div>
    </Card>
  )
}

export function Badge({ children, tone = 'slate' }) {
  const toneMap = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-brand-100 text-brand-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${toneMap[tone]}`}>
      {children}
    </span>
  )
}

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-500/20',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    danger: 'bg-rose-50 hover:bg-rose-100 text-rose-600',
    ghost: 'hover:bg-slate-100 text-slate-600',
  }
  const sizes = {
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-sm px-5 py-2.5',
  }
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-shadow bg-white disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-shadow bg-white ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
          checked ? 'bg-brand-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  )
}

export function FormRow({ label, hint, children, htmlFor }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-4 py-3 border-b border-slate-50 last:border-b-0">
      <div className="sm:col-span-1">
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  )
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <h3 className="text-base font-semibold text-slate-800">{children}</h3>
      {action}
    </div>
  )
}

export function EmptyState({ title, hint }) {
  return (
    <div className="text-center py-12 text-slate-400">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
    </div>
  )
}

export function Spinner({ className = '' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
