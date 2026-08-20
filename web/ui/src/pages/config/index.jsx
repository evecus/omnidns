import React, { useState } from 'react'
import { ConfigProvider, useConfig } from './ConfigContext'
import { Card, Button, Spinner, EmptyState } from '../../components/ui'
import BasicTab from './BasicTab'
import UpstreamsTab from './UpstreamsTab'
import HostsTab from './HostsTab'
import CacheTab from './CacheTab'
import FirewallTab from './FirewallTab'
import DhcpTab from './DhcpTab'
import WebTab from './WebTab'

const TABS = [
  { key: 'basic', label: '基础', component: BasicTab },
  { key: 'upstreams', label: '上游 / 规则', component: UpstreamsTab },
  { key: 'hosts', label: 'Hosts', component: HostsTab },
  { key: 'cache', label: '缓存', component: CacheTab },
  { key: 'firewall', label: '防火墙', component: FirewallTab },
  { key: 'dhcp', label: 'DHCP / RA', component: DhcpTab },
  { key: 'web', label: '面板设置', component: WebTab },
]

export default function ConfigPage() {
  return (
    <ConfigProvider>
      <ConfigPageInner />
    </ConfigProvider>
  )
}

function ConfigPageInner() {
  const { config, loading, saving, dirty, error, save, reload } = useConfig()
  const [activeTab, setActiveTab] = useState('basic')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Spinner className="w-6 h-6" />
      </div>
    )
  }

  if (error && !config) {
    return <EmptyState title="加载配置失败" hint={error} />
  }

  const ActiveComponent = TABS.find((t) => t.key === activeTab)?.component

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">配置</h1>
          <p className="text-sm text-slate-500 mt-1">修改后点击"保存并应用"，多数配置项会立即热更新生效</p>
        </div>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={reload} type="button">
            放弃修改
          </Button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
              activeTab === t.key
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>{ActiveComponent && <ActiveComponent />}</Card>

      {/* 悬浮保存条 */}
      <div
        className={`fixed bottom-0 left-0 lg:left-64 right-0 z-40 transition-transform duration-200 ${
          dirty ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 lg:px-8 pb-4">
          <div className="bg-white border border-slate-200 shadow-card-hover rounded-2xl px-5 py-3.5 flex items-center justify-between">
            <span className="text-sm text-slate-600">有未保存的修改</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={reload} type="button">
                取消
              </Button>
              <Button size="sm" onClick={save} disabled={saving} type="button">
                {saving ? '保存中…' : '保存并应用'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
