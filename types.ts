import type { z } from 'zod'

/** 
 * ZodTable represents a database table defined by a Zod schema. It includes the table name and the raw shape of the Zod object, which defines the columns and their types. This structure is used internally to generate SQL statements and snapshots of the database schema.
*/
export type ZodTable = {
	name: string
	struct: z.ZodRawShape
}

/**
 * ZodCheck is a type that represents a validation check defined in a Zod schema. It includes information about the kind of check, the error code, the check expression, and any relevant values or options. This is used to extract constraints from Zod schemas when mapping them to SQL types.
 */
export interface ZodCheck {
	kind?: string
	code?: string
	check?: string
	value?: number
	version?: string
	options?: { version?: string }
}

/**
 * ZodDef is a type that represents the internal definition of a Zod schema. It includes various properties that describe the schema, such as its type, inner types, default values, checks, and other metadata. This is used to analyze Zod schemas and extract information needed for SQL mapping and migration generation.
 */
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

/**
 * SqlDialect represents the supported SQL dialects that the library can generate statements for. This is used to customize the generated SQL syntax based on the target database system (e.g., MySQL, PostgreSQL, SQLite).
 */
export type SqlDialect = 'mysql' | 'postgresql' | 'sqlite'

/**
 * SqlMapOptions defines the options that can be passed to the sqlMap function when mapping a Zod schema to SQL types. 
 * It includes settings for varchar length, SQL dialect, and a callback for warnings. 
 * These options allow for customization of the SQL generation process based on specific requirements or database constraints.
 */
export type SqlMapOptions = {
	varcharLen?: number
	dialect?: SqlDialect
	// Called instead of throwing for non-fatal warnings
	onWarn?: (message: string) => void
}

/**
 * AlterOptions extends SqlMapOptions with an additional option to allow destructive changes in generated ALTER TABLE statements. 
 * When allowDestructive is set to true, the library will generate DROP TABLE and DROP COLUMN statements as needed. 
 * By default, this is set to false to prevent accidental data loss, and such statements will be commented out instead.
 */
export type AlterOptions = SqlMapOptions & {
	allowDestructive?: boolean
}


/**
 * Constraints represents the minimum and maximum constraints that can be applied to numeric fields in the database.
 */
export interface Constraints {
	min?: number | null
	max?: number | null
}

/**
 * SqlMapResult represents the result of mapping a Zod schema to SQL types and metadata. 
 * It includes the SQL type, nullability, default value, constraints, 
 * and any special attributes like primary key or auto-increment. 
 * This structure is used to generate SQL DDL statements based on the Zod schema definitions.
 */
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

/**
 * ColumnChange represents the changes detected in a column when comparing two snapshots of the database schema. 
 * It includes the column name and the specific changes in SQL type, nullability, default value, and constraints. 
 * This is used to generate ALTER TABLE statements for modifying existing columns in the database.
 */
export interface ColumnChange {
	column: string
	changes: {
		sqlType?: { old: string; new: string }
		nullable?: { old: boolean; new: boolean }
		default?: { old: unknown; new: unknown }
		constraints?: { old?: Constraints; new?: Constraints }
	}
}

/**
 * ColumnSnapshot represents the state of a column in a database table at a specific point in time. 
 * It includes the column name, SQL type, nullability, default value, and any constraints or special attributes.
 */
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

/**
 * ForeignKeySnapshot represents the state of a foreign key in a database table at a specific point in time. 
 * It includes the column name, the referenced table, and the referenced column.
 */
export interface ForeignKeySnapshot {
	column: string
	refTable: string
	refColumn: string
}

/**
 * TableSnapshot represents the state of a table in a database at a specific point in time. 
 * It includes the table name, columns, primary keys, unique keys, and foreign keys.
 */
export interface TableSnapshot {
	name: string
	columns: Record<string, ColumnSnapshot>
	primaryKeys: string[]
	uniqueKeys: string[]
	foreignKeys: ForeignKeySnapshot[]
}


/**
 * Snapshot represents the state of the entire database at a specific point in time. 
 * It includes the version, optional name, timestamp, and the tables in the database.
 */
export interface Snapshot {
	version: number
	name?: string
	timestamp: string
	tables: Record<string, TableSnapshot>
}


/**
 * TableDiff represents the differences detected in a table when comparing two snapshots of the database schema. 
 * It includes the table name, changes in columns, primary keys, unique keys, and foreign keys.
 */
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

/**
 * SchemaDiff represents the differences detected in the entire database schema when comparing two snapshots. 
 * It includes changes in tables, such as added, removed, and modified tables.
 */
export interface SchemaDiff {
	tables: {
		added: string[]
		removed: string[]
		modified: TableDiff[]
	}
}