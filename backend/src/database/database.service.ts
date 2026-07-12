import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Los servicios gestionados de Postgres (entre ellos Azure Database for
    // PostgreSQL) exigen TLS y rechazan la conexión sin él. En una instancia
    // local no hace falta, de modo que se decide por entorno.
    const useSsl = this.config.get('DB_SSL', 'false') === 'true';

    this.pool = new Pool({
      host: this.config.getOrThrow('DB_HOST'),
      port: this.config.get<number>('DB_PORT', 5432),
      user: this.config.getOrThrow('DB_USER'),
      password: this.config.getOrThrow('DB_PASSWORD'),
      database: this.config.getOrThrow('DB_NAME'),
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  query<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
