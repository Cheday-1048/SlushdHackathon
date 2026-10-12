import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('API client', () => {
  it('reports malformed JSON as a response error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Not JSON</html>')));
    await expect(api.health()).rejects.toThrow('invalid JSON');
  });

  it('rejects a success response with an invalid contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'pretend' }))));
    await expect(api.health()).rejects.toThrow('invalid response');
  });

  it('surfaces a structured server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'internal_error', message: 'Please retry.' }), { status: 500 })));
    await expect(api.dashboardSummary()).rejects.toThrow('Please retry.');
  });

  it('reports HTTP errors without requiring a JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));
    await expect(api.health()).rejects.toThrow('HTTP 502');
  });

  it('times out a hung request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const assertion = expect(api.health()).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });
});
