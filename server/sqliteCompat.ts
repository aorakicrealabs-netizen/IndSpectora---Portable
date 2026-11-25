/**
 * IndSpectora — better-sqlite3 compatibility adapter powered by Node's built-in node:sqlite
 * Used exclusively by the zero-install Windows portable executable so no native .node addons are needed.
 */
import { createRequire } from 'node:module';

type SqliteParam = null | number | bigint | string | Uint8Array;

interface NativeStatement {
  get(...params: SqliteParam[]): unknown;
  all(...params: SqliteParam[]): unknown[];
  run(...params: SqliteParam[]): { lastInsertRowid: number | bigint; changes: number | bigint };
}

interface NativeDatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): NativeStatement;
  close(): void;
}

const require = createRequire(
  typeof __filename !== 'undefined' ? __filename : import.meta.url
);

function getDatabaseSyncClass(): new (path: string) => NativeDatabaseSync {
  const mod = require('node:sqlite') as {
    DatabaseSync: new (path: string) => NativeDatabaseSync;
  };
  return mod.DatabaseSync;
}

function sanitizeParams(args: unknown[]): SqliteParam[] {
  return args.map((arg) => {
    if (arg === undefined || arg === null) return null;
    if (typeof arg === 'boolean') return arg ? 1 : 0;
    if (
      typeof arg === 'number' ||
      typeof arg === 'bigint' ||
      typeof arg === 'string' ||
      arg instanceof Uint8Array
    ) {
      return arg;
    }
    return String(arg);
  });
}

function toPlainRow(row: unknown): unknown {
  if (!row || typeof row !== 'object') return row;
  return { ...(row as Record<string, unknown>) };
}

class StatementCompat {
  private readonly stmt: NativeStatement;

  constructor(stmt: NativeStatement) {
    this.stmt = stmt;
  }

  get(...args: unknown[]): unknown {
    const row = this.stmt.get(...sanitizeParams(args));
    return row === undefined ? undefined : toPlainRow(row);
  }

  all(...args: unknown[]): unknown[] {
    const rows = this.stmt.all(...sanitizeParams(args));
    return rows.map((row) => toPlainRow(row));
  }

  run(...args: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint } {
    return this.stmt.run(...sanitizeParams(args));
  }
}

export default class DatabaseCompat {
  private readonly nativeDb: NativeDatabaseSync;
  private txDepth = 0;

  constructor(dbPath: string) {
    const DatabaseSync = getDatabaseSyncClass();
    this.nativeDb = new DatabaseSync(dbPath);
  }

  pragma(source: string): unknown {
    const trimmed = source.trim();
    if (trimmed.includes('=')) {
      this.nativeDb.exec(`PRAGMA ${trimmed}`);
      return undefined;
    }
    const rows = this.nativeDb.prepare(`PRAGMA ${trimmed}`).all();
    return rows.map((r) => toPlainRow(r));
  }

  exec(sql: string): this {
    this.nativeDb.exec(sql);
    return this;
  }

  prepare(sql: string): StatementCompat {
    return new StatementCompat(this.nativeDb.prepare(sql));
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult {
    return (...args: TArgs): TResult => {
      const depth = this.txDepth;
      const savepoint = `sp_portable_${depth}`;
      if (depth === 0) {
        this.nativeDb.exec('BEGIN IMMEDIATE');
      } else {
        this.nativeDb.exec(`SAVEPOINT ${savepoint}`);
      }
      this.txDepth += 1;
      try {
        const result = fn(...args);
        if (depth === 0) {
          this.nativeDb.exec('COMMIT');
        } else {
          this.nativeDb.exec(`RELEASE SAVEPOINT ${savepoint}`);
        }
        return result;
      } catch (err) {
        try {
          if (depth === 0) {
            this.nativeDb.exec('ROLLBACK');
          } else {
            this.nativeDb.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            this.nativeDb.exec(`RELEASE SAVEPOINT ${savepoint}`);
          }
        } catch {
          // Ignore rollback secondary errors
        }
        throw err;
      } finally {
        this.txDepth -= 1;
      }
    };
  }

  close(): void {
    this.nativeDb.close();
  }
}
