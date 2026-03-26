import { z } from 'zod'
import { generateSnapshot } from './snapshot.ts'
import type {
	SqlMapOptions,
	ColumnChange,
	ColumnSnapshot,
	TableDiff,
	TableSnapshot,
	Snapshot,
	SchemaDiff,
} from './types.ts'

function diffColumn(
	oldCol: ColumnSnapshot,
	newCol: ColumnSnapshot
): ColumnChange['changes'] | null {
	const changes: ColumnChange['changes'] = {}

	if (oldCol.sqlType !== newCol.sqlType) {
		changes.sqlType = { old: oldCol.sqlType, new: newCol.sqlType }
	}
	if (oldCol.nullable !== newCol.nullable) {
		changes.nullable = { old: oldCol.nullable, new: newCol.nullable }
	}
	if (JSON.stringify(oldCol.default) !== JSON.stringify(newCol.default)) {
		changes.default = { old: oldCol.default, new: newCol.default }
	}
	if (
		JSON.stringify(oldCol.constraints) !==
		JSON.stringify(newCol.constraints)
	) {
		changes.constraints = {
			old: oldCol.constraints,
			new: newCol.constraints,
		}
	}

	return Object.keys(changes).length > 0 ? changes : null
}

function diffTable(
	oldTable: TableSnapshot,
	newTable: TableSnapshot
): TableDiff | null {
	const oldCols = new Set(Object.keys(oldTable.columns))
	const newCols = new Set(Object.keys(newTable.columns))

	const addedCols: ColumnSnapshot[] = []
	const removedCols: string[] = []
	const modifiedCols: ColumnChange[] = []

	for (const col of newCols) {
		if (!oldCols.has(col)) addedCols.push(newTable.columns[col])
	}
	for (const col of oldCols) {
		if (!newCols.has(col)) removedCols.push(col)
	}
	for (const col of newCols) {
		if (!oldCols.has(col)) continue
		const changes = diffColumn(oldTable.columns[col], newTable.columns[col])
		if (changes) modifiedCols.push({ column: col, changes })
	}

	const pkChanged = JSON.stringify(oldTable.primaryKeys) !==
		JSON.stringify(newTable.primaryKeys)
	const ukAdded = newTable.uniqueKeys.filter(
		k => !oldTable.uniqueKeys.includes(k)
	)
	const ukRemoved = oldTable.uniqueKeys.filter(
		k => !newTable.uniqueKeys.includes(k)
	)
	const fkChanged = JSON.stringify(oldTable.foreignKeys) !==
		JSON.stringify(newTable.foreignKeys)

	if (
		addedCols.length === 0 &&
		removedCols.length === 0 &&
		modifiedCols.length === 0 &&
		!pkChanged &&
		ukAdded.length === 0 &&
		ukRemoved.length === 0 &&
		!fkChanged
	) return null

	const diff: TableDiff = {
		table: newTable.name,
		columns: {
			added: addedCols,
			removed: removedCols,
			modified: modifiedCols,
		},
	}

	if (pkChanged) {
		diff.primaryKeys = {
			old: oldTable.primaryKeys,
			new: newTable.primaryKeys,
		}
	}
	if (ukAdded.length > 0 || ukRemoved.length > 0) {
		diff.uniqueKeys = { added: ukAdded, removed: ukRemoved }
	}
	if (fkChanged) {
		const fkAdded = newTable.foreignKeys.filter(
			nfk => !oldTable.foreignKeys.some(
				ofk =>
					ofk.column === nfk.column &&
					ofk.refTable === nfk.refTable &&
					ofk.refColumn === nfk.refColumn
			)
		)
		const fkRemoved = oldTable.foreignKeys.filter(
			ofk => !newTable.foreignKeys.some(
				nfk =>
					ofk.column === nfk.column &&
					ofk.refTable === nfk.refTable &&
					ofk.refColumn === nfk.refColumn
			)
		)
		diff.foreignKeys = { added: fkAdded, removed: fkRemoved }
	}

	return diff
}

export function generateDiff(
	oldSnapshot: Snapshot,
	newSchemas: Record<string, z.ZodObject<z.ZodRawShape>>,
	options?: SqlMapOptions
): SchemaDiff & { newSnapshot: Snapshot } {
	const newSnapshot = generateSnapshot(newSchemas, options)
	const oldTables = new Set(Object.keys(oldSnapshot.tables))
	const newTables = new Set(Object.keys(newSnapshot.tables))

	const added: string[] = []
	const removed: string[] = []
	const modified: TableDiff[] = []

	for (const table of newTables) {
		if (!oldTables.has(table)) added.push(table)
	}
	for (const table of oldTables) {
		if (!newTables.has(table)) removed.push(table)
	}
	for (const table of newTables) {
		if (!oldTables.has(table)) continue
		const tableDiff = diffTable(
			oldSnapshot.tables[table],
			newSnapshot.tables[table]
		)
		if (tableDiff) modified.push(tableDiff)
	}

	return { tables: { added, removed, modified }, newSnapshot }
}