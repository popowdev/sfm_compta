import { sql, relations } from 'drizzle-orm';
import {
  mysqlTable,
  mysqlEnum,
  varchar,
  boolean,
  timestamp,
  datetime,
  date,
  int,
  json,
  decimal,
  text,
  unique,
} from 'drizzle-orm/mysql-core';
import { APP_ROLES, MODULE_KEYS } from '@rp-compta/shared';

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
    companyRoleId: int('company_role_id').references(() => companyRoles.id, {
      onDelete: 'set null',
    }),
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
  canManage: boolean('can_manage').notNull().default(false),
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
    canCreate: boolean('can_create').notNull().default(false),
    canEdit: boolean('can_edit').notNull().default(false),
    canDelete: boolean('can_delete').notNull().default(false),
  },
  (t) => ({
    uqRoleModule: unique('uq_role_module').on(t.companyRoleId, t.moduleKey),
  }),
);

export const roleSpecialPermissions = mysqlTable(
  'role_special_permissions',
  {
    id: int('id').autoincrement().primaryKey(),
    companyRoleId: int('company_role_id')
      .notNull()
      .references(() => companyRoles.id, { onDelete: 'cascade' }),
    moduleKey: mysqlEnum('module_key', MODULE_KEYS).notNull(),
    actionKey: varchar('action_key', { length: 48 }).notNull(),
    granted: boolean('granted').notNull().default(false),
  },
  (t) => ({
    uqRoleSpecial: unique('uq_role_special').on(t.companyRoleId, t.moduleKey, t.actionKey),
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

export const declarations = mysqlTable('declarations', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  weekLabel: varchar('week_label', { length: 60 }).notNull(),
  declarantName: varchar('declarant_name', { length: 120 }).notNull(),
  caNet: decimal('ca_net', { precision: 14, scale: 2 }).notNull(),
  charges: decimal('charges', { precision: 14, scale: 2 }).notNull(),
  benefit: decimal('benefit', { precision: 14, scale: 2 }).notNull(),
  corporateTax: decimal('corporate_tax', { precision: 14, scale: 2 }).notNull(),
  dividends: decimal('dividends', { precision: 14, scale: 2 }).notNull(),
  dividendTax: decimal('dividend_tax', { precision: 14, scale: 2 }).notNull(),
  totalTax: decimal('total_tax', { precision: 14, scale: 2 }).notNull(),
  status: mysqlEnum('status', ['submitted', 'paid', 'cancelled']).notNull().default('submitted'),
  declaredByUserId: int('declared_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  email: varchar('email', { length: 150 }),
  notes: text('notes'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  paidAt: timestamp('paid_at'),
});

export const companyExpenses = mysqlTable('company_expenses', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 200 }).notNull(),
  category: mysqlEnum('category', ['salary', 'vehicle', 'meal', 'supply', 'rent', 'other'])
    .notNull()
    .default('other'),
  amount: decimal('amount', { precision: 14, scale: 2 }).notNull(),
  taxDeductible: boolean('tax_deductible').notNull().default(false),
  expenseDate: date('expense_date', { mode: 'string' }).notNull(),
  notes: text('notes'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const subventions = mysqlTable('subventions', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  motif: varchar('motif', { length: 200 }).notNull(),
  requesterName: varchar('requester_name', { length: 120 }).notNull(),
  amountRequested: decimal('amount_requested', { precision: 14, scale: 2 }).notNull(),
  amountGranted: decimal('amount_granted', { precision: 14, scale: 2 }),
  status: mysqlEnum('status', ['pending', 'approved', 'rejected', 'paid'])
    .notNull()
    .default('pending'),
  requestedByUserId: int('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  decidedAt: timestamp('decided_at'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyEmployees = mysqlTable('company_employees', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  dateOfBirth: date('date_of_birth', { mode: 'string' }),
  hireDate: date('hire_date', { mode: 'string' }),
  position: mysqlEnum('position', ['pdg', 'patron', 'co_patron', 'gerant', 'employe', 'apprenti'])
    .notNull()
    .default('employe'),
  contractType: mysqlEnum('contract_type', ['cdi', 'cdd', 'interim']).notNull().default('cdi'),
  contractSigned: boolean('contract_signed').notNull().default(false),
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull().default('0'),
  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  warnings: int('warnings').notNull().default(0),
  terminationReason: varchar('termination_reason', { length: 255 }),
  active: boolean('active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
},
  (t) => ({ uq: unique('uq_company_employee_user').on(t.companyId, t.userId) }),
);

export const timeEntries = mysqlTable('time_entries', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  employeeId: int('employee_id')
    .notNull()
    .references(() => companyEmployees.id, { onDelete: 'cascade' }),
  clockIn: datetime('clock_in', { mode: 'string' }).notNull(),
  clockOut: datetime('clock_out', { mode: 'string' }),
  pauseStart: datetime('pause_start', { mode: 'string' }),
  pauseMinutes: int('pause_minutes').notNull().default(0),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const salaryGrid = mysqlTable(
  'salary_grid',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    position: mysqlEnum('position', ['pdg', 'patron', 'co_patron', 'gerant', 'employe', 'apprenti']).notNull(),
    hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull().default('0'),
    baseSalary: decimal('base_salary', { precision: 12, scale: 2 }).notNull().default('0'),
  },
  (t) => ({ uq: unique('uq_salary_grid').on(t.companyId, t.position) }),
);

export const messages = mysqlTable('messages', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  fromIrs: boolean('from_irs').notNull().default(false),
  senderUserId: int('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
  senderName: varchar('sender_name', { length: 120 }).notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyRentals = mysqlTable('company_rentals', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  clientName: varchar('client_name', { length: 150 }).notNull(),
  clientPhone: varchar('client_phone', { length: 50 }),
  label: varchar('label', { length: 150 }).notNull(),
  eventDate: date('event_date', { mode: 'string' }).notNull(),
  eventTime: varchar('event_time', { length: 20 }),
  durationHours: int('duration_hours'),
  rentalPrice: decimal('rental_price', { precision: 12, scale: 2 }).notNull().default('0'),
  deposit: decimal('deposit', { precision: 12, scale: 2 }).notNull().default('0'),
  depositStatus: mysqlEnum('deposit_status', ['paid', 'returned', 'kept']).notNull().default('paid'),
  status: mysqlEnum('status', ['reserved', 'active', 'completed', 'cancelled'])
    .notNull()
    .default('reserved'),
  notes: text('notes'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyClients = mysqlTable('company_clients', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 150 }),
  notes: text('notes'),
  loyaltyTier: mysqlEnum('loyalty_tier', ['bronze', 'silver', 'gold', 'platinum'])
    .notNull()
    .default('bronze'),
  loyaltyPoints: int('loyalty_points').notNull().default(0),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }).notNull().default('0'),
  accountBalance: decimal('account_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  creditLimit: decimal('credit_limit', { precision: 12, scale: 2 }).notNull().default('0'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const clientLoyaltyTiers = mysqlTable(
  'client_loyalty_tiers',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    tier: mysqlEnum('tier', ['bronze', 'silver', 'gold', 'platinum']).notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    threshold: int('threshold').notNull().default(0),
  },
  (t) => ({ uq: unique('uq_loyalty_tier').on(t.companyId, t.tier) }),
);

export const stockItems = mysqlTable('stock_items', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  category: varchar('category', { length: 80 }),
  unit: mysqlEnum('unit', ['piece', 'kg', 'g', 'liter', 'cl', 'box', 'pack', 'other'])
    .notNull()
    .default('piece'),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  unitCost: decimal('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  lowStockThreshold: decimal('low_stock_threshold', { precision: 12, scale: 3 })
    .notNull()
    .default('0'),
  notes: text('notes'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const stockMovements = mysqlTable('stock_movements', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  stockItemId: int('stock_item_id')
    .notNull()
    .references(() => stockItems.id, { onDelete: 'cascade' }),
  type: mysqlEnum('type', ['in', 'out', 'adjust']).notNull(),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitCost: decimal('unit_cost', { precision: 12, scale: 2 }),
  supplier: varchar('supplier', { length: 150 }),
  reason: varchar('reason', { length: 200 }),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
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
  expenses: many(companyExpenses),
  subventions: many(subventions),
  messages: many(messages),
  employees: many(companyEmployees),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  company: one(companies, { fields: [messages.companyId], references: [companies.id] }),
}));

export const companyEmployeesRelations = relations(companyEmployees, ({ one, many }) => ({
  company: one(companies, { fields: [companyEmployees.companyId], references: [companies.id] }),
  timeEntries: many(timeEntries),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  company: one(companies, { fields: [timeEntries.companyId], references: [companies.id] }),
  employee: one(companyEmployees, {
    fields: [timeEntries.employeeId],
    references: [companyEmployees.id],
  }),
}));

export const companyExpensesRelations = relations(companyExpenses, ({ one }) => ({
  company: one(companies, { fields: [companyExpenses.companyId], references: [companies.id] }),
}));

export const subventionsRelations = relations(subventions, ({ one }) => ({
  company: one(companies, { fields: [subventions.companyId], references: [companies.id] }),
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
  grade: one(companyRoles, {
    fields: [memberships.companyRoleId],
    references: [companyRoles.id],
  }),
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
export type Declaration = typeof declarations.$inferSelect;
export type CompanyExpense = typeof companyExpenses.$inferSelect;
export type Subvention = typeof subventions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CompanyEmployee = typeof companyEmployees.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type SalaryGridRow = typeof salaryGrid.$inferSelect;
export type CompanyRental = typeof companyRentals.$inferSelect;
export type CompanyClient = typeof companyClients.$inferSelect;
export type ClientLoyaltyTier = typeof clientLoyaltyTiers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type TaxBracketRow = typeof taxBrackets.$inferSelect;
export type FiscalConfigRow = typeof fiscalConfig.$inferSelect;
