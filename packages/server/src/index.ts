import './env.js'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
const port = Number(process.env.PORT ?? 4000)
console.log(`Nav listening on port ${port}`)
serve({ fetch: createApp().fetch, port })
