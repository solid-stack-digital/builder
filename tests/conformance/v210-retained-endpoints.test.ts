import { afterEach, expect, it } from 'vitest';
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, meshFixture, ownerBundle } from './fixture.js';

afterEach(cleanupFixtures);

it.each(['dev', 'prod', 'e2e'] as const)('V210-005 makes cross-service retained endpoint reachable in %s', stage => {
  const root = meshFixture({ services: {
    api: { path: 'api' }, client: { path: 'client', env: { DB_HOST: '${api.dependencies.db.endpoints.api.network_host}' } },
  }, tester: { compose: 'tester.yml', service: 'runner' } }, {
    api: { app: {}, dependencies: { db: dep('db.yml') } }, client: { app: {} },
  }, { 'api/db.yml': ownerBundle(), 'tester.yml': { services: { runner: { image: 'alpine', command: ['true'] } } } });
  const result = compileMesh(stage, root);
  const host = env(result.compose.services.client).DB_HOST!;
  expect(host).toBe(result.endpoints.dependencies.api!.db!.api!.networkHost);
  const networks = (name: string) => Object.keys(result.compose.services[name]!.networks as object);
  expect(networks('client').some(network => networks(host).includes(network))).toBe(true);
  expect(result.compose.services.client!.depends_on ?? {}).not.toHaveProperty(host);
  expect(result.compose.services[host]!.ports ?? []).toEqual([]);
});

