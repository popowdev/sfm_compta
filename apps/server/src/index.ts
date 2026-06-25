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
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { internalRouter } from './routes/internal';
import { companiesRouter } from './routes/companies';
import { shareholdersRouter } from './routes/shareholders';
import { gradesRouter, meGradesRouter } from './routes/grades';
import { membersRouter, meMembersRouter } from './routes/members';
import { meRouter } from './routes/me';
import { meDeclarationsRouter, irsDeclarationsRouter } from './routes/declarations';
import { meExpensesRouter } from './routes/expenses';
import { meSubventionsRouter, irsSubventionsRouter } from './routes/subventions';
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
import { adminModulesRouter } from './routes/adminModules';
import { adminUsersRouter } from './routes/admin';
import { fiscalRouter } from './routes/fiscal';
import { createSocketServer } from './realtime/socket';
import { purgeExpiredSessions } from './auth/session';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(pinoHttp({ logger }));

app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/internal', internalRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/companies/:companyId/shareholders', shareholdersRouter);
app.use('/api/companies/:companyId/roles', gradesRouter);
app.use('/api/companies/:companyId/members', membersRouter);
app.use('/api/me', meRouter);
app.use('/api/me/companies/:companyId/declarations', meDeclarationsRouter);
app.use('/api/me/companies/:companyId/expenses', meExpensesRouter);
app.use('/api/me/companies/:companyId/subventions', meSubventionsRouter);
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
app.use('/api/me/companies/:companyId/sales', meSalesRouter);
app.use('/api/me/companies/:companyId/exercices', meExercicesRouter);
app.use('/api/me/companies/:companyId/clients', meClientsRouter);
app.use('/api/me/companies/:companyId/loyalty-tiers', meLoyaltyRouter);
app.use('/api/me/companies/:companyId/grades', meGradesRouter);
app.use('/api/me/companies/:companyId/members', meMembersRouter);
app.use('/api/declarations', irsDeclarationsRouter);
app.use('/api/subventions', irsSubventionsRouter);
app.use('/api/dividends', irsDividendsRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/messages', irsMessagesRouter);
app.use('/api/admin/modules', adminModulesRouter);
app.use('/api/fiscal', fiscalRouter);

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

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'internal_error' });
});

const httpServer = createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`RP Compta API → http://127.0.0.1:${env.PORT} (${env.NODE_ENV})`);
});

setInterval(
  () => {
    void purgeExpiredSessions().catch((err) => logger.error({ err }, 'purge sessions failed'));
  },
  60 * 60 * 1000,
).unref();
