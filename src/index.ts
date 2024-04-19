import { Elysia} from "elysia";
import http from 'node:http';
import net from 'node:net';

import type { Server, NextHandleFunction, NextFunction } from 'connect';
import type { Middlewares, MiddlewareHandleServer, Config } from './types';

import { create_server } from './server';

class IncomingMessage extends http.IncomingMessage {
  constructor(request: Request) {
    super(new net.Socket());

    this.method = request.method;
    this.url = request.url;
    this.headers = request.headers.toJSON();
    this.rawHeaders = Object.entries(request.headers.toJSON()).flat();
    this.push(request.body);
    this.push(null);
  }
}

class ServerResponse extends http.ServerResponse {
  body: BodyInit | null | undefined;
  response: Response | null | undefined;

  //@TODO: fix undefined is not a function when calling write in 2nd middleware
  constructor(incomingMessage: http.IncomingMessage) {
    super(incomingMessage);

    const originalWrite = this.write;
    this.write = function (...args: any) {//@TODO: fix any
      if (typeof args[0] === 'string') {
        this.body = this.body ? this.body + args[0] : args[0];
      }

      if (args[0] instanceof Buffer) {
        this.body = this.body ? this.body + args[0].toString() : args[0].toString();
      }

      if (args[0] instanceof Uint8Array) {
        this.body = this.body ? this.body + Buffer.from(args[0]).toString() : Buffer.from(args[0]).toString();
      }

      return originalWrite.apply(this, args)
    }

    const originalEnd = this.end;
    this.end = function (...args: any) {//@TODO: fix any
      if (args[0] && typeof args[0] !== 'function' && !this.body) {
          this.body = args[0];
      }
      this.response = new Response(this.body, {
        status: this.statusCode,
        statusText: this.statusMessage,
        headers: JSON.parse(JSON.stringify(this.getHeaders())),
      });

      return originalEnd.apply(this, args)
    }
  }
}

export const middleware_plugin = (config?: Config) => {
  const { logger, httpServer } = config || { logger: true, httpServer: true };
  const plugin = new Elysia({
    name: 'elysia-middleware',
    seed: {
      logger,
      httpServer
    }
  }).derive({ as: 'global' }, async () => ({
    connect: {
      use: (args: Middlewares) => { console.log(args) },
      handle: (): Promise<Response | null | undefined | void> => { return Promise.resolve() }
    }
  }));

  if (logger) {
    console.log(`[elysia-middleware] - mode: ${httpServer ? 'server' : 'connect'}`)
  }
    
  if (httpServer) {
    const config = httpServer === true ? {} : httpServer;
    const promise_server: Promise<MiddlewareHandleServer> | MiddlewareHandleServer = create_server(config);

    plugin
      .derive({ as: 'global' }, async (ctx) => {
        let server: MiddlewareHandleServer;
        if (promise_server instanceof Promise) {
          server = await promise_server;
        } else {
          server = promise_server;
        }
        await server.listen();
        const path = ctx.path;

        return {
          connect: {
            use: (args: Middlewares) => {
              const { middlewares, connectApp } = get_args(args);
              if (connectApp) {
                if (middlewares.length) {
                  middlewares.forEach((m) => {
                    connectApp.use(path, m)
                  })
                }
                server.add_connectApp(connectApp);

                return
              }
              
              server.add_middleware(path, middlewares);
            },
            handle: async (): Promise<Response | null | undefined | void> => await server.handle(ctx)
          }
        }
      });
  } else {
    plugin
      .derive({ as: 'global' }, async (ctx) => {
        const incomingMessage = new IncomingMessage(ctx.request);
        const serverResponse = new ServerResponse(incomingMessage);

        let m: NextHandleFunction[] = [];
        let a: Server;

        return {
          connect: {
            use: (args: Middlewares): void => {
              const { middlewares, connectApp } = get_args(args);
              if (m.length) {
                m.push(...middlewares);
              } else {
                m = [...middlewares];
              }
              //@TODO: feat connectApp
              if (connectApp) {
                if (a) {
                  a.use(connectApp);
                } else {
                  a = connectApp;
                }
              }
            },
            handle: async (): Promise<Response | null | undefined | void> => await execute_middlewares(m, incomingMessage, serverResponse)
          }
        }
      });
  }

  return plugin
}

function get_args(args: Middlewares): { middlewares: NextHandleFunction[], connectApp: Server | undefined} {
  let middlewares: NextHandleFunction[] = [];
  let connectApp: Server | undefined;

  if (Array.isArray(args)) {
    middlewares = [...args];
  } else if (args) {
    if (typeof args === 'function') {
      middlewares.push(args);
    } else {
      connectApp = args;
    }
  }

  return { middlewares, connectApp }
}

function execute_middlewares(middlewares: NextHandleFunction[], req: IncomingMessage, res: ServerResponse) {
  let i = 0;
  return new Promise<Response | null | undefined | void>((resolve, reject) => {
    if (!middlewares.length) {
      resolve();
    }
    const executor = () => {
      if (res.closed || res.writableEnded || res.response || i >= middlewares.length) {
        resolve(res.response);
        return
      }

      const middleware = middlewares[i++];
      if (middleware) {
        const next: NextFunction = (err) => {
          if (err) {
            reject(err);
          }
          executor();
        }

        middleware(req, res, next)
      } else {
        executor();
      }
    }

    executor();
  })
}

export default middleware_plugin;
