import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile } from '@/lib/types';
import { getCurrentUser, login as storeLogin, logout as storeLogout, initDemoUsers } from '@/lib/store';
import { dsLogin } from '@/lib/dataService';
import { useDataConnection } from './DataContext';

interface AuthContextType {
  user: UserProfile | null;
  login: (employeeId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { lastSyncTime } = useDataConnection();

  useEffect(() => {
    // Ensure demo users exist after every sync event
    initDemoUsers();
    const currentUser = getCurrentUser();
    setUser(currentUser);
    setIsLoading(false);
  }, [lastSyncTime]);

  const login = async (employeeId: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Ensure demo users exist before attempting login
    initDemoUsers();

    try {
      // Try Supabase login first (dsLogin handles fallback to localStorage internally)
      const loggedInUser = await dsLogin(employeeId, password);
      if (loggedInUser) {
        // Save to localStorage for session persistence
        localStorage.setItem('foundry_current_user', JSON.stringify(loggedInUser));
        setUser(loggedInUser);
        return { success: true };
      }
      return { success: false, error: '員工編號或密碼錯誤' };
    } catch (err: unknown) {
      // If Supabase fails with network error, try local login as fallback
      console.warn('[AuthContext] Supabase login failed, trying local:', err);
      const localUser = storeLogin(employeeId, password);
      if (localUser) {
        setUser(localUser);
        return { success: true, error: '（離線模式登入）' };
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        return { success: false, error: '網路連線逾時，請確認網路狀態後重試' };
      }
      return { success: false, error: '登入失敗，請稍後重試' };
    }
  };

  const logout = () => {
    storeLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}