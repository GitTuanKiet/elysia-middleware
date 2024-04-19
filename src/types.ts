import type * as http from 'node:http'
import type * as http2 from 'node:http2'
import type * as https from 'node:https'
import type { Options as ProxyOptions } from 'http-proxy-middleware'
import type { Context } from 'elysia'
import type { Server, NextHandleFunction } from 'connect'

export type HttpServer = http.Server | http2.Http2SecureServer | https.Server;
export type HttpsServerOptions = https.ServerOptions;
export type Http2SecureServerRequestListener = ((request: http2.Http2ServerRequest, response: http2.Http2ServerResponse) => void);
export type Middlewares = NextHandleFunction | NextHandleFunction[] | Server;

export type Config = {
  /**
   * Enable logger
   * @default true
   */
  logger: boolean | undefined
  /**
   * Enable http server
   * @default true
   */
  httpServer: boolean | ResolveConfig
};
export type ResolvedConfig = Readonly<{
  base: string
  server: ServerOptions
}>;
export type ResolveConfig = {
  /**
   * base url 
   * @default '/''
   */
  base?: string
  server?: ServerOptions
};

export interface Hostname {
  host: string | undefined
  name: string
}
export interface ServerOptions {
  /**
   * server port
   * @default 3003
   */
  port: number
  /**
   * server host
   * @default localhost
   */
  host: string | boolean
  /**
   * strict port
   * if false, port++
   * @default false
   */
  strictPort: boolean | undefined
  /**
   * HttpsServerOptions
   */
  https: HttpsServerOptions | undefined
  /**
   * ProxyOptions
   */
  proxy: ProxyOptions | undefined
}
export interface MiddlewareHandleServer {
  config: ResolvedConfig
  connectApp: Server
  handlers: Record<string, NextHandleFunction[]>
  httpServer: HttpServer
  handle: (ctx: Context) => Promise<Response | void>
  add_middleware: (
    path: string | undefined,
    middlewares: NextHandleFunction[]
  ) => void
  add_connectApp: (connectApp: Server) => void
  listen: (port?: number, isRestart?: boolean) => Promise<MiddlewareHandleServer>
  close: () => Promise<void>
  restart: () => Promise<void>
  get_url: (path?: string) => string
  _setInternalServer: (server: MiddlewareHandleServer) => void
  _isRunning: () => boolean
  _restartPromise: Promise<void> | null
  _serverUrl: string | null
  _serverPort: number
}