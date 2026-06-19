import { sql } from 'drizzle-orm';
import { mysqlTable, varchar, boolean, timestamp, int } from 'drizzle-orm/mysql-core';

export const companies = mysqlTable('companies', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  slug: varchar('slug', { length: 150 }).notNull().unique(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  discordId: varchar('discord_id', { length: 32 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 255 }),
  whitelisted: boolean('whitelisted').notNull().default(false),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Company = typeof companies.$inferSelect;
export type User = typeof users.$inferSelect;
