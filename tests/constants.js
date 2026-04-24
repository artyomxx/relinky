/** Shared literals for integration tests (admin server + fetch). */

export const devPasswordHash =
	'$6$U6FoHpuonLWpqT2s$Zx/tZFXdqzNvRCM./BBzF8j57S65BzONzgQ/Bij2j9B6zepxB1OPLUr.yUdwVnGD31ATIzONf9wtNFPQPbbRt.'
export const adminPassword = 'dev'
export const baseHost = 'example.com'
export const adminListenHost = '127.0.0.1'
export const adminServerEntry = 'app/admin/backend/server.js'
export const redirectorServerEntry = 'app/redirector/server.js'

export const pathHealthcheck = '/healthcheck'
export const pathAuthLogin = '/api/auth/login'
export const pathAuthLogout = '/api/auth/logout'
export const pathAuthCheck = '/api/auth/check'
export const pathDomains = '/api/domains'
export const pathDomainsDeleteWithLinks = '/api/domains/delete-with-links'
export const pathLinks = '/api/links'
export const pathSettings = '/api/settings'
export const pathSettingsApiKeys = '/api/settings/api-keys'
export const pathStats = '/api/stats'
export const pathLogs = '/api/logs'
export const pathExternalLinks = '/api/external/links'
export const pathExternalStats = '/api/external/stats'
export const pathLinksImportPreview = '/api/links/import/preview'
export const pathLinksImport = '/api/links/import'
export const pathLinksExport = '/api/links/export'
export const pathLinksExportCount = '/api/links/export/count'
export const pathLinksCheckUrlBase = '/api/links/check-url'

/** Import / export test helpers */
export const importFlagsNone = Object.freeze({ createDomains: false, replaceExisting: false })
export const importFlagsReplace = Object.freeze({ createDomains: false, replaceExisting: true })
export const linksListLimit = '10'
