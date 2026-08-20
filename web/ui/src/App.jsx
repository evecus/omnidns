import React from 'react'
import { HashRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import QueryLog from './pages/QueryLog'
import ConfigPage from './pages/config'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/querylog" element={<QueryLog />} />
                <Route path="/config" element={<ConfigPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  )
}

function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
        加载中…
      </div>
    )
  }

  if (status === 'anon') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
