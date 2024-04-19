import { Elysia } from "elysia";
import type { NextHandleFunction } from "connect";
import { middleware_plugin } from '../src';

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

const request = (method: string, path: string) => new Request(`http://localhost:3000${path}`, { method });

const app = new Elysia().use(middleware_plugin({ logger: true, httpServer: false }))
  .get('/get', async ({ connect }) => {
    connect.use(middleware1);
    connect.use(middleware2);
    return await connect.handle();
  })
  .post('/post', async ({ connect }) => {
    connect.use([middleware3, middleware2]);
    return await connect.handle();
  })
  .listen(3000);

const get = await app.handle(request('GET', '/get'))
console.log("GET:")
console.log(await get.text())

const post = await app.handle(request('POST', '/post'))
console.log("POST:")
console.log(await post.text())

await app.stop()