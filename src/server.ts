import { Socket, type AddressInfo} from 'node:net';
import type { Context } from 'elysia';
import connect from 'connect';

import type {
  HttpServer,
  ResolvedConfig,
  ResolveConfig,
  MiddlewareHandleServer,
} from './types';

import {
  create_http_server,
  http_server_start,
  resolve_https_config,
  set_middleware_error_handler
} from "./http";

import {
  resolve_host_name,
  resolve_server_url
} from './utils';

const DEFAULT_PORT = 3003;
const DEFAULT_HOST = 'localhost';

export function create_server(
  resolveConfig?: ResolveConfig,
): Promise<MiddlewareHandleServer> {
  let resolvedConfig: ResolvedConfig;
  if (resolveConfig) {
    resolvedConfig = resolve_config(resolveConfig);
  } else {
    resolvedConfig = resolve_config({});
  }

  return _create_server(resolvedConfig)
}

async function _create_server(
  resolvedConfig: ResolvedConfig,
  connectApp = connect(),
): Promise<MiddlewareHandleServer> {
  const { server: serverConfig } = resolvedConfig;
  const https = await resolve_https_config(serverConfig.https);
  const httpServer = await create_http_server({ proxy: serverConfig.proxy, https }, connectApp);

  set_middleware_error_handler(httpServer);

  const close_http_server = create_server_close_fn(httpServer);
  let exit_process = (): Promise<void> => Promise.resolve();

  let server: MiddlewareHandleServer = {
    config: resolvedConfig,
    connectApp,
    handlers: {},
    httpServer,
    handle: async (ctx) => await _handle(ctx, server),
    add_middleware(path, middlewares) {
      const connectApp = server.connectApp;
      const handlers = server.handlers;
      const fixedPath = !path || path === './' ? '/' : path;

      if (middlewares.length) {
        if (handlers[fixedPath]?.length)
          handlers[fixedPath] = [ ...(handlers[fixedPath] || []), ...middlewares ];
        else
          handlers[fixedPath] = middlewares;

        middlewares.forEach((middleware) => {
          connectApp.use(fixedPath, middleware);
        });
      }
    },
    add_connectApp: (connectApp) => {
      connectApp.use(server.connectApp);
      server.connectApp = connectApp;
    },
    listen: async (port?: number, isRestart?: boolean) => {
      if (isRestart) {
        await start_server(server, port);
        return server
      }

      await start_server(server, port);

      server._serverUrl = await resolve_server_url(
        httpServer,
        resolvedConfig.server,
        resolvedConfig
      );

      return server
    },
    close: async () => {
      process.off('SIGTERM', exit_process)
      if (process.env.CI !== 'true') {
        process.stdin.off('end', exit_process)
      }
      await close_http_server();
      server._serverUrl = null;
    },
    get_url: (path) => {
      if (server._serverUrl) {
        return path ? new URL(path, server._serverUrl).href : server._serverUrl
      } else {
        throw new Error(
          'cannot get server URL before server.listen is called.',
        )
      }
    },
    restart: async () => {
      if (!server._restartPromise) {
        server._restartPromise = _restart(server).finally(() => {
          server._restartPromise = null;
        });
      }

      return await server._restartPromise
    },
    _isRunning: () => server._serverUrl !== null,
    _setInternalServer: (newServer: MiddlewareHandleServer) => {
      server = newServer
    },
    _restartPromise: null,
    _serverUrl: null,
    _serverPort: serverConfig.port || DEFAULT_PORT
  }

  exit_process = async () => {
    try {
      await server.close()
    } finally {
      process.exit()
    }
  }

  process.once('SIGTERM', exit_process)
  if (process.env.CI !== 'true') {
    process.stdin.on('end', exit_process)
  }

  httpServer.once('listening', () => {
    serverConfig.port = (httpServer.address() as AddressInfo).port
  })

  server._serverUrl = await resolve_server_url(
    httpServer,
    serverConfig,
    resolvedConfig
  );

  return server
}

const start_server = async (
  server: MiddlewareHandleServer,
  port?: number,
): Promise<void> => {
  const httpServer = server.httpServer;
  const serverConfig = server.config.server;
  const hostname = await resolve_host_name(serverConfig.host);
  const configPort = port ?? serverConfig.port;

  const finalPort = (configPort === server._serverPort
      ? server._serverPort
      : configPort) ?? DEFAULT_PORT;

  const serverPort = await http_server_start(httpServer, {
    port: finalPort,
    strictPort: serverConfig.strictPort,
    host: hostname.host
  });

  server._serverPort = serverPort;
}

export function create_server_close_fn(
  server: HttpServer | null,
): () => Promise<void> {
  if (!server) {
    return () => Promise.resolve()
  }

  let hasListened = false;
  const openSockets = new Set<Socket>();

  server.on('connection', (socket) => {
    openSockets.add(socket)
    socket.on('close', () => {
      openSockets.delete(socket)
    })
  })

  server.once('listening', () => {
    hasListened = true
  })

  return () =>
    new Promise<void>((resolve, reject) => {
      openSockets.forEach((s) => s.destroy());
      if (hasListened) {
        server.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      } else {
        resolve()
      }
    })
}

async function _handle(
  ctx: Context,
  server: MiddlewareHandleServer,
): Promise<Response | void> {
  const url = server.get_url(ctx.path);
  const req = new Request(url, {
    method: ctx.request.method,
    headers: ctx.request.headers,
    body: ctx.body ? JSON.stringify(ctx.body) : undefined,
  });
  const res = await fetch(req);

  if (res.status != 404) 
    return res
}

async function _restart(server: MiddlewareHandleServer) {
  const { server: { port } } = server.config;
  const config = server.config;
  {
    let newServer = null;
    try {
      // delay ws server listen
      newServer = await _create_server(config, server.connectApp);
    } catch (err: any) {
      console.error('Server restart failed', err.message, { timestamp: true });
      return
    }

    await server.close();

    // Assign new server props to existing server instance
    newServer._serverPort = server._serverPort;
    Object.assign(server, newServer);

    // Rebind internal server variable so functions reference the user server
    newServer._setInternalServer(server);
  }

  await server.listen(port, true);
}

export function resolve_config(
  resolveConfig: ResolveConfig,
): ResolvedConfig {
  const resolveServerConfig = resolveConfig.server;
  const server = {
    port: resolveServerConfig?.port || DEFAULT_PORT,
    host: resolveServerConfig?.host || DEFAULT_HOST,
    strictPort: resolveServerConfig?.strictPort || false,
    https: resolveServerConfig?.https,
    proxy: resolveServerConfig?.proxy,
  };

  const base = resolveConfig.base || '/';

  let resolved: ResolvedConfig = {
    base,
    server
  };
  resolved = {
    ...resolveConfig,
    ...resolved,
  };

  return resolved
}