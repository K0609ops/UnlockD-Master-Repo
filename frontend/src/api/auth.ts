import { apiClient, tokenStore } from './client';
import { auth } from '../firebase';

export interface BackendUser {
  id: string;
  email: string;
  username: string | null;
  monthly_income: number;
  hours_per_week: number;
  target_savings_percentage: number;
  auth_provider: string;
  created_at: string;
}

export interface AuthResponse {
  user: BackendUser;
  access_token: string;
  token_type: string;
  is_new_user: boolean;
  message: string;
}

/**
 * Email/password login — calls POST /auth/login, stores JWT.
 */
export async function loginWithEmail(email: string, password: string): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/auth/login', { email, password });
  tokenStore.set(res.access_token);
  return res;
}

/**
 * Email/password registration — calls POST /auth/register, stores JWT.
 */
export async function registerWithEmail(
  email: string,
  username: string,
  password: string,
  monthly_income = 0,
  hours_per_week = 40,
): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/auth/register', {
    email, username, password, monthly_income, hours_per_week,
  });
  tokenStore.set(res.access_token);
  return res;
}

/**
 * Google sign-in — sends Firebase ID token to backend for verification.
 * Backend issues our own JWT in return.
 */
export async function syncGoogleUserWithBackend(): Promise<AuthResponse | null> {
  try {
    const currentUser = auth?.currentUser;
    if (!currentUser) return null;
    const idToken = await currentUser.getIdToken();
    const res = await apiClient.post<AuthResponse>('/auth/google', { id_token: idToken });
    tokenStore.set(res.access_token);
    return res;
  } catch (err) {
    console.warn('Google backend sync failed:', err);
    return null;
  }
}

/** Remove token on logout. */
export function clearAuthToken() {
  tokenStore.clear();
}
