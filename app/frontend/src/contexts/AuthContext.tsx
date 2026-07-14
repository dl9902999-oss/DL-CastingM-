import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile } from '@/lib/types';
import { getCurrentUser, login as storeLogin, logout as storeLogout, initDemoUsers } from '@/lib/store';
import { useDataConnection } from './DataContext';

interface AuthContextType {
  user: UserProfile | null;
  login: (employeeId: string, password: string) => boolean;
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
    // This protects against race conditions where fullSyncFromSupabase
    // might clear users before this runs
    initDemoUsers();
    const currentUser = getCurrentUser();
    setUser(currentUser);
    setIsLoading(false);
  }, [lastSyncTime]);

  const login = (employeeId: string, password: string): boolean => {
    // Ensure demo users exist before attempting login
    initDemoUsers();
    const loggedInUser = storeLogin(employeeId, password);
    if (loggedInUser) {
      setUser(loggedInUser);
      return true;
    }
    return false;
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