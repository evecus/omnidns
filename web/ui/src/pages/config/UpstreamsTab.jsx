import React, { useEffect, useRef, useState } from 'react'
import { useConfig } from './ConfigContext'
import { Card, SectionTitle, Button, Input, Select, Toggle } from '../../components/ui'
import { StringListEditor } from './ListEditor'

/**
 * 「DNS 规则 / 规则集」页
 *
 * 前端视图：
 *   1. 规则集库 catalog: [{ name, path }] — 名称供 DNS 规则勾选
 *   2. DNS 规则 dnsRules: [{ rulesets, servers, strategy, insecure, clientSubnet }]
 *      - 按顺序匹配；规则集多选；上游 DNS 直接填写
 *      - strategy / ECS / insecure 作用在「本条规则」对应的隐式上游组上，
 *        组内所有服务器共用，不能按单个 URL 单独配置（与后端一致）
 *
 * 与后端映射：
 *   - 每条 DNS 规则 → 一个隐式 group（名取自首个规则集名或 rule-N）
 *   - 保存时保留 groups.default，其余由规则重建；rulesets 按顺序展开
 */

function basenameNoExt(p) {
  if (!p) return ''
  const base = String(p).split(/[/\\]/).pop() || ''
  return base.replace(/\.drs$/i, '') || base
}

function emptyRule() {
  return {
    rulesets: [],
    servers: [],
    strategy: 'round_robin',
    insecure: false,
    clientSubnet: null,
  }
}

function fromBackend(config) {
  const rulesets = config.rulesets || []
  const groups = config.groups || {}
  const catalogMap = new Map()
  const pathToName = new Map()
  const rules = []

  for (const entry of rulesets) {
    const path = entry.path || ''
    const upstream = entry.upstream || ''

    let name = pathToName.get(path)
    if (!name && path) {
      name = basenameNoExt(path)
      if (catalogMap.has(name) && catalogMap.get(name) !== path) {
        let i = 2
        while (catalogMap.has(`${name}_${i}`)) i += 1
        name = `${name}_${i}`
      }
      catalogMap.set(name, path)
      pathToName.set(path, name)
    }

    const g = groups[upstream] || {}
    const last = rules[rules.length - 1]
    if (last && last._upstream === upstream) {
      if (name && !last.rulesets.includes(name)) {
        last.rulesets = [...last.rulesets, name]
      }
    } else {
      rules.push({
        rulesets: name ? [name] : [],
        servers: [...(g.servers || [])],
        strategy: g.strategy || 'round_robin',
        insecure: !!g.insecure,
        clientSubnet: g['client-subnet'] ?? null,
        _upstream: upstream,
      })
    }
  }

  const catalog = Array.from(catalogMap.entries()).map(([name, path]) => ({ name, path }))
  const dnsRules = rules.map(({ _upstream, ...r }) => r)
  return { catalog, dnsRules }
}

function groupNameForRule(rule, index, used) {
  const base =
    (rule.rulesets && rule.rulesets[0] && String(rule.rulesets[0]).trim()) || `rule-${index + 1}`
  let name = base
  if (name === 'default') name = `rule-${index + 1}`
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  let i = 2
  while (used.has(`${base}-${i}`)) i += 1
  const finalName = `${base}-${i}`
  used.add(finalName)
  return finalName
}

function commitToConfig(config, updateSection, catalog, dnsRules) {
  const pathOf = Object.fromEntries(catalog.map((c) => [c.name, c.path]))
  const groups = { ...(config.groups || {}) }
  const defaultGroup = groups.default || {
    servers: [],
    strategy: 'round_robin',
    insecure: false,
    'client-subnet': null,
  }

  const nextGroups = { default: defaultGroup }
  const nextRulesets = []
  const usedNames = new Set(['default'])

  dnsRules.forEach((rule, index) => {
    const gName = groupNameForRule(rule, index, usedNames)
    nextGroups[gName] = {
      servers: rule.servers || [],
      strategy: rule.strategy || 'round_robin',
      insecure: !!rule.insecure,
      'client-subnet': rule.clientSubnet || null,
    }
    const names = rule.rulesets?.length ? rule.rulesets : []
    for (const rsName of names) {
      const path = pathOf[rsName]
      if (path) nextRulesets.push({ path, upstream: gName })
    }
  })

  updateSection('groups', nextGroups)
  updateSection('rulesets', nextRulesets)
}

