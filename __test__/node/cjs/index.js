if ('Bun' in globalThis) {
    throw new Error('❌ Use Node.js to run this test!')
}

const { middleware_plugin } = require('elysia-middleware')

if (typeof middleware_plugin !== 'function') {
    throw new Error('❌ CommonJS Node.js failed')
}

console.log('✅ CommonJS Node.js works!')