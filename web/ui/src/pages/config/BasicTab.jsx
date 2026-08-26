import React from 'react'
import { useConfig } from './ConfigContext'
import { FormRow, Input, Select, Toggle, SectionTitle, Card } from '../../components/ui'
import { StringListEditor } from './ListEditor'

export default function BasicTab() {
  const { config, update, updateSection } = useConfig()
  const groups = config.groups || {}
  const defaultGroup = groups.default || {
    servers: [],
    strategy: 'round_robin',
    insecure: false,
    'client-subnet': null,
  }

  const setDefaultGroup = (g) => {
    updateSection('groups', { ...groups, default: g })
  }

  return (
    <div className="divide-y divide-slate-50">
      <FormRow label="日志级别" hint="需要重启进程才生效">
        <Select value={config['log-level']} onChange={(e) => update(['log-level'], e.target.value)}>
          <option value="trace">trace</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </Select>
      </FormRow>

      <FormRow label="DNS 监听地址" hint="如 0.0.0.0:53，热更新生效">
        <Input value={config.listen} onChange={(e) => update(['listen'], e.target.value)} placeholder="0.0.0.0:53" />
      </FormRow>

      <FormRow label="IP 策略" hint="控制返回的地址族偏好">
        <Select value={config.strategy} onChange={(e) => update(['strategy'], e.target.value)}>
          <option value="all">all（都返回）</option>
          <option value="prefer_ipv4">prefer_ipv4</option>
          <option value="prefer_ipv6">prefer_ipv6</option>
          <option value="ipv4_only">ipv4_only</option>
          <option value="ipv6_only">ipv6_only</option>
        </Select>
      </FormRow>

      <FormRow label="接管 resolv.conf" hint="需要重启进程才生效；开启后会把 /etc/resolv.conf 指向自身">
        <Toggle checked={config['manage-resolv-conf']} onChange={(v) => update(['manage-resolv-conf'], v)} />
      </FormRow>

      <FormRow label="上游域名解析 DNS" hint="用于解析上游服务器自身域名的递归 DNS，必须是 IP 字面量">
        <StringListEditor
          items={config['default-nameserver'] || []}
          onChange={(v) => update(['default-nameserver'], v)}
          placeholder="1.1.1.1 或 1.1.1.1:53"
        />
      </FormRow>

      {/* nameserver / default 组：保底上游，放在「上游域名解析 DNS」下面 */}
      <div className="py-4">
        <SectionTitle>保底上游（nameserver）</SectionTitle>
        <p className="text-xs text-slate-400 mb-3">
          对应配置文件的 nameserver，即 default 组。所有 DNS 规则都未命中时走这里。
          支持 udp:// tcp:// tls:// https:// quic:// dhcp:// rcode:// 前缀。
        </p>
        <Card className="!p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">负载均衡策略</label>
              <Select
                value={defaultGroup.strategy || 'round_robin'}
                onChange={(e) => setDefaultGroup({ ...defaultGroup, strategy: e.target.value })}
              >
                <option value="random">random</option>
                <option value="round_robin">round_robin</option>
                <option value="fastest">fastest</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">EDNS Client Subnet（可选）</label>
              <Input
                value={defaultGroup['client-subnet'] || ''}
                onChange={(e) =>
                  setDefaultGroup({ ...defaultGroup, 'client-subnet': e.target.value || null })
                }
                placeholder="1.2.3.0/24"
              />
            </div>
          </div>
          <div className="mb-3">
            <Toggle
              checked={!!defaultGroup.insecure}
              onChange={(v) => setDefaultGroup({ ...defaultGroup, insecure: v })}
              label="跳过 TLS 证书验证（DoT/DoH/DoQ，不建议开启）"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">服务器列表</label>
            <StringListEditor
              items={defaultGroup.servers || []}
              onChange={(v) => setDefaultGroup({ ...defaultGroup, servers: v })}
              placeholder="tls://1.1.1.1 或 rcode://refused"
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
