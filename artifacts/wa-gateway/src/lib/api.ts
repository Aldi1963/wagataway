import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

const AUTH_TOKEN_KEY = "wa_auth_token";

export const API_BASE = "/api";

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

setBaseUrl(API_BASE);
setAuthTokenGetter(() => getToken());

export function apiFetch(path: string, options?: RequestInit) {
  const tok = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    ...(options?.headers as Record<string, string> ?? {}),
  };
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
