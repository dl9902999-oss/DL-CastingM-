import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { canAccessPage } from '@/lib/pageAccess';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import SyncStatusNotifier from '@/components/SyncStatusNotifier';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import WorkOrders from '@/pages/WorkOrders';
import Molding from '@/pages/Molding';
import MeltingManagement from '@/pages/MeltingManagement';
import Quality from '@/pages/Quality';
import WarehousePage from '@/pages/WarehousePage';
import Shipment from '@/pages/Shipment';
import Traceability from '@/pages/Traceability';
import Customers from '@/pages/Customers';
import Suppliers from '@/pages/Suppliers';
import UserManagement from '@/pages/UserManagement';
import MoldManagement from '@/pages/MoldManagement';
import SyncHistory from '@/pages/SyncHistory';
import DataSyncVerification from '@/pages/DataSyncVerification';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const { pathname } = useLocation();
  if (isLoading) return <div className="min-h-screen bg-zinc-900 flex items-center justify-center"><span className="text-zinc-400">載入中...</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessPage(user, pathname)) return <main className="min-h-screen bg-zinc-900 text-zinc-100 p-8"><h1>沒有此頁面的存取權限</h1><p>請聯絡管理員確認您的工作權限。</p><button onClick={() => logout()}>登出並更換帳號</button></main>;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-zinc-900 flex items-center justify-center"><span className="text-zinc-400">載入中...</span></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
    <Route path="/molding" element={<ProtectedRoute><Molding /></ProtectedRoute>} />
    <Route path="/melting-management" element={<ProtectedRoute><MeltingManagement /></ProtectedRoute>} />
    <Route path="/quality" element={<ProtectedRoute><Quality /></ProtectedRoute>} />
    <Route path="/warehouse" element={<ProtectedRoute><WarehousePage /></ProtectedRoute>} />
    <Route path="/shipment" element={<ProtectedRoute><Shipment /></ProtectedRoute>} />
    <Route path="/traceability" element={<ProtectedRoute><Traceability /></ProtectedRoute>} />
    <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
    <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
    <Route path="/mold-management" element={<ProtectedRoute><MoldManagement /></ProtectedRoute>} />
    <Route path="/user-management" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
    <Route path="/sync-history" element={<ProtectedRoute><SyncHistory /></ProtectedRoute>} />
    <Route path="/sync-verify" element={<ProtectedRoute><DataSyncVerification /></ProtectedRoute>} />
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <SessionData />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
  </QueryClientProvider>
);

function SessionData() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p>載入中...</p>;
  // This is a lifecycle gate, not database authorization. The legacy login is
  // retained until the verified Auth migration is ready.
  if (!user) return <AppRoutes />;
  return <DataProvider key={user.id}><SyncStatusNotifier /><AppRoutes /></DataProvider>;
}

export default App;
export { AppRoutes };
