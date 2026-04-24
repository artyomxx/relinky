/**
 * Bind HTTP server for reverse proxies (Traefik, Coolify): when bindHost is 0.0.0.0, use
 * listen(port) only so Node accepts IPv4 and IPv6. Binding explicitly to 0.0.0.0 is IPv4-only
 * and Traefik often dials the container on IPv6 → connection refused → 502.
 */
export function listenServer(server, port, bindHost, onListening) {
	if (bindHost === '0.0.0.0') {
		server.listen(port, onListening)
	} else {
		server.listen(port, bindHost, onListening)
	}
}
