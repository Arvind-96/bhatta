import { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Express 4 does not catch rejected promises from async route handlers —
// an uncaught one becomes an unhandled rejection that can crash the whole
// process instead of just failing that one request. Wrapping every handler
// with this routes the error to errorMiddleware (JSON error response)
// instead, so a single bad request/bug never takes the server down.
export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
