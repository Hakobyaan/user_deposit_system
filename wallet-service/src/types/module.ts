import type { Request, Response, NextFunction } from 'express';
import { Utility } from './request';

export type RequestMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type RequestMethodsLow = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface MutatedResponse extends Response {
  result?: Utility;
}

export interface MutatedRequest<T = Utility> extends Request {
  pagination?: { offset: number; limit: number };
  idempotencyKey?: string;
  authUserId?: number;
  meta?: Record<string, Utility>;
  body: T;
}

export type MiddlewareHandler = (req: MutatedRequest, res: MutatedResponse, next: NextFunction) => Promise<void> | void;

export interface SingleRoute<T = Utility> {
  handler: (req: MutatedRequest<T>, res: MutatedResponse, next: NextFunction) => Promise<unknown> | unknown;
  path: string;
  method: RequestMethods;
  middleware?: MiddlewareHandler | MiddlewareHandler[];
  validators?: MiddlewareHandler | MiddlewareHandler[];
  preRequest?: MiddlewareHandler | MiddlewareHandler[];
  postRequest?: MiddlewareHandler | MiddlewareHandler[];
}

export interface Router<T = Utility> {
  routes: SingleRoute<T>[];
  path?: string;
  middleware?: MiddlewareHandler | MiddlewareHandler[];
}

export type ModuleActionsList = Record<string, MiddlewareHandler>;
