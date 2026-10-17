import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ quiet: true, path: resolve(import.meta.dirname, '../../../.env') })
