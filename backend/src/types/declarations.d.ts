/* eslint-disable @typescript-eslint/no-explicit-any */
// Module declarations for packages without installed type definitions

declare module 'node-pg-migrate' {
  export interface MigrationBuilder {
    createTable(tableName: string, columns: Record<string, any>, options?: any): void;
    dropTable(tableName: string, options?: any): void;
    addColumns(tableName: string, columns: Record<string, any>): void;
    dropColumns(tableName: string, columns: string | string[]): void;
    renameColumn(tableName: string, oldName: string, newName: string): void;
    alterColumn(tableName: string, columnName: string, options: any): void;
    addConstraint(tableName: string, constraintName: string | null, expression: any): void;
    dropConstraint(tableName: string, constraintName: string, options?: any): void;
    createIndex(tableName: string, columns: string | string[], options?: any): void;
    dropIndex(tableName: string, columns: string | string[], options?: any): void;
    addExtension(extension: string): void;
    createExtension(extension: string): void;
    dropExtension(extension: string): void;
    sql(query: string, args?: any): void;
    func(expression: string): any;
    createType(typeName: string, values: string[] | Record<string, any>): void;
    dropType(typeName: string): void;
    createSchema(schemaName: string): void;
    dropSchema(schemaName: string): void;
    renameTable(tableName: string, newName: string): void;
    addType(typeName: string, values: string[]): void;
    noTransaction(): void;
    createTrigger(tableName: string, triggerName: string, options: any): void;
    dropTrigger(tableName: string, triggerName: string, options?: any): void;
    addIndex(tableName: string, columns: string | string[], options?: any): void;
  }

  export type ColumnDefinitions = Record<string, any>;

  export interface RunnerOption {
    databaseUrl?: string | Record<string, any>;
    dir?: string;
    direction?: 'up' | 'down';
    count?: number;
    migrationsTable?: string;
    checkOrder?: boolean;
    verbose?: boolean;
    schema?: string;
    createSchema?: boolean;
    createMigrationsSchema?: boolean;
    noLock?: boolean;
    fake?: boolean;
    decamelize?: boolean;
    [key: string]: any;
  }

  export function runner(options: RunnerOption): Promise<any[]>;
}

declare module 'ioredis' {
  class Redis {
    constructor(url?: string);
    constructor(port?: number, host?: string, options?: any);
    constructor(options?: any);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: any[]): Promise<string>;
    setex(key: string, seconds: number, value: string): Promise<string>;
    del(...keys: string[]): Promise<number>;
    exists(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    hget(key: string, field: string): Promise<string | null>;
    hset(key: string, field: string, value: string): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
    lpush(key: string, ...values: string[]): Promise<number>;
    rpush(key: string, ...values: string[]): Promise<number>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(...channels: string[]): Promise<number>;
    on(event: string, callback: (...args: any[]) => void): this;
    disconnect(): void;
    quit(): Promise<string>;
    pipeline(): any;
    multi(): any;
    exec(): Promise<any>;
    duplicate(): Redis;
    info(section?: string): Promise<string>;
    flushdb(): Promise<string>;
    status: string;
  }
  export default Redis;
  export { Redis };
}

declare module 'node-cron' {
  interface ScheduledTask {
    start(): void;
    stop(): void;
    destroy(): void;
  }
  export function schedule(expression: string, func: () => void, options?: any): ScheduledTask;
  export function validate(expression: string): boolean;
}

declare module 'json2csv' {
  export class Parser<T = any> {
    constructor(opts?: any);
    parse(data: T[]): string;
  }
  export function parse<T = any>(data: T[], opts?: any): string;
}

declare module 'puppeteer' {
  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }
  export interface Page {
    setContent(html: string, options?: any): Promise<void>;
    pdf(options?: any): Promise<Buffer>;
    waitForTimeout(milliseconds: number): Promise<void>;
    close(): Promise<void>;
  }
  export interface LaunchOptions {
    headless?: boolean | 'new';
    args?: string[];
  }
  function launch(options?: LaunchOptions): Promise<Browser>;
  export default { launch };
}

declare module 'chart.js' {
  export interface ChartConfiguration {
    type: string;
    data: any;
    options?: any;
  }
}
