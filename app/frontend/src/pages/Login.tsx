import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = login(employeeId, password);
    if (success) {
      navigate('/dashboard');
    } else {
      toast({
        title: '登入失敗',
        description: '請確認員工編號及密碼是否正確',
        variant: 'destructive',
      });
    }
  };

  const demoAccounts = [
    { employeeId: 'A001', password: 'admin123', role: 'Admin (管理員)' },
    { employeeId: 'P001', password: '1234', role: 'Production (生產員)' },
    { employeeId: 'Q001', password: '1234', role: 'QC (品管員)' },
    { employeeId: 'W001', password: '1234', role: 'Warehouse (倉管員)' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-900 p-4">
      <Card className="w-full max-w-md bg-zinc-800 border-zinc-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Factory className="w-8 h-8 text-amber-500" />
            </div>
          </div>
          <CardTitle className="text-2xl text-zinc-100">鑄造工廠生產紀錄系統</CardTitle>
          <p className="text-sm text-zinc-400 mt-1">請以員工編號登入</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employeeId" className="text-zinc-300">員工編號</Label>
              <Input
                id="employeeId"
                type="text"
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                placeholder="輸入員工編號"
                className="bg-zinc-700 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">密碼</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="輸入密碼"
                className="bg-zinc-700 border-zinc-600 text-zinc-100 placeholder:text-zinc-500"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900 font-semibold">
              登入
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-zinc-700">
            <p className="text-xs text-zinc-400 mb-3">示範帳號：</p>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map(acc => (
                <button
                  key={acc.employeeId}
                  onClick={() => { setEmployeeId(acc.employeeId); setPassword(acc.password); }}
                  className="text-xs px-2 py-1.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                >
                  {acc.employeeId} ({acc.role})
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}