it('preserves helper privacy while connecting the endpoint owner to mesh', () => {
  const root = meshFixture(
    {
      services: {
        api: { path: 'api' },
        client: { path: 'client', env: { DB_HOST: '${api.dependencies.db.endpoints.api.network_host}' } },
      },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    {
      api: { app: {}, dependencies: { db: dep('db.yml') } },
      client: { app: {} },
    },
    {
      'api/db.yml': ownerBundle({ helper: { image: 'alpine' } }),
      'tester.yml': { services: { runner: { image: 'alpine', command: ['true'] } } },
    },
  );
  const result = compileMesh('prod', root);
  const host = env(result.compose.services.client).DB_HOST!;
  const helperName = Object.keys(result.compose.services).find(name => name.endsWith('--helper'))!;
  expect(helperName).toBeDefined();

  const helperNetworks = result.compose.services[helperName]!.networks as Record<string, unknown>;
  const hostNetworks = result.compose.services[host]!.networks as Record<string, unknown>;

  expect(helperNetworks).not.toHaveProperty('mesh');
  expect(helperNetworks).toHaveProperty('mesh--api');
  expect(hostNetworks).toHaveProperty('mesh');
  expect(hostNetworks).toHaveProperty('mesh--api');
});

it('assigns distinct hosts on mesh for two dependencies using the same source service name without shared-network aliases', () => {
  const root = meshFixture(
    {
      services: {
        api1: { path: 'api1' },
        api2: { path: 'api2' },
        client: {
          path: 'client',
          env: {
            DB1_HOST: '${api1.dependencies.db.endpoints.api.network_host}',
            DB2_HOST: '${api2.dependencies.db.endpoints.api.network_host}',
          },
        },
      },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    {
      api1: { app: {}, dependencies: { db: dep('db.yml') } },
      api2: { app: {}, dependencies: { db: dep('db.yml') } },
      client: { app: {} },
    },
    {
      'api1/db.yml': ownerBundle(),
      'api2/db.yml': ownerBundle(),
      'tester.yml': { services: { runner: { image: 'alpine', command: ['true'] } } },
    },
  );
  const result = compileMesh('prod', root);
  const host1 = env(result.compose.services.client).DB1_HOST!;
  const host2 = env(result.compose.services.client).DB2_HOST!;

  expect(host1).not.toBe(host2);

  const net1 = result.compose.services[host1]!.networks as Record<string, unknown>;
  const net2 = result.compose.services[host2]!.networks as Record<string, unknown>;

  expect(net1).toHaveProperty('mesh');
  expect(net2).toHaveProperty('mesh');
  expect(net1.mesh).toBeNull();
  expect(net2.mesh).toBeNull();
});

it('repeated attachment is idempotent for multiple endpoints on one owner', () => {
  const root = meshFixture(
    {
      services: {
        api: { path: 'api' },
        client: {
          path: 'client',
          env: {
            DB_HTTP: '${api.dependencies.db.endpoints.http.network_host}',
            DB_ADMIN: '${api.dependencies.db.endpoints.admin.network_host}',
          },
        },
      },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    {
      api: {
        app: {},
        dependencies: {
          db: {
            compose: 'db.yml',
            endpoints: {
              http: { service: 'owner', port: 8080, primary: true, scheme: 'http' },
              admin: { service: 'owner', port: 9090, scheme: 'http' },
            },
          },
        },
      },
      client: { app: {} },
    },
    {
      'api/db.yml': ownerBundle(),
      'tester.yml': { services: { runner: { image: 'alpine', command: ['true'] } } },
    },
  );
  const result = compileMesh('prod', root);
  const host = env(result.compose.services.client).DB_HTTP!;
  expect(env(result.compose.services.client).DB_ADMIN).toBe(host);

  const hostNetworks = result.compose.services[host]!.networks as Record<string, unknown>;
  const meshKeys = Object.keys(hostNetworks).filter(k => k === 'mesh');
  expect(meshKeys).toHaveLength(1);
  expect(hostNetworks.mesh).toBeNull();
});

it('preserves custom namespaced dependency networks and aliases while adding mesh', () => {
  const bundleWithNet = {
    services: {
      owner: {
        image: 'alpine',
        healthcheck: { test: ['CMD', 'true'] },
        networks: {
          backend: {
            aliases: ['custom-db-alias'],
          },
        },
      },
    },
    networks: {
      backend: {},
    },
  };

  const root = meshFixture(
    {
      services: {
        api: { path: 'api' },
        client: { path: 'client', env: { DB_HOST: '${api.dependencies.db.endpoints.api.network_host}' } },
      },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    {
      api: { app: {}, dependencies: { db: dep('db.yml') } },
      client: { app: {} },
    },
    {
      'api/db.yml': bundleWithNet,
      'tester.yml': { services: { runner: { image: 'alpine', command: ['true'] } } },
    },
  );
  const result = compileMesh('prod', root);
  const host = env(result.compose.services.client).DB_HOST!;
  const hostNetworks = result.compose.services[host]!.networks as Record<string, unknown>;

  expect(hostNetworks).toHaveProperty('mesh');
  expect(hostNetworks.mesh).toBeNull();
  expect(hostNetworks).toHaveProperty('mesh--api');
  expect(hostNetworks['mesh--api']).toBeNull();

  // Find the namespaced backend network
  const customNetKey = Object.keys(hostNetworks).find(k => k.endsWith('--backend'))!;
  expect(customNetKey).toBeDefined();
  expect((hostNetworks[customNetKey] as any).aliases).toEqual(expect.arrayContaining(['custom-db-alias', 'owner']));
});

it('resolves substituted dependency references to provider app on mesh and omits local bundle', () => {
  const root = meshFixture(
    {
      services: {
        api: { path: 'api', dependencies: { db: 'provider' } },
        provider: { path: 'provider' },
        client: { path: 'client', env: { DB_HOST: '${api.dependencies.db.endpoints.api.network_host}' } },
      },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    {
      api: { app: {}, dependencies: { db: dep('db.yml') } },
      provider: { app: { endpoints: { api: { port: 5432, primary: true, scheme: 'postgres' } } } },
      client: { app: {} },
    },
    {
      'api/db.yml': ownerBundle(),
      'tester.yml': { services: { runner: { image: 'alpine', command: ['true'] } } },
    },
  );
  const result = compileMesh('prod', root);
  const host = env(result.compose.services.client).DB_HOST!;
  expect(host).toBe('provider');
  expect(result.compose.services).toHaveProperty('provider');

  // No local bundle services exist
  const localDbServices = Object.keys(result.compose.services).filter(s => s.includes('svc--api--dep--db'));
  expect(localDbServices).toHaveLength(0);

  // Provider is on mesh
  const providerNetworks = result.compose.services.provider!.networks as Record<string, unknown>;
  expect(providerNetworks).toHaveProperty('mesh');
});

it('preserves private network access for the original consumer app and endpoint owner', () => {
  const root = meshFixture(
    {
      services: {
        api: { path: 'api' },
        client: { path: 'client', env: { DB_HOST: '${api.dependencies.db.endpoints.api.network_host}' } },
      },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    {
      api: { app: {}, dependencies: { db: dep('db.yml') } },
      client: { app: {} },
    },
    {
      'api/db.yml': ownerBundle(),
      'tester.yml': { services: { runner: { image: 'alpine', command: ['true'] } } },
    },
  );
  const result = compileMesh('prod', root);
  const host = env(result.compose.services.client).DB_HOST!;

  const apiNetworks = result.compose.services.api!.networks as Record<string, unknown>;
  const hostNetworks = result.compose.services[host]!.networks as Record<string, unknown>;

  // Both api and owner share the private network mesh--api
  expect(apiNetworks).toHaveProperty('mesh--api');
  expect(hostNetworks).toHaveProperty('mesh--api');

  // Both api and owner are also on mesh
  expect(apiNetworks).toHaveProperty('mesh');
  expect(hostNetworks).toHaveProperty('mesh');
});
