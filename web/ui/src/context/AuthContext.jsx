import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { api, AuthError } from '../api'

const AuthContext = createContext(null)

// 会话状态：'checking' | 'authed' | 'anon'
// 'anon' 涵盖两种情况：真的没登录，或者后端本来就没开鉴权（auth.enable=false）。
// 二者对前端体验没区别——都是"不需要登录页拦截"。
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('checking')

  const probe = useCallback(async () => {
    try {
      // /api/config 需要鉴权（若开启），用它来探测当前 session 是否有效。
      await api.getConfig()
      setStatus('authed')
    } catch (e) {
      if (e instanceof AuthError) {
        setStatus('anon')
      } else {
        // 网络错误等：暂时当作已登录处理，避免把错误当成"未登录"反复弹登录页；
        // 具体页面会自己处理请求失败的情况。
        setStatus('authed')
      }
    }
  }, [])

  useEffect(() => {
    probe()
  }, [probe])

  const login = useCallback(async (username, password) => {
    await api.login(username, password)
    setStatus('authed')
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setStatus('anon')
    }
  }, [])

  // 供各页面在拿到 401 时统一调用，跳回登录态。
  const handleAuthError = useCallback(() => {
    setStatus('anon')
  }, [])

  return (
    <AuthContext.Provider value={{ status, login, logout, handleAuthError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
