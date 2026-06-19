import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4010),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('rp-compta'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('rp-compta'),

  SESSION_SECRET: z.string().min(16).default('dev-only-secret-change-me-please!'),
  INTERNAL_API_KEY: z.string().optional(),

  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_REDIRECT_URI: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_WHITELIST_ROLE_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variables d\'environnement invalides :', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
