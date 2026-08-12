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
  index,
} from 'drizzle-orm/mysql-core';
import { APP_ROLES, MODULE_KEYS } from '@rp-compta/shared';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  discordId: varchar('discord_id', { length: 32 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 255 }),
  whitelisted: boolean('whitelisted').notNull().default(false),
  staffMode: boolean('staff_mode').notNull().default(true),
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
  managedByFivem: boolean('managed_by_fivem').notNull().default(false),
  externalLink: varchar('external_link', { length: 255 }),
  valuation: decimal('valuation', { precision: 14, scale: 2 }).notNull().default('0'),
  immoSeeded: boolean('immo_seeded').notNull().default(false),
  concessionSeeded: boolean('concession_seeded').notNull().default(false),
  menuLayout: json('menu_layout'),
  showroomToken: varchar('showroom_token', { length: 32 }).unique(),
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
  nickname: varchar('nickname', { length: 60 }),
  rank: int('rank').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  canManage: boolean('can_manage').notNull().default(false),
  fivemGrade: int('fivem_grade'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const fivemPlayers = mysqlTable('fivem_players', {
  id: int('id').autoincrement().primaryKey(),
  discordId: varchar('discord_id', { length: 32 }).notNull().unique(),
  identifier: varchar('identifier', { length: 80 }),
  name: varchar('name', { length: 120 }).notNull().default(''),
  job: varchar('job', { length: 64 }).notNull().default(''),
  jobGrade: int('job_grade').notNull().default(0),
  selectedChar: varchar('selected_char', { length: 120 }),
  jobLabel: varchar('job_label', { length: 120 }),
  gradeLabel: varchar('grade_label', { length: 120 }),
  online: boolean('online').notNull().default(false),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

export const fivemCharacters = mysqlTable(
  'fivem_characters',
  {
    id: int('id').autoincrement().primaryKey(),
    discordId: varchar('discord_id', { length: 32 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    jobId: varchar('job_id', { length: 64 }).notNull().default(''),
    jobLabel: varchar('job_label', { length: 120 }),
    grade: int('grade').notNull().default(0),
    gradeLabel: varchar('grade_label', { length: 120 }),
    unemployed: boolean('unemployed').notNull().default(false),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow(),
  },
  (t) => ({ uq: unique('uq_fivem_char').on(t.discordId, t.name) }),
);

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
  archivedAt: timestamp('archived_at'),
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
  type: mysqlEnum('type', ['evenement', 'contrat', 'badgeuse', 'autre']).notNull().default('evenement'),
  requesterName: varchar('requester_name', { length: 120 }).notNull(),
  rib: varchar('rib', { length: 64 }),
  amountRequested: decimal('amount_requested', { precision: 14, scale: 2 }).notNull(),
  amountGranted: decimal('amount_granted', { precision: 14, scale: 2 }),
  status: mysqlEnum('status', ['pending', 'approved', 'rejected', 'paid'])
    .notNull()
    .default('pending'),
  photoUrl: varchar('photo_url', { length: 255 }),
  requestedByUserId: int('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  decidedAt: timestamp('decided_at'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const subventionDocuments = mysqlTable('subvention_documents', {
  id: int('id').autoincrement().primaryKey(),
  subventionId: int('subvention_id')
    .notNull()
    .references(() => subventions.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 255 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyDocuments = mysqlTable('company_documents', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  url: varchar('url', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  folder: varchar('folder', { length: 60 }),
  size: int('size').notNull().default(0),
  uploadedByUserId: int('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyDocFolders = mysqlTable(
  'company_doc_folders',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ uq: unique('uq_doc_folder').on(t.companyId, t.name) }),
);

export const irsDocuments = mysqlTable('irs_documents', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  url: varchar('url', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  folder: varchar('folder', { length: 60 }),
  size: int('size').notNull().default(0),
  uploadedByUserId: int('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const associations = mysqlTable('associations', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 140 }).notNull().unique(),
  objet: varchar('objet', { length: 250 }),
  logoUrl: varchar('logo_url', { length: 255 }),
  status: mysqlEnum('status', ['active', 'dissolved']).notNull().default('active'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const associationMembers = mysqlTable(
  'association_members',
  {
    id: int('id').autoincrement().primaryKey(),
    associationId: int('association_id')
      .notNull()
      .references(() => associations.id, { onDelete: 'cascade' }),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', ['president', 'tresorier', 'secretaire', 'membre']).notNull().default('membre'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ uqAssociationMember: unique('uq_association_member').on(t.associationId, t.userId) }),
);

export const associationTransactions = mysqlTable('association_transactions', {
  id: int('id').autoincrement().primaryKey(),
  associationId: int('association_id')
    .notNull()
    .references(() => associations.id, { onDelete: 'cascade' }),
  type: mysqlEnum('type', ['cotisation', 'don', 'subvention', 'depense', 'autre']),
  direction: mysqlEnum('direction', ['in', 'out']).notNull().default('in'),
  partyType: mysqlEnum('party_type', ['entreprise', 'particulier']),
  fromName: varchar('from_name', { length: 140 }),
  toName: varchar('to_name', { length: 140 }),
  label: varchar('label', { length: 200 }).notNull(),
  amount: decimal('amount', { precision: 14, scale: 2 }).notNull(),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const associationDocuments = mysqlTable('association_documents', {
  id: int('id').autoincrement().primaryKey(),
  associationId: int('association_id')
    .notNull()
    .references(() => associations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  url: varchar('url', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  folder: varchar('folder', { length: 60 }),
  size: int('size').notNull().default(0),
  uploadedByUserId: int('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const notifications = mysqlTable(
  'notifications',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    body: varchar('body', { length: 300 }),
    link: varchar('link', { length: 200 }),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ idxUser: index('idx_notif_user').on(t.userId) }),
);

export const auditLog = mysqlTable(
  'audit_log',
  {
    id: int('id').autoincrement().primaryKey(),
    actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 120 }).notNull(),
    action: varchar('action', { length: 60 }).notNull(),
    targetType: varchar('target_type', { length: 40 }).notNull(),
    targetLabel: varchar('target_label', { length: 200 }),
    detail: varchar('detail', { length: 300 }),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ idxCreated: index('idx_audit_created').on(t.createdAt) }),
);

export const announcements = mysqlTable('announcements', {
  id: int('id').autoincrement().primaryKey(),
  title: varchar('title', { length: 160 }).notNull(),
  body: text('body').notNull(),
  pinned: boolean('pinned').notNull().default(false),
  type: mysqlEnum('type', ['irs', 'dev']).notNull().default('irs'),
  important: boolean('important').notNull().default(false),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByName: varchar('created_by_name', { length: 120 }).notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const announcementReads = mysqlTable(
  'announcement_reads',
  {
    id: int('id').autoincrement().primaryKey(),
    announcementId: int('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
    userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ uq: unique('uq_announcement_read').on(t.announcementId, t.userId) }),
);

export const shareListings = mysqlTable('share_listings', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sellerShareholderId: int('seller_shareholder_id').references(() => shareholders.id, { onDelete: 'set null' }),
  parts: decimal('parts', { precision: 5, scale: 2 }).notNull(),
  pricePerPart: decimal('price_per_part', { precision: 14, scale: 2 }).notNull().default('0'),
  note: varchar('note', { length: 250 }),
  status: mysqlEnum('listing_status', ['open', 'closed']).notNull().default('open'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const shareRequests = mysqlTable('share_requests', {
  id: int('id').autoincrement().primaryKey(),
  listingId: int('listing_id')
    .notNull()
    .references(() => shareListings.id, { onDelete: 'cascade' }),
  buyerUserId: int('buyer_user_id').references(() => users.id, { onDelete: 'set null' }),
  buyerName: varchar('buyer_name', { length: 120 }).notNull(),
  parts: decimal('parts', { precision: 5, scale: 2 }).notNull(),
  status: mysqlEnum('request_status', ['pending', 'accepted', 'refused']).notNull().default('pending'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const events = mysqlTable('events', {
  id: int('id').autoincrement().primaryKey(),
  title: varchar('title', { length: 150 }).notNull(),
  category: varchar('category', { length: 80 }),
  ownerType: mysqlEnum('owner_type', ['company', 'association']).notNull(),
  companyId: int('company_id').references(() => companies.id, { onDelete: 'set null' }),
  associationId: int('association_id').references(() => associations.id, { onDelete: 'set null' }),
  ownerName: varchar('owner_name', { length: 140 }).notNull(),
  startAt: datetime('start_at', { mode: 'string' }).notNull(),
  endAt: datetime('end_at', { mode: 'string' }).notNull(),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyEvents = mysqlTable('company_events', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 150 }).notNull(),
  posterPath: varchar('poster_path', { length: 255 }),
  eventDate: date('event_date', { mode: 'string' }).notNull(),
  revenue: decimal('revenue', { precision: 14, scale: 2 }).notNull().default('0'),
  charges: decimal('charges', { precision: 14, scale: 2 }).notNull().default('0'),
  profit: decimal('profit', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const companyNotes = mysqlTable('company_notes', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  authorUserId: int('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: varchar('author_name', { length: 140 }).notNull().default(''),
  type: mysqlEnum('type', ['no_answer', 'not_present', 'other']).notNull().default('no_answer'),
  incidentAt: datetime('incident_at', { mode: 'string' }).notNull(),
  body: text('body'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const garageContracts = mysqlTable('garage_contracts', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const garageVehicles = mysqlTable('garage_vehicles', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ownerFirstName: varchar('owner_first_name', { length: 80 }),
  ownerLastName: varchar('owner_last_name', { length: 80 }),
  model: varchar('model', { length: 120 }),
  plate: varchar('plate', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const garageRepairTypes = mysqlTable('garage_repair_types', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  price: decimal('price', { precision: 12, scale: 2 }).notNull().default('0'),
  sortOrder: int('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => ({ uq: unique('uq_garage_type').on(t.companyId, t.name) }));

export const garagePacks = mysqlTable('garage_packs', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  price: decimal('price', { precision: 12, scale: 2 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
});

export const garageContractPrices = mysqlTable('garage_contract_prices', {
  id: int('id').autoincrement().primaryKey(),
  contractId: int('contract_id')
    .notNull()
    .references(() => garageContracts.id, { onDelete: 'cascade' }),
  typeId: int('type_id').references(() => garageRepairTypes.id, { onDelete: 'cascade' }),
  packId: int('pack_id').references(() => garagePacks.id, { onDelete: 'cascade' }),
  price: decimal('price', { precision: 12, scale: 2 }).notNull().default('0'),
});

export const garageSettings = mysqlTable('garage_settings', {
  companyId: int('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  depannagePerKm: decimal('depannage_per_km', { precision: 12, scale: 2 }).notNull().default('25'),
  depannageMultiplier: int('depannage_multiplier').notNull().default(2),
  customMarginPct: decimal('custom_margin_pct', { precision: 6, scale: 2 }).notNull().default('25'),
  commissionPct: decimal('commission_pct', { precision: 6, scale: 2 }).notNull().default('30'),
});

export const garageRepairs = mysqlTable('garage_repairs', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  contractId: int('contract_id').references(() => garageContracts.id, { onDelete: 'set null' }),
  vehicleId: int('vehicle_id').references(() => garageVehicles.id, { onDelete: 'set null' }),
  mechanicName: varchar('mechanic_name', { length: 140 }).notNull().default(''),
  clientName: varchar('client_name', { length: 140 }),
  plate: varchar('plate', { length: 20 }),
  model: varchar('model', { length: 120 }),
  packName: varchar('pack_name', { length: 80 }),
  items: json('items'),
  mechanicUserId: int('mechanic_user_id').references(() => users.id, { onDelete: 'set null' }),
  commissionAmount: decimal('commission_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  depannageKm: int('depannage_km').notNull().default(0),
  total: decimal('total', { precision: 12, scale: 2 }).notNull().default('0'),
  description: text('description'),
  paid: boolean('paid').notNull().default(false),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const garageCustoms = mysqlTable('garage_customs', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  contractId: int('contract_id').references(() => garageContracts.id, { onDelete: 'set null' }),
  vehicleId: int('vehicle_id').references(() => garageVehicles.id, { onDelete: 'set null' }),
  mechanicName: varchar('mechanic_name', { length: 140 }).notNull().default(''),
  clientName: varchar('client_name', { length: 140 }),
  plate: varchar('plate', { length: 20 }),
  model: varchar('model', { length: 120 }),
  mechanicUserId: int('mechanic_user_id').references(() => users.id, { onDelete: 'set null' }),
  commissionAmount: decimal('commission_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  costPrice: decimal('cost_price', { precision: 12, scale: 2 }).notNull().default('0'),
  discountPct: decimal('discount_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  marginPct: decimal('margin_pct', { precision: 6, scale: 2 }).notNull().default('25'),
  finalPrice: decimal('final_price', { precision: 12, scale: 2 }).notNull().default('0'),
  profit: decimal('profit', { precision: 12, scale: 2 }).notNull().default('0'),
  description: text('description'),
  paid: boolean('paid').notNull().default(false),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const vehicleModels = mysqlTable(
  'vehicle_models',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    manufacturer: varchar('manufacturer', { length: 80 }),
    category: varchar('category', { length: 40 }),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ idxName: index('idx_vehicle_model_name').on(t.name) }),
);

export const companyEmployees = mysqlTable('company_employees', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  iban: varchar('iban', { length: 40 }),
  dateOfBirth: date('date_of_birth', { mode: 'string' }),
  hireDate: date('hire_date', { mode: 'string' }),
  companyRoleId: int('company_role_id').references(() => companyRoles.id, { onDelete: 'set null' }),
  contractType: mysqlEnum('contract_type', ['cdi', 'cdd', 'interim']).notNull().default('cdi'),
  contractSigned: boolean('contract_signed').notNull().default(false),
  medicalVisit: boolean('medical_visit').notNull().default(false),
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
    companyRoleId: int('company_role_id')
      .notNull()
      .references(() => companyRoles.id, { onDelete: 'cascade' }),
    hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull().default('0'),
    baseSalary: decimal('base_salary', { precision: 12, scale: 2 }).notNull().default('0'),
  },
  (t) => ({ uq: unique('uq_salary_grid').on(t.companyRoleId) }),
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

export const stockCategories = mysqlTable(
  'stock_categories',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ uq: unique('uq_stock_category').on(t.companyId, t.name) }),
);

export const stockItems = mysqlTable('stock_items', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  category: varchar('category', { length: 80 }),
  categoryId: int('category_id').references(() => stockCategories.id, { onDelete: 'set null' }),
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
  saleId: int('sale_id'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const sales = mysqlTable('sales', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  employeeId: int('employee_id').references(() => companyEmployees.id, { onDelete: 'set null' }),
  clientId: int('client_id').references(() => companyClients.id, { onDelete: 'set null' }),
  subtotal: decimal('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  discount: decimal('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  total: decimal('total', { precision: 14, scale: 2 }).notNull().default('0'),
  productionCost: decimal('production_cost', { precision: 14, scale: 2 }).notNull().default('0'),
  paymentMethod: mysqlEnum('payment_method', ['cash', 'card', 'transfer', 'account'])
    .notNull()
    .default('cash'),
  pointsAwarded: int('points_awarded').notNull().default(0),
  notes: varchar('notes', { length: 300 }),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const saleItems = mysqlTable('sale_items', {
  id: int('id').autoincrement().primaryKey(),
  saleId: int('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  catalogItemId: int('catalog_item_id').references(() => catalogItems.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 150 }).notNull(),
  itemType: mysqlEnum('item_type', ['product', 'service']).notNull().default('service'),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  lineTotal: decimal('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
  productionCost: decimal('production_cost', { precision: 14, scale: 2 }).notNull().default('0'),
});

export const exercices = mysqlTable(
  'exercices',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 150 }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    status: mysqlEnum('status', ['open', 'closed']).notNull().default('open'),
    revenue: decimal('revenue', { precision: 14, scale: 2 }).notNull().default('0'),
    dividends: decimal('dividends', { precision: 14, scale: 2 }).notNull().default('0'),
    hoursCap: decimal('hours_cap', { precision: 10, scale: 2 }).notNull().default('0'),
    salaryCap: decimal('salary_cap', { precision: 14, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    snapshot: json('snapshot'),
    createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({ uq: unique('uq_exercice_period').on(t.companyId, t.startDate, t.endDate) }),
);

export const exercicePayroll = mysqlTable(
  'exercice_payroll',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    exerciceId: int('exercice_id')
      .notNull()
      .references(() => exercices.id, { onDelete: 'cascade' }),
    employeeId: int('employee_id')
      .notNull()
      .references(() => companyEmployees.id, { onDelete: 'cascade' }),
    commission: decimal('commission', { precision: 12, scale: 2 }).notNull().default('0'),
    bonus: decimal('bonus', { precision: 12, scale: 2 }).notNull().default('0'),
    deductions: decimal('deductions', { precision: 12, scale: 2 }).notNull().default('0'),
    notes: varchar('notes', { length: 200 }),
    paid: boolean('paid').notNull().default(false),
    paidAt: timestamp('paid_at'),
  },
  (t) => ({ uq: unique('uq_exercice_payroll').on(t.exerciceId, t.employeeId) }),
);

export const catalogItems = mysqlTable('catalog_items', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  category: varchar('category', { length: 80 }),
  categoryId: int('category_id').references(() => stockCategories.id, { onDelete: 'set null' }),
  stockItemId: int('stock_item_id').references(() => stockItems.id, { onDelete: 'set null' }),
  type: mysqlEnum('type', ['product', 'service']).notNull().default('product'),
  price: decimal('price', { precision: 12, scale: 2 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
  notes: text('notes'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const catalogRecipe = mysqlTable(
  'catalog_recipe',
  {
    id: int('id').autoincrement().primaryKey(),
    companyId: int('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    catalogItemId: int('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    stockItemId: int('stock_item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'cascade' }),
    quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  },
  (t) => ({ uq: unique('uq_catalog_recipe').on(t.catalogItemId, t.stockItemId) }),
);

export const dividendPayouts = mysqlTable('dividend_payouts', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  shareholderName: varchar('shareholder_name', { length: 150 }).notNull(),
  rib: varchar('rib', { length: 40 }),
  gross: decimal('gross', { precision: 14, scale: 2 }).notNull().default('0'),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).notNull().default('33'),
  tax: decimal('tax', { precision: 14, scale: 2 }).notNull().default('0'),
  net: decimal('net', { precision: 14, scale: 2 }).notNull().default('0'),
  status: mysqlEnum('div_status', ['pending', 'paid', 'cancelled']).notNull().default('pending'),
  transferValidated: boolean('transfer_validated').notNull().default(false),
  notes: varchar('notes', { length: 300 }),
  declaredByUserId: int('declared_by_user_id').references(() => users.id, { onDelete: 'set null' }),
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

export const errorLog = mysqlTable('error_log', {
  id: int('id').autoincrement().primaryKey(),
  code: varchar('code', { length: 16 }).notNull(),
  source: varchar('source', { length: 10 }).notNull(),
  message: varchar('message', { length: 500 }),
  stack: text('stack'),
  method: varchar('method', { length: 10 }),
  path: varchar('path', { length: 255 }),
  userId: int('user_id'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const tickets = mysqlTable('tickets', {
  id: int('id').autoincrement().primaryKey(),
  ref: varchar('ref', { length: 8 }).notNull(),
  type: mysqlEnum('type', ['bug', 'question', 'suggestion']).notNull(),
  priority: mysqlEnum('priority', ['low', 'normal', 'high']).notNull().default('normal'),
  status: mysqlEnum('status', ['waiting_staff', 'waiting_user', 'resolved', 'closed']).notNull().default('waiting_staff'),
  title: varchar('title', { length: 150 }).notNull(),
  userId: int('user_id').notNull(),
  assignedUserId: int('assigned_user_id'),
  companyId: int('company_id'),
  contextPath: varchar('context_path', { length: 255 }),
  contextErrorCode: varchar('context_error_code', { length: 16 }),
  contextAgent: varchar('context_agent', { length: 255 }),
  lastMessageAt: timestamp('last_message_at'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: timestamp('resolved_at'),
  closedAt: timestamp('closed_at'),
  discordThreadId: varchar('discord_thread_id', { length: 32 }),
});

export const ticketMessages = mysqlTable('ticket_messages', {
  id: int('id').autoincrement().primaryKey(),
  ticketId: int('ticket_id').notNull(),
  userId: int('user_id'),
  body: text('body').notNull(),
  internal: boolean('internal').notNull().default(false),
  fromDiscord: boolean('from_discord').notNull().default(false),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const ticketAttachments = mysqlTable('ticket_attachments', {
  id: int('id').autoincrement().primaryKey(),
  ticketId: int('ticket_id').notNull(),
  messageId: int('message_id'),
  path: varchar('path', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 200 }),
  size: int('size').notNull().default(0),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const ticketMessageReactions = mysqlTable('ticket_message_reactions', {
  id: int('id').autoincrement().primaryKey(),
  ticketId: int('ticket_id').notNull(),
  messageId: int('message_id').notNull(),
  userId: int('user_id').notNull(),
  emoji: varchar('emoji', { length: 32 }).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({ uq: unique('uq_reaction').on(t.messageId, t.userId, t.emoji) }));

export const ticketEvents = mysqlTable('ticket_events', {
  id: int('id').autoincrement().primaryKey(),
  ticketId: int('ticket_id').notNull(),
  ref: varchar('ref', { length: 16 }).notNull(),
  eventType: varchar('event_type', { length: 40 }).notNull(),
  actorUserId: int('actor_user_id'),
  actorName: varchar('actor_name', { length: 120 }),
  detail: varchar('detail', { length: 255 }),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const immoRentals = mysqlTable('immo_rentals', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  propertyRef: varchar('property_ref', { length: 120 }).notNull(),
  clientId: int('client_id').references(() => companyClients.id, { onDelete: 'set null' }),
  tenantName: varchar('tenant_name', { length: 150 }),
  agent: varchar('agent', { length: 120 }),
  weeklyRent: decimal('weekly_rent', { precision: 14, scale: 2 }).notNull().default('0'),
  startDate: date('start_date', { mode: 'string' }),
  status: mysqlEnum('status', ['active', 'terminee', 'resiliee']).notNull().default('active'),
  autoGenerate: boolean('auto_generate').notNull().default(false),
  reminderEnabled: boolean('reminder_enabled').notNull().default(false),
  tenantDiscordId: varchar('tenant_discord_id', { length: 32 }),
  lastReminderAt: timestamp('last_reminder_at'),
  notes: text('notes'),
  pricingDetail: text('pricing_detail'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const immoRentInvoices = mysqlTable('immo_rent_invoices', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  rentalId: int('rental_id')
    .notNull()
    .references(() => immoRentals.id, { onDelete: 'cascade' }),
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  amount: decimal('amount', { precision: 14, scale: 2 }).notNull().default('0'),
  status: mysqlEnum('status', ['paye', 'impaye']).notNull().default('impaye'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const immoSales = mysqlTable('immo_sales', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  propertyRef: varchar('property_ref', { length: 120 }).notNull(),
  clientId: int('client_id').references(() => companyClients.id, { onDelete: 'set null' }),
  buyerName: varchar('buyer_name', { length: 150 }),
  agent: varchar('agent', { length: 120 }),
  price: decimal('price', { precision: 14, scale: 2 }).notNull().default('0'),
  status: mysqlEnum('status', ['disponible', 'vendu']).notNull().default('disponible'),
  saleDate: date('sale_date', { mode: 'string' }),
  notes: text('notes'),
  pricingDetail: text('pricing_detail'),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const immoParcels = mysqlTable('immo_parcels', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  propertyRef: varchar('property_ref', { length: 120 }).notNull(),
  status: mysqlEnum('status', ['disponible', 'vendu', 'active']).notNull().default('disponible'),
  price: decimal('price', { precision: 14, scale: 2 }).notNull().default('0'),
  ownerName: varchar('owner_name', { length: 150 }),
  notes: text('notes'),
  geometry: json('geometry').notNull(),
  createdByUserId: int('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const immoPriceTypes = mysqlTable('immo_price_types', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  kind: mysqlEnum('kind', ['location', 'vente']).notNull(),
  key: varchar('key', { length: 120 }).notNull(),
  label: varchar('label', { length: 120 }).notNull(),
  basePrice: decimal('base_price', { precision: 14, scale: 2 }).notNull().default('0'),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const immoOptions = mysqlTable('immo_options', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  kind: mysqlEnum('kind', ['location', 'vente']).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  pct: decimal('pct', { precision: 6, scale: 2 }).notNull().default('0'),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const immoDiscounts = mysqlTable('immo_discounts', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  pct: decimal('pct', { precision: 6, scale: 2 }).notNull().default('0'),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const taxiSettings = mysqlTable('taxi_settings', {
  companyId: int('company_id').primaryKey().references(() => companies.id, { onDelete: 'cascade' }),
  pricePerKm: decimal('price_per_km', { precision: 14, scale: 2 }).notNull().default('20'),
  pricePerClient: decimal('price_per_client', { precision: 14, scale: 2 }).notNull().default('605'),
});

export const taxiVipTypes = mysqlTable('taxi_vip_types', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  fixedPrice: decimal('fixed_price', { precision: 14, scale: 2 }).notNull().default('0'),
  pricePerKm: decimal('price_per_km', { precision: 14, scale: 2 }),
  sortOrder: int('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const taxiCitoyens = mysqlTable('taxi_citoyens', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  driverUserId: int('driver_user_id'),
  driverName: varchar('driver_name', { length: 120 }).notNull().default(''),
  km: decimal('km', { precision: 12, scale: 2 }).notNull().default('0'),
  pricePerKm: decimal('price_per_km', { precision: 14, scale: 2 }).notNull().default('0'),
  total: decimal('total', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdByUserId: int('created_by_user_id'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const taxiConcitoyens = mysqlTable('taxi_concitoyens', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  driverUserId: int('driver_user_id'),
  driverName: varchar('driver_name', { length: 120 }).notNull().default(''),
  clients: int('clients').notNull().default(1),
  pricePerClient: decimal('price_per_client', { precision: 14, scale: 2 }).notNull().default('0'),
  total: decimal('total', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdByUserId: int('created_by_user_id'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const taxiVip = mysqlTable('taxi_vip', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  driverUserId: int('driver_user_id'),
  driverName: varchar('driver_name', { length: 120 }).notNull().default(''),
  typeId: int('type_id').references(() => taxiVipTypes.id, { onDelete: 'set null' }),
  typeName: varchar('type_name', { length: 120 }).notNull().default(''),
  km: decimal('km', { precision: 12, scale: 2 }),
  total: decimal('total', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdByUserId: int('created_by_user_id'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const companyVehicles = mysqlTable('company_vehicles', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  plate: varchar('plate', { length: 20 }).notNull(),
  perf: boolean('perf').notNull().default(false),
  assignedEmployeeId: int('assigned_employee_id').references(() => companyEmployees.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const employeeWarnings = mysqlTable('employee_warnings', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  employeeId: int('employee_id').notNull().references(() => companyEmployees.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 500 }).notNull(),
  createdByUserId: int('created_by_user_id'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pawnshopItems = mysqlTable('pawnshop_items', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  buyPrice: decimal('buy_price', { precision: 12, scale: 2 }).notNull().default('0'),
  sellPrice: decimal('sell_price', { precision: 12, scale: 2 }).notNull().default('0'),
  venteClient: boolean('vente_client').notNull().default(false),
  active: boolean('active').notNull().default(true),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pawnshopTransactions = mysqlTable('pawnshop_transactions', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  itemId: int('item_id').notNull().references(() => pawnshopItems.id, { onDelete: 'cascade' }),
  type: mysqlEnum('type', ['buy', 'sell']).notNull(),
  qty: int('qty').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
  total: decimal('total', { precision: 14, scale: 2 }).notNull().default('0'),
  clientName: varchar('client_name', { length: 120 }),
  note: varchar('note', { length: 255 }),
  createdByUserId: int('created_by_user_id'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const chasseItems = mysqlTable('chasse_items', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  buyPrice: decimal('buy_price', { precision: 12, scale: 2 }).notNull().default('0'),
  sellPrice: decimal('sell_price', { precision: 12, scale: 2 }).notNull().default('0'),
  venteClient: boolean('vente_client').notNull().default(false),
  active: boolean('active').notNull().default(true),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const chasseTransactions = mysqlTable('chasse_transactions', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  itemId: int('item_id').notNull().references(() => chasseItems.id, { onDelete: 'cascade' }),
  type: mysqlEnum('type', ['buy', 'sell']).notNull(),
  qty: int('qty').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
  total: decimal('total', { precision: 14, scale: 2 }).notNull().default('0'),
  clientName: varchar('client_name', { length: 120 }),
  note: varchar('note', { length: 255 }),
  createdByUserId: int('created_by_user_id'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const companyRuns = mysqlTable('company_runs', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  employeeId: int('employee_id').references(() => companyEmployees.id, { onDelete: 'set null' }),
  qty: int('qty').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
  total: decimal('total', { precision: 14, scale: 2 }).notNull().default('0'),
  commission: decimal('commission', { precision: 14, scale: 2 }).notNull().default('0'),
  note: varchar('note', { length: 255 }),
  createdByUserId: int('created_by_user_id'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const concessionVehicles = mysqlTable('concession_vehicles', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  category: varchar('category', { length: 80 }).notNull().default('Autre'),
  type: mysqlEnum('type', ['new', 'used']).notNull().default('new'),
  purchasePrice: decimal('purchase_price', { precision: 12, scale: 2 }).notNull().default('0'),
  salePrice: decimal('sale_price', { precision: 12, scale: 2 }).notNull().default('0'),
  imageUrl: varchar('image_url', { length: 255 }),
  description: text('description'),
  available: boolean('available').notNull().default(true),
  showroom: boolean('showroom').notNull().default(true),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const concessionSales = mysqlTable('concession_sales', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  vehicleId: int('vehicle_id').references(() => concessionVehicles.id, { onDelete: 'set null' }),
  clientId: int('client_id').references(() => companyClients.id, { onDelete: 'set null' }),
  vehicleName: varchar('vehicle_name', { length: 150 }).notNull(),
  clientName: varchar('client_name', { length: 120 }),
  plate: varchar('plate', { length: 20 }),
  purchasePrice: decimal('purchase_price', { precision: 12, scale: 2 }).notNull().default('0'),
  salePrice: decimal('sale_price', { precision: 12, scale: 2 }).notNull().default('0'),
  commission: decimal('commission', { precision: 14, scale: 2 }).notNull().default('0'),
  note: varchar('note', { length: 255 }),
  createdByUserId: int('created_by_user_id'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
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
