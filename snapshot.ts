import type { z } from 'zod';
import { sqlMap } from './map.ts'
import type {
	SqlMapOptions,
	Snapshot,
	TableSnapshot,
	ColumnSnapshot,
	ForeignKeySnapshot,
} from './types.ts'


/**
 * 
 * @param schemas 
 * @param options 
 * @returns 
 * 
 * Generate	s a snapshot of the current database schema based on the provided Zod schemas.
 * The snapshot includes detailed information about tables, columns, data types, constraints, and keys.
 * This can be used for schema diffing and migration generation in the future.
 * Validates the structure of the Zod schemas and ensures that identifiers are valid.
 * Supports custom SQL type mapping through options.
 * 
 * Example usage:
 * 
 * const snapshot = generateSnapshot({
 *   users: z.object({
 *     id: pk(autoIncrement(z.number())),
 *     name: z.string(),
 *     email: unique(z.string().email()),
 *     profileId: fk(z.number(), 'profiles', 'id'),
 *   }),
 * });
 * 
 * This would generate a snapshot representing a "users" table with the specified columns and constraints.
 */

export function generateSnapshot(
	schemas: Record<string, z.ZodObject<z.ZodRawShape>>,
	options?: SqlMapOptions & { name?: string }
): Snapshot {
	const tables: Record<string, TableSnapshot> = {}

	for (const [tableName, schema] of Object.entries(schemas)) {
		const columns: Record<string, ColumnSnapshot> = {}
		const primaryKeys: string[] = []
		const uniqueKeys: string[] = []
		const foreignKeys: ForeignKeySnapshot[] = []

		for (const [fieldName, fieldSchema] of Object.entries(schema.shape)) {
			const info = sqlMap(fieldSchema as z.ZodTypeAny, options)

			columns[fieldName] = {
				name: fieldName,
				sqlType: info.sqlType,
				nullable: info.nullable || info.optional,
				default: info.default,
				constraints: info.constraints,
				autoIncrement: info.autoIncrement,
				primaryKey: info.primaryKey,
				unique: info.unique,
			}

			if (info.primaryKey) primaryKeys.push(fieldName)
			if (info.unique && !info.primaryKey) uniqueKeys.push(fieldName)
			if (info.foreignKey) {
				foreignKeys.push({
					column: fieldName,
					refTable: info.foreignKey.table,
					refColumn: info.foreignKey.column,
				})
			}
		}

		tables[tableName] = {
			name: tableName,
			columns,
			primaryKeys,
			uniqueKeys,
			foreignKeys,
		}
	}

	return {
		version: 1,
		name: options?.name,
		timestamp: new Date().toISOString(),
		tables,
	}
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

export async function saveSnapshot(
	snapshot: Snapshot,
	path: string
): Promise<void> {
	await Deno.writeTextFile(path, JSON.stringify(snapshot, null, 2))
}

export async function loadSnapshot(path: string): Promise<Snapshot> {
	const raw = await Deno.readTextFile(path)
	const data = JSON.parse(raw) as unknown

	if (
		typeof data !== 'object' || data === null ||
		!('version' in data) || !('tables' in data)
	) {
		throw new Error(`Invalid snapshot file: ${path}`)
	}

	return data as Snapshot
}