import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 使用 './' 相对路径，确保在 GitHub Pages 任何子目录名称下均可零报错加载静态资源与 JSON 数据
export default defineConfig({
  plugins: [react()],
  base: './',
})
