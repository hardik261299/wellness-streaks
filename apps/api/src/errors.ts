import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import type { ErrorResponse } from '@wellness/shared';
import { ConflictError } from './repo';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorBody = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
export const wrap =
  (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; ');
    throw new ApiError(422, 'VALIDATION_ERROR', msg);
  }
  return result.data;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  void next;
  if (err instanceof ApiError) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json(errorBody(err.code, err.message));
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json(errorBody('BAD_JSON', 'malformed JSON body'));
    return;
  }
  console.error(err);
  res.status(500).json(errorBody('INTERNAL', 'internal server error'));
};
