import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError, fieldErrorsFromZod, type ApiFieldErrors } from './errors';

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

export function failure(
  status: number,
  code: string,
  message: string,
  fields?: ApiFieldErrors,
): NextResponse {
  return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, {
    status,
    headers: SECURITY_HEADERS,
  });
}

/** Wraps a route handler, mapping thrown errors to a consistent JSON envelope. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse | Response>,
): (...args: Args) => Promise<NextResponse | Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) {
          const match = /in (\d+)s/.exec(error.message);
          const response = failure(error.status, error.code, error.message, error.fields);
          if (match) response.headers.set('Retry-After', match[1]!);
          return response;
        }
        return failure(error.status, error.code, error.message, error.fields);
      }
      if (error instanceof ZodError) {
        return failure(400, 'validation_failed', 'Some fields need attention.', fieldErrorsFromZod(error));
      }
      console.error('[api] unhandled error', error);
      return failure(500, 'internal_error', 'Something went wrong on our side.');
    }
  };
}

export async function readJson<S extends ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON.');
  }
  return schema.parse(body);
}

export function noStoreHeaders(): Record<string, string> {
  return { ...SECURITY_HEADERS };
}
