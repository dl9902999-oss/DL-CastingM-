import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import WorkOrders from '@/pages/WorkOrders';
import Molding from '@/pages/Molding';
import Melting from '@/pages/Melting';
import MeltingManagement from '@/pages/MeltingManagement';
import Quality from '@/pages/Quality';
import WarehousePage from '@/pages/WarehousePage';
import Shipment from '@/pages/Shipment';
import Traceability from '@/pages/Traceability';
import Customers from '@/pages/Customers';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-zinc-900 flex items-center justify-center"><span className="text-zinc-400">載入中...</span></div>;
  if (!user) return <Navigate to="/login" replace />;
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
    <Route path="/melting" element={<ProtectedRoute><Melting /></ProtectedRoute>} />
    <Route path="/melting-management" element={<ProtectedRoute><MeltingManagement /></ProtectedRoute>} />
    <Route path="/quality" element={<ProtectedRoute><Quality /></ProtectedRoute>} />
    <Route path="/warehouse" element={<ProtectedRoute><WarehousePage /></ProtectedRoute>} />
    <Route path="/shipment" element={<ProtectedRoute><Shipment /></ProtectedRoute>} />
    <Route path="/traceability" element={<ProtectedRoute><Traceability /></ProtectedRoute>} />
    <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
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
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
export { AppRoutes };