import React, { useEffect, useRef, useState } from 'react'
import { useConfig } from './ConfigContext'
import { Card, SectionTitle, Button, Input, Select, Toggle } from '../../components/ui'
import { StringListEditor } from './ListEditor'

/**
 * 「DNS 规则 / 规则集」页
 *
 * 数据模型（前端视图）：
 *   1. 规则集库 rulesetCatalog: [{ name, path }]
 *      - 定义「规则集名称 → .drs 文件路径」
 *      - 名称用于 DNS 规则里勾选，不直接参与匹配
 *   2. DNS 规则 dnsRules: [{ rulesets: string[], upstream: string }]
 *      - 按顺序匹配，首个命中生效
 *      - rulesets 可多选（对应配置文件里一条规则引用多个规则集）
 *      - upstream 从已有上游组里选择（下拉，不可自由输入）
 *   3. 上游组 groups（不含 default，default 已移到「基础」）
 *
 * 与后端 Config 的映射：
 *   - 保存时把 dnsRules 展开为 rulesets: [{ path, upstream }, ...]
 *   - 加载时从 rulesets[] 反推 catalog + dnsRules（相邻且同 upstream 的多条 path 合并）
 */

function basenameNoExt(p) {
  if (!p) return ''
  const base = String(p).split(/[/\\]/).pop() || ''
  return base.replace(/\.drs$/i, '') || base
}

/** 从后端 rulesets[{path,upstream}] 还原 catalog + 有序 dnsRules */
function fromBackendRulesets(rulesets = []) {
  const catalogMap = new Map() // name -> path
  const pathToName = new Map() // path -> name
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

    const last = rules[rules.length - 1]
    if (last && last.upstream === upstream && name) {
      if (!last.rulesets.includes(name)) {
        last.rulesets = [...last.rulesets, name]
      }
    } else {
      rules.push({ rulesets: name ? [name] : [], upstream })
    }
  }

  const catalog = Array.from(catalogMap.entries()).map(([name, path]) => ({ name, path }))
  return { catalog, rules }
}

/** 把 catalog + dnsRules 展开回后端 rulesets[] */
function toBackendRulesets(catalog, rules) {
  const pathOf = Object.fromEntries(catalog.map((c) => [c.name, c.path]))
  const out = []
  for (const rule of rules) {
    const names = rule.rulesets?.length ? rule.rulesets : []
    for (const name of names) {
      const path = pathOf[name]
      if (path && rule.upstream) {
        out.push({ path, upstream: rule.upstream })
      }
    }
  }
  return out
}

