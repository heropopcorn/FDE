declare module "node:sqlite" {
  export type SqlValue = string | number | bigint | null | Uint8Array;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export interface StatementSync {
    get(...params: SqlValue[]): unknown;
    all(...params: SqlValue[]): unknown[];
    run(...params: SqlValue[]): StatementResultingChanges;
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
