import React from 'react'
import { Input, Button } from '../../components/ui'

// 通用"字符串列表"编辑器（比如 servers、default-nameserver）。
// 输入框占满剩余宽度，避免移动端被挤成窄条。
export function StringListEditor({ items = [], onChange, placeholder }) {
  const set = (i, v) => {
    const next = [...items]
    next[i] = v
    onChange(next)
  }
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const add = () => onChange([...items, ''])

  return (
    <div className="space-y-2 w-full">
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-2 w-full min-w-0">
          <Input
            value={v}
            onChange={(e) => set(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-0 w-full py-2.5"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => remove(i)}
            className="shrink-0 !px-2.5 self-stretch"
            type="button"
            aria-label="删除"
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={add} type="button" className="w-full sm:w-auto">
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
    <div className="space-y-2 w-full">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-2 w-full min-w-0">
          <Input
            value={k}
            onChange={(e) => setRow(i, e.target.value, v)}
            placeholder={keyPlaceholder}
            className="flex-1 min-w-0 py-2.5"
          />
          <Input
            value={v}
            onChange={(e) => setRow(i, k, e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 min-w-0 py-2.5"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeRow(i)}
            className="shrink-0 self-end sm:self-center"
            type="button"
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={addRow} type="button" className="w-full sm:w-auto">
        <PlusIcon /> 添加
      </Button>
    </div>
  )
}

// 通用"对象数组"编辑器，columns 定义每列的 key/placeholder/type。
// 用于 rulesets（path, upstream）、static-leases（mac, ip, hostname）等。
//
// 移动端适配：桌面端（sm 及以上）沿用原来的等宽 grid 表格布局；
// 小屏幕下每一行会挤压成没法输入的窄条（比如静态租约是 3 列 + 删除按钮，
// 375px 宽的手机上每个输入框不到 80px，placeholder 都放不下），所以
// 移动端改为每行一张卡片，每个字段带上自己的 label 竖排列出，删除按钮
// 放在卡片右上角，保证任何列数下都可用。
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

  // 桌面端 grid 的列宽用 CSS 变量传入，配合下方 <style> 里的媒体查询生效；
  // 移动端（<640px）该媒体查询不生效，容器退回 flex 竖排卡片布局。
  const desktopGridStyle = { '--obj-list-cols': `repeat(${columns.length}, 1fr) 32px` }

  return (
    <div className="space-y-2 w-full">
      {/* 桌面端表头，移动端隐藏（卡片布局下每个字段自带 label） */}
      {items.length > 0 && (
        <div className="hidden sm:grid gap-2 px-0.5 obj-list-row" style={desktopGridStyle}>
          {columns.map((c) => (
            <div key={c.key} className="text-xs font-medium text-slate-400">{c.label}</div>
          ))}
        </div>
      )}
      {items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 p-3 rounded-xl border border-slate-100 sm:border-0 sm:p-0 sm:rounded-none sm:grid sm:gap-2 obj-list-row w-full min-w-0"
          style={desktopGridStyle}
        >
          {/* 移动端：右上角删除按钮 */}
          <div className="flex justify-end sm:hidden -mt-1 -mr-1">
            <Button variant="ghost" size="sm" onClick={() => remove(i)} type="button" className="text-rose-500 hover:bg-rose-50">
              <TrashIcon /> 删除
            </Button>
          </div>
          {columns.map((c) => (
            <div key={c.key} className="sm:contents min-w-0">
              <label className="text-xs font-medium text-slate-400 mb-1 block sm:hidden">{c.label}</label>
              <Input
                value={item[c.key] ?? ''}
                onChange={(e) => setField(i, c.key, e.target.value)}
                placeholder={c.placeholder}
                className="w-full min-w-0 py-2.5"
              />
            </div>
          ))}
          {/* 桌面端：行尾删除按钮 */}
          <Button variant="ghost" size="sm" onClick={() => remove(i)} className="hidden sm:inline-flex shrink-0" type="button">
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={add} type="button" className="w-full sm:w-auto">
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
