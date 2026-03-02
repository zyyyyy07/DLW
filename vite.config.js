import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const hfToken = env.HF_API_KEY || env.VITE_HF_API_KEY || ''

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/hf-chat': {
          target: 'https://router.huggingface.co',
          changeOrigin: true,
          secure: true,
          rewrite: () => '/v1/chat/completions',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (hfToken) {
                proxyReq.setHeader('Authorization', `Bearer ${hfToken}`)
              }
            })
          },
        },
      },
    },
  }
})
