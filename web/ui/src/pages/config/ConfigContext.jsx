import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

const ConfigContext = createContext(null)

// 默认空白结构，字段名与后端 Config（serde kebab-case）一致。
// 用于新装载配置里某些 section 缺失时兜底，避免表单读取 undefined 报错。
export const EMPTY_CONFIG = {
  'log-level': 'info',
  listen: '127.0.0.1:53',
  'manage-resolv-conf': false,
  strategy: 'prefer_ipv4',
  'default-nameserver': [],
  groups: { default: { servers: [], strategy: 'random', insecure: false, 'client-subnet': null } },
  rulesets: [],
  hosts: {},
  cache: { enable: true, size: 4096, 'min-ttl': 0, 'max-ttl': 0 },
  firewall: null,
  dhcp: { v4: null, v6: null, ra: null },
  web: {
    enable: true,
    listen: '0.0.0.0:8087',
    'query-log-size': 1000,
    'sqlite-path': '/var/lib/relay/stats.db',
    'web-dir': null,
    auth: { enable: false, username: 'admin', 'password-set': false },
  },
}

export function ConfigProvider({ children }) {
  const { handleAuthError } = useAuth()
  const toast = useToast()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getConfig()
      setConfig({ ...EMPTY_CONFIG, ...data })
      setDirty(false)
      setError('')
    } catch (e) {
      if (e.name === 'AuthError') return handleAuthError()
      setError(e.message || '加载配置失败')
    } finally {
      setLoading(false)
    }
  }, [handleAuthError])

  useEffect(() => {
    load()
  }, [load])

  // 局部更新：path 是形如 ['dhcp', 'v4', 'enable'] 的字段路径
  const update = useCallback((path, value) => {
    setConfig((prev) => {
      const next = structuredClone(prev)
      let cursor = next
      for (let i = 0; i < path.length - 1; i++) {
        if (cursor[path[i]] == null) cursor[path[i]] = {}
        cursor = cursor[path[i]]
      }
      cursor[path[path.length - 1]] = value
      return next
    })
    setDirty(true)
  }, [])

  // 整体替换某个顶层 section（用于数组增删等复杂操作，调用方直接构造新对象）
  const updateSection = useCallback((key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const report = await api.putConfig(config)
      setDirty(false)
      const parts = []
      if (report.applied?.length) parts.push(`已热更新：${report.applied.join(', ')}`)
      if (report.ignored?.length) parts.push(`未生效（只读或需重启）：${report.ignored.join(', ')}`)
      toast.success(parts.length ? parts.join('；') : '配置已保存', { duration: 6000 })
      await load()
      return true
    } catch (e) {
      if (e.name === 'AuthError') return handleAuthError()
      toast.error(e.message || '保存失败')
      return false
    } finally {
      setSaving(false)
    }
  }, [config, toast, load, handleAuthError])

  return (
    <ConfigContext.Provider value={{ config, loading, saving, dirty, error, update, updateSection, save, reload: load }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider')
  return ctx
}
