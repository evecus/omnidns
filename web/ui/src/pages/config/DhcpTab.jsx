import React, { useState } from 'react'
import { useConfig } from './ConfigContext'
import { Card, FormRow, Input, Select, Toggle } from '../../components/ui'
import { StringListEditor, ObjectListEditor } from './ListEditor'

const SUB_TABS = [
  { key: 'v4', label: 'DHCPv4' },
  { key: 'v6', label: 'DHCPv6' },
  { key: 'ra', label: 'RA (路由通告)' },
]

const EMPTY_V4 = {
  enable: false,
  interface: '',
  range: ['192.168.1.100', '192.168.1.200'],
  'lease-time': '12h',
  subnet: '255.255.255.0',
  gateway: '192.168.1.1',
  dns: [],
  domain: null,
  'lease-file': '/var/lib/relay/dhcp4-leases.json',
  'arp-probe': true,
  'static-leases': [],
}

const EMPTY_V6 = {
  enable: false,
  interface: '',
  mode: 'stateless',
  prefix: null,
  dns: [],
  domain: null,
  'lease-file': '/var/lib/relay/dhcp6-leases.json',
  'lease-time': '12h',
}

const EMPTY_RA = {
  enable: false,
  interface: '',
  preference: 'medium',
  interval: 200,
  managed: false,
  other: true,
  'router-lifetime': 1800,
  rdnss: [],
  'dns-lifetime': 1800,
  'suppress-other-routers': false,
}

export default function DhcpTab() {
  const [sub, setSub] = useState('v4')

  return (
    <div>
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sub === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'v4' && <V4Panel />}
      {sub === 'v6' && <V6Panel />}
      {sub === 'ra' && <RaPanel />}
    </div>
  )
}

function V4Panel() {
  const { config, update } = useConfig()
  const v4 = config.dhcp?.v4 || EMPTY_V4
  const set = (key, value) => update(['dhcp', 'v4'], { ...v4, [key]: value })
  const setRange = (idx, value) => {
    const range = [...(v4.range || ['', ''])]
    range[idx] = value
    set('range', range)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">在指定网卡上提供 DHCPv4 服务并派发地址租约。</p>
        <Toggle checked={!!v4.enable} onChange={(v) => set('enable', v)} label="启用" />
      </div>

      {v4.enable && (
        <div className="divide-y divide-slate-50">
          <FormRow label="网卡">
            <Input value={v4.interface} onChange={(e) => set('interface', e.target.value)} placeholder="eth0" />
          </FormRow>
          <FormRow label="地址池范围">
            <div className="flex items-center gap-2">
              <Input value={v4.range?.[0] || ''} onChange={(e) => setRange(0, e.target.value)} placeholder="192.168.1.100" />
              <span className="text-slate-400 text-sm">至</span>
              <Input value={v4.range?.[1] || ''} onChange={(e) => setRange(1, e.target.value)} placeholder="192.168.1.200" />
            </div>
          </FormRow>
          <FormRow label="子网掩码">
            <Input value={v4.subnet} onChange={(e) => set('subnet', e.target.value)} placeholder="255.255.255.0" />
          </FormRow>
          <FormRow label="网关">
            <Input value={v4.gateway} onChange={(e) => set('gateway', e.target.value)} placeholder="192.168.1.1" />
          </FormRow>
          <FormRow label="下发的 DNS 服务器">
            <StringListEditor items={v4.dns || []} onChange={(v) => set('dns', v)} placeholder="192.168.1.1" />
          </FormRow>
          <FormRow label="搜索域" hint="可选，如 lan">
            <Input value={v4.domain || ''} onChange={(e) => set('domain', e.target.value || null)} placeholder="lan" />
          </FormRow>
          <FormRow label="租约时长">
            <Input value={v4['lease-time']} onChange={(e) => set('lease-time', e.target.value)} placeholder="12h" />
          </FormRow>
          <FormRow label="租约文件路径">
            <Input value={v4['lease-file']} onChange={(e) => set('lease-file', e.target.value)} />
          </FormRow>
          <FormRow label="下发前 ARP 探测" hint="避免地址冲突，略微增加延迟">
            <Toggle checked={!!v4['arp-probe']} onChange={(v) => set('arp-probe', v)} />
          </FormRow>
          <FormRow label="静态租约" hint="按 MAC 地址固定分配 IP">
            <Card className="!p-3 !shadow-none !border-slate-100">
              <ObjectListEditor
                items={v4['static-leases'] || []}
                onChange={(v) => set('static-leases', v)}
                addLabel="添加静态租约"
                columns={[
                  { key: 'mac', label: 'MAC 地址', placeholder: 'aa:bb:cc:dd:ee:ff' },
                  { key: 'ip', label: 'IP 地址', placeholder: '192.168.1.10' },
                  { key: 'hostname', label: '主机名（可选）', placeholder: 'my-device' },
                ]}
              />
            </Card>
          </FormRow>
        </div>
      )}
    </div>
  )
}

