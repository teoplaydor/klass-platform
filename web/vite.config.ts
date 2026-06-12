import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Слушаем все интерфейсы: исключает рассинхрон IPv4/IPv6 на Windows
    // и позволяет открывать дев-сервер с других устройств в сети
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    // Целевой бюджет — лёгкий бандл: продукт обязан работать на слабых машинах
    target: 'es2019',
    sourcemap: false,
  },
});