export default function UpstreamsTab() {
  const { config, updateSection, dirty } = useConfig()
  const groups = config.groups || {}
  const groupNames = Object.keys(groups).filter((n) => n !== 'default')
  const allUpstreamNames = Object.keys(groups) // 含 default，规则里可选保底

  const boot = fromBackendRulesets(config.rulesets || [])
  const [catalog, setCatalog] = useState(boot.catalog)
  const [dnsRules, setDnsRules] = useState(boot.rules)
  const [newGroupName, setNewGroupName] = useState('')
  const [newRsName, setNewRsName] = useState('')
  const [newRsPath, setNewRsPath] = useState('')

  // 保存/放弃修改后 config 从服务端重载，同步本地视图
  const prevDirty = useRef(dirty)
  useEffect(() => {
    if (prevDirty.current && !dirty) {
      const next = fromBackendRulesets(config.rulesets || [])
      setCatalog(next.catalog)
      setDnsRules(next.rules)
    }
    prevDirty.current = dirty
  }, [dirty, config.rulesets])

  // 同步到 config（保存时走统一 PUT）
  const commitRulesets = (nextCatalog, nextRules) => {
    setCatalog(nextCatalog)
    setDnsRules(nextRules)
    updateSection('rulesets', toBackendRulesets(nextCatalog, nextRules))
  }

  // ---------- 上游组 ----------
  const addGroup = () => {
    const name = newGroupName.trim()
    if (!name || groups[name]) return
    updateSection('groups', {
      ...groups,
      [name]: { servers: [], strategy: 'round_robin', insecure: false, 'client-subnet': null },
    })
    setNewGroupName('')
  }

  const removeGroup = (name) => {
    if (name === 'default') return
    const next = { ...groups }
    delete next[name]
    updateSection('groups', next)
    const nextRules = dnsRules.map((r) =>
      r.upstream === name ? { ...r, upstream: '' } : r,
    )
    commitRulesets(catalog, nextRules)
  }

  // ---------- 规则集库 ----------
  const addCatalogEntry = () => {
    const name = newRsName.trim()
    const path = newRsPath.trim()
    if (!name || !path) return
    if (catalog.some((c) => c.name === name)) return
    const next = [...catalog, { name, path }]
    commitRulesets(next, dnsRules)
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
    commitRulesets(next, nextRules)
  }

  const removeCatalogEntry = (i) => {
    const name = catalog[i].name
    const next = catalog.filter((_, idx) => idx !== i)
    const nextRules = dnsRules.map((r) => ({
      ...r,
      rulesets: (r.rulesets || []).filter((n) => n !== name),
    }))
    commitRulesets(next, nextRules)
  }

  // ---------- DNS 规则（有序） ----------
  const addRule = () => {
    const next = [...dnsRules, { rulesets: [], upstream: allUpstreamNames[0] || 'default' }]
    commitRulesets(catalog, next)
  }

  const updateRule = (i, patch) => {
    const next = dnsRules.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    commitRulesets(catalog, next)
  }

  const removeRule = (i) => {
    commitRulesets(
      catalog,
      dnsRules.filter((_, idx) => idx !== i),
    )
  }

  const moveRule = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= dnsRules.length) return
    const next = [...dnsRules]
    ;[next[i], next[j]] = [next[j], next[i]]
    commitRulesets(catalog, next)
  }

  const catalogNames = catalog.map((c) => c.name)

  return (
    <div className="space-y-8">
      {/* ===== 1. 规则集库 ===== */}
      <div>
        <SectionTitle>规则集</SectionTitle>
        <p className="text-xs text-slate-400 mb-3">
          先定义规则集名称与对应的 .drs 文件路径。名称供下方 DNS 规则勾选，不直接参与匹配。
        </p>

        <div className="space-y-2 mb-3">
          {catalog.map((c, i) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl border border-slate-100 sm:border-0 sm:p-0"
            >
              <div className="sm:w-40">
                <label className="text-xs text-slate-400 sm:hidden">名称</label>
                <Input
                  value={c.name}
                  onChange={(e) => updateCatalogEntry(i, { name: e.target.value })}
                  placeholder="cn"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-400 sm:hidden">.drs 路径</label>
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
            <p className="text-xs text-slate-400 py-2">尚未添加规则集。先添加名称和 .drs 路径。</p>
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
      </div>

      {/* ===== 2. 上游组（不含 default） ===== */}
      <div>
        <SectionTitle
          action={
            <div className="flex gap-2">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="新上游组名称"
                className="!w-40"
              />
              <Button size="sm" onClick={addGroup} type="button">
                添加上游组
              </Button>
            </div>
          }
        >
          上游组
        </SectionTitle>
        <p className="text-xs text-slate-400 mb-4">
          自定义上游组，供 DNS 规则引用。保底上游（default / nameserver）请在「基础」页配置。
        </p>

        <div className="space-y-4">
          {groupNames.length === 0 && (
            <p className="text-xs text-slate-400">暂无自定义上游组。可添加如 china、ads 等。</p>
          )}
          {groupNames.map((name) => (
            <GroupCard
              key={name}
              name={name}
              group={groups[name]}
              onChange={(g) => updateSection('groups', { ...groups, [name]: g })}
              onRemove={() => removeGroup(name)}
            />
          ))}
        </div>
      </div>

      {/* ===== 3. DNS 规则（有序匹配） ===== */}
      <div>
        <SectionTitle
          action={
            <Button size="sm" onClick={addRule} type="button" disabled={catalogNames.length === 0}>
              添加规则
            </Button>
          }
        >
          DNS 规则
        </SectionTitle>
        <p className="text-xs text-slate-400 mb-3">
          按列表顺序匹配，从上到下第一条命中生效；全部未命中则走「基础」里的保底上游。
          一条规则可勾选多个规则集（相当于配置文件里引用规则集数组）。
        </p>

        <div className="space-y-3">
          {dnsRules.map((rule, i) => (
            <Card key={i} className="!p-4">
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

                  <div className="max-w-xs">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">上游组</label>
                    <Select
                      value={rule.upstream || ''}
                      onChange={(e) => updateRule(i, { upstream: e.target.value })}
                    >
                      <option value="" disabled>
                        选择上游组
                      </option>
                      {allUpstreamNames.map((n) => (
                        <option key={n} value={n}>
                          {n === 'default' ? 'default（保底 / nameserver）' : n}
                        </option>
                      ))}
                    </Select>
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
            <p className="text-xs text-slate-400 py-2">
              暂无 DNS 规则。添加后将按顺序匹配规则集并转发到对应上游组。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupCard({ name, group, onChange, onRemove }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-slate-800 text-sm">{name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          type="button"
          className="text-rose-500 hover:bg-rose-50"
        >
          删除组
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">负载均衡策略</label>
          <Select
            value={group.strategy || 'round_robin'}
            onChange={(e) => onChange({ ...group, strategy: e.target.value })}
          >
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
