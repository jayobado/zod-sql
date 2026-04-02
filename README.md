# zod-sql

Generate SQL DDL statements directly from Zod schemas. Supports schema snapshots, diffing, and migration generation across MySQL, PostgreSQL, and SQLite — with no ORM and no migration files.

## What it provides

- **`generateCreateTableStatements`** — generates `CREATE TABLE` SQL from a Zod schema
- **`generateSnapshot`** — captures a point-in-time snapshot of your schema
- **`generateDiff`** — compares two snapshots and produces a diff
- **`generateAlterTableStatements`** — generates `ALTER TABLE` SQL from a diff
- **`runMigrations`** — executes generated statements via a pluggable executor
- **`saveSnapshot` / `loadSnapshot`** — persist snapshots to disk
- **`sqlMap`** — inspect the SQL type mapping for any Zod field
- **Typed helpers** — `pk()`, `fk()`, `unique()`, `autoIncrement()`, `sqlType()` for safe schema annotation

## Requirements

- Deno 1.40+ or Node 18+
- [Zod v4](https://zod.dev)

## Compatibility

| Environment | Supported | Notes |
|---|---|---|
| Deno | ✓ | Native — recommended |
| Node 18+ | ✓ | Via npm |
| Bun | ✓ | Via npm |
| Browser | ✗ | Server-side only — uses `Deno.readTextFile` for snapshot persistence |

> `saveSnapshot` and `loadSnapshot` use `Deno.readTextFile` / `Deno.writeTextFile`. In Node or Bun use `fs.readFile` / `fs.writeFile` and manage snapshots yourself — the rest of the library is runtime-agnostic.

## Installation

### Deno (JSR)
```sh
deno add jsr:@jayobado/zod-sql
```

Or in `deno.json`:
```json
{
  "imports": {
    "@zod-sql": "jsr:@jayobado/zod-sql@^0.1.0"
  }
}
```

### Node / Bun
```sh
npm install @jayobado/zod-sql
# or
bun add @jayobado/zod-sql
```

---

## Quick start
```typescript
import { z }                             from 'zod'
import {
  pk, fk, unique, autoIncrement,
  generateCreateTableStatements,
  generateSnapshot,
  generateDiff,
  generateAlterTableStatements,
  runMigrations,
  saveSnapshot,
  loadSnapshot,
} from '@zod-sql'

// Define your schemas
const users = z.object({
  id:         pk(z.number().int()).describe('autoIncrement'),
  email:      unique(z.string().email()),
  name:       z.string().max(100),
  role:       z.enum(['admin', 'user', 'viewer']).default('user'),
  createdAt:  z.date(),
})

const posts = z.object({
  id:        pk(z.number().int()).describe('autoIncrement'),
  userId:    fk(z.number().int(), 'users', 'id'),
  title:     z.string().max(255),
  body:      z.string(),
  published: z.boolean().default(false),
})

const schemas = { users, posts }

// Generate CREATE TABLE
const sql = generateCreateTableStatements('users', users, { dialect: 'postgresql' })
console.log(sql)

// Generate a snapshot
const snapshot = generateSnapshot(schemas, { dialect: 'postgresql', name: 'my-app' })

// Save snapshot to disk
await saveSnapshot(snapshot, './schema.snapshot.json')
```

---

## Annotating schemas

Use the typed helper functions instead of raw `.describe()` strings. The helpers prevent silent typos and make intent explicit.
```typescript
import { pk, fk, unique, autoIncrement, sqlType } from '@zod-sql'
import { z } from 'zod'

const users = z.object({
  // Primary key
  id:    pk(z.number().int()),

  // Primary key + auto increment
  id:    autoIncrement(pk(z.number().int())),

  // Unique constraint
  email: unique(z.string().email()),

  // Foreign key → posts.author_id references users.id
  userId: fk(z.number().int(), 'users', 'id'),

  // Explicit SQL type override
  data:  sqlType(z.string(), 'JSONB'),
})
```

You can also use raw `.describe()` strings if you prefer:
```typescript
const users = z.object({
  id:    z.number().int().describe('pk, autoIncrement'),
  email: z.string().email().describe('unique'),
  userId: z.number().int().describe('fk:users.id'),
  data:  z.string().describe('sql:JSONB'),
})
```

### Supported tokens

| Helper | `.describe()` equivalent | Effect |
|---|---|---|
| `pk(schema)` | `"pk"` | PRIMARY KEY |
| `autoIncrement(schema)` | `"autoIncrement"` | AUTO_INCREMENT / SERIAL / INTEGER |
| `unique(schema)` | `"unique"` | UNIQUE constraint |
| `fk(schema, table, col)` | `"fk:table.column"` | FOREIGN KEY reference |
| `sqlType(schema, type)` | `"sql:TYPE"` | Override SQL type directly |

---

## Type mapping

Go types are automatically mapped to SQL types per dialect:

| Zod type | MySQL | PostgreSQL | SQLite |
|---|---|---|---|
| `z.string()` | `TEXT` | `TEXT` | `TEXT` |
| `z.string().max(n)` | `VARCHAR(n)` | `VARCHAR(n)` | `VARCHAR(n)` |
| `z.string().email()` | `VARCHAR(254)` | `VARCHAR(254)` | `VARCHAR(254)` |
| `z.string().url()` | `TEXT` | `TEXT` | `TEXT` |
| `z.string().uuid()` | `CHAR(36)` | `UUID` | `CHAR(36)` |
| `z.string().datetime()` | `DATETIME` | `TIMESTAMP` | `TEXT` |
| `z.number()` | `DOUBLE` | `DOUBLE` | `DOUBLE` |
| `z.number().int()` | `INT` | `INT` | `INT` |
| `z.boolean()` | `TINYINT(1)` | `BOOLEAN` | `INTEGER` |
| `z.date()` | `DATETIME` | `TIMESTAMP` | `TEXT` |
| `z.enum([...])` | `ENUM(...)` | `TEXT` | `TEXT` |
| `z.nativeEnum(E)` | `ENUM(...)` | `ENUM(...)` | `ENUM(...)` |
| `z.object({})` | `JSON` | `JSON` | `JSON` |
| `z.array(...)` | `JSON` | `JSON` | `JSON` |
| `z.instanceof(File)` | `BLOB` | `BLOB` | `BLOB` |

Override any type explicitly using `sqlType()` or `.describe('sql:TYPE')`.

---

## `generateCreateTableStatements`
```typescript
import { generateCreateTableStatements } from '@zod-sql'
import { z } from 'zod'

const sql = generateCreateTableStatements('users', schema, {
  dialect:    'postgresql',  // 'mysql' | 'postgresql' | 'sqlite' — default 'mysql'
  varcharLen: 255,           // default VARCHAR length — default 255
  onWarn:     console.warn,  // optional warning handler
})
```

Example output (PostgreSQL):
```sql
CREATE TABLE "users" (
  "id" SERIAL NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
  "created_at" TIMESTAMP NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("email")
);
```

---

## Snapshots

A snapshot captures the full structure of your schemas at a point in time. Save it alongside your code and commit it — it becomes the baseline for future migrations.
```typescript
import {
  generateSnapshot,
  saveSnapshot,
  loadSnapshot,
} from '@zod-sql'

// Generate
const snapshot = generateSnapshot(schemas, {
  dialect: 'postgresql',
  name:    'my-app',       // optional — helps identify the snapshot
})

// Save to disk
await saveSnapshot(snapshot, './schema.snapshot.json')

// Load from disk
const previous = await loadSnapshot('./schema.snapshot.json')
```

### Snapshot format
```json
{
  "version": 1,
  "name": "my-app",
  "timestamp": "2026-01-17T12:00:00.000Z",
  "tables": {
    "users": {
      "name": "users",
      "columns": {
        "id": { "name": "id", "sqlType": "INT", "nullable": false, "primaryKey": true, "autoIncrement": true }
      },
      "primaryKeys": ["id"],
      "uniqueKeys":  ["email"],
      "foreignKeys": []
    }
  }
}
```

---

## Diffing and migrations

The migration workflow:
```
load old snapshot → diff against new schemas → generate ALTER statements → execute
```
```typescript
import {
  loadSnapshot,
  generateDiff,
  generateAlterTableStatements,
  saveSnapshot,
  runMigrations,
} from '@zod-sql'

// 1. Load the previous snapshot
const oldSnapshot = await loadSnapshot('./schema.snapshot.json')

// 2. Diff against your current schemas
const { tables, newSnapshot } = generateDiff(oldSnapshot, schemas, {
  dialect: 'postgresql',
})

// 3. Generate ALTER TABLE statements
const statements = generateAlterTableStatements(
  { tables, newSnapshot },
  schemas,
  {
    dialect:          'postgresql',
    allowDestructive: false,  // DROP TABLE and DROP COLUMN are commented out by default
  }
)

console.log(statements.join('\n'))

// 4. Execute against your database
await runMigrations(statements, async (sql) => {
  await db.execute(sql)
})

// 5. Save the new snapshot
await saveSnapshot(newSnapshot, './schema.snapshot.json')
```

### Destructive operations

By default `DROP TABLE` and `DROP COLUMN` are emitted as comments so you never accidentally destroy data:
```sql
-- SKIPPED: DROP TABLE `old_table`; (set allowDestructive: true to enable)
-- SKIPPED: ALTER TABLE `users` DROP COLUMN `legacy_field`; (set allowDestructive: true to enable)
```

Set `allowDestructive: true` to emit the real statements:
```typescript
generateAlterTableStatements(diff, schemas, {
  allowDestructive: true,
})
```

### Primary key changes

Primary key changes cannot be auto-migrated. They are emitted as comments with guidance:
```sql
-- WARNING: Primary key change on "users" requires manual migration
-- Old: (id)  →  New: (id, tenant_id)
```

---

## `runMigrations`

Database-agnostic migration runner. Pass your own `execute` function — works with any database client.
```typescript
import { runMigrations } from '@zod-sql'

// With a generic execute callback
await runMigrations(statements, async (sql) => {
  await db.execute(sql)
})

// Comment lines (--) and empty lines are skipped automatically
// Statements are executed in order
```

### Example with pg (Node)
```typescript
import { Pool }           from 'pg'
import { runMigrations }  from '@zod-sql'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

await runMigrations(statements, async (sql) => {
  await pool.query(sql)
})
```

### Example with go-pgx style pool (Deno)
```typescript
await runMigrations(statements, async (sql) => {
  await pool.query(sql)
})
```

---

## `sqlMap`

Inspect the SQL mapping for any Zod field directly:
```typescript
import { sqlMap } from '@zod-sql'
import { z }      from 'zod'

sqlMap(z.string().max(100))
// { sqlType: 'VARCHAR(100)', optional: false, nullable: false, typeName: 'string', ... }

sqlMap(z.string().email(), { dialect: 'postgresql' })
// { sqlType: 'VARCHAR(254)', ... }

sqlMap(z.number().int().describe('pk, autoIncrement'))
// { sqlType: 'INT', primaryKey: true, autoIncrement: true, ... }
```

---

## `formatZodErrors`

Format Zod validation errors into a flat key → message map for use in forms or API responses:
```typescript
import { formatZodErrors } from '@zod-sql'
import { z }               from 'zod'

const result = z.object({
  email: z.string().email(),
  age:   z.number().min(18),
}).safeParse({ email: 'invalid', age: 10 })

if (!result.success) {
  console.log(formatZodErrors(result.error))
  // { email: 'Invalid email', age: 'Number must be greater than or equal to 18' }
}
```

---

## Options

### `SqlMapOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `dialect` | `'mysql' \| 'postgresql' \| 'sqlite'` | `'mysql'` | Target SQL dialect |
| `varcharLen` | `number` | `255` | Default VARCHAR length for unconstrained strings |
| `onWarn` | `(msg: string) => void` | `undefined` | Warning handler — called instead of writing to stdout |

### `AlterOptions`

Extends `SqlMapOptions` with:

| Field | Type | Default | Description |
|---|---|---|---|
| `allowDestructive` | `boolean` | `false` | Emit `DROP TABLE` and `DROP COLUMN` statements. Destructive statements are commented out by default |

---

## Project structure
```
zod-sql/
├── mod.ts        # barrel export
├── types.ts      # all shared types and interfaces
├── helpers.ts    # validateIdentifier, formatZodErrors, pk, fk, unique, autoIncrement, sqlType
├── map.ts        # sqlMap — Zod → SQL type mapping
├── snapshot.ts   # generateSnapshot, saveSnapshot, loadSnapshot
├── diff.ts       # generateDiff
├── create.ts     # generateCreateTableStatements
└── alter.ts      # generateAlterTableStatements, runMigrations
```

## License

MIT