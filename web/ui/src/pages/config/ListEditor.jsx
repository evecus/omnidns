import React from 'react'
import { Input, Button } from '../../components/ui'

// 通用"字符串列表"编辑器（比如 servers、default-nameserver）。
export function StringListEditor({ items = [], onChange, placeholder }) {
  const set = (i, v) => {
    const next = [...items]
    next[i] = v
    onChange(next)
  }
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const add = () => onChange([...items, ''])

  return (
    <div className="space-y-2">
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input value={v} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} />
          <Button variant="ghost" size="sm" onClick={() => remove(i)} className="shrink-0" type="button">
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={add} type="button">
        <PlusIcon /> 添加
      </Button>
    </div>
  )
}

// 通用"键值对表格"编辑器（比如 hosts: hostname -> ip）。
export function KeyValueEditor({ entries = {}, onChange, keyPlaceholder = 'key', valuePlaceholder = 'value' }) {
  const rows = Object.entries(entries)

  const setRow = (i, key, value) => {
    const next = [...rows]
    next[i] = [key, value]
    onChange(Object.fromEntries(next))
  }
  const removeRow = (i) => {
    const next = rows.filter((_, idx) => idx !== i)
    onChange(Object.fromEntries(next))
  }
  const addRow = () => {
    onChange(Object.fromEntries([...rows, ['', '']]))
  }

  return (
    <div className="space-y-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <Input value={k} onChange={(e) => setRow(i, e.target.value, v)} placeholder={keyPlaceholder} className="flex-1" />
          <Input value={v} onChange={(e) => setRow(i, k, e.target.value)} placeholder={valuePlaceholder} className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => removeRow(i)} className="shrink-0" type="button">
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={addRow} type="button">
        <PlusIcon /> 添加
      </Button>
    </div>
  )
}

// 通用"对象数组"编辑器，columns 定义每列的 key/placeholder/type。
// 用于 rulesets（path, upstream）、static-leases（mac, ip, hostname）等。
export function ObjectListEditor({ items = [], onChange, columns, addLabel = '添加' }) {
  const setField = (i, key, value) => {
    const next = items.map((item, idx) => (idx === i ? { ...item, [key]: value } : item))
    onChange(next)
  }
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const add = () => {
    const blank = Object.fromEntries(columns.map((c) => [c.key, c.default ?? '']))
    onChange([...items, blank])
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="hidden sm:grid gap-2 px-0.5" style={{ gridTemplateColumns: `${columns.map(() => '1fr').join(' ')} 32px` }}>
          {columns.map((c) => (
            <div key={c.key} className="text-xs font-medium text-slate-400">{c.label}</div>
          ))}
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `${columns.map(() => '1fr').join(' ')} 32px` }}>
          {columns.map((c) => (
            <Input
              key={c.key}
              value={item[c.key] ?? ''}
              onChange={(e) => setField(i, c.key, e.target.value)}
              placeholder={c.placeholder}
            />
          ))}
          <Button variant="ghost" size="sm" onClick={() => remove(i)} className="shrink-0" type="button">
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={add} type="button">
        <PlusIcon /> {addLabel}
      </Button>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
