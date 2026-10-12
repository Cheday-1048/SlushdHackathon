import { defineConfig } from '@playwright/test';

// Browser integration must never inherit a developer's shared Supabase URL.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to a migrated, seeded local rdl_test_* database before browser tests. See README.');
const database = new URL(databaseUrl);
if (!['postgres:', 'postgresql:', 'postgresql+psycopg:'].includes(database.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
  || !database.pathname.startsWith('/rdl_test_')
  || [...database.searchParams.keys()].some((key) => !['sslmode', 'sslrootcert'].includes(key))) {
  throw new Error('Browser tests require a local PostgreSQL rdl_test_* database with no routing overrides.');
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chromium', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run backend', url: 'http://127.0.0.1:8000/health', reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, MIGRATION_DATABASE_URL: '', RDL_DB_POOL_MODE: 'direct',
        RDL_DB_SSLMODE: 'disable', PGHOSTADDR: database.hostname === '[::1]' ? '::1' : '127.0.0.1' } },
    { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  ],
});
