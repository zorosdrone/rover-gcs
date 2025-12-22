import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl() // ★ HTTPS化 (オレオレ証明書生成)
  ],
  server: {
    host: '0.0.0.0', // ← true から '0.0.0.0' (文字列) に変更してIPv4固定
    port: 5173,
    https: true,
    allowedHosts: [
      'rover.zorosmap.me',
      'trigkeys5',
      'trigkeys5-wsl',
      'localhost',
      '127.0.0.1'
    ],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})