export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`api_error_${status}`);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}
