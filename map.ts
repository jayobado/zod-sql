import { z } from 'zod'
import type {
	ZodDef,
	Unwrapped,
	Constraints,
	SqlMapOptions,
	SqlMapResult,
} from './types.ts'

function zodDef(schema: z.ZodType): ZodDef | null {
	return (schema as { def?: ZodDef }).def ?? null
}

function zodTypeName(schema: z.ZodType): string | undefined {
	const d = zodDef(schema)
	if (!d) return undefined
	const tn = d.type ?? undefined
	return typeof tn === 'string' ? tn : String(tn)
}

function unwrap(schema: z.ZodType): Unwrapped {
	let cur = schema
	let optional = false
	let nullable = false
	let default_: unknown = undefined

	while (true) {
		const d = zodDef(cur)
		const tn = d?.type ?? ''
		if (!tn || !d) break

		if (tn === 'optional') {
			optional = true
			cur = d.innerType ?? cur
			continue
		}
		if (tn === 'nullable') {
			nullable = true
			cur = d.innerType ?? cur
			continue
		}
		if (tn === 'default') {
			try {
				const maybeDefault = d.defaultValue ?? d.value ?? undefined
				default_ = typeof maybeDefault === 'function'
					? (maybeDefault as () => unknown)()
					: maybeDefault
			} catch {
				// silently skip — default will be undefined
			}
			cur = d.innerType ?? cur
			continue
		}
		if (tn === 'pipe') {
			cur = d.in ?? cur
			continue
		}
		break
	}

	return {
		inner: cur,
		optional,
		nullable,
		default: default_,
		typeName: zodTypeName(cur),
		def: zodDef(cur) ?? undefined,
	}
}

function setConstraints(schema: z.ZodType | null | undefined): Constraints {
	if (!schema) return { min: null, max: null }
	const s = schema as {
		minLength?: number
		maxLength?: number
		minValue?: number
		maxValue?: number
	}
	const min = s.minLength ?? s.minValue ?? null
	const max = s.maxLength ?? s.maxValue ?? null
	return { min, max }
}

function readDescribeTokens(schema: z.ZodType | null | undefined): string[] {
	const desc = (schema as { description?: string })?.description ?? ''
	return desc.split(',').map((s: string) => s.trim()).filter(Boolean)
}

