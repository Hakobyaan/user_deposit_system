import express, { json, NextFunction, Router, urlencoded } from 'express';
import type { MutatedRequest, MutatedResponse } from './types/module';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './docs/openapi';
import logger from './utils/logger';
import { getAsArray } from './utils/array';
import { SingleRoute, RequestMethodsLow, MiddlewareHandler } from './types/module';
import { Utility } from './types/request';
import { convertModuleToRoute } from './utils/convertor';
import { EXTENSION } from './utils/variables';

class Server {
  public server = express();
  private modules: { name: string, path: string }[] = [];
  private readonly router: Router = Router();

  constructor() {
    this.config();
  }

  private config(): void {
    this.server.use(cors());
    this.server.use(json());
    this.server.use(urlencoded({
      extended: false
    }));
    this.server.use(morgan('dev'));

    this.server.get('/health', (_req, res) => res.json({
      ok: true
    }));

    this.server.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

    this.server.use(this.router);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.server.use((err: any, _req: any, res: any, _next: any) => {
      const status  = err?.status  ?? 500;
      const message = err?.message ?? 'Internal server error';
      const data    = err?.data    ?? null;

      logger.error(`[${status}] ${message}`);

      res.status(status).json({
        ok: false,
        status,
        message,
        ...(data ? {
          data
        } : {}),
      });
    });
  }

  public async loadModules(): Promise<void> {
    const modulesUrl = `${__dirname}/modules/`;
    const folders = fs.readdirSync(modulesUrl).filter((folder) => !folder.startsWith('.'));
    folders.forEach((module) => {
      const routerPath = path.join(__dirname, 'modules', module, `router.${EXTENSION}`);
      if (fs.existsSync(routerPath)) {
        this.modules.push({
          name: module, path: routerPath
        });
      } else {
        logger.error('Router path not found: ' + routerPath);
      }
    });
    this.signRoutes();
  }

  private signRoutes() {
    for (const moduleObj of this.modules) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { module } = require(moduleObj.path);
      const moduleRouter = Router();
      if (module.middleware) moduleRouter.use(module.middleware);
      module.routes.forEach((route: SingleRoute) => {
        const { method, path: routePath, actions } = this.createRoute(route);
        moduleRouter[method](routePath, actions);
      });
      const modulePath = module.path && module.path !== ''
        ? module.path
        : `/${convertModuleToRoute(moduleObj.name)}`;
      this.router.use(modulePath, moduleRouter);
    }
  }

  private requestHandlerWrapper(handler: Utility) {
    return async function (_req: MutatedRequest, res: MutatedResponse, next: NextFunction) {
      try {
        // eslint-disable-next-line prefer-spread, prefer-rest-params
        const data = await handler.apply(null, arguments);
        if (!res.headersSent) res.result = data;
        next();
      } catch (err: Utility) {
        next(err);
      }
    };
  }

  private createRoute(route: SingleRoute) {
    const method: RequestMethodsLow = route.method.toLowerCase() as RequestMethodsLow;
    const actions: Utility[] = [];

    const responseFunction: MiddlewareHandler = async (_req, res: Utility): Promise<void> => {
      if (res.headersSent) return;
      res.status(200).json({
        ok:     true,
        status: 200,
        data:   res.result,
      });
    };

    const middlewares = getAsArray(route.middleware).map(
      (middleware): MiddlewareHandler =>
        async function (req, res, next) {
          try {
            let called = false;
            const wrappedNext = (err?: Utility) => {
              called = true;
              next(err);
            };
            await middleware(req, res, wrappedNext);
            if (!called && !res.headersSent) next();
          } catch (err: Utility) {
            next(err);
          }
        }
    );

    actions.push(...getAsArray(route.preRequest));
    actions.push(...getAsArray(route.validators));
    actions.push(...getAsArray(middlewares));
    actions.push(...getAsArray(this.requestHandlerWrapper(route.handler)));
    actions.push(...getAsArray(responseFunction));
    actions.push(...getAsArray(route.postRequest));

    return {
      method, path: route.path, actions
    };
  }
}

export default new Server();
