export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(message: string, status: number, code = 'error', fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

/** Thin fetch wrapper: JSON in, typed data out, errors as ApiClientError. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = (data as { error?: { message?: string; code?: string; fields?: Record<string, string> } } | null)
      ?.error;
    throw new ApiClientError(
      error?.message ?? `Request failed (${response.status})`,
      response.status,
      error?.code ?? 'error',
      error?.fields,
    );
  }
  return data as T;
}

export function fieldIssue(fields: Record<string, string> | undefined, path: string): string | null {
  if (!fields) return null;
  return fields[`payload.${path}`] ?? fields[path] ?? null;
}
