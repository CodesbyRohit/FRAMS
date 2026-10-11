import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.FRAMS_API_ORIGIN || 'http://localhost:5000',
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // face-api.js (TensorFlow.js) is only needed on the verify and enroll screens.
        codeSplitting: {
          groups: [
            { name: 'face', test: /node_modules[\\/](face-api\.js|@tensorflow)/ },
            { name: 'charts', test: /node_modules[\\/](recharts|d3-|victory-vendor)/ },
          ],
        },
      },
    },
  },
})
