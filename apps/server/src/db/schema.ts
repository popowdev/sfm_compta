import { sql, relations } from 'drizzle-orm';
import {
  mysqlTable,
  mysqlEnum,
  varchar,
  boolean,
  timestamp,
  int,
  json,
  decimal,
  unique,
} from 'drizzle-orm/mysql-core';
import { APP_ROLES, COMPANY_ROLES, MODULE_KEYS } from '@rp-compta/shared';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  discordId: varchar('discord_id', { length: 32 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 255 }),
  whitelisted: boolean('whitelisted').notNull().default(false),
  lastWhitelistCheck: timestamp('last_whitelist_check'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

export const userAppRoles = mysqlTable(
  'user_app_roles',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', APP_ROLES).notNull(),
  },
  (t) => ({
    uqUserRole: unique('uq_user_role').on(t.userId, t.role),
  }),
);

export const companies = mysqlTable('companies', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  slug: varchar('slug', { length: 150 }).notNull().unique(),
  logoUrl: varchar('logo_url', { length: 255 }),
  fivemJob: varchar('fivem_job', { length: 64 }).unique(),
  externalLink: varchar('external_link', { length: 255 }),
  valuation: decimal('valuation', { precision: 14, scale: 2 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
  deletedAt: timestamp('deleted_at'),
});

export const memberships = mysqlTable(
  'memberships',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', COMPANY_ROLES).notNull().default('employe'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow(),
  },
  (t) => ({
    uqCompanyUser: unique('uq_company_user').on(t.companyId, t.userId),
  }),
);

export const companyModules = mysqlTable(
  'company_modules',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    moduleKey: mysqlEnum('module_key', MODULE_KEYS).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    config: json('config'),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow(),
  },
  (t) => ({
    uqCompanyModule: unique('uq_company_module').on(t.companyId, t.moduleKey),
  }),
);

export const shareholders = mysqlTable('shareholders', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  percentage: decimal('percentage', { precision: 5, scale: 2 }).notNull(),
  shareType: varchar('share_type', { length: 40 }).notNull().default('ordinaire'),
  anonymous: boolean('anonymous').notNull().default(false),
  publicName: varchar('public_name', { length: 120 }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

export const companyRoles = mysqlTable('company_roles', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 60 }).notNull(),
  rank: int('rank').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const rolePermissions = mysqlTable(
  'role_permissions',
  {
    id: int('id').autoincrement().primaryKey(),
    companyRoleId: int('company_role_id')
      .notNull()
      .references(() => companyRoles.id, { onDelete: 'cascade' }),
    moduleKey: mysqlEnum('module_key', MODULE_KEYS).notNull(),
    canView: boolean('can_view').notNull().default(false),
    canWrite: boolean('can_write').notNull().default(false),
  },
  (t) => ({
    uqRoleModule: unique('uq_role_module').on(t.companyRoleId, t.moduleKey),
  }),
);

export const moduleSettings = mysqlTable('module_settings', {
  moduleKey: mysqlEnum('module_key', MODULE_KEYS).primaryKey(),
  label: varchar('label', { length: 100 }),
  groupName: varchar('group_name', { length: 80 }),
  blocked: boolean('blocked').notNull().default(false),
  sortOrder: int('sort_order'),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

export const taxBrackets = mysqlTable('tax_brackets', {
  id: int('id').autoincrement().primaryKey(),
  minAmount: decimal('min_amount', { precision: 14, scale: 2 }).notNull(),
  maxAmount: decimal('max_amount', { precision: 14, scale: 2 }),
  rate: decimal('rate', { precision: 5, scale: 2 }).notNull(),
  sortOrder: int('sort_order').notNull().default(0),
});

export const fiscalConfig = mysqlTable('fiscal_config', {
  id: int('id').primaryKey(),
  dividendTaxRate: decimal('dividend_tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

export const sessions = mysqlTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: int('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const usersRelations = relations(users, ({ many }) => ({
  appRoles: many(userAppRoles),
  memberships: many(memberships),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const userAppRolesRelations = relations(userAppRoles, ({ one }) => ({
  user: one(users, { fields: [userAppRoles.userId], references: [users.id] }),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  memberships: many(memberships),
  modules: many(companyModules),
  shareholders: many(shareholders),
  roles: many(companyRoles),
}));

export const companyRolesRelations = relations(companyRoles, ({ one, many }) => ({
  company: one(companies, { fields: [companyRoles.companyId], references: [companies.id] }),
  permissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(companyRoles, {
    fields: [rolePermissions.companyRoleId],
    references: [companyRoles.id],
  }),
}));

export const shareholdersRelations = relations(shareholders, ({ one }) => ({
  company: one(companies, { fields: [shareholders.companyId], references: [companies.id] }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  company: one(companies, { fields: [memberships.companyId], references: [companies.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const companyModulesRelations = relations(companyModules, ({ one }) => ({
  company: one(companies, { fields: [companyModules.companyId], references: [companies.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type CompanyModule = typeof companyModules.$inferSelect;
export type Shareholder = typeof shareholders.$inferSelect;
export type Grade = typeof companyRoles.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type TaxBracketRow = typeof taxBrackets.$inferSelect;
export type FiscalConfigRow = typeof fiscalConfig.$inferSelect;
