import { createServer } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from './env';
import { logger } from './logger';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { internalRouter } from './routes/internal';
import { companiesRouter } from './routes/companies';
import { shareholdersRouter } from './routes/shareholders';
import { gradesRouter } from './routes/grades';
import { membersRouter } from './routes/members';
import { meRouter } from './routes/me';
import { meDeclarationsRouter, irsDeclarationsRouter } from './routes/declarations';
import { meExpensesRouter } from './routes/expenses';
import { meSubventionsRouter, irsSubventionsRouter } from './routes/subventions';
import { meMessagesRouter, irsMessagesRouter } from './routes/messages';
import { meEmployeesRouter } from './routes/employees';
import { meStatsRouter } from './routes/stats';
import { meTimeclockRouter } from './routes/timeclock';
import { meSalaryRouter } from './routes/salary';
import { adminModulesRouter } from './routes/adminModules';
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
app.use('/api/me/companies/:companyId/messages', meMessagesRouter);
app.use('/api/me/companies/:companyId/employees', meEmployeesRouter);
app.use('/api/me/companies/:companyId/stats', meStatsRouter);
app.use('/api/me/companies/:companyId/timeclock', meTimeclockRouter);
app.use('/api/me/companies/:companyId/salary-grid', meSalaryRouter);
app.use('/api/declarations', irsDeclarationsRouter);
app.use('/api/subventions', irsSubventionsRouter);
app.use('/api/messages', irsMessagesRouter);
app.use('/api/admin/modules', adminModulesRouter);
app.use('/api/fiscal', fiscalRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
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
