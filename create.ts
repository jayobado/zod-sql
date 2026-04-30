import type { z } from 'zod'
import { validateIdentifier } from './helpers.ts'
import { sqlMap } from './map.ts'
import type { SqlDialect } from './types.ts'

/**
 * 
 * @param tableName 
 * @param schema 
 * @param options 
 * @returns 
 * 
 * Generates a SQL CREATE TABLE statement based on the provided Zod schema.
 * Supports MySQL, PostgreSQL, and SQLite dialects with customizable options.
 * Validates identifiers and schema structure before generating the SQL statement.
 * Handles various field constraints, default values, and key definitions.
 * Provides warnings for potential issues like AUTO_INCREMENT without PRIMARY KEY.
 */

export function generateCreateTableStatements(
	tableName: string,
	schema: z.ZodObject<z.ZodRawShape>,
	options?: { varcharLen?: number; dialect?: SqlDialect; onWarn?: (msg: string) => void }
): string {
	const dialect = options?.dialect ?? 'mysql'
	validateIdentifier(tableName, 'table')

	if (!schema || typeof schema !== 'object' || !('shape' in schema)) {
		throw new TypeError('Schema must be a ZodObject')
	}
	if (Object.keys(schema.shape).length === 0) {
		throw new Error('Schema must have at least one field')
	}
	if (options?.varcharLen !== undefined) {
		if (options.varcharLen <= 0 || !Number.isInteger(options.varcharLen)) {
			throw new RangeError('varcharLen must be a positive integer')
		}
	}

	const fieldsSql: string[] = []
	const primaryKeys: string[] = []
	const uniqueKeys: string[] = []
	const foreignKeys: string[] = []

	for (const [key, fieldSchema] of Object.entries(schema.shape)) {
		validateIdentifier(key, 'field')

		const info = sqlMap(fieldSchema as z.ZodTypeAny, options)
		const identifier = dialect === 'mysql' ? `\`${key}\`` : `"${key}"`
		let line = `${identifier} ${info.sqlType}`

		if (info.autoIncrement && info.sqlType.includes('INT')) {
			if (dialect === 'postgresql') {
				line = `${identifier} SERIAL`
			} else if (dialect === 'sqlite') {
				line = `${identifier} INTEGER`
			} else {
				line += ' AUTO_INCREMENT'
			}
		}

		if (!info.nullable && !info.optional) line += ' NOT NULL'

		if (info.default !== undefined) {
			if (typeof info.default === 'string') {
				line += ` DEFAULT '${info.default.replace(/'/g, "''")}'`
			} else if (
				typeof info.default === 'number' ||
				typeof info.default === 'boolean'
			) {
				line += ` DEFAULT ${info.default}`
			} else if (info.default instanceof Date) {
				line += ` DEFAULT '${info.default
					.toISOString()
					.slice(0, 19)
					.replace('T', ' ')}'`
			} else if (typeof info.default === 'object') {
				line += ` DEFAULT '${JSON.stringify(info.default).replace(/'/g, "''")}'`
			}
		}

		const constraints = info.constraints ?? {}
		if (
			(constraints.min != null || constraints.max != null) &&
			!info.autoIncrement
		) {
			const lengthFn = dialect === 'postgresql' ? 'LENGTH' : 'CHAR_LENGTH'
			if (
				info.sqlType.startsWith('VARCHAR') ||
				info.sqlType === 'TEXT'
			) {
				const checks: string[] = []
				if (constraints.min != null) {
					checks.push(`${lengthFn}(${identifier}) >= ${constraints.min}`)
				}
				if (constraints.max != null) {
					checks.push(`${lengthFn}(${identifier}) <= ${constraints.max}`)
				}
				if (checks.length) line += ` CHECK (${checks.join(' AND ')})`
			} else if (
				info.sqlType.includes('INT') ||
				info.sqlType.includes('DOUBLE') ||
				info.sqlType.includes('FLOAT') ||
				info.sqlType.includes('SERIAL')
			) {
				const checks: string[] = []
				if (constraints.min != null) {
					checks.push(`${identifier} >= ${constraints.min}`)
				}
				if (constraints.max != null) {
					checks.push(`${identifier} <= ${constraints.max}`)
				}
				if (checks.length) line += ` CHECK (${checks.join(' AND ')})`
			}
		}

		fieldsSql.push(line)

		if (info.primaryKey) primaryKeys.push(key)
		if (info.unique && !info.primaryKey) uniqueKeys.push(key)

		if (info.foreignKey) {
			const fkTable = dialect === 'mysql'
				? `\`${info.foreignKey.table}\``
				: `"${info.foreignKey.table}"`
			const fkColumn = dialect === 'mysql'
				? `\`${info.foreignKey.column}\``
				: `"${info.foreignKey.column}"`
			foreignKeys.push(
				`FOREIGN KEY (${identifier}) REFERENCES ${fkTable}(${fkColumn})`
			)
		}

		if (info.autoIncrement && !info.primaryKey) {
			options?.onWarn?.(
				`AUTO_INCREMENT on "${key}" without PRIMARY KEY`
			)
		}
	}

	if (primaryKeys.length > 0) {
		const pkCols = primaryKeys
			.map(k => dialect === 'mysql' ? `\`${k}\`` : `"${k}"`)
			.join(', ')
		fieldsSql.push(`PRIMARY KEY (${pkCols})`)
	}

	for (const key of uniqueKeys) {
		const identifier = dialect === 'mysql' ? `\`${key}\`` : `"${key}"`
		if (dialect === 'mysql') {
			fieldsSql.push(`UNIQUE KEY \`${key}_unique\` (${identifier})`)
		} else {
			fieldsSql.push(`UNIQUE (${identifier})`)
		}
	}

	fieldsSql.push(...foreignKeys)

	const tableIdentifier = dialect === 'mysql'
		? `\`${tableName}\``
		: `"${tableName}"`

	return `CREATE TABLE ${tableIdentifier} (\n  ${fieldsSql.join(',\n  ')}\n);`
}