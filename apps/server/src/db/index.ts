import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../env';
import * as schema from './schema';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  enableKeepAlive: true,
});

// Pin the session timezone to UTC so DATE()-based period bucketing (exercices,
// sales) is deterministic regardless of the host/MySQL default timezone.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

export const db = drizzle(pool, { schema, mode: 'default' });

export async function pingDb(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

export { schema };
