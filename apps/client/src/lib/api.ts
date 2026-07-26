export class ApiError extends Error {
  status: number;
  code: string | null;
  errorId: string | null;
  constructor(status: number, code: string | null = null, errorId: string | null = null) {
    super(code ?? `api_error_${status}`);
    this.status = status;
    this.code = code;
    this.errorId = errorId;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; errorId?: string } | null;
    throw new ApiError(res.status, body?.error ?? null, body?.errorId ?? null);
  }
  return (await res.json()) as T;
}
