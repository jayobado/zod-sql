import type { z } from 'zod'

export function validateIdentifier(name: string, type: 'table' | 'field'): void {
	if (!name?.trim()) throw new TypeError(`${type} name cannot be empty`)
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		throw new Error(`Invalid ${type} name: "${name}"`)
	}
}

export function formatZodErrors(error: z.ZodError): Record<string, string> {
	return error.issues.reduce((acc, err) => {
		const field = err.path.join('.')
		acc[field] = err.message
		return acc
	}, {} as Record<string, string>)
}

// ─── Typed description token helpers ─────────────────────────────────────────
// Use these instead of raw .describe() strings to avoid silent typos.

export function pk<T extends z.ZodTypeAny>(schema: T): T {
	return schema.describe('pk') as T
}

export function unique<T extends z.ZodTypeAny>(schema: T): T {
	return schema.describe('unique') as T
}

export function autoIncrement<T extends z.ZodTypeAny>(schema: T): T {
	return schema.describe('autoIncrement') as T
}

export function fk<T extends z.ZodTypeAny>(
	schema: T,
	table: string,
	column: string
): T {
	return schema.describe(`fk:${table}.${column}`) as T
}

export function sqlType<T extends z.ZodTypeAny>(schema: T, type: string): T {
	return schema.describe(`sql:${type}`) as T
}