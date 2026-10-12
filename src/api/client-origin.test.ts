import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function healthRequest(production: boolean, configuredUrl: string) {
  vi.stubEnv('PROD', production);
  vi.stubEnv('VITE_API_BASE_URL', configuredUrl);
  vi.stubGlobal('window', { location: { origin: 'https://demo.retail.example' } });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', service: 'Retail Decision Lab API' })));
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  const { api } = await import('./client');
  await api.health();
  return (fetchMock.mock.calls[0][0] as URL).href;
}

describe('API deployment origin', () => {
  it('sends production requests to the public page origin when no API URL is configured', async () => {
    expect(await healthRequest(true, '')).toBe('https://demo.retail.example/health');
  });

  it('preserves an explicit production API URL and removes trailing slashes', async () => {
    expect(await healthRequest(true, 'https://api.retail.example/backend///')).toBe('https://api.retail.example/backend/health');
  });

  it('retains the local backend default during development', async () => {
    expect(await healthRequest(false, '')).toBe('http://127.0.0.1:8000/health');
  });

  it('honors an explicit API URL during development', async () => {
    expect(await healthRequest(false, 'https://api.retail.example')).toBe('https://api.retail.example/health');
  });
});