export default function UpstreamsTab() {
  const { config, updateSection, dirty } = useConfig()

  const boot = fromBackend(config)
  const [catalog, setCatalog] = useState(boot.catalog)
  const [dnsRules, setDnsRules] = useState(boot.dnsRules)
  const [newRsName, setNewRsName] = useState('')
  const [newRsPath, setNewRsPath] = useState('')

  const prevDirty = useRef(dirty)
  useEffect(() => {
    if (prevDirty.current && !dirty) {
      const next = fromBackend(config)
      setCatalog(next.catalog)
      setDnsRules(next.dnsRules)
    }
    prevDirty.current = dirty
  }, [dirty, config])

  const commit = (nextCatalog, nextRules) => {
    setCatalog(nextCatalog)
    setDnsRules(nextRules)
    commitToConfig(config, updateSection, nextCatalog, nextRules)
  }

  const addCatalogEntry = () => {
    const name = newRsName.trim()
    const path = newRsPath.trim()
    if (!name || !path) return
    if (catalog.some((c) => c.name === name)) return
    commit([...catalog, { name, path }], dnsRules)
    setNewRsName('')
    setNewRsPath('')
  }

  const updateCatalogEntry = (i, patch) => {
    const next = catalog.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    let nextRules = dnsRules
    if (patch.name && patch.name !== catalog[i].name) {
      const oldName = catalog[i].name
      nextRules = dnsRules.map((r) => ({
        ...r,
        rulesets: (r.rulesets || []).map((n) => (n === oldName ? patch.name : n)),
      }))
    }
    commit(next, nextRules)
  }

  const removeCatalogEntry = (i) => {
    const name = catalog[i].name
    const next = catalog.filter((_, idx) => idx !== i)
    const nextRules = dnsRules.map((r) => ({
      ...r,
      rulesets: (r.rulesets || []).filter((n) => n !== name),
    }))
    commit(next, nextRules)
  }

  const addRule = () => commit(catalog, [...dnsRules, emptyRule()])

  const updateRule = (i, patch) => {
    commit(
      catalog,
      dnsRules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    )
  }

  const removeRule = (i) => commit(catalog, dnsRules.filter((_, idx) => idx !== i))

  const moveRule = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= dnsRules.length) return
    const next = [...dnsRules]
    ;[next[i], next[j]] = [next[j], next[i]]
    commit(catalog, next)
  }

  const catalogNames = catalog.map((c) => c.name)

  return (
    <div className="space-y-6">
      {/* ===== 规则集库 ===== */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-4">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-200 text-slate-600 text-xs font-bold shrink-0">
            1
          </span>
          <div className="min-w-0">
            <SectionTitle>规则集</SectionTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              登记「名称 → .drs 文件」。这里只做资源库，不决定匹配顺序；名称供下方 DNS 规则勾选。
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-3">
          {catalog.map((c, i) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl border border-slate-200 bg-white"
            >
              <div className="sm:w-40">
                <label className="text-xs text-slate-400 mb-1 block sm:hidden">名称</label>
                <Input
                  value={c.name}
                  onChange={(e) => updateCatalogEntry(i, { name: e.target.value })}
                  placeholder="cn"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block sm:hidden">.drs 路径</label>
                <Input
                  value={c.path}
                  onChange={(e) => updateCatalogEntry(i, { path: e.target.value })}
                  placeholder="/etc/relay/cn.drs"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeCatalogEntry(i)}
                type="button"
                className="text-rose-500 shrink-0"
              >
                删除
              </Button>
            </div>
          ))}
          {catalog.length === 0 && (
            <p className="text-xs text-slate-400 py-2 px-1">尚未添加规则集。先添加名称和 .drs 路径。</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={newRsName}
            onChange={(e) => setNewRsName(e.target.value)}
            placeholder="规则集名称，如 cn"
            className="sm:!w-40"
          />
          <Input
            value={newRsPath}
            onChange={(e) => setNewRsPath(e.target.value)}
            placeholder=".drs 路径，如 /etc/relay/cn.drs"
            className="flex-1"
          />
          <Button size="sm" onClick={addCatalogEntry} type="button" className="shrink-0">
            添加规则集
          </Button>
        </div>
      </section>

      {/* 分隔说明 */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
          匹配顺序在下方配置
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* ===== DNS 规则 ===== */}
      <section className="rounded-2xl border border-brand-100 bg-brand-50/30 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold shrink-0">
              2
            </span>
            <div className="min-w-0">
              <SectionTitle>DNS 规则</SectionTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                按列表顺序匹配，第一条命中生效；全部未命中走「基础」里的保底上游。
                规则集从上方勾选；上游 DNS 在本条内直接填写。
              </p>
            </div>
          </div>
          <Button size="sm" onClick={addRule} type="button" disabled={catalogNames.length === 0}>
            添加规则
          </Button>
        </div>

        <div className="space-y-3">
          {dnsRules.map((rule, i) => (
            <Card key={i} className="!p-4 !shadow-none border-slate-200">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                  <span className="text-xs font-mono text-slate-400 w-6 text-center">{i + 1}</span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => moveRule(i, -1)}
                    title="上移"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    disabled={i === dnsRules.length - 1}
                    onClick={() => moveRule(i, 1)}
                    title="下移"
                  >
                    ▼
                  </button>
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                      规则集（可多选）
                    </label>
                    {catalogNames.length === 0 ? (
                      <p className="text-xs text-amber-600">请先在上方添加规则集</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {catalogNames.map((name) => {
                          const checked = (rule.rulesets || []).includes(name)
                          return (
                            <label
                              key={name}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                                checked
                                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() => {
                                  const set = new Set(rule.rulesets || [])
                                  if (checked) set.delete(name)
                                  else set.add(name)
                                  updateRule(i, { rulesets: Array.from(set) })
                                }}
                              />
                              {name}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">
                        负载均衡
                        <span className="font-normal text-slate-400 ml-1">（本条规则共用）</span>
                      </label>
                      <Select
                        value={rule.strategy || 'round_robin'}
                        onChange={(e) => updateRule(i, { strategy: e.target.value })}
                      >
                        <option value="random">random</option>
                        <option value="round_robin">round_robin</option>
                        <option value="fastest">fastest</option>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">
                        EDNS Client Subnet
                        <span className="font-normal text-slate-400 ml-1">（本条规则共用）</span>
                      </label>
                      <Input
                        value={rule.clientSubnet || ''}
                        onChange={(e) =>
                          updateRule(i, { clientSubnet: e.target.value || null })
                        }
                        placeholder="1.2.3.0/24"
                      />
                    </div>
                  </div>

                  <Toggle
                    checked={!!rule.insecure}
                    onChange={(v) => updateRule(i, { insecure: v })}
                    label="跳过 TLS 证书验证（本条规则共用，不建议开启）"
                  />

                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">
                      上游 DNS
                    </label>
                    <StringListEditor
                      items={rule.servers || []}
                      onChange={(v) => updateRule(i, { servers: v })}
                      placeholder="udp://223.5.5.5 或 tls://1.1.1.1"
                    />
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRule(i)}
                  type="button"
                  className="text-rose-500 shrink-0"
                >
                  删除
                </Button>
              </div>
            </Card>
          ))}

          {dnsRules.length === 0 && (
            <p className="text-xs text-slate-400 py-2 px-1">
              暂无 DNS 规则。添加后按顺序匹配规则集，并使用本条填写的上游 DNS。
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
