import React, { useState } from 'react'
import { useConfig } from './ConfigContext'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import { Card, FormRow, Input, Toggle, Button, Badge } from '../../components/ui'

export default function WebTab() {
  const { config } = useConfig()
  const web = config.web || {}
  const auth = web.auth || {}

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">面板设置</h3>
          <Badge tone="amber">只读</Badge>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          出于避免"改配置把自己锁在门外"的原因，监听地址与用户名不支持在线修改；如需更改，请手动编辑配置文件后重启进程。
        </p>
        <div className="divide-y divide-slate-50">
          <FormRow label="监听地址">
            <Input value={web.listen} disabled />
          </FormRow>
          <FormRow label="查询日志容量（内存）">
            <Input value={web['query-log-size']} disabled />
          </FormRow>
          <FormRow label="SQLite 路径">
            <Input value={web['sqlite-path']} disabled />
          </FormRow>
          <FormRow label="鉴权状态">
            <Badge tone={auth.enable ? 'green' : 'slate'}>{auth.enable ? '已启用' : '未启用'}</Badge>
          </FormRow>
          {auth.enable && (
            <FormRow label="用户名">
              <Input value={auth.username} disabled />
            </FormRow>
          )}
        </div>
      </div>

      {auth.enable && <PasswordChangeCard />}
    </div>
  )
}

function PasswordChangeCard() {
  const toast = useToast()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast.error('新密码至少 8 位')
      return
    }
    if (newPassword !== confirm) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setLoading(true)
    try {
      await api.changePassword(oldPassword, newPassword)
      toast.success('密码已更新，立即生效')
      setOldPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (e) {
      toast.error(e.message || '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">修改密码</h3>
      <Card className="!p-5 max-w-md">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">当前密码</label>
            <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">新密码（至少 8 位）</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">确认新密码</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          <Button type="submit" disabled={loading} className="mt-1">
            {loading ? '提交中…' : '更新密码'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
