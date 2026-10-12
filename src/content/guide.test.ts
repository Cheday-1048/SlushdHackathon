import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { architecture, capabilities, features, presentation, scenario, sections, workflow } from './guide';
import { facts } from './scenario-data';

// Vitest runs from the repository root.
const exists = (path: string) => existsSync(resolve(process.cwd(), path));
const unique = (values: string[]) => new Set(values).size === values.length;

describe('guide content', () => {
  it('only claims capabilities that the repository evidences', () => {
    for (const item of capabilities) {
      if (item.status === 'planned') {
        expect(item.evidence, `${item.id} is planned and must not cite evidence`).toBeUndefined();
        continue;
      }
      expect(item.evidence?.length, `${item.id} needs evidence`).toBeGreaterThan(0);
      for (const path of item.evidence ?? []) expect(exists(path), `${item.id}: ${path} must exist`).toBe(true);
    }
  });

  it('lists only API paths that the published OpenAPI contract contains', () => {
    const openapi = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/openapi.json'), 'utf-8')) as { paths: Record<string, unknown> };
    const endpoints = capabilities.flatMap((item) => item.endpoints ?? []);
    expect(endpoints.length).toBeGreaterThan(0);
    for (const path of endpoints) expect(Object.keys(openapi.paths), path).toContain(path);
  });

  it('keeps identifiers unique and the lists complete', () => {
    expect(unique(capabilities.map((item) => item.id))).toBe(true);
    expect(unique(workflow.map((stage) => stage.id))).toBe(true);
    expect(unique(features.map((feature) => feature.id))).toBe(true);
    expect(unique(scenario.steps.map((step) => step.id))).toBe(true);
    expect(workflow).toHaveLength(7);
    expect(features).toHaveLength(6);
    expect(scenario.steps).toHaveLength(7);
    expect(sections).toHaveLength(6);
  });

  it('keeps planned modules free of MVP claims and available modules backed by MVP lines', () => {
    for (const feature of features) {
      if (feature.status === 'planned') expect(feature.mvp, feature.title).toHaveLength(0);
      else expect(feature.mvp.length, feature.title).toBeGreaterThan(0);
    }
    expect(features.filter((feature) => feature.status === 'available').map((feature) => feature.id)).toEqual(['dashboard', 'analytics', 'simulation', 'arena', 'optimizer', 'assistant']);
  });

  it('follows the requested presentation order', () => {
    expect(presentation.map((step) => step.id)).toEqual(['overview', 'problem', 'solution', 'workflow', 'features', 'scenario', 'vision']);
  });

  it('grounds the scenario in the demo data and keeps the planned step honest', () => {
    expect(facts.revenueChangePct).toBeGreaterThan(0);
    expect(facts.marginAfter).toBeLessThan(facts.marginBefore);
    const status = Object.fromEntries(scenario.steps.map((step) => [step.id, step.status]));
    expect(status).toMatchObject({ see: 'available', dig: 'available', explain: 'planned', simulate: 'available', compare: 'available', optimize: 'available', decide: 'partial' });
  });

  it('only lists the capabilities that exist as planned when no code exists for them', () => {
    const planned = capabilities.filter((item) => item.status === 'planned').map((item) => item.id);
    expect(planned).toEqual(expect.arrayContaining(['ai-causes', 'live-ab', 'live-ai', 'own-data', 'auth', 'hosting']));
    for (const id of ['simulation', 'arena', 'optimizer', 'assistant']) expect(planned).not.toContain(id);
  });

  it('describes the planned architecture only as unspecified design intent', () => {
    const planned = architecture.nodes.filter((node) => node.status === 'planned');
    expect(planned).toHaveLength(1);
    expect(planned[0].note).toMatch(/not a specification/i);
    for (const node of architecture.nodes.filter((item) => item.status === 'available')) expect(node.note).toBeUndefined();
  });
});
