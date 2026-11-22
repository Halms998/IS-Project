import path from 'path';
import { createApp } from './app';
import { loadConfig, loadDotEnv } from './config/env';
import { CliCryptoRunner } from './crypto/cliRunner';
import { openDatabase } from './database/db';

loadDotEnv(path.resolve(process.cwd(), '.env'));

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Configuration error: ${(error as Error).message}`);
  process.exit(1);
}

const db = openDatabase(config.databasePath);
const app = createApp({ db, runner: new CliCryptoRunner(config), config });

const server = app.listen(config.port, () => {
  console.log(`Secure Ballot API listening on http://localhost:${config.port}/api`);
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
