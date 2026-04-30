import type { z } from 'zod'

/**
 * 
 * @param name 
 * @param type 
 * 
 * Validates that the given name is a valid SQL identifier for a table or field.
 */

export function validateIdentifier(name: string, type: 'table' | 'field'): void {
	if (!name?.trim()) throw new TypeError(`${type} name cannot be empty`)
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		throw new Error(`Invalid ${type} name: "${name}"`)
	}
}


/** * 
 * @param error 
 * @returns 
 * 
 * Formats Zod validation errors into a simple object mapping field paths to error messages.
 */

export function formatZodErrors(error: z.ZodError): Record<string, string> {
	return error.issues.reduce((acc, err) => {
		const field = err.path.join('.')
		acc[field] = err.message
		return acc
	}, {} as Record<string, string>)
}

/**
 * 
 * @param schema 
 * @returns 
 * 
 * Marks a Zod schema as a primary key.
 */
export function pk<T extends z.ZodTypeAny>(schema: T): T {
	return schema.describe('pk') as T
}


/** * 
 * @param schema 
 * @returns 
 * 
 * Marks a Zod schema as a unique key.
 */
export function unique<T extends z.ZodTypeAny>(schema: T): T {
	return schema.describe('unique') as T
}


/** * 
 * @param schema 
 * @returns 
 * 
 * Marks a Zod schema as auto-incrementing.
 */
export function autoIncrement<T extends z.ZodTypeAny>(schema: T): T {
	return schema.describe('autoIncrement') as T
}

/** * 
 * @param schema 
 * @param table 
 * @param column 
 * @returns 
 * 
 * Marks a Zod schema as a foreign key referencing the specified table and column.
 */
export function fk<T extends z.ZodTypeAny>(
	schema: T,
	table: string,
	column: string
): T {
	return schema.describe(`fk:${table}.${column}`) as T
}

/** * 
 * @param schema 
 * @param type 
 * @returns 
 * 
 * Attaches a custom SQL type to a Zod schema using the describe method.
 * This allows you to specify the exact SQL type for a field when generating DDL statements.
 */
export function sqlType<T extends z.ZodTypeAny>(schema: T, type: string): T {
	return schema.describe(`sql:${type}`) as T
}