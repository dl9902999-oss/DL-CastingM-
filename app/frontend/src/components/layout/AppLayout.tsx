import { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDataConnection } from '@/contexts/DataContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutDashboard,
  ClipboardList,
  Layers,
  Flame,
  CheckCircle,
  Warehouse,
  Truck,
  Search,
  LogOut,
  Menu,
  Factory,
  Users,
  Shield,
  Box,
  RefreshCw,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: '總覽', path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['Admin', 'Production', 'QC', 'Warehouse'] },
  { label: '客戶資料', path: '/customers', icon: <Users className="w-5 h-5" />, roles: ['Admin', 'Production'] },
  { label: '工單管理', path: '/work-orders', icon: <ClipboardList className="w-5 h-5" />, roles: ['Admin', 'Production'] },
  { label: '開工造模', path: '/molding', icon: <Layers className="w-5 h-5" />, roles: ['Admin', 'Production'] },
  { label: '熔解管理', path: '/melting-management', icon: <Flame className="w-5 h-5" />, roles: ['Admin', 'Production'] },
  { label: '品質檢驗', path: '/quality', icon: <CheckCircle className="w-5 h-5" />, roles: ['Admin', 'QC'] },
  { label: '入庫', path: '/warehouse', icon: <Warehouse className="w-5 h-5" />, roles: ['Admin', 'Warehouse'] },
  { label: '出貨', path: '/shipment', icon: <Truck className="w-5 h-5" />, roles: ['Admin', 'Warehouse'] },
  { label: '模具管理', path: '/mold-management', icon: <Box className="w-5 h-5" />, roles: ['Admin', 'Production'] },
  { label: '生產追溯', path: '/traceability', icon: <Search className="w-5 h-5" />, roles: ['Admin', 'Production', 'QC', 'Warehouse'] },
  { label: '帳號管理', path: '/user-management', icon: <Shield className="w-5 h-5" />, roles: ['Admin'] },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { isOnline, isLoading: dataLoading, refreshData } = useDataConnection();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleGlobalRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredNavItems = navItems.filter(item => {
    if (!user) return false;
    // Use permissions array if available, otherwise fall back to role-based
    if (user.permissions && user.permissions.length > 0) {
      return user.permissions.includes(item.path);
    }
    return item.roles.includes(user.role);
  });

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-zinc-700">
        <Factory className="w-7 h-7 text-amber-500" />
        <span className="text-lg font-bold text-zinc-100">鑄造生產系統</span>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {filteredNavItems.map(item => (
          <button
            key={item.path}
            onClick={() => { navigate(item.path); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
              location.pathname === item.path
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-zinc-700">
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-block w-2 h-2 rounded-full ${dataLoading ? 'bg-yellow-400 animate-pulse' : isOnline ? 'bg-green-400' : 'bg-zinc-500'}`} />
          <span className="text-xs text-zinc-400">
            {dataLoading ? '連接中...' : isOnline ? 'Supabase 已連接' : '離線模式'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-200">{user?.name}</p>
            <p className="text-xs text-zinc-400">{user?.employee_id} · {user?.role}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="text-zinc-400 hover:text-zinc-100">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-zinc-900">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col bg-zinc-800 border-r border-zinc-700">
        <NavContent />
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center justify-between p-3 bg-zinc-800 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <Factory className="w-6 h-6 text-amber-500" />
            <span className="font-bold text-zinc-100">鑄造生產系統</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleGlobalRefresh}
              disabled={isRefreshing}
              className="text-zinc-300 hover:text-amber-400"
              title="重新刷新資料"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-zinc-300">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-zinc-800 border-zinc-700">
                <NavContent />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Desktop top bar with refresh */}
        <header className="hidden md:flex items-center justify-end p-2 bg-zinc-800/50 border-b border-zinc-700/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGlobalRefresh}
            disabled={isRefreshing}
            className="text-zinc-400 hover:text-amber-400 gap-1.5"
            title="重新刷新資料"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="text-xs">刷新</span>
          </Button>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}