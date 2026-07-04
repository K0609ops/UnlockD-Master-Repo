const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Token management — stored in localStorage, sent as Bearer on every request
// ---------------------------------------------------------------------------
export const tokenStore = {
  get: (): string | null => localStorage.getItem('finverse_token'),
  set: (token: string) => localStorage.setItem('finverse_token', token),
  clear: () => localStorage.removeItem('finverse_token'),
};

async function request<T>(method: string, path: string, body?: unknown, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = tokenStore.get();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const reqOptions: RequestInit = {
    method,
    headers,
    credentials: 'include', // vital for sending HttpOnly refresh_token cookie
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let res = await fetch(`${BASE_URL}${path}`, reqOptions);

  if (res.status === 401 && !isRetry && path !== '/auth/login' && path !== '/auth/register' && path !== '/auth/refresh') {
    // Attempt token refresh
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include'
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        tokenStore.set(data.access_token);
        // Retry original request
        return request<T>(method, path, body, true);
      }
    } catch (e) {
      console.error('Token refresh failed', e);
    }
    // If refresh failed or returned !ok
    tokenStore.clear();
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      tokenStore.clear();
    }
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get:    <T>(path: string)              => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body: unknown) => request<T>('PUT',    path, body),
  patch:  <T>(path: string, body: unknown) => request<T>('PATCH',  path, body),
  delete: <T>(path: string)              => request<T>('DELETE', path),
};
