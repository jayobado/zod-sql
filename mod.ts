/**	
 * @module zod-sql
 *
 * A toolkit to generate SQL DDL statements directly from Zod schemas.
 * Supports multiple SQL dialects and provides utilities for schema snapshots,
 * diffing, and migration generation.
 */
export { generateSnapshot, saveSnapshot, loadSnapshot } from './snapshot.ts'
export { generateCreateTableStatements } from './create.ts'
export { generateDiff } from './diff.ts'
export { generateAlterTableStatements, runMigrations } from './alter.ts'
export { sqlMap } from './map.ts'
export {
	validateIdentifier,
	formatZodErrors,
	pk,
	unique,
	autoIncrement,
	fk,
	sqlType,
} from './helpers.ts'
export type {
	SqlDialect,
	SqlMapOptions,
	AlterOptions,
	SqlMapResult,
	Snapshot,
	SchemaDiff,
	TableDiff,
	ColumnSnapshot,
	ColumnChange,
	Constraints,
	ForeignKeySnapshot,
	TableSnapshot,
} from './types.ts'