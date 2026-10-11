import { afterEach, expect, it } from 'vitest';
import { rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { namespaceDependencyCompose } from '../../src/core/composition/namespaceDependencyCompose.js';
import { validateDependencyCompose } from '../../src/core/composition/validateDependencyCompose.js';
import { cleanupFixtures, compileService, compileMesh, fixture, meshFixture, write, dep, ownerBundle } from './fixture.js';
afterEach(cleanupFixtures);
it('preserves override bind and anonymous mounts, rewriting only owned volume sources', () => {
 const root=fixture({app:{},dev:{'override-compose':'o.yml'}},{'o.yml':{services:{app:{volumes:['./src:/src:ro','/app/node_modules','cache:/cache:ro',{type:'volume',source:'cache',target:'/other'},{type:'bind',source:'./src',target:'/long'}]}},volumes:{cache:{}}}});
 expect(compileService('dev',root).compose.services.app?.volumes).toEqual(['./src:/src:ro','/app/node_modules','app-override--dev--volume--cache:/cache:ro',{type:'volume',source:'app-override--dev--volume--cache',target:'/other'},{type:'bind',source:'./src',target:'/long'}]);
});
it('unions mesh and override network attachments',()=>{
 const root=meshFixture({services:{api:{path:'api'}}},{api:{app:{},dev:{'override-compose':'o.yml'}}},{'api/o.yml':{services:{app:{networks:{tooling:{aliases:['tool']}}}},networks:{tooling:{}}}});
 expect(compileMesh('dev',root).compose.services.api?.networks).toMatchObject({mesh:null,'app-override--dev--network--tooling':{aliases:['tool']}});
});
it.each([undefined,'missing.Dockerfile'])('rejects missing Dockerfile %s during compilation',dockerfile=>{
 const root=fixture({app:{},...(dockerfile?{dockerfile}:{})});rmSync(path.join(root,'Dockerfile'),{force:true});
 expect(()=>compileService('dev',root)).toThrow(/Dockerfile/);
});
it('preserves a dependency customized implicit default network',()=>{
 const result=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{services:{owner:{image:'alpine'}},networks:{default:{internal:true}}}}).document;
 expect(result.services['dep--db--owner']?.networks).toEqual({'dep--db--network--default':null});
});
it('rewrites same-file extends, ipc and pid service references',()=>{
 const result=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{services:{base:{image:'alpine'},owner:{extends:{service:'base'},ipc:'service:base',pid:'service:base'}}}}).document;
 expect(result.services['dep--db--owner']).toMatchObject({extends:{service:'dep--db--base'},ipc:'service:dep--db--base',pid:'service:dep--db--base'});
});
it('rejects dependency Compose symlinks escaping the project',()=>{
 const external=fixture({}, {'dep.yml':ownerBundle()});const root=fixture({app:{},dependencies:{db:dep('escape/dep.yml')}});
 symlinkSync(external,path.join(root,'escape'),'dir');expect(()=>compileService('prod',root)).toThrow(/escapes|outside/);
});
it.each(['C:\\','C:/','/','//server/share/'])('rejects host root bind %s',source=>{
 expect(()=>validateDependencyCompose('db',{compose:'d.yml',endpoints:{},env:{},dependsOn:[]},{services:{owner:{volumes:[{type:'bind',source,target:'/host'}]}}},{composePath:'d.yml',stage:'prod'})).toThrow(/host root/);
});
it('namespaces named dependency volumes without changing bind options or Windows drives',()=>{
 const volumes=['cache:/cache:ro','C:\\src:/src:ro','/tmp:/tmp','/anonymous',{type:'volume',source:'cache',target:'/long'}];
 const c=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{services:{owner:{volumes}},volumes:{cache:{}}}}).document;
 expect(c.services['dep--db--owner']?.volumes).toEqual(['dep--db--volume--cache:/cache:ro','C:\\src:/src:ro','/tmp:/tmp','/anonymous',{type:'volume',source:'dep--db--volume--cache',target:'/long'}]);
});
it.each(['C:\\:/host:ro','C:/:/host','//server/share:/host','/tmp/..:/host'])('rejects short root bind %s',mount=>{
 expect(()=>validateDependencyCompose('db',{compose:'d.yml',endpoints:{},env:{},dependsOn:[]},{services:{owner:{volumes:[mount]}}},{composePath:'d.yml',stage:'prod'})).toThrow(/host root/);
});
it.each([{ipc:'service:missing'},{pid:'service:missing'},{extends:{service:'missing'}},{extends:{file:'elsewhere.yml',service:'base'}}])('rejects unresolved or unsupported service references %j',service=>{
 expect(()=>validateDependencyCompose('db',{compose:'d.yml',endpoints:{},env:{},dependsOn:[]},{services:{owner:service}},{composePath:'d.yml',stage:'prod'})).toThrow(/reference|extends/);
});
it('does not attach an implicit default when network_mode owns networking',()=>{
 const c=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{services:{owner:{network_mode:'none'}},networks:{default:{internal:true}}}}).document;
 expect(c.services['dep--db--owner']?.networks).toBeUndefined();
});
it('preserves narrower Windows bind sources',()=>{
 expect(()=>validateDependencyCompose('db',{compose:'d.yml',endpoints:{},env:{},dependsOn:[]},{services:{owner:{volumes:['C:\\data:/data:ro',{type:'bind',source:'C:/data',target:'/data'}]}}},{composePath:'d.yml',stage:'prod'})).not.toThrow();
});
it('preserves inherited explicit networking when a default network also exists',()=>{
 const c=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{services:{base:{networks:['internal']},owner:{extends:{service:'base'}}},networks:{default:{internal:true},internal:{}}}}).document;
 expect(c.services['dep--db--base']?.networks).toEqual(['dep--db--network--internal']);expect(c.services['dep--db--owner']?.networks).toBeUndefined();expect(c.services['dep--db--owner']?.extends).toEqual({service:'dep--db--base'});
});
