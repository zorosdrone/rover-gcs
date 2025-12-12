import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    host: true, // 0.0.0.0 でリッスンして外部アクセスを許可
    // 以下を追加
    allowedHosts: [
      'rover.zorosmap.me',
      'trigkeys5',
      'trigkeys5-wsl',
      'localhost',
      '127.0.0.1'
    ]
  }
})
