import React, { useEffect, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { api, ApiError } from '../api'
import { useAuth } from '../context/AuthContext'
import { Card, StatCard, Badge, SectionTitle, EmptyState, Spinner } from '../components/ui'

const COLORS = ['#5b63ee', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6']

export default function Dashboard() {
  const { handleAuthError } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const d = await api.dashboard()
      setData(d)
      setError('')
    } catch (e) {
      if (e.name === 'AuthError') return handleAuthError()
      setError(e instanceof ApiError ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [handleAuthError])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Spinner className="w-6 h-6" />
      </div>
    )
  }

  if (error && !data) {
    return <EmptyState title="加载失败" hint={error} />
  }

  const { stats, upstreams, rules, clients, recent_queries } = data

  const rcodeData = (stats.by_rcode || []).map(([name, value]) => ({ name, value }))
  const upstreamData = upstreams.map(([name, s]) => ({ name, queries: s.queries, latency: Number(s.latency_ema_ms?.toFixed(1) || 0) }))

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">概览</h1>
        <p className="text-sm text-slate-500 mt-1">
          运行时长：{formatUptime(stats.started_at)}
        </p>
      </div>

      {/* 顶部统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="总查询数" value={formatNum(stats.total_queries)} icon={QueryIcon} accent="brand" />
        <StatCard label="已拦截" value={formatNum(stats.total_blocked)} icon={BlockIcon} accent="rose" />
        <StatCard label="缓存命中" value={formatNum(stats.cache_hits)} icon={CacheIcon} accent="emerald" />
        <StatCard label="平均延迟" value={`${stats.avg_latency_ms?.toFixed(1) ?? 0} ms`} icon={LatencyIcon} accent="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 响应码分布 */}
        <Card>
          <SectionTitle>响应码分布</SectionTitle>
          {rcodeData.length === 0 ? (
            <EmptyState title="暂无数据" />
          ) : (
            <div className="h-56 flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rcodeData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {rcodeData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 pr-2 shrink-0">
                {rcodeData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-slate-600">{d.name}</span>
                    <span className="text-slate-400 tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* 上游延迟 */}
        <Card>
          <SectionTitle>上游延迟 (ms)</SectionTitle>
          {upstreamData.length === 0 ? (
            <EmptyState title="暂无上游数据" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={upstreamData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="latency" fill="#5b63ee" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 上游表格 */}
        <Card>
          <SectionTitle>上游状态</SectionTitle>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2 font-medium">名称</th>
                  <th className="px-5 py-2 font-medium text-right">查询</th>
                  <th className="px-5 py-2 font-medium text-right">成功率</th>
                  <th className="px-5 py-2 font-medium text-right">延迟</th>
                </tr>
              </thead>
              <tbody>
                {upstreams.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-slate-400 text-sm">暂无数据</td>
                  </tr>
                ) : (
                  upstreams.map(([name, s]) => {
                    const rate = s.queries > 0 ? ((s.success / s.queries) * 100).toFixed(1) : '—'
                    return (
                      <tr key={name} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-2.5 font-medium text-slate-700">{name}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-slate-500">{s.queries}</td>
                        <td className="px-5 py-2.5 text-right">
                          <Badge tone={rate === '—' ? 'slate' : Number(rate) > 95 ? 'green' : Number(rate) > 80 ? 'amber' : 'red'}>
                            {rate === '—' ? rate : `${rate}%`}
                          </Badge>
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-slate-500">{s.latency_ema_ms?.toFixed(1)} ms</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 规则命中 + 客户端 */}
        <Card>
          <SectionTitle>规则命中 Top</SectionTitle>
          <div className="space-y-2 mt-2">
            {rules.length === 0 ? (
              <EmptyState title="暂无规则命中" />
            ) : (
              rules.slice(0, 8).map(([name, count]) => {
                const max = rules[0][1] || 1
                const pct = Math.max(4, (count / max) * 100)
                return (
                  <div key={name} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 truncate text-slate-600">{name}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right tabular-nums text-slate-400 text-xs">{count}</span>
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </div>

      {/* 最近查询 */}
      <Card>
        <SectionTitle>最近查询</SectionTitle>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2 font-medium">时间</th>
                <th className="px-5 py-2 font-medium">域名</th>
                <th className="px-5 py-2 font-medium">类型</th>
                <th className="px-5 py-2 font-medium">来源</th>
                <th className="px-5 py-2 font-medium">响应码</th>
                <th className="px-5 py-2 font-medium text-right">延迟</th>
              </tr>
            </thead>
            <tbody>
              {(recent_queries || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-slate-400 text-sm">暂无查询记录</td>
                </tr>
              ) : (
                recent_queries.slice(0, 10).map((q) => (
                  <tr key={q.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-2 text-slate-400 text-xs whitespace-nowrap">{formatTime(q.time)}</td>
                    <td className="px-5 py-2 font-medium text-slate-700 truncate max-w-[220px]">{q.domain}</td>
                    <td className="px-5 py-2 text-slate-500">{q.qtype}</td>
                    <td className="px-5 py-2 text-slate-500">{q.upstream}</td>
                    <td className="px-5 py-2">
                      <Badge tone={q.rcode === 'NOERROR' ? 'green' : q.blocked ? 'red' : 'amber'}>{q.rcode}</Badge>
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-slate-400">{q.latency_ms?.toFixed(1)} ms</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function formatNum(n) {
  if (n == null) return '0'
  return n.toLocaleString('zh-CN')
}

function formatTime(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function formatUptime(startedAt) {
  try {
    const start = new Date(startedAt).getTime()
    const diff = Math.max(0, Date.now() - start)
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (h > 24) {
      const d = Math.floor(h / 24)
      return `${d} 天 ${h % 24} 小时`
    }
    return `${h} 小时 ${m} 分钟`
  } catch {
    return '—'
  }
}

function QueryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function BlockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
    </svg>
  )
}
function CacheIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}
function LatencyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
