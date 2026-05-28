import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(import.meta.dirname, '../../../.env') })
