import React from 'react'
import { useConfig } from './ConfigContext'
import { FormRow, Input, Select, Toggle } from '../../components/ui'

const EMPTY_FW = {
  enable: false,
  backend: 'auto',
  'localhost-hijack': true,
  'lan-hijack': false,
  'lan-cidr': null,
  'lan-interface': null,
}

export default function FirewallTab() {
  const { config, update } = useConfig()
  const fw = config.firewall || EMPTY_FW

  const set = (key, value) => {
    update(['firewall'], { ...fw, [key]: value })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            透明代理：把设备上其它进程发出的 DNS 请求（53 端口）强制重定向到 relay 自身，避免被绕过。
          </p>
        </div>
        <Toggle checked={!!fw.enable} onChange={(v) => set('enable', v)} label="启用" />
      </div>

      {fw.enable && (
        <div className="divide-y divide-slate-50">
          <FormRow label="后端" hint="auto 会自动探测 nftables/iptables/pf">
            <Select value={fw.backend || 'auto'} onChange={(e) => set('backend', e.target.value)}>
              <option value="auto">auto</option>
              <option value="nftables">nftables</option>
              <option value="iptables">iptables</option>
              <option value="pf">pf (macOS/BSD)</option>
            </Select>
          </FormRow>

          <FormRow label="劫持本机 DNS 请求" hint="重定向本机发出的 53 端口流量">
            <Toggle checked={!!fw['localhost-hijack']} onChange={(v) => set('localhost-hijack', v)} />
          </FormRow>

          <FormRow label="劫持局域网 DNS 请求" hint="重定向经过本机转发的局域网设备 DNS 流量（需配合 DHCP 使用）">
            <Toggle checked={!!fw['lan-hijack']} onChange={(v) => set('lan-hijack', v)} />
          </FormRow>

          {fw['lan-hijack'] && (
            <>
              <FormRow label="局域网 CIDR" hint="如 192.168.1.0/24">
                <Input
                  value={fw['lan-cidr'] || ''}
                  onChange={(e) => set('lan-cidr', e.target.value || null)}
                  placeholder="192.168.1.0/24"
                />
              </FormRow>
              <FormRow label="局域网网卡" hint="如 eth0">
                <Input
                  value={fw['lan-interface'] || ''}
                  onChange={(e) => set('lan-interface', e.target.value || null)}
                  placeholder="eth0"
                />
              </FormRow>
            </>
          )}
        </div>
      )}
    </div>
  )
}
