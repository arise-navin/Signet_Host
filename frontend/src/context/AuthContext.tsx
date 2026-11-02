import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  api,
  AuthUser,
  setActiveUserId,
  getActiveUserId,
  setAuthToken,
  getAuthToken,
} from '../api/client.js';

interface AuthContextType {
  currentUser: AuthUser | null;
  demoUsers: AuthUser[];
  login: (identifier: string, password: string, expectedRole?: string) => Promise<AuthUser>;
  register: (payload: any) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  isLoading: boolean;
  authError: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  demoUsers: [],
  login: async () => { throw new Error('Not implemented'); },
  register: async () => { throw new Error('Not implemented'); },
  logout: async () => {},
  changePassword: async () => {},
  switchUser: async () => {},
  refreshUsers: async () => {},
  isLoading: true,
  authError: null,
  clearError: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [demoUsers, setDemoUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const clearError = () => setAuthError(null);

  const initAuth = async () => {
    try {
      setIsLoading(true);
      // Try fetching current session from token / cookie
      const meRes = await api.getMe().catch(() => null);
      if (meRes?.user) {
        setCurrentUser(meRes.user);
        setActiveUserId(meRes.user.id);
      } else {
        // Check if there is an active user ID saved locally
        const activeId = getActiveUserId();
        if (activeId) {
          const session = await api.switchUser(activeId).catch(() => null);
          if (session?.user) {
            setCurrentUser(session.user);
            if (session.token) setAuthToken(session.token);
          }
        }
      }

      // Fetch demo accounts for switcher bar
      const demoData = await api.getDemoUsers().catch(() => null);
      if (demoData?.demoUsers) {
        setDemoUsers(demoData.demoUsers);
      }
    } catch (err) {
      console.warn('Auth initialization:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (identifier: string, password: string, expectedRole?: string): Promise<AuthUser> => {
    try {
      setAuthError(null);
      const res = await api.login({ identifier, password, expectedRole });
      setAuthToken(res.token);
      setActiveUserId(res.user.id);
      setCurrentUser(res.user);
      queryClient.clear();
      return res.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
      throw err;
    }
  };

  const register = async (payload: any): Promise<AuthUser> => {
    try {
      setAuthError(null);
      const res = await api.register(payload);
      setAuthToken(res.token);
      setActiveUserId(res.user.id);
      setCurrentUser(res.user);
      queryClient.clear();
      return res.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.logout().catch(() => {});
    } finally {
      setAuthToken(null);
      localStorage.removeItem('hospital_ai_active_user_id');
      setCurrentUser(null);
      queryClient.clear();
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      setAuthError(null);
      await api.changePassword({ currentPassword, newPassword });
      if (currentUser) {
        setCurrentUser({ ...currentUser, mustChangePassword: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
      throw err;
    }
  };

  const switchUser = async (userId: string) => {
    try {
      setAuthError(null);
      const res = await api.switchUser(userId);
      queryClient.clear();
      const url = new URL(window.location.href);
      url.searchParams.delete('conversation');
      window.history.replaceState(null, '', url);
      setActiveUserId(userId);
      if (res.token) setAuthToken(res.token);
      setCurrentUser(res.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    }
  };

  const refreshUsers = async () => {
    try {
      const demoData = await api.getDemoUsers();
      setDemoUsers(demoData.demoUsers);
    } catch (err) {
      console.warn('Refresh users failed:', err);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        demoUsers,
        login,
        register,
        logout,
        changePassword,
        switchUser,
        refreshUsers,
        isLoading,
        authError,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
