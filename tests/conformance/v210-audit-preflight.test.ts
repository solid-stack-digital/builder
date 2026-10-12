import { afterEach, expect, it, vi } from 'vitest';
import { cleanupFixtures, compileMesh, dep, http, meshFixture, ownerBundle } from './fixture.js';
import { getMeshJson } from '../../src/core/mesh/getMeshJson.js';
import { checkMeshServices } from '../../src/core/mesh/checkers/checkMeshServices.js';

vi.mock('../../src/core/checkers/checkInfra.js', () => ({ checkInfra: vi.fn() }));

afterEach(() => {
  cleanupFixtures();
  vi.clearAllMocks();
});

it('V210-006 accepts ordinary mesh cross-service env in preflight', () => {
  const root = meshFixture(
    {
      services: {
        backend: { path: 'backend' },
        frontend: { path: 'frontend', env: { API_URL: '${backend.app.endpoints.http.network_url}' } },
      },
    },
    {
      backend: { app: { endpoints: { http: http() } } },
      frontend: { app: {} },
    },
  );
  expect(() => compileMesh('dev', root)).not.toThrow();
  expect(() => checkMeshServices(getMeshJson(root), root)).not.toThrow();
});

it('V210-006 accepts retained dependency publication in ordinary preflight', () => {
  const root = meshFixture(
    {
      services: {
        api: { path: 'api', publish: ['dependencies.db.endpoints.api'] },
      },
    },
    {
      api: { app: {}, dependencies: { db: dep('db.yml', 'owner', 6379, { publicPort: 54321 }) } },
    },
    { 'api/db.yml': ownerBundle() },
  );
  expect(() => compileMesh('prod', root)).not.toThrow();
  expect(() => checkMeshServices(getMeshJson(root), root)).not.toThrow();
});

it('exercises explicit test-stage branch when includeTestStage is true', () => {
  const rootCrossEnv = meshFixture(
    {
      services: {
        backend: { path: 'backend' },
        frontend: { path: 'frontend', env: { API_URL: '${backend.app.endpoints.http.network_url}' } },
      },
    },
    {
      backend: { app: { endpoints: { http: http() } } },
      frontend: { app: {} },
    },
  );
  expect(() => checkMeshServices(getMeshJson(rootCrossEnv), rootCrossEnv, { includeTestStage: true })).toThrow(
    /Unknown mesh service reference "backend"/,
  );

  const rootPub = meshFixture(
    {
      services: {
        api: { path: 'api', publish: ['dependencies.db.endpoints.api'] },
      },
    },
    {
      api: { app: {}, dependencies: { db: dep('db.yml', 'owner', 6379, { publicPort: 54321 }) } },
    },
    { 'api/db.yml': ownerBundle() },
  );
  expect(() => checkMeshServices(getMeshJson(rootPub), rootPub, { includeTestStage: true })).toThrow(
    /mesh\.test is isolated; dependency endpoints are not materialized and cannot be published/,
  );
});

it('still rejects unknown endpoint references in ordinary preflight', () => {
  const root = meshFixture(
    {
      services: {
        backend: { path: 'backend' },
        frontend: { path: 'frontend', env: { API_URL: '${backend.app.endpoints.missing.network_url}' } },
      },
    },
    {
      backend: { app: { endpoints: { http: http() } } },
      frontend: { app: {} },
    },
  );
  expect(() => checkMeshServices(getMeshJson(root), root)).toThrow(
    /Referenced endpoint does not exist/,
  );
});
