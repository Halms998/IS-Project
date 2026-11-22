import express, { Express } from 'express';
import { Config } from './config/env';
import { Db } from './database/db';
import { errorHandler, notFound } from './middleware/errorHandler';
import { createRoutes } from './routes';
import { AuditService } from './services/auditService';
import { ElectionService } from './services/electionService';
import { CryptoRunner } from './types';

export interface AppDependencies {
  db: Db;
  runner: CryptoRunner;
  config: Pick<Config, 'adminApiKey' | 'dataDir'>;
}

// Builds the Express app from its dependencies, so tests can supply an in-memory database and a
// stand-in for the C++ programs.
export function createApp({ db, runner, config }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  const audit = new AuditService(db);
  const elections = new ElectionService(db, runner, audit, config.dataDir);
  app.use('/api', createRoutes(elections, audit, config.adminApiKey));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
