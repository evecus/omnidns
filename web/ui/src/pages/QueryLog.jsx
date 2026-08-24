import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { Card, Badge, Input, Toggle, EmptyState, Spinner, Button } from '../components/ui'

export default function QueryLog() {
  const { handleAuthError } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [domain, setDomain] = useState('')
  const [client, setClient] = useState('')
  const [history, setHistory] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.querylog({ limit: 200, domain, client, history })
      setRows(data)
    } catch (e) {
      if (e.name === 'AuthError') return handleAuthError()
    } finally {
      setLoading(false)
    }
  }, [domain, client, history, handleAuthError])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh || history) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [autoRefresh, history, load])

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">查询日志</h1>
          <p className="text-sm text-slate-500 mt-1">
            {history ? '来自 SQLite 历史记录' : '内存中最近的查询（实时）'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Toggle checked={history} onChange={setHistory} label="历史记录" />
          {!history && <Toggle checked={autoRefresh} onChange={setAutoRefresh} label="自动刷新" />}
          <Button variant="secondary" size="sm" onClick={load}>刷新</Button>
        </div>
      </div>

      <Card className="!p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px]">
            <Input placeholder="按域名过滤…" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Input placeholder="按客户端 IP 过滤…" value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Spinner className="w-6 h-6" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="暂无记录" hint="试试调整过滤条件" />
        ) : (
          <>
            {/* 桌面端：表格，sm 以上显示 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100 sticky top-0 bg-white">
                    <th className="px-5 py-2.5 font-medium">时间</th>
                    <th className="px-5 py-2.5 font-medium">客户端</th>
                    <th className="px-5 py-2.5 font-medium">域名</th>
                    <th className="px-5 py-2.5 font-medium">类型</th>
                    <th className="px-5 py-2.5 font-medium">规则</th>
                    <th className="px-5 py-2.5 font-medium">来源</th>
                    <th className="px-5 py-2.5 font-medium">响应码</th>
                    <th className="px-5 py-2.5 font-medium text-right">延迟</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => (
                    <tr key={q.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-2 text-slate-400 text-xs whitespace-nowrap">{formatTime(q.time)}</td>
                      <td className="px-5 py-2 text-slate-500 whitespace-nowrap">{q.client}</td>
                      <td className="px-5 py-2 font-medium text-slate-700 truncate max-w-[240px]">{q.domain}</td>
                      <td className="px-5 py-2 text-slate-500">{q.qtype}</td>
                      <td className="px-5 py-2 text-slate-500">{q.rule || '—'}</td>
                      <td className="px-5 py-2 text-slate-500">
                        {q.cached && <Badge tone="blue">cache</Badge>}
                        {!q.cached && q.upstream}
                      </td>
                      <td className="px-5 py-2">
                        <Badge tone={q.rcode === 'NOERROR' ? 'green' : q.blocked ? 'red' : 'amber'}>{q.rcode}</Badge>
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-slate-400">{q.latency_ms?.toFixed(1)} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 移动端：卡片列表，sm 以下显示。8 列表格在窄屏上只能横向滑动
                查看，字段容易和表头对不上；改为每条记录一张卡片，突出域名
                和响应码，其余字段用标签形式排布，更符合手机上的浏览习惯。 */}
            <div className="sm:hidden divide-y divide-slate-50">
              {rows.map((q) => (
                <div key={q.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-700 text-sm break-all">{q.domain}</span>
                    <Badge tone={q.rcode === 'NOERROR' ? 'green' : q.blocked ? 'red' : 'amber'}>{q.rcode}</Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>{formatTime(q.time)}</span>
                    <span>{q.qtype}</span>
                    <span className="tabular-nums">{q.latency_ms?.toFixed(1)} ms</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>客户端 {q.client}</span>
                    <span className="flex items-center gap-1">
                      来源 {q.cached ? <Badge tone="blue">cache</Badge> : q.upstream}
                    </span>
                    {q.rule && <span>规则 {q.rule}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function formatTime(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}
