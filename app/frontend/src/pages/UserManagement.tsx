import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import { dsGetAllUsers, dsCreateUser, dsUpdateUser, dsDeleteUser } from '@/lib/dataService';
import { UserProfile, UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, Users, Key, Shield, ArrowLeft } from 'lucide-react';

const ROLE_LABELS: Record<UserRole, string> = {
  Admin: '管理員',
  Production: '生產',
  QC: '品管',
  Warehouse: '倉管',
};

const PERMISSION_ITEMS = [
  { path: '/dashboard', label: '總覽' },
  { path: '/customers', label: '客戶資料' },
  { path: '/work-orders', label: '工單管理' },
  { path: '/molding', label: '開工造模' },
  { path: '/melting-management', label: '熔解管理' },
  { path: '/quality', label: '品質檢驗' },
  { path: '/warehouse', label: '入庫' },
  { path: '/shipment', label: '出貨' },
  { path: '/traceability', label: '生產追溯' },
  { path: '/user-management', label: '帳號管理' },
];

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
    permissions: ['/dashboard', '/traceability'] as string[],
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await dsGetAllUsers();
      setUsers(data);
    } catch { /* handled */ }
    finally { setLoading(false); }
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setForm({ employee_id: '', name: '', password: '', role: 'Production', permissions: ['/dashboard', '/traceability'] });
    setDialogOpen(true);
  };

  // 當員工編號變更時，自動同步預設密碼（僅新增模式且密碼未手動修改時）
  const handleEmployeeIdChange = (value: string) => {
    const trimmed = value.trim();
    // 如果密碼為空或等於舊的員工編號，則同步更新密碼
    if (!editingUser && (form.password === '' || form.password === form.employee_id)) {
      setForm({ ...form, employee_id: value, password: trimmed });
    } else {
      setForm({ ...form, employee_id: value });
    }
  };

  const handleOpenEdit = (u: UserProfile) => {
    setEditingUser(u);
    setForm({ employee_id: u.employee_id, name: u.name, password: '', role: u.role, permissions: u.permissions || [] });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.employee_id.trim()) {
      toast({ title: '請輸入員工編號', variant: 'destructive' });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: '請輸入姓名', variant: 'destructive' });
      return;
    }

    try {
      if (editingUser) {
        // Update existing user
        const updates: Partial<Omit<UserProfile, 'id'>> = {
          employee_id: form.employee_id.trim(),
          name: form.name.trim(),
          role: form.role,
          permissions: form.permissions,
        };
        // Check duplicate employee_id
        const existing = users.find(u => u.employee_id === form.employee_id.trim() && u.id !== editingUser.id);
        if (existing) {
          toast({ title: '員工編號已存在', variant: 'destructive' });
          return;
        }
        await dsUpdateUser(editingUser.id, updates);
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
        await dsCreateUser({
          employee_id: form.employee_id.trim(),
          name: form.name.trim(),
          password: form.password.trim(),
          role: form.role,
          permissions: form.permissions,
        });
        toast({ title: '帳號已建立' });
      }

      setDialogOpen(false);
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[UserManagement] Save failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，帳號操作失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，資料已儲存至本地', description: '連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('duplicate') || msg.includes('unique')) {
        toast({ title: '員工編號或帳號已存在', variant: 'destructive' });
      } else {
        toast({ title: '操作失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleDelete = async (u: UserProfile) => {
    if (u.id === currentUser?.id) {
      toast({ title: '無法刪除自己的帳號', variant: 'destructive' });
      return;
    }
    if (!window.confirm(`確定要刪除帳號「${u.employee_id} - ${u.name}」？`)) return;
    try {
      await dsDeleteUser(u.id);
      toast({ title: '帳號已刪除' });
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[UserManagement] Delete failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，刪除失敗', description: '資料已暫存本地，連線恢復後將自動同步', variant: 'destructive' });
      } else if (msg.includes('foreign') || msg.includes('constraint')) {
        toast({ title: '此帳號有關聯資料，無法刪除', variant: 'destructive' });
      } else {
        toast({ title: '刪除失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  const handleOpenPasswordChange = (u: UserProfile) => {
    setPasswordTarget(u);
    setNewPassword(u.password);
    setPasswordDialogOpen(true);
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      toast({ title: '請輸入新密碼', variant: 'destructive' });
      return;
    }
    if (!passwordTarget) return;
    try {
      await dsUpdateUser(passwordTarget.id, { password: newPassword.trim() });
      toast({ title: `已變更 ${passwordTarget.employee_id} 的密碼` });
      setPasswordDialogOpen(false);
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[UserManagement] ChangePassword failed:', err);
      if (msg.includes('policy') || msg.includes('permission') || msg.includes('row-level security')) {
        toast({ title: '權限不足，密碼變更失敗', variant: 'destructive' });
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        toast({ title: '連線異常，請稍後再試', variant: 'destructive' });
      } else {
        toast({ title: '變更密碼失敗，請稍後再試', variant: 'destructive' });
      }
    }
  };

  if (currentUser?.role !== 'Admin') {
    return (
      <AppLayout>
        <div className="p-6 text-center text-zinc-400">
          <Shield className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
          <p className="text-lg">僅管理員可存取此頁面</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
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
                    <p className="text-xs text-zinc-500 mt-0.5">員工編號: {u.employee_id} ｜ 密碼: <span className="font-mono text-zinc-400">{u.password}</span></p>
                    {u.permissions && u.permissions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {u.permissions.map(p => {
                          const item = PERMISSION_ITEMS.find(pi => pi.path === p);
                          return item ? (
                            <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/80 text-zinc-400">{item.label}</span>
                          ) : null;
                        })}
                      </div>
                    )}
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
                onChange={e => editingUser ? setForm({ ...form, employee_id: e.target.value }) : handleEmployeeIdChange(e.target.value)}
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
                <Label className="text-zinc-300">密碼 *（預設與員工編號相同）</Label>
                <Input
                  type="text"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="設定密碼"
                  className="bg-zinc-700 border-zinc-600 text-zinc-100 font-mono"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-zinc-300">權限角色</Label>
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
            <div className="space-y-2">
              <Label className="text-zinc-300">頁面權限（勾選可存取的功能）</Label>
              <div className="grid grid-cols-2 gap-2 p-3 rounded bg-zinc-700/50 border border-zinc-600 max-h-48 overflow-y-auto">
                {PERMISSION_ITEMS.map(item => (
                  <label key={item.path} className="flex items-center gap-2 cursor-pointer py-1">
                    <Checkbox
                      checked={form.permissions.includes(item.path)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setForm({ ...form, permissions: [...form.permissions, item.path] });
                        } else {
                          setForm({ ...form, permissions: form.permissions.filter(p => p !== item.path) });
                        }
                      }}
                      className="border-zinc-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                    />
                    <span className="text-sm text-zinc-300">{item.label}</span>
                  </label>
                ))}
              </div>
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
              <Label className="text-zinc-300">目前密碼</Label>
              <div className="px-3 py-2 rounded bg-zinc-700/50 border border-zinc-600 text-zinc-200 font-mono text-sm">
                {passwordTarget?.password}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">新密碼 *</Label>
              <Input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="輸入新密碼"
                className="bg-zinc-700 border-zinc-600 text-zinc-100 font-mono"
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
    </AppLayout>
  );
}