import { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  { label: '生產追溯', path: '/traceability', icon: <Search className="w-5 h-5" />, roles: ['Admin', 'Production', 'QC', 'Warehouse'] },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const filteredNavItems = navItems.filter(item => user && item.roles.includes(user.role));

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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-200">{user?.name}</p>
            <p className="text-xs text-zinc-400">{user?.role}</p>
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
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}