import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'
import fs from 'node:fs'

// The production main.cjs bundle is flattened into dist-electron/, so the
// SQL migration files (read from disk at runtime, not imported as modules)
// need to be copied alongside it — otherwise initDb()'s migrate() call is a
// silent no-op against a freshly created database.
function copyMigrationsPlugin(): Plugin {
  return {
    name: 'bunkmate:copy-migrations',
    closeBundle() {
      const src = path.resolve(__dirname, 'electron/db/migrations')
      const dest = path.resolve(__dirname, 'dist-electron/migrations')
      fs.cpSync(src, dest, { recursive: true })
    },
  }
}

// dist-electron is shared by three separate sub-builds (main, preload, this
// plugin's migrations copy), so Vite never empties it automatically — doing
// so after the first sub-build would delete the others' output. That means
// a main.cjs left over from an older/differently-configured build (e.g. one
// built before a vite-plugin-electron upgrade, or a partially-failed build)
// can silently survive into a new `npm run package` and ship broken. This
// plugin fails the build loudly instead: it re-reads the freshly written
// main.cjs/preload.cjs and throws if either isn't actually CommonJS, so a
// format regression is caught at build time, not by a user launching the
// installer. It also refuses to run against a stale file left in place by a
// build that already failed for some other reason.
function assertElectronOutputIsCjsPlugin(): Plugin {
  function assertCjs(filePath: string) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[bunkmate:assert-cjs] Expected ${filePath} to exist after the build — it doesn't.`)
    }
    const content = fs.readFileSync(filePath, 'utf8')
    // A real CJS bundle from this build never contains a top-level ESM
    // import/export statement (string contents that happen to include the
    // word "import" don't match this — it specifically looks for the
    // statement form).
    if (/(^|\n)\s*(import\s[^(]|export\s)/.test(content)) {
      throw new Error(
        `[bunkmate:assert-cjs] ${filePath} contains ESM import/export syntax but is loaded as CommonJS ` +
          `(the .cjs extension forces CJS interpretation regardless of package.json's "type"). ` +
          `This would crash immediately on launch with "Cannot use import statement outside a module". ` +
          `Check vite.config.ts's electron main/preload build config (lib.formats / rollupOptions.output.format).`,
      )
    }
  }

  return {
    name: 'bunkmate:assert-electron-output-is-cjs',
    closeBundle() {
      for (const file of ['main.cjs', 'preload.cjs']) {
        const filePath = path.resolve(__dirname, 'dist-electron', file)
        if (fs.existsSync(filePath)) assertCjs(filePath)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // Only for `vite build` (not the dev server, which reuses dist-electron
  // across incremental rebuilds): start from a clean dist-electron so a
  // stale file from a previous, possibly differently-configured build can
  // never survive into a new one.
  if (command === 'build') {
    fs.rmSync(path.resolve(__dirname, 'dist-electron'), { recursive: true, force: true })
  }

  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            plugins: [copyMigrationsPlugin(), assertElectronOutputIsCjsPlugin()],
            build: {
              outDir: 'dist-electron',
              // A plain (non-lib) build. vite-plugin-electron derives its
              // own `build.lib` default for the `main` entry from whether
              // package.json has "type": "module" (it does, here) — so its
              // injected default was `lib.formats: ['es']`, silently
              // shipping main.cjs as ESM despite the .cjs extension (caught
              // by assertElectronOutputIsCjsPlugin below, confirmed via a
              // temporary config-dump plugin, not guessed). `lib: false`
              // opts out of that default; the entry/format instead come
              // from `rolldownOptions` below, since Vite 8's actual bundler
              // only reads `build.rolldownOptions` — `build.rollupOptions`
              // is normalized away during the merge (see
              // vite-plugin-electron's own utils.ts comment: "Vite 8+ reads
              // build.rolldownOptions, while Vite < 8 reads
              // build.rollupOptions").
              lib: false,
              rolldownOptions: {
                input: 'electron/main.ts',
                external: ['better-sqlite3', 'electron', /^pdfjs-dist/, /^tesseract\.js/, /^@napi-rs\//],
                output: {
                  format: 'cjs',
                  entryFileNames: 'main.cjs',
                },
              },
            },
          },
        },
        preload: {
          input: 'electron/preload.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['electron'],
                output: {
                  format: 'cjs',
                  entryFileNames: 'preload.cjs',
                },
              },
            },
          },
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 4000,
      rolldownOptions: {
        output: {
          codeSplitting: false,
        },
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
