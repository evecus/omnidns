import React from 'react'
import { useConfig } from './ConfigContext'
import { FormRow, Input, Toggle } from '../../components/ui'

export default function CacheTab() {
  const { config, update } = useConfig()
  const cache = config.cache || {}

  return (
    <div className="divide-y divide-slate-50">
      <FormRow label="启用缓存">
        <Toggle checked={!!cache.enable} onChange={(v) => update(['cache', 'enable'], v)} />
      </FormRow>
      <FormRow label="缓存条目数上限">
        <Input
          type="number"
          min={1}
          value={cache.size ?? 4096}
          onChange={(e) => update(['cache', 'size'], Number(e.target.value))}
        />
      </FormRow>
      <FormRow label="最小 TTL（秒）" hint="0 表示不覆盖上游返回的 TTL">
        <Input
          type="number"
          min={0}
          value={cache['min-ttl'] ?? 0}
          onChange={(e) => update(['cache', 'min-ttl'], Number(e.target.value))}
        />
      </FormRow>
      <FormRow label="最大 TTL（秒）" hint="0 表示不限制">
        <Input
          type="number"
          min={0}
          value={cache['max-ttl'] ?? 0}
          onChange={(e) => update(['cache', 'max-ttl'], Number(e.target.value))}
        />
      </FormRow>
    </div>
  )
}
