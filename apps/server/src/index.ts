import { createServer } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { env } from './env';
import { logger } from './logger';
import { runRentAutoGeneration, runRentReminders } from './services/rentAutoGen';
import { runWeeklyRollover } from './services/exerciceAutoWeek';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { internalRouter } from './routes/internal';
import { companiesRouter } from './routes/companies';
import { shareholdersRouter, meShareholdersRouter } from './routes/shareholders';
import { gradesRouter, meGradesRouter } from './routes/grades';
import { membersRouter, meMembersRouter } from './routes/members';
import { meRouter } from './routes/me';
import { meDeclarationsRouter, irsDeclarationsRouter } from './routes/declarations';
import { meExpensesRouter } from './routes/expenses';
import { meSubventionsRouter, irsSubventionsRouter } from './routes/subventions';
import { meCompanyEventsRouter } from './routes/companyEvents';
import { fivemRouter } from './routes/fivem';
import { meFivemRouter } from './routes/fivemMe';
import { refreshSelectedCharacters } from './services/fivemSync';
import { genErrorCode, recordError } from './services/errorLog';
import { errorsRouter, adminErrorsRouter } from './routes/errors';
import { meTicketsRouter, supportTicketsRouter, ticketFilesRouter, devTicketLogsRouter } from './routes/tickets';
import { meImmoRentalsRouter, meImmoSalesRouter, meImmoParcelsRouter, meImmoSettingsRouter } from './routes/immo';
import { meTaxiRouter } from './routes/taxi';
import { mePawnshopRouter } from './routes/pawnshop';
import { meChasseRouter } from './routes/chasse';
import { meRunsRouter } from './routes/runs';
import { meMyPayRouter } from './routes/mypay';
import { irsCompanyNotesRouter } from './routes/companyNotes';
import { meGarageRouter } from './routes/garage';
import { meDividendsRouter, irsDividendsRouter } from './routes/dividends';
import { meMessagesRouter, irsMessagesRouter } from './routes/messages';
import { meEmployeesRouter } from './routes/employees';
import { meStatsRouter } from './routes/stats';
import { meDashboardRouter } from './routes/dashboard';
import { meTimeclockRouter } from './routes/timeclock';
import { meSalaryRouter } from './routes/salary';
import { meRentalsRouter } from './routes/rentals';
import { meStocksRouter } from './routes/stocks';
import { meStockCategoriesRouter } from './routes/stockCategories';
import { meCatalogRouter } from './routes/catalog';
import { meSalesRouter } from './routes/sales';
import { meExercicesRouter } from './routes/exercices';
import { meClientsRouter, meLoyaltyRouter } from './routes/clients';
import { meDocumentsRouter, irsDocumentsRouter } from './routes/documents';
import { meAssociationsRouter, irsAssociationsRouter } from './routes/associations';
import { calendarRouter } from './routes/calendar';
import { meNotificationsRouter } from './routes/notifications';
import { irsAuditRouter } from './routes/audit';
import { irsOverviewRouter } from './routes/irsOverview';
import { announcementsRouter } from './routes/announcements';
import { meShareListingsRouter, irsShareListingsRouter } from './routes/shareListings';
import { adminModulesRouter } from './routes/adminModules';
import { adminUsersRouter } from './routes/admin';
import { fiscalRouter } from './routes/fiscal';
import { createSocketServer, emitInvalidate } from './realtime/socket';
import { purgeExpiredSessions } from './auth/session';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use('/api/fivem', express.json({ limit: '2mb' }));
app.use(express.json());
app.use(cookieParser());
app.use(pinoHttp({ logger }));

const rateLimited = (_req: express.Request, res: express.Response) =>
  res.status(429).json({ error: 'rate_limited' });

app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 1200,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimited,
  }),
);

const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimited,
});
const fivemLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, handler: rateLimited });

