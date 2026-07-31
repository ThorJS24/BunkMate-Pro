import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './electron/db/migrations',
  dialect: 'sqlite',
})
