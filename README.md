# elysia-middleware
Plugin for [elysia](https://github.com/saltyaom/elysia) use node middleware

## Installation
```bash
bun add elysia-middleware
```

## Example
```typescript
import { Elysia } from 'elysia'
import { middleware_plugin } from 'elysia-middleware'

const app = new Elysia()
    .use(middleware_plugin())
    .get('/', async ({ connect, ...ctx}) => {
        connect.use(middleware);
        const res = await connect.handle();

        // means that the middleware has handled the request and return the response
        if (res) return res
        // no response from middleware, continue to the next handler
        return ctx
    })
    .listen(3000)
```

## This plugin is not complete yet, I created this plugin for use with vite dev server so it maybe it only works for development