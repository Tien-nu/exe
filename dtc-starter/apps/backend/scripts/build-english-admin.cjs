// Compile the original Medusa dashboard with Yarnly's English extensions.
// This does not start Medusa or connect to PostgreSQL.
const { createRequire } = require("node:module")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const local = createRequire(require.resolve("@medusajs/medusa"))
import(pathToFileURL(local.resolve("@medusajs/admin-bundler")).href)
  .then(({ build }) =>
    build({
      path: "/app",
      plugins: [],
      backendUrl: "/",
      sources: [path.resolve(__dirname, "../src/admin")],
      outDir: path.resolve(__dirname, "../admin-build-english"),
      // pnpm isolates bundler peers; resolve Tailwind sources from this project.
      vite: (config) => {
        config.plugins = config.plugins.filter(
          (plugin) => plugin.name !== "medusa:inject-tailwindcss"
        )
        return {
          css: {
            postcss: {
              plugins: [
                require("../../storefront/node_modules/tailwindcss")({
                  presets: [
                    require("../../storefront/node_modules/@medusajs/ui-preset"),
                  ],
                  darkMode: "class",
                  content: [
                    path.resolve(
                      __dirname,
                      "../.medusa/client/**/*.{js,jsx,ts,tsx,html}"
                    ),
                    path.resolve(
                      __dirname,
                      "../src/admin/**/*.{js,jsx,ts,tsx}"
                    ),
                    path.join(
                      path.dirname(require.resolve("@medusajs/dashboard")),
                      "**/*.{js,jsx,ts,tsx}"
                    ),
                    path.join(
                      path.dirname(require.resolve("@medusajs/ui")),
                      "**/*.{js,jsx,ts,tsx}"
                    ),
                  ],
                }),
              ],
            },
          },
        }
      },
    })
  )
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
