import { z } from 'zod'
import { validateIdentifier } from './helpers.ts'
import { generateCreateTableStatements } from './create.ts'
import type {
	AlterOptions,
	ColumnSnapshot,
	Snapshot,
	SchemaDiff,
} from './types.ts'

function generateAddColumnStatement(
	tableName: string,
	column: ColumnSnapshot,
	options?: AlterOptions
): string {
	const dialect = options?.dialect ?? 'mysql'
	validateIdentifier(tableName, 'table')
	validateIdentifier(column.name, 'field')

	const tableId = dialect === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`
	const colId = dialect === 'mysql' ? `\`${column.name}\`` : `"${column.name}"`

	let sql = `ALTER TABLE ${tableId} ADD COLUMN ${colId} ${column.sqlType}`

	if (column.autoIncrement && column.sqlType.includes('INT')) {
		if (dialect === 'postgresql') {
			sql = `ALTER TABLE ${tableId} ADD COLUMN ${colId} SERIAL`
		} else if (dialect !== 'sqlite') {
			sql += ' AUTO_INCREMENT'
		}
	}

	if (!column.nullable) sql += ' NOT NULL'

	if (column.default !== undefined) {
		if (typeof column.default === 'string') {
			sql += ` DEFAULT '${column.default.replace(/'/g, "''")}'`
		} else if (
			typeof column.default === 'number' ||
			typeof column.default === 'boolean'
		) {
			sql += ` DEFAULT ${column.default}`
		}
	}

	return sql + ';'
}

function generateDropColumnStatement(
	tableName: string,
	columnName: string,
	options?: AlterOptions
): string {
	const dialect = options?.dialect ?? 'mysql'
	validateIdentifier(tableName, 'table')
	validateIdentifier(columnName, 'field')

	const tableId = dialect === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`
	const colId = dialect === 'mysql' ? `\`${columnName}\`` : `"${columnName}"`

	return `ALTER TABLE ${tableId} DROP COLUMN ${colId};`
}

function generateModifyColumnStatements(
	tableName: string,
	column: ColumnSnapshot,
	options?: AlterOptions
): string[] {
	const dialect = options?.dialect ?? 'mysql'
	validateIdentifier(tableName, 'table')
	validateIdentifier(column.name, 'field')

	const tableId = dialect === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`
	const colId = dialect === 'mysql' ? `\`${column.name}\`` : `"${column.name}"`
	const statements: string[] = []

	if (dialect === 'mysql') {
		let sql = `ALTER TABLE ${tableId} MODIFY COLUMN ${colId} ${column.sqlType}`
		if (!column.nullable) sql += ' NOT NULL'
		if (column.default !== undefined) {
			if (typeof column.default === 'string') {
				sql += ` DEFAULT '${column.default.replace(/'/g, "''")}'`
			} else if (
				typeof column.default === 'number' ||
				typeof column.default === 'boolean'
			) {
				sql += ` DEFAULT ${column.default}`
			}
		}
		statements.push(sql + ';')

	} else if (dialect === 'postgresql') {
		statements.push(
			`ALTER TABLE ${tableId} ALTER COLUMN ${colId} TYPE ${column.sqlType};`
		)
		if (column.nullable) {
			statements.push(
				`ALTER TABLE ${tableId} ALTER COLUMN ${colId} DROP NOT NULL;`
			)
		} else {
			statements.push(
				`ALTER TABLE ${tableId} ALTER COLUMN ${colId} SET NOT NULL;`
			)
		}
		if (column.default !== undefined) {
			const defaultVal = typeof column.default === 'string'
				? `'${column.default.replace(/'/g, "''")}'`
				: String(column.default)
			statements.push(
				`ALTER TABLE ${tableId} ALTER COLUMN ${colId} SET DEFAULT ${defaultVal};`
			)
		} else {
			statements.push(
				`ALTER TABLE ${tableId} ALTER COLUMN ${colId} DROP DEFAULT;`
			)
		}
	}

	return statements
}

export function generateAlterTableStatements(
	diff: SchemaDiff & { newSnapshot?: Snapshot },
	schemas: Record<string, z.ZodObject<z.ZodRawShape>>,
	options?: AlterOptions
): string[] {
	const statements: string[] = []
	const allowDestructive = options?.allowDestructive ?? false
	const dialect = options?.dialect ?? 'mysql'

	// ── New tables ─────────────────────────────────────────────────────────────

	for (const tableName of diff.tables.added) {
		const schema = schemas[tableName]
		if (schema) {
			statements.push(generateCreateTableStatements(tableName, schema, options))
		}
	}

	// ── Modified tables ───────────────────────────────────────────────────────

	for (const tableDiff of diff.tables.modified) {

		// Primary key changes cannot be auto-migrated
		if (tableDiff.primaryKeys) {
			statements.push(
				`-- WARNING: Primary key change on "${tableDiff.table}" requires manual migration`
			)
			statements.push(
				`-- Old: (${tableDiff.primaryKeys.old.join(', ')})  →  New: (${tableDiff.primaryKeys.new.join(', ')})`
			)
		}

		// Added columns
		for (const col of tableDiff.columns.added) {
			statements.push(generateAddColumnStatement(tableDiff.table, col, options))
		}

		// Removed columns
		for (const colName of tableDiff.columns.removed) {
			if (allowDestructive) {
				statements.push(
					generateDropColumnStatement(tableDiff.table, colName, options)
				)
			} else {
				const tableId = dialect === 'mysql'
					? `\`${tableDiff.table}\``
					: `"${tableDiff.table}"`
				const colId = dialect === 'mysql'
					? `\`${colName}\``
					: `"${colName}"`
				statements.push(
					`-- SKIPPED: ALTER TABLE ${tableId} DROP COLUMN ${colId}; (set allowDestructive: true to enable)`
				)
			}
		}

		// Modified columns
		for (const change of tableDiff.columns.modified) {
			const newCol = diff.newSnapshot?.tables[tableDiff.table]?.columns[change.column]
			if (newCol) {
				statements.push(
					...generateModifyColumnStatements(tableDiff.table, newCol, options)
				)
			}
		}
	}

	// ── Removed tables ────────────────────────────────────────────────────────

	for (const tableName of diff.tables.removed) {
		const tableId = dialect === 'mysql'
			? `\`${tableName}\``
			: `"${tableName}"`
		if (allowDestructive) {
			statements.push(`DROP TABLE ${tableId};`)
		} else {
			statements.push(
				`-- SKIPPED: DROP TABLE ${tableId}; (set allowDestructive: true to enable)`
			)
		}
	}

	return statements
}

// ─── Migration runner ─────────────────────────────────────────────────────────
// Database-agnostic — pass your own execute function.
// Skips comment lines automatically.

export async function runMigrations(
	statements: string[],
	execute: (sql: string) => Promise<void>
): Promise<void> {
	for (const sql of statements) {
		const trimmed = sql.trim()
		// Skip comments and empty lines
		if (!trimmed || trimmed.startsWith('--')) continue
		await execute(sql)
	}
}