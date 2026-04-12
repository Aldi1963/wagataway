import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getToken, setToken, removeToken, API_BASE } from "@/lib/api";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  plan?: string | null;
  role?: string | null;
  aiSettings?: any;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getToken();
    if (stored) {
      setTokenState(stored);
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${stored}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setUser(data);
          else removeToken();
        })
        .catch(() => removeToken())
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  function login(tok: string, u: AuthUser) {
    setToken(tok);
    setTokenState(tok);
    setUser(u);
  }

  function logout() {
    removeToken();
    setTokenState(null);
    setUser(null);
  }

  function updateUser(u: AuthUser) {
    setUser(u);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
