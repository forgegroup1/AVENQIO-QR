import { ZodError } from 'zod';

export type ApiFieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: ApiFieldErrors;

  constructor(status: number, code: string, message: string, fields?: ApiFieldErrors) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static unauthorized(message = 'Sign in to continue.') {
    return new ApiError(401, 'unauthorized', message);
  }

  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, 'forbidden', message);
  }

  /** 404 is also used when a resource exists but the caller cannot see it. */
  static notFound(message = 'Not found.') {
    return new ApiError(404, 'not_found', message);
  }

  static badRequest(message: string, fields?: ApiFieldErrors) {
    return new ApiError(400, 'bad_request', message, fields);
  }

  static conflict(message: string) {
    return new ApiError(409, 'conflict', message);
  }

  static tooManyRequests(retryAfterSeconds: number) {
    return new ApiError(429, 'rate_limited', `Too many requests. Try again in ${retryAfterSeconds}s.`);
  }
}

export function fieldErrorsFromZod(error: ZodError): ApiFieldErrors {
  const fields: ApiFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