app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
app.use('/api/auth/discord', authLimiter);
app.use('/api/auth', authRouter);
app.use('/api/internal', internalRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/companies/:companyId/shareholders', shareholdersRouter);
app.use('/api/companies/:companyId/roles', gradesRouter);
app.use('/api/companies/:companyId/members', membersRouter);
app.use('/api/companies/:companyId/notes', irsCompanyNotesRouter);
app.use('/api/me', meRouter);
app.use('/api/me/associations', meAssociationsRouter);
app.use('/api/me/notifications', meNotificationsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/share-listings', meShareListingsRouter);
app.use('/api/me/companies/:companyId/declarations', meDeclarationsRouter);
app.use('/api/me/companies/:companyId/expenses', meExpensesRouter);
app.use('/api/me/companies/:companyId/subventions', meSubventionsRouter);
app.use('/api/me/companies/:companyId/evenements', meCompanyEventsRouter);
app.use('/api/me/companies/:companyId/garage', meGarageRouter);
app.use('/api/fivem', fivemLimiter, fivemRouter);
app.use('/api/me/fivem', meFivemRouter);
app.use('/api/me/companies/:companyId/dividends', meDividendsRouter);
app.use('/api/me/companies/:companyId/messages', meMessagesRouter);
app.use('/api/me/companies/:companyId/employees', meEmployeesRouter);
app.use('/api/me/companies/:companyId/stats', meStatsRouter);
app.use('/api/me/companies/:companyId/dashboard', meDashboardRouter);
app.use('/api/me/companies/:companyId/timeclock', meTimeclockRouter);
app.use('/api/me/companies/:companyId/salary-grid', meSalaryRouter);
app.use('/api/me/companies/:companyId/rentals', meRentalsRouter);
app.use('/api/me/companies/:companyId/stocks', meStocksRouter);
app.use('/api/me/companies/:companyId/stock-categories', meStockCategoriesRouter);
app.use('/api/me/companies/:companyId/catalog', meCatalogRouter);
app.use('/api/me/companies/:companyId/immo-rentals', meImmoRentalsRouter);
app.use('/api/me/companies/:companyId/immo-sales', meImmoSalesRouter);
app.use('/api/me/companies/:companyId/immo-parcels', meImmoParcelsRouter);
app.use('/api/me/companies/:companyId/immo-settings', meImmoSettingsRouter);
app.use('/api/me/companies/:companyId/taxi', meTaxiRouter);
app.use('/api/me/companies/:companyId/pawnshop', mePawnshopRouter);
app.use('/api/me/companies/:companyId/chasse', meChasseRouter);
app.use('/api/me/companies/:companyId/runs', meRunsRouter);
app.use('/api/me/companies/:companyId/my-pay', meMyPayRouter);
app.use('/api/me/companies/:companyId/sales', meSalesRouter);
app.use('/api/me/companies/:companyId/exercices', meExercicesRouter);
app.use('/api/me/companies/:companyId/clients', meClientsRouter);
app.use('/api/me/companies/:companyId/loyalty-tiers', meLoyaltyRouter);
app.use('/api/me/companies/:companyId/documents', meDocumentsRouter);
app.use('/api/me/companies/:companyId/shareholders', meShareholdersRouter);
app.use('/api/me/companies/:companyId/grades', meGradesRouter);
app.use('/api/me/companies/:companyId/members', meMembersRouter);
app.use('/api/declarations', irsDeclarationsRouter);
app.use('/api/subventions', irsSubventionsRouter);
app.use('/api/dividends', irsDividendsRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/irs/documents', irsDocumentsRouter);
app.use('/api/associations', irsAssociationsRouter);
app.use('/api/irs/audit', irsAuditRouter);
app.use('/api/irs/overview', irsOverviewRouter);
app.use('/api/irs/share-listings', irsShareListingsRouter);
app.use('/api/messages', irsMessagesRouter);
app.use('/api/admin/modules', adminModulesRouter);
app.use('/api/fiscal', fiscalRouter);
app.use('/api/errors', errorsRouter);
app.use('/api/admin/errors', adminErrorsRouter);
app.use('/api/me/tickets', meTicketsRouter);
app.use('/api/support/tickets', supportTicketsRouter);
app.use('/api/tickets', ticketFilesRouter);
app.use('/api/dev/ticket-logs', devTicketLogsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'too_many_files' });
    }
    return res.status(400).json({ error: 'invalid_upload' });
  }
  next(err);
});

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const code = genErrorCode();
  const e = err as { message?: string; stack?: string };
  logger.error({ err, errorCode: code, method: req.method, path: req.originalUrl }, 'unhandled error');
  void recordError({
    code,
    source: 'server',
    message: e?.message ?? String(err),
    stack: e?.stack ?? null,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id ?? null,
  });
  res.status(500).json({ error: 'internal_error', errorId: code });
});

const httpServer = createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.PORT, '127.0.0.1', () => {
  logger.info(`RP Compta API → http://127.0.0.1:${env.PORT} (${env.NODE_ENV})`);
});

setInterval(
  () => {
    void purgeExpiredSessions().catch((err) => logger.error({ err }, 'purge sessions failed'));
  },
  60 * 60 * 1000,
).unref();

if (env.FIVEM_PLAYER_API_URL) {
  let fivemRefreshRunning = false;
  setInterval(
    () => {
      if (fivemRefreshRunning) return;
      fivemRefreshRunning = true;
      void refreshSelectedCharacters()
        .then((r) => {
          if (!r.userIds.length) return;
          emitInvalidate('irs', [['fivem-players'], ['companies'], ['members']]);
          for (const uid of new Set(r.userIds)) emitInvalidate(`user:${uid}`, [['my-companies']]);
        })
        .catch((err) => logger.error({ err }, 'fivem refresh failed'))
        .finally(() => {
          fivemRefreshRunning = false;
        });
    },
    10 * 60 * 1000,
  ).unref();
}

// Génération automatique des loyers (hebdo, idempotente) — vérifiée toutes les heures.
{
  let rentGenRunning = false;
  const tick = () => {
    if (rentGenRunning) return;
    rentGenRunning = true;
    void runRentAutoGeneration()
      .then(() => runRentReminders())
      .then(() => runWeeklyRollover())
      .catch((err) => logger.error({ err }, 'auto-génération / relance loyers ou semaines échouée'))
      .finally(() => { rentGenRunning = false; });
  };
  setTimeout(tick, 30 * 1000); // un passage peu après le démarrage
  setInterval(tick, 60 * 60 * 1000).unref();
}
