export class Router {
	constructor() {
		this.routes = []
	}

	add(method, path, handler) {
		this.routes.push({ method, path, handler })
	}

	get(path, handler) {
		this.add('GET', path, handler)
	}

	post(path, handler) {
		this.add('POST', path, handler)
	}

	put(path, handler) {
		this.add('PUT', path, handler)
	}

	delete(path, handler) {
		this.add('DELETE', path, handler)
	}

	match(method, url) {
		const parsedUrl = new URL(url, 'http://localhost')
		const pathname = parsedUrl.pathname

		for (const route of this.routes) {
			if (route.method !== method) continue

			// Simple exact match
			if (route.path === pathname) {
				return { handler: route.handler, params: {} }
			}

			// Simple param matching (e.g., /api/links/:id)
			const pattern = route.path.replace(/:[^/]+/g, '([^/]+)')
			const regex = new RegExp(`^${pattern}$`)
			const match = pathname.match(regex)

			if (match) {
				const paramNames = route.path.match(/:[^/]+/g) || []
				const params = {}
				paramNames.forEach((name, index) => {
					params[name.substring(1)] = match[index + 1]
				})
				return { handler: route.handler, params }
			}
		}

		return null
	}
}

