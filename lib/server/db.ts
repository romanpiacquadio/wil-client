import { Pool } from 'pg';

let pool: Pool | undefined;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not defined`);
  }
  return value;
}

export function getDbPool(): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: readEnv('AWS_DATABASE_HOST'),
    port: Number.parseInt(readEnv('AWS_DATABASE_PORT'), 10),
    database: readEnv('AWS_DATABASE_NAME'),
    user: readEnv('AWS_DATABASE_USER'),
    password: readEnv('AWS_DATABASE_PASSWORD'),
  });

  return pool;
}
