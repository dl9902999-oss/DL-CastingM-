import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers, createUser, updateUser, deleteUser } from '@/lib/store';
import { UserProfile, UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Users, Key, Shield, ArrowLeft } from 'lucide-react';

const ROLE_LABELS: Record<UserRole, string> = {
  Admin: '管理員',
  Production: '生產',
  QC: '品管',
  Warehouse: '倉管',
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const { toast } = useToast();

  const [form, setForm] = useState({
    employee_id: '',
    name: '',
    password: '',
    role: 'Production' as UserRole,
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = () => {
    setUsers(getAllUsers());
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setForm({ employee_id: '', name: '', password: '', role: 'Production' });
    setDialogOpen(true);
  };

  const handleOpenEdit = (u: UserProfile) => {
    setEditingUser(u);
    setForm({ employee_id: u.employee_id, name: u.name, password: '', role: u.role });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.employee_id.trim()) {
      toast({ title: '請輸入員工編號', variant: 'destructive' });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: '請輸入姓名', variant: 'destructive' });
      return;
    }

    if (editingUser) {
      // Update existing user
      const updates: Partial<Omit<UserProfile, 'id'>> = {
        employee_id: form.employee_id.trim(),
        name: form.name.trim(),
        role: form.role,
      };
      // Check duplicate employee_id
      const existing = users.find(u => u.employee_id === form.employee_id.trim() && u.id !== editingUser.id);
      if (existing) {
        toast({ title: '員工編號已存在', variant: 'destructive' });
        return;
      }
      updateUser(editingUser.id, updates);
      toast({ title: '帳號已更新' });
    } else {
      // Create new user
      if (!form.password.trim()) {
        toast({ title: '請輸入密碼', variant: 'destructive' });
        return;
      }
      // Check duplicate employee_id
      const existing = users.find(u => u.employee_id === form.employee_id.trim());
      if (existing) {
        toast({ title: '員工編號已存在', variant: 'destructive' });
        return;
      }
      createUser({
        employee_id: form.employee_id.trim(),
        name: form.name.trim(),
        password: form.password.trim(),
        role: form.role,
      });
      toast({ title: '帳號已建立' });
    }

    setDialogOpen(false);
    loadUsers();
  };

  const handleDelete = (u: UserProfile) => {
    if (u.id === currentUser?.id) {
      toast({ title: '無法刪除自己的帳號', variant: 'destructive' });
      return;
    }
    if (!window.confirm(`確定要刪除帳號「${u.employee_id} - ${u.name}」？`)) return;
    deleteUser(u.id);
    toast({ title: '帳號已刪除' });
    loadUsers();
  };

  const handleOpenPasswordChange = (u: UserProfile) => {
    setPasswordTarget(u);
    setNewPassword('');
    setPasswordDialogOpen(true);
  };

  const handleChangePassword = () => {
    if (!newPassword.trim()) {
      toast({ title: '請輸入新密碼', variant: 'destructive' });
      return;
    }
    if (!passwordTarget) return;
    updateUser(passwordTarget.id, { password: newPassword.trim() });
    toast({ title: `已變更 ${passwordTarget.employee_id} 的密碼` });
    setPasswordDialogOpen(false);
    loadUsers();
  };

  if (currentUser?.role !== 'Admin') {
    return (
      <div className="p-6 text-center text-zinc-400">
        <Shield className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
        <p className="text-lg">僅管理員可存取此頁面</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="text-zinc-400 hover:text-zinc-100 h-8 w-8" title="返回主頁">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Users className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-bold text-zinc-100">帳號管理</h1>
          <span className="text-sm text-zinc-500">({users.length} 個帳號)</span>
        </div>
        <Button onClick={handleOpenCreate} className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
          <Plus className="w-4 h-4 mr-2" />新增帳號
        </Button>
      </div>

      {/* User List */}
      <div className="grid gap-3">
        {users.map(u => (
          <Card key={u.id} className="bg-zinc-800 border-zinc-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
                    <span className="text-sm font-bold text-amber-400">{u.employee_id.slice(0, 2)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-100">{u.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-400">{ROLE_LABELS[u.role]}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">目前登入</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">員工編號: {u.employee_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleOpenPasswordChange(u)} className="text-zinc-400 hover:text-amber-400 h-8 w-8 p-0" title="變更密碼">
                    <Key className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(u)} className="text-zinc-400 hover:text-blue-400 h-8 w-8 p-0" title="編輯">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {u.id !== currentUser?.id && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(u)} className="text-zinc-400 hover:text-red-400 h-8 w-8 p-0" title="刪除">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-800 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">
              {editingUser ? '編輯帳號' : '新增帳號'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">員工編號 *</Label>
              <Input
                value={form.employee_id}
                onChange={e => setForm({ ...form, employee_id: e.target.value })}
                placeholder="例: P002"
                className="bg-zinc-700 border-zinc-600 text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">姓名 *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="例: 王小明"
                className="bg-zinc-700 border-zinc-600 text-zinc-100"
              />
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label className="text-zinc-300">密碼 *</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="設定密碼"
                  className="bg-zinc-700 border-zinc-600 text-zinc-100"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-zinc-300">權限角色 *</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v as UserRole })}>
                <SelectTrigger className="bg-zinc-700 border-zinc-600 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-700 border-zinc-600">
                  <SelectItem value="Admin" className="text-zinc-100">管理員</SelectItem>
                  <SelectItem value="Production" className="text-zinc-100">生產</SelectItem>
                  <SelectItem value="QC" className="text-zinc-100">品管</SelectItem>
                  <SelectItem value="Warehouse" className="text-zinc-100">倉管</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-zinc-400">取消</Button>
              <Button onClick={handleSave} className="bg-amber-500 hover:bg-amber-600 text-zinc-900">
                {editingUser ? '儲存' : '建立'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="bg-zinc-800 border-zinc-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">變更密碼</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              帳號: <span className="text-zinc-200 font-medium">{passwordTarget?.employee_id} - {passwordTarget?.name}</span>
            </p>
            <div className="space-y-2">
              <Label className="text-zinc-300">新密碼 *</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="輸入新密碼"
                className="bg-zinc-700 border-zinc-600 text-zinc-100"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setPasswordDialogOpen(false)} className="text-zinc-400">取消</Button>
              <Button onClick={handleChangePassword} className="bg-amber-500 hover:bg-amber-600 text-zinc-900">確認變更</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}