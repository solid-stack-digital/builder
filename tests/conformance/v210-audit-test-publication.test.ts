import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { cleanupFixtures, dep, http, meshFixture, ownerBundle } from './fixture.js';
import { runMeshTestUnit } from '../../src/core/mesh/runners/runMeshTestUnit.js';
import { getMeshJson } from '../../src/core/mesh/getMeshJson.js';
import { checkMeshServices } from '../../src/core/mesh/checkers/checkMeshServices.js';
import type { ComposeDocument } from '../../src/core/composition/types.js';

vi.mock('../../src/core/checkers/checkInfra.js', () => ({ checkInfra: vi.fn() }));

afterEach(() => {
  cleanupFixtures();
  vi.restoreAllMocks();
});

it('V210-007 resolves published app reference before explicit test-stage execution', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          publish: ['app.endpoints.http'],
          env: { SELF_URL: '${api.app.endpoints.http.public_url}' },
        },
      },
    },
    { api: { app: { endpoints: { http: http(3000, { publicPort: 54321 }) } } } },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).resolves.toBe(0);
});

it('emits published port mapping and resolves SELF_URL in debug YAML output', async () => {
  const logs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          publish: ['app.endpoints.http'],
          env: { SELF_URL: '${api.app.endpoints.http.public_url}' },
        },
      },
    },
    { api: { app: { endpoints: { http: http(3000, { publicPort: 54321 }) } } } },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true, debug: true })).resolves.toBe(0);
  const yamlString = logs.find(log => log.includes('services:'));
  expect(yamlString).toBeDefined();
  const parsed = parse(yamlString!) as ComposeDocument;
  const appService = parsed.services.app!;
  expect((appService.environment as Record<string, string>).SELF_URL).toBe('http://127.0.0.1:54321');
  const ports = appService.ports as Array<{ target: number; published: number; host_ip?: string; protocol?: string }>;
  expect(ports.filter(p => p.published === 54321)).toHaveLength(1);
});

it('passes checkMeshServices with includeTestStage: true for published app endpoint self-reference', () => {
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          publish: ['app.endpoints.http'],
          env: { SELF_URL: '${api.app.endpoints.http.public_url}' },
        },
      },
    },
    { api: { app: { endpoints: { http: http(3000, { publicPort: 54321 }) } } } },
  );
  expect(() => checkMeshServices(getMeshJson(root), root, { includeTestStage: true })).not.toThrow();
});

it('resolves published app reference in build.json app env', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          publish: ['app.endpoints.http'],
        },
      },
    },
    {
      api: {
        app: {
          endpoints: { http: http(3000, { publicPort: 54321 }) },
          env: { APP_SELF: '${app.endpoints.http.public_url}' },
        },
      },
    },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).resolves.toBe(0);
});

it('resolves AUTO port in dry-run with validation placeholder without creating port cache', async () => {
  const logs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          publish: ['app.endpoints.http'],
          env: { SELF_URL: '${api.app.endpoints.http.public_url}' },
        },
      },
    },
    { api: { app: { endpoints: { http: http(3000, { publicPort: 'AUTO' }) } } } },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true, debug: true })).resolves.toBe(0);
  const yamlString = logs.find(log => log.includes('services:'));
  expect(yamlString).toBeDefined();
  const parsed = parse(yamlString!) as ComposeDocument;
  const appService = parsed.services.app!;
  const envUrl = (appService.environment as Record<string, string>).SELF_URL!;
  const ports = appService.ports as Array<{ target: number; published: number }>;
  expect(ports).toHaveLength(1);
  const allocatedPort = ports[0]!.published;
  expect(envUrl).toBe(`http://127.0.0.1:${allocatedPort}`);
  expect(existsSync(path.join(root, '.builder'))).toBe(false);
});

it('fails when public reference is used without publish entry even if publicPort is defined', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          env: { SELF_URL: '${api.app.endpoints.http.public_url}' },
        },
      },
    },
    { api: { app: { endpoints: { http: http(3000, { publicPort: 54321 }) } } } },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).rejects.toThrow(
    /Endpoint property public_url requires effective publication/,
  );
});

it('fails publication validation when publish is specified without publicPort', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          publish: ['app.endpoints.http'],
          env: { SELF_URL: '${api.app.endpoints.http.public_url}' },
        },
      },
    },
    { api: { app: { endpoints: { http: http(3000) } } } },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).rejects.toThrow(
    /publicPort/i,
  );
});

it('fails when retained dependency publication is included in explicit test topology', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          publish: ['dependencies.db.endpoints.api'],
        },
      },
    },
    {
      api: { app: {}, dependencies: { db: dep('db.yml', 'owner', 6379, { publicPort: 54321 }) } },
    },
    { 'api/db.yml': ownerBundle() },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).rejects.toThrow(
    /mesh\.test is isolated; dependency endpoints are not materialized and cannot be published/,
  );
});

it('verifies target=test, EXEC_MODE=test, INFRA_MODE=isolated, no dependency containers and no tester in emitted compose', async () => {
  const logs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  const root = meshFixture(
    {
      services: {
        api: {
          path: 'api',
          publish: ['app.endpoints.http'],
        },
      },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    {
      api: {
        app: { endpoints: { http: http(3000, { publicPort: 54321 }) } },
        dependencies: { db: dep('db.yml') },
      },
    },
    {
      'api/db.yml': ownerBundle(),
      'tester.yml': { services: { runner: { image: 'alpine' } } },
    },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true, debug: true })).resolves.toBe(0);
  const yamlString = logs.find(log => log.includes('services:'));
  expect(yamlString).toBeDefined();
  const parsed = parse(yamlString!) as ComposeDocument;
  expect(Object.keys(parsed.services)).toEqual(['app']);
  const app = parsed.services.app!;
  expect((app.build as Record<string, unknown>).target).toBe('test');
  const env = app.environment as Record<string, string>;
  expect(env.EXEC_MODE).toBe('test');
  expect(env.INFRA_MODE).toBe('isolated');
});
