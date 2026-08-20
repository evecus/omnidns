import React from 'react'
import { useConfig } from './ConfigContext'
import { FormRow, Input, Select, Toggle } from '../../components/ui'
import { StringListEditor } from './ListEditor'

export default function BasicTab() {
  const { config, update } = useConfig()

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
    </div>
  )
}
