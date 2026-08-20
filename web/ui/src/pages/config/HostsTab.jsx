import React from 'react'
import { useConfig } from './ConfigContext'
import { Card, SectionTitle } from '../../components/ui'
import { KeyValueEditor } from './ListEditor'

export default function HostsTab() {
  const { config, updateSection } = useConfig()

  return (
    <div>
      <SectionTitle>静态 Hosts</SectionTitle>
      <p className="text-xs text-slate-400 mb-3">优先级最高，命中后直接返回，不再走上游或规则集。</p>
      <Card>
        <KeyValueEditor
          entries={config.hosts || {}}
          onChange={(v) => updateSection('hosts', v)}
          keyPlaceholder="hostname，如 nas.local"
          valuePlaceholder="IP 地址"
        />
      </Card>
    </div>
  )
}
