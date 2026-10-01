import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import inventory from '../middleware/inventory.js'

function localSimulationApi() {
  let store = inventory.createInitialStore()

  return {
    name: 'local-inventory-simulation-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost')
          const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
          const [resource, id, action] = segments
          const readBody = async () => {
            let raw = ''
            for await (const chunk of req) raw += chunk
            return raw ? JSON.parse(raw) : {}
          }
          const send = (status, payload) => {
            res.statusCode = status
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.setHeader('cache-control', 'no-store')
            res.end(JSON.stringify(payload))
          }

          if (req.method === 'GET' && segments.length === 1) {
            if (resource === 'health') return send(200, { ok: true, service: 'local-simulation' })
            if (resource === 'trays') {
              const trays = Object.values(store.configs).map((config) => ({
                ...config,
                ...(store.trays[config.id] || { id: config.id, online: false, health: 'awaiting_data', isLowStock: false, actuatorLed: 'off' }),
              }))
              return send(200, trays)
            }
            if (resource === 'orders') return send(200, store.orders)
            if (resource === 'alerts') return send(200, store.alerts)
          }

          if (req.method === 'POST' && resource === 'simulation') {
            const input = await readBody()
            const result = inventory.createSimulationPayload(store, input)
            const timestamp = new Date().toISOString()
            if (input.online === false) {
              const status = inventory.processDeviceStatus(store, `inventory/${result.trayId}/status`, result.status, timestamp)
              store = status.store
            } else {
              const status = inventory.processDeviceStatus(store, `inventory/${result.trayId}/status`, result.status, timestamp)
              const telemetry = inventory.processTelemetry(status.store, `inventory/${result.trayId}/telemetry`, result.telemetry, timestamp)
              store = telemetry.store
            }
            return send(202, { accepted: true, trayId: result.trayId, scenario: input.online === false ? 'device_offline' : result.telemetry.sensorValid ? 'telemetry' : 'sensor_error' })
          }

          if (req.method === 'PUT' && resource === 'trays' && action === 'config') {
            const input = await readBody()
            const result = inventory.updateTrayConfig(store, id, input)
            store = result.store
            return send(200, { config: result.config, published: false, mode: 'local-simulation' })
          }

          if (req.method === 'PATCH' && resource === 'orders') {
            const input = await readBody()
            const result = inventory.updateOrderStatus(store, id, input.status)
            store = result.store
            return send(200, result.order)
          }

          return send(404, { error: 'Unknown local simulation API route' })
        } catch (error) {
          const status = error instanceof SyntaxError ? 400 : error.message.startsWith('Unknown') ? 404 : 400
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: error.message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react(), localSimulationApi()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:1880',
        changeOrigin: true,
      },
    },
  },
})
