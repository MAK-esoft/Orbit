import { ApiEnvelope } from './types';

/**
 * Client-side API wrapper. All requests go through the Next.js rewrite proxy
 * (`/api/*` → NestJS), so cookies are first-party. On a 401 it transparently
 * refreshes the token once, then retries.
 *
 * Refresh is single-flight: when many requests 401 at the same time (e.g. a
 * dashboard firing several calls in parallel after the access token expires),
 * they all await ONE refresh. Refresh tokens are single-use (rotation), so
 * firing concurrent refreshes would revoke the token and fail all-but-one —
 * which previously caused data to intermittently disappear.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        // Allow a fresh refresh next time the token expires.
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function fetchEnvelope<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<ApiEnvelope<T>> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && retry && path !== '/auth/refresh') {
    const ok = await refreshOnce();
    if (ok) return fetchEnvelope<T>(path, options, false);
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // no body
  }

  if (!res.ok) {
    const msg = envelope?.error?.message ?? res.statusText;
    throw new ApiError(
      res.status,
      Array.isArray(msg) ? msg.join(', ') : msg,
      envelope?.error?.details,
    );
  }

  return (envelope ?? { data: undefined as T, meta: null, error: null });
}

function body(b?: unknown): BodyInit | undefined {
  if (b === undefined) return undefined;
  return b instanceof FormData ? b : JSON.stringify(b);
}

export interface Page<T> {
  data: T;
  meta: Record<string, unknown> | null;
}

export const api = {
  get: async <T>(path: string): Promise<T> =>
    (await fetchEnvelope<T>(path)).data,
  /** Like get(), but also returns the envelope `meta` (e.g. pagination). */
  page: async <T>(path: string): Promise<Page<T>> => {
    const env = await fetchEnvelope<T>(path);
    return { data: env.data, meta: env.meta };
  },
  post: async <T>(path: string, b?: unknown): Promise<T> =>
    (await fetchEnvelope<T>(path, { method: 'POST', body: body(b) })).data,
  patch: async <T>(path: string, b?: unknown): Promise<T> =>
    (await fetchEnvelope<T>(path, { method: 'PATCH', body: body(b) })).data,
  del: async <T>(path: string): Promise<T> =>
    (await fetchEnvelope<T>(path, { method: 'DELETE' })).data,
};
