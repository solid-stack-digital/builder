import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { handleMeshUp } from '../../src/commands/mesh/commands/up/handler.js';
import { teardownCompose } from '../../src/core/teardownCompose.js';
import { cleanupFixtures, compileMesh, meshFixture, write } from '../conformance/fixture.js';
import { runtimeMesh, emitCompose, dockerCompose, down } from './runtimeFixture.js';
afterEach(cleanupFixtures);
it('mesh dev dry-run enforces real Dockerfile healthcheck policy',async()=>{
 const root=meshFixture({services:{api:{path:'api'}}},{api:{app:{}}});
 const dockerfile=readFileSync(`${root}/api/Dockerfile`,'utf8').replace(/HEALTHCHECK[^\n]*\n\s*CMD[^\n]*\n/g,'');
 write(root,'api/Dockerfile',dockerfile);
 await expect(handleMeshUp('dev',{projectDir:root,dryRun:true,skipChecks:false})).rejects.toThrow(/Dockerfile Contract/);
});
it.each([false,true])('removes running mesh anonymous volumes and preserves named volumes (saved state: %s)',async saved=>{
 const root=runtimeMesh({services:{frontend:{path:'frontend'},backend:{path:'backend'}}},{frontend:{app:{}},backend:{app:{}}});
 const c=compileMesh('dev',root).compose;c.volumes={persist:{}};c.services.frontend!.volumes!.push('persist:/persist');const file=emitCompose(root,c);
 try {
  const up=dockerCompose(root,file,['up','--build','-d','--wait'],60000);expect(up.status,up.stdout+up.stderr).toBe(0);
  const ids=dockerCompose(root,file,['ps','-q']).stdout.trim().split(/\s+/);
  const inspect=spawnSync('docker',['inspect',...ids],{encoding:'utf8'});expect(inspect.status,inspect.stderr).toBe(0);
  const mounts=JSON.parse(inspect.stdout).flatMap((container:any)=>container.Mounts);
  const anonymous=mounts.filter((mount:any)=>mount.Type==='volume'&&mount.Destination==='/app/node_modules').map((mount:any)=>mount.Name);
  const persistent=mounts.find((mount:any)=>mount.Destination==='/persist').Name;expect(anonymous).toHaveLength(2);
  await teardownCompose(saved?'':stringify(c),root,{removeVolumes:false,...(saved?{projectName:c.name!,anonymousVolumeServices:['backend','frontend']}:{})});
  for(const volume of anonymous) expect(spawnSync('docker',['volume','inspect',volume],{encoding:'utf8'}).status).not.toBe(0);
  expect(spawnSync('docker',['volume','inspect',persistent],{encoding:'utf8'}).status).toBe(0);
 } finally { down(root,file); }
},90000);
