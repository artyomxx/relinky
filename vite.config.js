import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const adminPort = process.env.ADMIN_PORT || '8081'

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
		// Bind IPv4 so `ssh -L 5173:127.0.0.1:5173` can reach the dev server (avoids ::1-only listen).
		host: '127.0.0.1',
		port: 5173,
		strictPort: true,
		// Browser runs on your laptop; HMR must use the forwarded localhost port, not the VPS hostname.
		hmr: {
			protocol: 'ws',
			host: 'localhost',
			port: 5173,
			clientPort: 5173
		},
		proxy: {
			'/api': {
				target: `http://127.0.0.1:${adminPort}`,
				changeOrigin: true
			}
		}
	}
})
