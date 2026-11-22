import fs from 'fs';
import path from 'path';

export interface Config {
  port: number;
  adminApiKey: string;
  databasePath: string;
  dataDir: string;
  cryptoBinDir: string;
  cryptoDllDir: string | undefined;
  cryptoTimeoutMs: number;
}

// Loads KEY=VALUE lines from a .env file into process.env without overriding variables that
// are already set. Supports # comments and optional surrounding quotes.
export function loadDotEnv(file: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!fs.existsSync(file)) {
    return;
  }
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const equals = line.indexOf('=');
    if (equals < 1) {
      continue;
    }
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

function readInteger(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

// Builds the configuration from environment variables. Throws a clear message when something
// required is missing, so the server never starts in an insecure state.
export function loadConfig(env: NodeJS.ProcessEnv = process.env, baseDir: string = process.cwd()): Config {
  const adminApiKey = env.ADMIN_API_KEY ?? '';
  if (adminApiKey.length < 16) {
    throw new Error('ADMIN_API_KEY must be set to a secret of at least 16 characters. See .env.example.');
  }
  return {
    port: readInteger(env, 'PORT', 3001, 1, 65535),
    adminApiKey,
    databasePath: path.resolve(baseDir, env.DATABASE_PATH || './data/ballot.db'),
    dataDir: path.resolve(baseDir, env.DATA_DIR || './data/elections'),
    cryptoBinDir: path.resolve(baseDir, env.CRYPTO_BIN_DIR || '..'),
    cryptoDllDir: env.CRYPTO_DLL_DIR ? path.resolve(baseDir, env.CRYPTO_DLL_DIR) : undefined,
    cryptoTimeoutMs: readInteger(env, 'CRYPTO_TIMEOUT_MS', 120000, 1000, 3600000),
  };
}
