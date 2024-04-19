import { Elysia } from "elysia";
import middleware_plugin from "..";

import { describe, expect, it } from 'bun:test'
import type { NextHandleFunction } from "connect";

const request = (method: string, path: string) => new Request(`http://localhost:3000${path}`, { method });

const middleware1: NextHandleFunction = async (req, res, next) => {
  res.end('middleware1')
  next()
}
const middleware2: NextHandleFunction = (req, res, next) => {
  res.write('middleware2')
  res.end()
  next()
}
const middleware3: NextHandleFunction = (req, res, next) => {
  res.write('middleware3')
  next()
}

describe('Elysia Middleware Plugin Server Mode', () => {
  const app = new Elysia().use(middleware_plugin({ logger: true, httpServer: true }))
  it('should use middleware1 end on GET request', async () => {
    app.get('/server-get', async ({ connect }) => {
      connect.use(middleware1);
      const res = await connect.handle();

      if (res) {
        return res
      }
      return 'GET'
    }).listen(3000)

    const get = await app.handle(request('GET', '/server-get'))

    expect(await get.text()).toBe('middleware1')

    await app.stop()
  })

  it('should use middleware3 next middleware2 end on POST request', async () => {
    app.post('/server-post', async ({ connect }) => {
      connect.use([middleware3, middleware2]);
      const res = await connect.handle();

      if (res) {
        return res
      }
      return 'POST'
    }).listen(3000)

    const post = await app.handle(request('POST', '/server-post'))

    expect(await post.text()).toBe('middleware3middleware2')

    await app.stop()
  })

  it('should use middleware2 end on PUT request', async () => {
    app.put('/server-put', async ({ connect }) => {
      connect.use(middleware2);
      const res = await connect.handle();

      if (res) {
        return res
      }
      return 'PUT'
    }).listen(3000)

    const put = await app.handle(request('PUT', '/server-put'))

    expect(await put.text()).toBe('middleware2')

    await app.stop()
  })
})

describe('Elysia Middleware Plugin Connect Mode', () => {
  const app = new Elysia().use(middleware_plugin({ logger: true, httpServer: false }))
  it('should use middleware1 end on GET request', async () => {
    app.get('/connect-get', async ({ connect }) => {
      connect.use(middleware1);
      const res = await connect.handle();

      if (res) {
        return res
      }
      return 'GET'
    }).listen(3000)

    const get = await app.handle(request('GET', '/connect-get'))

    expect(await get.text()).toBe('middleware1')

    await app.stop()
  })

  // it('should use middleware3 next middleware2 end on POST request', async () => {
  //   app.post('/connect-post', async ({ connect }) => {
  //     connect.use([middleware3, middleware2]);
  //     const res = await connect.handle();

  //     if (res) {
  //       return res
  //     }

  //     return 'POST'
  //   }).listen(3000)

  //   const post = await app.handle(request('POST', '/connect-post'))

  //   expect(await post.text()).toBe('middleware3middleware2')

  //   await app.stop()
  // })

  it('should use middleware2 end on PUT request', async () => {
    app.put('/connect-put', async ({ connect }) => {
      connect.use(middleware2);
      const res = await connect.handle();

      if (res) {
        return res
      }
      return 'PUT'
    }).listen(3000)

    const put = await app.handle(request('PUT', '/connect-put'))

    expect(await put.text()).toBe('middleware2')

    await app.stop()
  })
})