import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { teardownCompose } from '../src/core/teardownCompose.js';
import { cleanupFixtures, compileMesh, meshFixture } from './conformance/fixture.js';
vi.mock('node:child_process',()=>({spawn:vi.fn(()=>{const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),kill:vi.fn()});queueMicrotask(()=>child.emit('close',0));return child;})}));
afterEach(()=>{cleanupFixtures();vi.clearAllMocks();});
it('cleans mesh anonymous volumes using generated service names',async()=>{
 const root=meshFixture({services:{frontend:{path:'frontend'},backend:{path:'backend'}}},{frontend:{app:{}},backend:{app:{}}});
 await teardownCompose(stringify(compileMesh('dev',root).compose),root,{removeVolumes:false});
 const calls=vi.mocked(spawn).mock.calls.map(call=>call[1] as string[]);
 expect(calls.find(args=>args.includes('rm'))?.slice(-2)).toEqual(['backend','frontend']);
 expect(calls.find(args=>args.includes('rm'))).toContain('-s');
 expect(calls.find(args=>args.includes('down'))).not.toContain('-v');
});
it('preserves named volumes and skips anonymous cleanup when none exist',async()=>{
 await teardownCompose('services:\n  db:\n    image: redis\n    volumes: ["data:/data", "./src:/src"]\nvolumes:\n  data: {}\n',process.cwd(),{removeVolumes:false});
 expect(vi.mocked(spawn).mock.calls).toHaveLength(1);expect(vi.mocked(spawn).mock.calls[0]?.[1]).toContain('down');expect(vi.mocked(spawn).mock.calls[0]?.[1]).not.toContain('-v');
});
it('uses persisted anonymous mount owners when YAML is unavailable',async()=>{
 await teardownCompose('',process.cwd(),{projectName:'mesh-dev',removeVolumes:false,anonymousVolumeServices:['frontend','backend']});
 expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(['compose','-p','mesh-dev','rm','-s','-f','-v','frontend','backend']);
});
it('uses down -v when removal of all volumes was requested',async()=>{
 await teardownCompose('services: {app: {volumes: [/app/node_modules]}}',process.cwd(),{removeVolumes:true});
 expect(vi.mocked(spawn).mock.calls).toHaveLength(1);expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['down','-v']));
});