export function sqlMap(
	schema: z.ZodType,
	options: SqlMapOptions = {}
): SqlMapResult {
	if (!schema || typeof schema !== 'object') {
		throw new TypeError('Invalid Zod schema')
	}

	const { varcharLen = 255, dialect = 'mysql', onWarn } = options

	if (varcharLen <= 0 || !Number.isInteger(varcharLen)) {
		throw new RangeError('varcharLen must be a positive integer')
	}

	const un = unwrap(schema)
	const tn = un.typeName ?? ''
	const def = un.def
	const descTokens = readDescribeTokens(un.inner)

	const primaryKey = descTokens.includes('primary') ||
		descTokens.includes('primaryKey') ||
		descTokens.includes('pk')
	const unique = descTokens.includes('unique')
	const autoIncrement = descTokens.includes('autoIncrement') ||
		descTokens.includes('auto_increment') ||
		descTokens.includes('autoincrement')

	const fkToken = descTokens.find(
		(t: string) => t.startsWith('fk:') || t.startsWith('foreignKey:')
	)
	let foreignKey: { table: string; column: string } | undefined
	if (fkToken) {
		const fkValue = fkToken.split(':')[1]
		if (fkValue?.includes('.')) {
			const [table, column] = fkValue.split('.')
			if (table?.trim() && column?.trim()) {
				foreignKey = { table: table.trim(), column: column.trim() }
			}
		}
	}

	const explicitSqlToken = descTokens.find(
		(t: string) => t.startsWith('sql:') || t.startsWith('sqlType:')
	)
	if (explicitSqlToken) {
		const explicitType = explicitSqlToken.split(':')[1]
		if (explicitType) {
			return {
				sqlType: explicitType.toUpperCase(),
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn,
				primaryKey,
				unique,
				autoIncrement,
				foreignKey,
			}
		}
	}

	// ── UUID ──────────────────────────────────────────────────────────────────

	if (tn === 'string' && def?.format === 'uuid') {
		const version = def?.version ?? undefined
		let sqlType = 'CHAR(36)'
		if (descTokens.includes('binary_uuid')) {
			sqlType = 'BINARY(16)'
		} else if (dialect === 'postgresql') {
			sqlType = 'UUID'
		}
		return {
			sqlType,
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn + (version ? ` (uuid:${version})` : ''),
			primaryKey,
			unique,
			autoIncrement,
			foreignKey,
		}
	}

	// ── JSON ──────────────────────────────────────────────────────────────────

	if (tn === 'lazy' || tn === 'json') {
		return {
			sqlType: 'JSON',
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			primaryKey,
			unique,
			foreignKey,
		}
	}

	// ── Special string formats ────────────────────────────────────────────────

	if (tn === 'string' && def?.format) {
		if (def.format === 'email') {
			return {
				sqlType: 'VARCHAR(254)',
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn + ' (email)',
				primaryKey,
				unique,
				foreignKey,
			}
		}
		if (def.format === 'url' || def.format === 'base64') {
			return {
				sqlType: 'TEXT',
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn + ` (${def.format})`,
				primaryKey,
				unique,
				foreignKey,
			}
		}
		if (def.format === 'datetime') {
			const sqlType = dialect === 'postgresql' ? 'TIMESTAMP'
				: dialect === 'sqlite' ? 'TEXT'
					: 'DATETIME'
			return {
				sqlType,
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn + ' (datetime)',
				primaryKey,
				unique,
				foreignKey,
			}
		}
	}

	// ── String ────────────────────────────────────────────────────────────────

	if (tn === 'string') {
		const { min, max } = setConstraints(un.inner)
		if (max && max > 0) {
			return {
				sqlType: `VARCHAR(${max})`,
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn,
				constraints: { min, max },
				primaryKey,
				unique,
				foreignKey,
			}
		}
		return {
			sqlType: 'TEXT',
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			constraints: { min, max },
			primaryKey,
			unique,
			foreignKey,
		}
	}

	// ── Number ────────────────────────────────────────────────────────────────

	if (tn === 'number') {
		const { min, max } = setConstraints(un.inner)
		const isInt = def?.format === 'safeint' || def?.format === 'int'
		let sqlType = 'DOUBLE'

		if (isInt) sqlType = 'INT'
		if (!isInt && (
			descTokens.includes('float32') ||
			descTokens.includes('sql:float')
		)) sqlType = 'FLOAT'

		const constraints: Constraints = {}
		if (min != null) constraints.min = min
		if (max != null) constraints.max = max

		return {
			sqlType,
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			constraints,
			primaryKey,
			unique,
			autoIncrement,
			foreignKey,
		}
	}

	// ── Boolean ───────────────────────────────────────────────────────────────

	if (tn === 'boolean') {
		const sqlType = dialect === 'postgresql' ? 'BOOLEAN'
			: dialect === 'sqlite' ? 'INTEGER'
				: 'TINYINT(1)'
		return {
			sqlType,
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			primaryKey,
			unique,
			foreignKey,
		}
	}

	// ── Date ──────────────────────────────────────────────────────────────────

	if (tn === 'date') {
		const sqlType = dialect === 'postgresql' ? 'TIMESTAMP'
			: dialect === 'sqlite' ? 'TEXT'
				: 'DATETIME'
		return {
			sqlType,
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			primaryKey,
			unique,
			foreignKey,
		}
	}

	// ── Enum ──────────────────────────────────────────────────────────────────

	if (tn === 'enum') {
		const entries = def?.entries ?? {}
		const values = Object.values(entries)
		let sqlType: string

		if (dialect === 'postgresql' || dialect === 'sqlite') {
			sqlType = 'TEXT'
		} else {
			sqlType = `ENUM(${values
				.map((v: unknown) => `'${String(v).replace(/'/g, "''")}'`)
				.join(',')})`
		}

		return {
			sqlType,
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			primaryKey,
			unique,
			foreignKey,
		}
	}

	// ── NativeEnum ────────────────────────────────────────────────────────────

	if (tn === 'nativeEnum') {
		const enumObj = (def?.values ?? def?.enum ?? {}) as Record<string, unknown>
		const enumVals = Object.values(enumObj).filter(
			(v): v is string => typeof v === 'string'
		)

		if (enumVals.length > 0) {
			return {
				sqlType: `ENUM(${enumVals
					.map(v => `'${v.replace(/'/g, "''")}'`)
					.join(',')})`,
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn,
				primaryKey,
				unique,
				foreignKey,
			}
		}
		return {
			sqlType: 'INT',
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			primaryKey,
			unique,
			autoIncrement,
			foreignKey,
		}
	}

	// ── Literal ───────────────────────────────────────────────────────────────

	if (tn === 'literal') {
		const v = def?.value ?? undefined
		if (typeof v === 'string') {
			return {
				sqlType: `VARCHAR(${Math.max(String(v).length, 1)})`,
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn,
				primaryKey,
				unique,
				foreignKey,
			}
		}
		if (typeof v === 'number') {
			return {
				sqlType: 'INT',
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn,
				primaryKey,
				unique,
				autoIncrement,
				foreignKey,
			}
		}
		if (typeof v === 'boolean') {
			return {
				sqlType: 'TINYINT(1)',
				optional: un.optional,
				nullable: un.nullable,
				default: un.default,
				typeName: tn,
				primaryKey,
				unique,
				foreignKey,
			}
		}
	}

	// ── File ──────────────────────────────────────────────────────────────────

	if (tn === 'file') {
		return {
			sqlType: 'BLOB',
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			primaryKey,
			unique,
			foreignKey,
		}
	}

	// ── Object / Array / any / unknown → JSON ─────────────────────────────────

	if (
		tn === 'object' || tn === 'array' ||
		tn === 'any' || tn === 'unknown'
	) {
		return {
			sqlType: 'JSON',
			optional: un.optional,
			nullable: un.nullable,
			default: un.default,
			typeName: tn,
			primaryKey,
			unique,
			foreignKey,
		}
	}

	// ── Fallback ──────────────────────────────────────────────────────────────

	onWarn?.(`Unknown Zod type "${tn}" — falling back to TEXT`)

	return {
		sqlType: 'TEXT',
		optional: un.optional,
		nullable: un.nullable,
		default: un.default,
		typeName: tn,
		primaryKey,
		unique,
		foreignKey,
	}
}