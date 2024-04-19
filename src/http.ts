import { resolve } from 'path';
import { readFileSync } from 'node:fs';

import type {
  HttpServer,
  HttpsServerOptions,
  Http2SecureServerRequestListener
} from './types';
import type { Server } from 'connect'
import type { Options as ProxyOptions} from 'http-proxy-middleware';

export async function create_http_server(
  { proxy, https }: { proxy?: ProxyOptions, https?: HttpsServerOptions},
  connectApp: Server
): Promise<HttpServer> {

  if (https && !proxy) { 
      // NotImplementedError: node:http2 createSecureServer is not yet implemented in Bun. 
      // Track the status & thumbs up the issue: https://github.com/oven-sh/bun/issues/887
    const { createSecureServer } = await import('node:http2');
    
    const onRequest: Http2SecureServerRequestListener = (req, res) => {
      console.log('🚀 ~ req, res:', req, res)
      return connectApp
    }

    const http2Server = createSecureServer({
      maxSessionMemory: 1000,
      ...https,
      allowHTTP1: true,
    }, onRequest);

    return http2Server;
  }
  
  if (https && proxy) {
      const { createServer } = await import('node:https');
      const { createProxyMiddleware } = await import('http-proxy-middleware');
      
      const middlewareProxy = createProxyMiddleware(proxy);
      connectApp.use(middlewareProxy);

      return createServer(https, connectApp)
  }
  
  const { createServer } = await import('node:http');

  return createServer(connectApp)
}
  
export async function resolve_https_config(
  https: HttpsServerOptions | undefined,
): Promise<HttpsServerOptions | undefined> {
  if (!https) return undefined

  const [ca, cert, key, pfx] = await Promise.all([
    existsFile(https.ca),
    existsFile(https.cert),
    existsFile(https.key),
    existsFile(https.pfx),
  ])
  return { ...https, ca, cert, key, pfx }
}

async function existsFile<T>(value: T): Promise<T | undefined> {
  if (typeof value === 'string') {
    return readFileSync(resolve(value)) as T || undefined
  }
  
  return value
}

export async function http_server_start(
  httpServer: HttpServer,
  serverOptions: {
    port: number
    strictPort: boolean | undefined
    host: string | undefined
  }
): Promise<number> {
  let { port } = serverOptions;
  const { host, strictPort } = serverOptions;

  return new Promise((resolve, reject) => {
    const onError = (e: Error & { code?: string }) => {
      if (e.code === 'EADDRINUSE') {
        if (strictPort) {
          httpServer.removeListener('error', onError);
          reject(new Error(`Port ${port} is already in use`));
        } else {
          console.info(`Port ${port} is in use, trying port++...`);
          httpServer.listen(++port, host, () => {
            httpServer.removeListener('error', onError);
            resolve(port);
          });
        }
      } else {
        httpServer.removeListener('error', onError);
        reject(e)
      }
    }

    httpServer.on('error', onError);

    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', onError)
      resolve(port)
    });
  })
}

export function set_middleware_error_handler(
  server: HttpServer
): void {
  server.on('middlewareError', (err, req, res, next) => {
    console.error(err)
    res.end()
    next()
  })
}
