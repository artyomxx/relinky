function pad2(n) {
	return String(n).padStart(2, '0')
}

export function parseTimestamp(value) {
	if (value == null || value === '') return null
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value
	}
	let ms = value
	if (typeof value === 'string' && /^\d+$/.test(value)) {
		ms = Number(value)
	}
	if (typeof ms === 'number') {
		if (ms < 1e12) ms *= 1000
	}
	const date = new Date(ms)
	return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateYMD(value) {
	const date = parseTimestamp(value)
	if (!date) return '-'
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function formatDateTimeLocal(value, empty = '—') {
	const date = parseTimestamp(value)
	if (!date) return empty
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function formatUtcOffsetLabel(value) {
	const date = parseTimestamp(value) ?? new Date()
	const offsetMinutes = -date.getTimezoneOffset()
	const sign = offsetMinutes >= 0 ? '+' : '-'
	const abs = Math.abs(offsetMinutes)
	const hours = Math.floor(abs / 60)
	const mins = abs % 60
	if (mins === 0) return `UTC${sign}${hours}`
	return `UTC${sign}${hours}:${pad2(mins)}`
}
