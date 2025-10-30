import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'path'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build:{
    outDir:'../api/public',
    emptyOutDir:true
  },
  resolve:{
    alias:{
      '@': resolve(__dirname,'./src')
    }
  }
})