function V6Panel() {
  const { config, update } = useConfig()
  const v6 = config.dhcp?.v6 || EMPTY_V6
  const set = (key, value) => update(['dhcp', 'v6'], { ...v6, [key]: value })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">在指定网卡上提供 DHCPv6 服务（stateless 或 stateful 模式）。</p>
        <Toggle checked={!!v6.enable} onChange={(v) => set('enable', v)} label="启用" />
      </div>

      {v6.enable && (
        <div className="divide-y divide-slate-50">
          <FormRow label="网卡">
            <Input value={v6.interface} onChange={(e) => set('interface', e.target.value)} placeholder="eth0" />
          </FormRow>
          <FormRow label="模式" hint="stateless 仅下发配置信息；stateful 分配地址">
            <Select value={v6.mode} onChange={(e) => set('mode', e.target.value)}>
              <option value="stateless">stateless</option>
              <option value="stateful">stateful</option>
            </Select>
          </FormRow>
          <FormRow label="前缀" hint="stateful 模式下用于地址分配，如 2001:db8::/64">
            <Input value={v6.prefix || ''} onChange={(e) => set('prefix', e.target.value || null)} placeholder="2001:db8::/64" />
          </FormRow>
          <FormRow label="下发的 DNS 服务器">
            <StringListEditor items={v6.dns || []} onChange={(v) => set('dns', v)} placeholder="2001:db8::1" />
          </FormRow>
          <FormRow label="搜索域" hint="可选">
            <Input value={v6.domain || ''} onChange={(e) => set('domain', e.target.value || null)} placeholder="lan" />
          </FormRow>
          <FormRow label="租约时长">
            <Input value={v6['lease-time']} onChange={(e) => set('lease-time', e.target.value)} placeholder="12h" />
          </FormRow>
          <FormRow label="租约文件路径">
            <Input value={v6['lease-file']} onChange={(e) => set('lease-file', e.target.value)} />
          </FormRow>
        </div>
      )}
    </div>
  )
}

function RaPanel() {
  const { config, update } = useConfig()
  const ra = config.dhcp?.ra || EMPTY_RA
  const set = (key, value) => update(['dhcp', 'ra'], { ...ra, [key]: value })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">发送 IPv6 路由通告（Router Advertisement），供设备自动配置 IPv6。</p>
        <Toggle checked={!!ra.enable} onChange={(v) => set('enable', v)} label="启用" />
      </div>

      {ra.enable && (
        <div className="divide-y divide-slate-50">
          <FormRow label="网卡">
            <Input value={ra.interface} onChange={(e) => set('interface', e.target.value)} placeholder="eth0" />
          </FormRow>
          <FormRow label="路由优先级">
            <Select value={ra.preference} onChange={(e) => set('preference', e.target.value)}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </Select>
          </FormRow>
          <FormRow label="通告间隔（秒）">
            <Input type="number" min={1} value={ra.interval} onChange={(e) => set('interval', Number(e.target.value))} />
          </FormRow>
          <FormRow label="Managed 标志" hint="提示客户端通过 DHCPv6 获取地址">
            <Toggle checked={!!ra.managed} onChange={(v) => set('managed', v)} />
          </FormRow>
          <FormRow label="Other 标志" hint="提示客户端通过 DHCPv6 获取其它配置（如 DNS）">
            <Toggle checked={!!ra.other} onChange={(v) => set('other', v)} />
          </FormRow>
          <FormRow label="路由器生命周期（秒）">
            <Input type="number" min={0} value={ra['router-lifetime']} onChange={(e) => set('router-lifetime', Number(e.target.value))} />
          </FormRow>
          <FormRow label="RDNSS（下发的 DNS 服务器）">
            <StringListEditor items={ra.rdnss || []} onChange={(v) => set('rdnss', v)} placeholder="2001:db8::1" />
          </FormRow>
          <FormRow label="DNS 生命周期（秒）">
            <Input type="number" min={0} value={ra['dns-lifetime']} onChange={(e) => set('dns-lifetime', Number(e.target.value))} />
          </FormRow>
          <FormRow label="抑制其它路由器" hint="发送 Router Lifetime=0 抑制其它路由器的通告">
            <Toggle checked={!!ra['suppress-other-routers']} onChange={(v) => set('suppress-other-routers', v)} />
          </FormRow>
        </div>
      )}
    </div>
  )
}
