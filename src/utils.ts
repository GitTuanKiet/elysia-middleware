import os from 'node:os'
import { promises as dns } from 'node:dns';

import type { AddressInfo, Server } from 'node:net'
import type {
  ResolvedConfig,
  ServerOptions,
  Hostname,
 } from './types'

/**
 * Returns resolved localhost address when `dns.lookup` result differs from DNS
 *
 * `dns.lookup` result is same when defaultResultOrder is `verbatim`.
 * Even if defaultResultOrder is `ipv4first`, `dns.lookup` result maybe same.
 * For example, when IPv6 is not supported on that machine/network.
 */
export async function get_localhost_address_If_differs_from_DNS(): Promise<
  string | undefined
> {
  const [nodeResult, dnsResult] = await Promise.all([
    dns.lookup('localhost'),
    dns.lookup('localhost', { verbatim: true }),
  ])
  const isSame =
    nodeResult.family === dnsResult.family &&
    nodeResult.address === dnsResult.address
  return isSame ? undefined : nodeResult.address
}

export async function resolve_host_name(
  optionsHost: string | boolean | undefined,
): Promise<Hostname> {
  let host: string | undefined
  if (optionsHost === undefined || optionsHost === false) {
    // Use a secure default
    host = 'localhost'
  } else if (optionsHost === true) {
    // If passed --host in the CLI without arguments
    host = undefined // undefined typically means 0.0.0.0 or :: (listen on all IPs)
  } else {
    host = optionsHost
  }

  // Set host name to localhost when possible
  let name = host === undefined || wildcardHosts.has(host) ? 'localhost' : host

  if (host === 'localhost') {
    // See #8647 for more details.
    const localhostAddr = await get_localhost_address_If_differs_from_DNS()
    if (localhostAddr) {
      name = localhostAddr
    }
  }

  return { host, name }
}

export const loopbackHosts = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0000:0000:0000:0000:0000:0000:0000:0001',
])

export const wildcardHosts = new Set([
  '0.0.0.0',
  '::',
  '0000:0000:0000:0000:0000:0000:0000:0000',
])

export async function resolve_server_url(
  server: Server,
  options: ServerOptions,
  config: ResolvedConfig,
): Promise<string> {
  const address = server.address();

  const is_address_info = (x: any): x is AddressInfo => x?.address;
  if (!is_address_info(address)) {
    if (address !== null) {
      return address
    }
  }

  const hostname = await resolve_host_name(options.host);
  const protocol = options.https ? 'https' : 'http';
  const port = address?.port ||  options.port;
  const base = config.base === './' || config.base === '' ? '/' : config.base;

  if (hostname.host !== undefined && !wildcardHosts.has(hostname.host)) {
    let hostnameName = hostname.name;
    // ipv6 host
    if (hostnameName.includes(':')) {
      hostnameName = `[${hostnameName}]`
    }
    const address = `${protocol}://${hostnameName}:${port}${base}`;
    if (loopbackHosts.has(hostname.host)) {
      return address
    }
  } else {
    Object.values(os.networkInterfaces())
      .flatMap((nInterface) => nInterface ?? [])
      .filter(
        (detail) =>
          detail &&
          detail.address &&
          (detail.family === 'IPv4' ||
            // @ts-expect-error Node 18.0 - 18.3 returns number
            detail.family === 4),
      )
      .forEach((detail) => {
        let host = detail.address.replace('127.0.0.1', hostname.name);
        // ipv6 host
        if (host.includes(':')) {
          host = `[${host}]`
        }
        const url = `${protocol}://${host}:${port}${base}`;
        if (detail.address.includes('127.0.0.1')) {
          return url
        }
      })
  }

  return `${protocol}://${hostname.name}:${port}${base}`
}