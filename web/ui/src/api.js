// API 封装：所有请求走 cookie（credentials: 'include'），401 统一抛 AuthError
// 供上层（AuthContext）捕获后跳转登录页。

export class AuthError extends Error {
  constructor(message) {
    super(message || 'Unauthorized')
    this.name = 'AuthError'
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (res.status === 401) {
    throw new AuthError()
  }

  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const body = isJson ? await res.json().catch(() => null) : await res.text()

  if (!res.ok) {
    const message = (isJson && body && body.error) || `请求失败 (${res.status})`
    throw new ApiError(message, res.status)
  }

  return body
}

export const api = {
  // 鉴权
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  changePassword: (old_password, new_password) =>
    request('/api/auth/password', { method: 'POST', body: JSON.stringify({ old_password, new_password }) }),

  // 配置
  getConfig: () => request('/api/config'),
  putConfig: (config) => request('/api/config', { method: 'PUT', body: JSON.stringify(config) }),

  // 统计 / 日志
  dashboard: () => request('/api/dashboard'),
  stats: () => request('/api/stats'),
  upstreams: () => request('/api/upstreams'),
  rules: () => request('/api/rules'),
  clients: (limit = 20) => request(`/api/clients?limit=${limit}`),
  querylog: ({ limit = 100, domain = '', client = '', history = false } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (domain) params.set('domain', domain)
    if (client) params.set('client', client)
    if (history) params.set('history', 'true')
    return request(`/api/querylog?${params.toString()}`)
  },
}
