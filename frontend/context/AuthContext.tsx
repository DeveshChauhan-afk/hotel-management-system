"use client";

import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface User {
  user_id: number;
  username: string;
  role: string;
  email?: string | null;
  full_name?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AuthContextType {
  token: string | null;
  user: User | null;
  role: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Lazy initializer to read from localStorage during client mount without setState in effect
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("token");
      } catch (e) {
        console.error("Failed to read token from localStorage:", e);
      }
    }
    return null;
  });

  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const storedUser = localStorage.getItem("user");
        return storedUser ? JSON.parse(storedUser) : null;
      } catch (e) {
        console.error("Failed to parse user from localStorage:", e);
      }
    }
    return null;
  });

  const [isLoading] = useState<boolean>(false);

  const login = useCallback((newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    try {
      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(newUser));
    } catch (e) {
      console.error("Failed to persist auth state to localStorage:", e);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch (e) {
      console.error("Failed to clear auth state from localStorage:", e);
    }
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({
      token,
      user,
      role: user?.role || null,
      isAuthenticated: !!token,
      isLoading,
      login,
      logout,
    }),
    [token, user, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
