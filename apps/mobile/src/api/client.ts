/**
 * Yaari API Client
 * 
 * Handles: base URL config, JWT auth headers, automatic token refresh,
 * request/response interceptors, error normalization.
 */
import { useAuthStore } from "../stores/authStore";

const API_BASE = __DEV__
  ? "http://10.0.2.2:3000/api/v1"  // Android emulator → host machine
  : "https://yaari-api.onrender.com/api/v1";

export { API_BASE };

// ─── TYPES ─────────────────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
  details?: Array<{ field: string; message: string }>;
  statusCode: number;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: Record<string, unknown> | FormData;
  params?: Record<string, string | number | undefined>;
  skipAuth?: boolean;
}

// ─── TOKEN REFRESH LOGIC ───────────────────────────────

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

function processQueue(error: Error | null, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else if (token) resolve(token);
  });
  refreshQueue = [];
}

async function refreshAccessToken(): Promise<string> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();

  if (!refreshToken) {
    logout();
    throw new Error("No refresh token");
  }

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      logout();
      throw new Error("Refresh failed");
    }

    const data = await response.json();
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch (error) {
    logout();
    throw error;
  }
}

// ─── MAIN REQUEST FUNCTION ─────────────────────────────

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, params, skipAuth = false, ...fetchOptions } = options;

  // Build URL with query params
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined) searchParams.append(key, String(val));
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  // Build headers
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  // Attach auth token
  if (!skipAuth) {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
  }

  // Build fetch config
  const config: RequestInit = {
    ...fetchOptions,
    headers,
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  };

  // Execute request
  let response = await fetch(url, config);

  // Handle 401 — attempt token refresh
  if (response.status === 401 && !skipAuth) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        processQueue(null, newToken);
        isRefreshing = false;

        // Retry original request with new token
        headers["Authorization"] = `Bearer ${newToken}`;
        response = await fetch(url, { ...config, headers });
      } catch (error) {
        processQueue(error as Error, null);
        isRefreshing = false;
        throw error;
      }
    } else {
      // Queue this request until refresh completes
      const newToken = await new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      });
      headers["Authorization"] = `Bearer ${newToken}`;
      response = await fetch(url, { ...config, headers });
    }
  }

  // Parse response
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const apiError: ApiError = {
      error: data?.error || "Something went wrong",
      code: data?.code || "UNKNOWN_ERROR",
      details: data?.details,
      statusCode: response.status,
    };
    throw apiError;
  }

  return data as T;
}

// ─── HTTP METHOD SHORTCUTS ─────────────────────────────

export const api = {
  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "GET" }),

  post: <T = any>(endpoint: string, body?: Record<string, unknown>, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "POST", body }),

  patch: <T = any>(endpoint: string, body?: Record<string, unknown>, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "PATCH", body }),

  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "DELETE" }),
};
