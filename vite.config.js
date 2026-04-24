import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
	plugins: [vue()],
	root: resolve(__dirname, 'app/admin/frontend'),
	build: {
		outDir: resolve(__dirname, 'app/admin/frontend/dist'),
		emptyOutDir: true
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, 'app/admin/frontend')
		}
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:8081',
				changeOrigin: true
			}
		}
	}
})
