import { AddressInfo } from 'net';
import { createApp } from '../../src/app';
import { openDatabase, Db } from '../../src/database/db';
import { FakeCryptoRunner } from './fakeRunner';

export const ADMIN_KEY = 'test-admin-key-0123456789';

export interface TestServer {
  url: string;
  db: Db;
  runner: FakeCryptoRunner;
  close: () => Promise<void>;
  request: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: any }>;
  admin: (method: string, path: string, body?: unknown) => Promise<{ status: number; json: any }>;
}

export async function startTestServer(): Promise<TestServer> {
  const db = openDatabase(':memory:');
  const runner = new FakeCryptoRunner();
  const app = createApp({ db, runner, config: { adminApiKey: ADMIN_KEY, dataDir: '/tmp/ballot-test-unused' } });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request: TestServer['request'] = async (method, path, body, headers = {}) => {
    const response = await fetch(url + path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  };
  return {
    url,
    db,
    runner,
    request,
    admin: (method, path, body) => request(method, path, body, { 'x-admin-key': ADMIN_KEY }),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}
