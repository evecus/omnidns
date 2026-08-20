import React, { useState } from 'react'
import { useConfig } from './ConfigContext'
import { Card, SectionTitle, Button, Input, Select, Toggle, FormRow } from '../../components/ui'
import { StringListEditor, ObjectListEditor } from './ListEditor'

export default function UpstreamsTab() {
  const { config, update, updateSection } = useConfig()
  const groups = config.groups || {}
  const groupNames = Object.keys(groups);
  const [newGroupName, setNewGroupName] = useState('')

  const addGroup = () => {
    const name = newGroupName.trim()
    if (!name || groups[name]) return
    updateSection('groups', {
      ...groups,
      [name]: { servers: [], strategy: 'random', insecure: false, 'client-subnet': null },
    })
    setNewGroupName('')
  }

  const removeGroup = (name) => {
    if (name === 'default') return // default 组（nameserver）不可删除
    const next = { ...groups }
    delete next[name]
    updateSection('groups', next)
  }

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle
          action={
            <div className="flex gap-2">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="新组名称"
                className="!w-40"
              />
              <Button size="sm" onClick={addGroup} type="button">添加上游组</Button>
            </div>
          }
        >
          上游组
        </SectionTitle>
        <p className="text-xs text-slate-400 mb-4">
          "default" 组对应保底 nameserver，其余组可被下方规则集引用。服务器地址支持 udp:// tcp:// tls:// https:// quic:// dhcp:// rcode:// 前缀。
        </p>

        <div className="space-y-4">
          {groupNames.map((name) => (
            <GroupCard
              key={name}
              name={name}
              group={groups[name]}
              onChange={(g) => updateSection('groups', { ...groups, [name]: g })}
              onRemove={() => removeGroup(name)}
              removable={name !== 'default'}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>规则集</SectionTitle>
        <p className="text-xs text-slate-400 mb-3">
          按顺序匹配域名规则集文件（.drs），命中后使用对应的上游组；未命中任何规则集时落到 default 组。
        </p>
        <Card>
          <ObjectListEditor
            items={config.rulesets || []}
            onChange={(v) => updateSection('rulesets', v)}
            addLabel="添加规则集"
            columns={[
              { key: 'path', label: '.drs 文件路径', placeholder: '/etc/relay/rulesets/cn.drs' },
              { key: 'upstream', label: '上游组名称', placeholder: '和上面的组名对应' },
            ]}
          />
        </Card>
      </div>
    </div>
  )
}

function GroupCard({ name, group, onChange, onRemove, removable }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-slate-800 text-sm">
          {name}
          {name === 'default' && <span className="ml-2 text-xs font-normal text-slate-400">（nameserver / 保底）</span>}
        </span>
        {removable && (
          <Button variant="ghost" size="sm" onClick={onRemove} type="button" className="text-rose-500 hover:bg-rose-50">
            删除组
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">负载均衡策略</label>
          <Select value={group.strategy || 'random'} onChange={(e) => onChange({ ...group, strategy: e.target.value })}>
            <option value="random">random</option>
            <option value="round_robin">round_robin</option>
            <option value="fastest">fastest</option>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">EDNS Client Subnet（可选）</label>
          <Input
            value={group['client-subnet'] || ''}
            onChange={(e) => onChange({ ...group, 'client-subnet': e.target.value || null })}
            placeholder="1.2.3.0/24"
          />
        </div>
      </div>

      <div className="mb-3">
        <Toggle
          checked={!!group.insecure}
          onChange={(v) => onChange({ ...group, insecure: v })}
          label="跳过 TLS 证书验证（DoT/DoH/DoQ，不建议开启）"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">服务器列表</label>
        <StringListEditor
          items={group.servers || []}
          onChange={(v) => onChange({ ...group, servers: v })}
          placeholder="tls://1.1.1.1 或 rcode://refused"
        />
      </div>
    </Card>
  )
}
