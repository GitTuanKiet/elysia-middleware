if ('Bun' in globalThis) {
    throw new Error('❌ Use Node.js to run this test!')
}

import { middleware_plugin } from 'elysia-middleware'

if (typeof middleware_plugin !== 'function') {
    throw new Error('❌ ESM Node.js failed')
}

console.log('✅ ESM Node.js works!')