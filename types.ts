import type { z } from 'zod'

export type ZodTable = {
	name: string
	struct: z.ZodRawShape
}

export interface ZodCheck {
	kind?: string
	code?: string
	check?: string
	value?: number
	version?: string
	options?: { version?: string }
}

export interface ZodDef {
	type?: string
	typeName?: string
	innerType?: z.ZodTypeAny
	schema?: z.ZodTypeAny
	in?: z.ZodTypeAny
	out?: z.ZodTypeAny
	default?: unknown
	defaultValue?: unknown
	value?: unknown
	checks?: ZodCheck[]
	validation?: ZodCheck[]
	description?: string
	format?: string
	version?: string
	entries?: Record<string, unknown>
	values?: string[] | Record<string, unknown>
	options?: unknown[]
	enum?: Record<string, unknown>
}

export type Unwrapped = {
	inner: z.ZodTypeAny
	optional: boolean
	nullable: boolean
	default?: unknown
	typeName?: string
	def?: ZodDef
}

export type SqlDialect = 'mysql' | 'postgresql' | 'sqlite'

export type SqlMapOptions = {
	varcharLen?: number
	dialect?: SqlDialect
	// Called instead of throwing for non-fatal warnings
	onWarn?: (message: string) => void
}

export type AlterOptions = SqlMapOptions & {
	// Set to true to allow DROP TABLE and DROP COLUMN statements
	// Defaults to false — destructive statements are commented out
	allowDestructive?: boolean
}

export interface Constraints {
	min?: number | null
	max?: number | null
}

export interface SqlMapResult {
	sqlType: string
	optional: boolean
	nullable: boolean
	default?: unknown
	typeName: string
	constraints?: Constraints
	primaryKey?: boolean
	unique?: boolean
	autoIncrement?: boolean
	foreignKey?: { table: string; column: string }
}

export interface ColumnChange {
	column: string
	changes: {
		sqlType?: { old: string; new: string }
		nullable?: { old: boolean; new: boolean }
		default?: { old: unknown; new: unknown }
		constraints?: { old?: Constraints; new?: Constraints }
	}
}

export interface ColumnSnapshot {
	name: string
	sqlType: string
	nullable: boolean
	default?: unknown
	constraints?: Constraints
	autoIncrement?: boolean
	primaryKey?: boolean
	unique?: boolean
}

export interface ForeignKeySnapshot {
	column: string
	refTable: string
	refColumn: string
}

export interface TableSnapshot {
	name: string
	columns: Record<string, ColumnSnapshot>
	primaryKeys: string[]
	uniqueKeys: string[]
	foreignKeys: ForeignKeySnapshot[]
}

export interface Snapshot {
	version: number
	name?: string
	timestamp: string
	tables: Record<string, TableSnapshot>
}

export interface TableDiff {
	table: string
	columns: {
		added: ColumnSnapshot[]
		removed: string[]
		modified: ColumnChange[]
	}
	primaryKeys?: { old: string[]; new: string[] }
	uniqueKeys?: { added: string[]; removed: string[] }
	foreignKeys?: { added: ForeignKeySnapshot[]; removed: ForeignKeySnapshot[] }
}

export interface SchemaDiff {
	tables: {
		added: string[]
		removed: string[]
		modified: TableDiff[]
	}
}