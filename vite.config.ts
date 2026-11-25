import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Both entry pages are built: the original demo UI and the interactive Paillier UI.
      input: {
        main: 'index.html',
        ui: 'ui.html',
      },
    },
  },
})
