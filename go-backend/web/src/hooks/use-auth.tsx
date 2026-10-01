import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { apiGet, apiPost } from "@/lib/api";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  plan: string;
  avatar?: string;
  twoFaEnabled?: boolean;
  notifyWa?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ requires2FA?: boolean; twofaToken?: string }>;
  verify2FA: (token: string, code: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  setTokenFromOAuth: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setIsLoading(false);
      return;
    }

    apiGet<{ user: User }>("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiPost<{
      token?: string;
      user?: User;
      requires2FA?: boolean;
      twofaToken?: string;
    }>("/auth/login", {
      email,
      password,
    });
    if (data.requires2FA) {
      return { requires2FA: true, twofaToken: data.twofaToken };
    }
    localStorage.setItem("token", data.token!);
    setUser(data.user!);
    return {};
  };

  const verify2FA = async (token: string, code: string) => {
    const data = await apiPost<{ token: string; user: User }>(
      "/auth/2fa/verify",
      { token, code }
    );
    localStorage.setItem("token", data.token);
    setUser(data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const data = await apiPost<{ token: string; user: User }>(
      "/auth/register",
      { name, email, password }
    );
    localStorage.setItem("token", data.token);
    setUser(data.user);
  };

  const logout = () => {
    // Best-effort: cabut sesi di server agar token tak bisa dipakai lagi.
    apiPost("/auth/logout").catch(() => {});
    localStorage.removeItem("token");
    setUser(null);
    window.location.href = "/login";
  };

  const updateUser = (u: User) => setUser(u);

  // Dipakai halaman callback OAuth: simpan token lalu verifikasi ke /auth/me.
  const setTokenFromOAuth = async (token: string) => {
    localStorage.setItem("token", token);
    const data = await apiGet<{ user: User }>("/auth/me");
    setUser(data.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        verify2FA,
        register,
        logout,
        updateUser,
        setTokenFromOAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
