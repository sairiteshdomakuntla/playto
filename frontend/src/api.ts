/**
 * Centralised API client.
 * All requests go through apiFetch() which attaches the auth token
 * and throws a typed ApiError on non-2xx responses.
 */

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

// Auth endpoints that must NEVER send an Authorization header.
// If a stale/invalid token is in localStorage, DRF's TokenAuthentication
// will reject the request with 401 before AllowAny even runs.
const PUBLIC_PATHS = ["/auth/login/", "/auth/register/"];

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  const isPublic = PUBLIC_PATHS.some((p) => path.endsWith(p));
  if (token && !isPublic) {
    headers["Authorization"] = `Token ${token}`;
  }
  // Only set Content-Type for JSON; let the browser set it for FormData.
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    // On 401, clear stale auth data so the user is sent back to login.
    if (res.status === 401 && !isPublic) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("username");
    }
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || data.detail || JSON.stringify(data);
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authApi = {
  register: (body: { username: string; password: string; email?: string }) =>
    apiFetch<{ token: string; user_id: number; username: string; role: string }>(
      "/auth/register/",
      { method: "POST", body: JSON.stringify(body) }
    ),

  login: (body: { username: string; password: string }) =>
    apiFetch<{ token: string; user_id: number; username: string; role: string }>(
      "/auth/login/",
      { method: "POST", body: JSON.stringify(body) }
    ),

  me: () =>
    apiFetch<{ user_id: number; username: string; role: string; email: string }>(
      "/auth/me/"
    ),
};

// ---------------------------------------------------------------------------
// Merchant KYC
// ---------------------------------------------------------------------------

import type { KYCSubmission } from "./types";

export const merchantApi = {
  getSubmission: () => apiFetch<KYCSubmission>("/kyc/submission/"),

  createSubmission: (data: object) =>
    apiFetch<KYCSubmission>("/kyc/submission/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateDraft: (data: object) =>
    apiFetch<KYCSubmission>("/kyc/submission/", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  submitForReview: () =>
    apiFetch<KYCSubmission>("/kyc/submission/submit/", { method: "POST" }),

  uploadDocument: (formData: FormData) =>
    apiFetch("/kyc/documents/", { method: "POST", body: formData }),
};

// ---------------------------------------------------------------------------
// Reviewer
// ---------------------------------------------------------------------------

import type { SubmissionListItem, ReviewerMetrics } from "./types";

export const reviewerApi = {
  getQueue: () => apiFetch<SubmissionListItem[]>("/reviewer/queue/"),

  getSubmission: (id: number) =>
    apiFetch<KYCSubmission>(`/reviewer/submissions/${id}/`),

  transition: (id: number, state: string, reviewer_note?: string) =>
    apiFetch<KYCSubmission>(`/reviewer/submissions/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ state, reviewer_note }),
    }),

  getMetrics: () => apiFetch<ReviewerMetrics>("/reviewer/metrics/"),
};
