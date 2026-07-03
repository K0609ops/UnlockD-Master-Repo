import { apiClient } from './client';
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
  message: string;
}

/**
 * Send the Firebase ID token to the backend to create or retrieve the user in Postgres.
 * The backend verifies the token with Firebase Admin SDK.
 */
export async function syncGoogleUserWithBackend(): Promise<AuthResponse | null> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;

    const idToken = await currentUser.getIdToken();
    return await apiClient.post<AuthResponse>('/auth/google', { id_token: idToken });
  } catch (err) {
    // Backend is optional during development — don't crash the app
    console.warn('Backend sync skipped (backend may not be running):', err);
    return null;
  }
}
