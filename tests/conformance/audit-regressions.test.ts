import { afterEach, expect, it } from 'vitest';
import { rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { namespaceDependencyCompose } from '../../src/core/composition/namespaceDependencyCompose.js';
import { rebaseComposePaths } from '../../src/core/composition/composePaths.js';
import { validateDependencyCompose } from '../../src/core/composition/validateDependencyCompose.js';
import { cleanupFixtures, compileService, compileMesh, fixture, meshFixture, write, dep, ownerBundle } from './fixture.js';
afterEach(cleanupFixtures);
it('preserves override bind and anonymous mounts, rewriting only owned volume sources', () => {
 const root=fixture({app:{},dev:{'override-compose':'o.yml'}},{'o.yml':{services:{app:{volumes:['./src:/src:ro','/app/node_modules','cache:/cache:ro',{type:'volume',source:'cache',target:'/other'},{type:'bind',source:'./src',target:'/long'}]}},volumes:{cache:{}}}});
 expect(compileService('dev',root).compose.services.app?.volumes).toEqual(['./src:/src:ro','/app/node_modules','app-override--dev--volume--cache:/cache:ro',{type:'volume',source:'app-override--dev--volume--cache',target:'/other'},{type:'bind',source:'./src',target:'/long'}]);
});
it('unions mesh and override network attachments',()=>{
 const root=meshFixture({services:{api:{path:'api'}}},{api:{app:{},dev:{'override-compose':'o.yml'}}},{'api/o.yml':{services:{app:{networks:{tooling:{aliases:['tool']}}}},networks:{tooling:{}}}});
 expect(compileMesh('dev',root).compose.services.api?.networks).toMatchObject({mesh:null,'svc--api--app-override--dev--network--tooling':{aliases:['tool']}});
});
it.each([undefined,'missing.Dockerfile'])('rejects missing Dockerfile %s during compilation',dockerfile=>{
 const root=fixture({app:{},...(dockerfile?{dockerfile}:{})});rmSync(path.join(root,'Dockerfile'),{force:true});
 expect(()=>compileService('dev',root)).toThrow(/Dockerfile/);
});
it('preserves a dependency customized implicit default network',()=>{
 const result=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{services:{owner:{image:'alpine'}},networks:{default:{internal:true}}}}).document;
 expect(result.services['dep--db--owner']?.networks).toEqual({'dep--db--network--default':{aliases:['owner']}});
});
it('rewrites ipc and pid service references',()=>{
 const result=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{services:{base:{image:'alpine'},owner:{ipc:'service:base',pid:'service:base'}}}}).document;
 expect(result.services['dep--db--owner']).toMatchObject({ipc:'service:dep--db--base',pid:'service:dep--db--base'});
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
it('rejects dependency Compose extends until effective semantics are supported',()=>{
 expect(()=>validateDependencyCompose('db',{compose:'d.yml',endpoints:{},env:{},dependsOn:[]},{services:{base:{networks:['internal']},owner:{extends:{service:'base'}}},networks:{internal:{}}},{composePath:'d.yml',stage:'prod'})).toThrow(/extends/);
});

import { env } from './fixture.js';

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A01: preserves raw Compose interpolation',()=>{
 const root=fixture({app:{},dev:{'override-compose':'o.yml'}},{'o.yml':{services:{app:{environment:{API_TOKEN:'${API_TOKEN}'}}}}});
 expect(env(compileService('dev',root).compose.services.app).API_TOKEN).toBe('${API_TOKEN}');
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A02: preserves bare dependency environment',()=>{
 const previous=process.env.OPTIONAL_TOKEN;delete process.env.OPTIONAL_TOKEN;
 try {const root=fixture({app:{},dependencies:{db:dep('d.yml')}},{'d.yml':ownerBundle({owner:{image:'alpine',environment:['OPTIONAL_TOKEN'],healthcheck:{test:['CMD','true']}}})});
 expect(compileService('prod',root).compose.services['dep--db--owner']?.environment).toEqual({OPTIONAL_TOKEN:null});
 }finally{if(previous===undefined)delete process.env.OPTIONAL_TOKEN;else process.env.OPTIONAL_TOKEN=previous;}
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it.each([
 ['root include',{services:{app:{}},include:['other.yml']}],
 ['profiles',{services:{app:{profiles:['optional']}}}],
 ['extends',{services:{app:{extends:{service:'base'}}}}],
 ['env_file',{services:{app:{env_file:['custom.env']}}}],
 ['unsupported build key',{services:{app:{build:{args:{OK:'1'},ssh:['default']}}}}],
])('audit gate A03: rejects override %s',(_name,override)=>{
 const root=fixture({app:{},dev:{'override-compose':'o.yml'}},{'o.yml':override});
 expect(()=>compileService('dev',root)).toThrow(/override|unsupported|cannot/i);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A04: isolates override resources per mesh service',()=>{
 const override={services:{app:{volumes:['cache:/cache']}},volumes:{cache:{}}};
 const build={app:{},dev:{'override-compose':'o.yml'}};
 const root=meshFixture({services:{a:{path:'a'},b:{path:'b'}}},{a:build,b:build},{'a/o.yml':override,'b/o.yml':override});
 const names=Object.keys(compileMesh('dev',root).compose.volumes??{}).filter(n=>n.includes('override')&&n.includes('cache'));
 expect(names).toHaveLength(2);expect(new Set(names).size).toBe(2);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A05: distinguishes delimiter-ambiguous identities',()=>{
 const healthy={image:'alpine',healthcheck:{test:['CMD','true']}};
 const root=fixture({app:{},dependencies:{'a--b':dep('x.yml','c',1001),a:dep('y.yml','b--c',1002)}},{'x.yml':{services:{c:healthy}},'y.yml':{services:{'b--c':healthy}}});
 const result=compileService('prod',root);const first=result.endpoints.dependencies['a--b']?.api?.networkHost;const second=result.endpoints.dependencies.a?.api?.networkHost;
 expect(first).toBeDefined();expect(second).toBeDefined();expect(first).not.toBe(second);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A06: applies dependency env to exact bundle only',()=>{
 const root=meshFixture({services:{api:{path:'api'}}},{api:{app:{},dependencies:{a:{...dep('a.yml','owner',1001),env:{ONLY_A:'yes'}},'a--b':dep('ab.yml','owner',1002)}}},{'api/a.yml':ownerBundle(),'api/ab.yml':ownerBundle()});
 const result=compileMesh('prod',root);const a=result.endpoints.dependencies.api?.a?.api?.networkHost!;const ab=result.endpoints.dependencies.api?.['a--b']?.api?.networkHost!;
 expect(env(result.compose.services[a]).ONLY_A).toBe('yes');expect(env(result.compose.services[ab]).ONLY_A).toBeUndefined();
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A07: avoids networks on namespace-sharing helpers',()=>{
 const root=meshFixture({services:{api:{path:'api'}}},{api:{app:{},dependencies:{db:dep('d.yml')}}},{'api/d.yml':ownerBundle({helper:{image:'alpine',network_mode:'service:owner'}})});
 const helper=Object.values(compileMesh('prod',root).compose.services).find(s=>String(s.network_mode??'').startsWith('service:'));
 expect(helper).toBeDefined();expect(helper!.networks).toBeUndefined();
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A08: rejects malformed healthcheck',()=>{
 expect(()=>validateDependencyCompose('db',{...dep('d.yml'),env:{},dependsOn:[]},{services:{owner:{image:'alpine',healthcheck:{test:123}}}},{composePath:'d.yml',stage:'prod'})).toThrow(/healthcheck/i);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A09: rejects conditional atomic bundles',()=>{
 const root=fixture({app:{},dependencies:{db:dep('d.yml')}},{'d.yml':ownerBundle({owner:{image:'alpine',profiles:['optional'],healthcheck:{test:['CMD','true']}}})});
 expect(()=>compileService('prod',root)).toThrow(/profiles|atomic/i);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A10: rejects inherited endpoint-owner networking',()=>{
 const root=fixture({app:{},dependencies:{db:dep('d.yml')}},{'d.yml':{services:{base:{image:'alpine',network_mode:'none'},owner:{extends:{service:'base'},healthcheck:{test:['CMD','true']}}}}});
 expect(()=>compileService('prod',root)).toThrow(/extends|network_mode|endpoint owner/i);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it.each(['https://github.com/acme/example.git','http://example.com/context.tar','ssh://git@example.com/repo','git://example.com/repo','git@github.com:org/repo.git'])('audit gate A11: preserves remote context %s',context=>{
 for(const build of [context,{context}]){
 const result=rebaseComposePaths({services:{owner:{build}}},'/project/dependencies/d.yml','/project');
 expect(typeof result.services.owner!.build==='string'?result.services.owner!.build:(result.services.owner!.build as any).context).toBe(context);
 }
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A12: rewrites dependency build secrets',()=>{
 const result=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{services:{owner:{build:{context:'.',secrets:['npm-token']}}},secrets:{'npm-token':{file:'./token.txt'}}}});
 expect((result.document.services[result.serviceNameMap.get('owner')!]!.build as any).secrets).toEqual([result.secretNameMap.get('npm-token')]);
});
// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A12: includes tester build-only secrets',()=>{
 const root=meshFixture({services:{gateway:{path:'gateway'}},tester:{compose:'t.yml',service:'runner'}},{gateway:{app:{}}},{'t.yml':{services:{runner:{build:{context:'.',secrets:['token']}}},secrets:{token:{file:'./token.txt'}}},'token.txt':'secret'});
 const result=compileMesh('e2e',root);const names=Object.keys(result.compose.secrets??{});
 expect(names).toHaveLength(1);expect((result.compose.services[result.testerServiceName!]!.build as any).secrets).toEqual(names);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A13: preserves tester array dependency edges',()=>{
 const root=meshFixture({services:{gateway:{path:'gateway'}},tester:{compose:'t.yml',service:'runner'}},{gateway:{app:{}}},{'t.yml':{services:{runner:{image:'alpine',depends_on:['browser']},browser:{image:'alpine'}}}});
 const result=compileMesh('e2e',root);const deps=result.compose.services[result.testerServiceName!]!.depends_on as Record<string,unknown>;const browser=Object.keys(result.compose.services).find(n=>n.includes('browser'));
 expect(browser).toBeDefined();expect(deps).toHaveProperty(browser!);expect(deps.gateway).toEqual({condition:'service_healthy'});
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it.each([{base:'service:helper'},['base=service:helper']])('audit gate A12 additional contexts: rejects unsupported service build references %j',additional_contexts=>{
 const root=fixture({app:{},dependencies:{db:dep('d.yml')}},{'d.yml':ownerBundle({owner:{build:{context:'.',additional_contexts},healthcheck:{test:['CMD','true']}},helper:{image:'alpine'}})});
 expect(()=>compileService('prod',root)).toThrow(/additional_contexts/);
});
// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A12 additional contexts: rejects tester service build references',()=>{
 const root=meshFixture({services:{gateway:{path:'gateway'}},tester:{compose:'t.yml',service:'runner'}},{gateway:{app:{}}},{'t.yml':{services:{runner:{build:{context:'.',additional_contexts:{base:'service:helper'}}},helper:{image:'alpine'}}}});
 expect(()=>compileMesh('e2e',root)).toThrow(/additional_contexts/);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A01 control: mesh preserves environment provenance and precedence', () => {
 const root=meshFixture({services:{api:{path:'api',env:{WINNER:'mesh'}}}},{
  api:{app:{env:{BASE:'build',WINNER:'build'}},dev:{'override-compose':'o.yml'}},
 },{
  'api/o.yml':{services:{app:{environment:{TOKEN:'${API_TOKEN}',WINNER:'override',PASSTHROUGH:null}}}},
 });
 expect(env(compileMesh('dev',root).compose.services.api)).toMatchObject({
  BASE:'build',WINNER:'mesh',TOKEN:'${API_TOKEN}',PASSTHROUGH:null,EXEC_MODE:'dev',INFRA_MODE:'integrated',
 });
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it.each([['OPTIONAL_TOKEN'],{OPTIONAL_TOKEN:null}])('audit gate A02 control: Builder overlay wins over pass-through %j',environment=>{
 const root=fixture({app:{},dependencies:{db:{...dep('d.yml'),env:{OPTIONAL_TOKEN:'builder-value'}}}},{
  'd.yml':ownerBundle({owner:{image:'alpine',environment,healthcheck:{test:['CMD','true']}}}),
 });
 const result=compileService('prod',root);
 expect(env(result.compose.services[result.endpoints.dependencies.db!.api!.networkHost]).OPTIONAL_TOKEN).toBe('builder-value');
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A05 control: shared allocator isolates cross-fragment and app name collisions deterministically',()=>{
 const root=meshFixture({services:{
  a:{path:'a'},'a--dep--b':{path:'b'},'svc--a--dep--b--dep--c--owner':{path:'c'},
 }},{
  a:{app:{},dependencies:{'b--dep--c':dep('d.yml')}},
  b:{app:{},dependencies:{c:dep('d.yml')}},
  c:{app:{}},
 },{'a/d.yml':ownerBundle(),'b/d.yml':ownerBundle()});
 const result=compileMesh('prod',root);
 const first=result.endpoints.dependencies.a!['b--dep--c']!.api!.networkHost;
 const second=result.endpoints.dependencies['a--dep--b']!.c!.api!.networkHost;
 expect(new Set([first,second,'svc--a--dep--b--dep--c--owner']).size).toBe(3);
 expect(Object.keys(result.compose.services)).toHaveLength(5);
 expect(compileMesh('prod',root).compose).toEqual(result.compose);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it.each([undefined,{disable:true},{test:[]},{test:['NONE']},{test:123},{test:['CMD']},{test:['CMD',123]}])(
 'audit gate A08 control: rejects invalid healthcheck %j',healthcheck=>{
 expect(()=>validateDependencyCompose('db',{...dep('d.yml'),env:{},dependsOn:[]},{
  services:{owner:{image:'alpine',healthcheck}},
 },{composePath:'d.yml',stage:'prod'})).toThrow(/healthcheck/i);
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it.each([{test:'curl -f http://localhost/health'},{test:['CMD','true']},{test:['CMD-SHELL','test -f /tmp/ready']}])(
 'audit gate A08 control: accepts valid healthcheck %j',healthcheck=>{
 expect(()=>validateDependencyCompose('db',{...dep('d.yml'),env:{},dependsOn:[]},{
  services:{owner:{image:'alpine',healthcheck}},
 },{composePath:'d.yml',stage:'prod'})).not.toThrow();
});

// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
it('audit gate A12 control: preserves long build secret options while rewriting source',()=>{
 const result=namespaceDependencyCompose({dependencyKey:'db',namespacePrefix:'dep--db',document:{
  services:{owner:{build:{context:'.',secrets:[{source:'token',target:'npm-token',uid:'1000',mode:256}]}}},
  secrets:{token:{file:'./token.txt'}},
 }});
 expect((result.document.services[result.serviceNameMap.get('owner')!]!.build as any).secrets)
  .toEqual([{source:result.secretNameMap.get('token'),target:'npm-token',uid:'1000',mode:256}]);
});

it("AUDIT-B04 rejects absolute in-project dependency compose path", () => {
 const root=fixture({app:{},dependencies:{db:dep("d.yml")}},{"d.yml":ownerBundle()});
 write(root,"build.json",{app:{},dependencies:{db:dep(path.join(root,"d.yml"))}});
 expect(()=>compileService("prod",root)).toThrow(/relative|absolute/i);
});

it("AUDIT-B04 rejects absolute in-project Dockerfile path", () => {
 const root=fixture({app:{}});
 write(root,"build.json",{app:{},dockerfile:path.join(root,"Dockerfile")});
 expect(()=>compileService("dev",root)).toThrow(/relative|absolute/i);
});

it("AUDIT-B04 rejects absolute in-project mesh service path", () => {
 const root=meshFixture({services:{api:{path:"api"}}},{api:{app:{}}});
 write(root,"mesh.json",{services:{api:{path:path.join(root,"api")}}});
 expect(()=>compileMesh("dev",root)).toThrow(/relative|absolute/i);
});

it("AUDIT-B04 rejects absolute in-project override-compose path", () => {
 const root=fixture({app:{},dev:{"override-compose":"o.yml"}},{"o.yml":{services:{app:{}}}});
 write(root,"build.json",{app:{},dev:{"override-compose":path.join(root,"o.yml")}});
 expect(()=>compileService("dev",root)).toThrow(/relative|absolute/i);
});

it("AUDIT-B04 rejects absolute in-project tester Compose path", () => {
 const root=meshFixture(
  {services:{api:{path:"api"}},tester:{compose:"t.yml",service:"runner"}},
  {api:{app:{}}},
  {"t.yml":{services:{runner:{image:"alpine"}}}},
 );
 write(root,"mesh.json",{services:{api:{path:"api"}},tester:{compose:path.join(root,"t.yml"),service:"runner"}});
 expect(()=>compileMesh("e2e",root)).toThrow(/relative|absolute/i);
});

it("AUDIT-B07 rebases map-form local build.additional_contexts", () => {
 const result=rebaseComposePaths({
  services:{owner:{build:{context:".",additional_contexts:{fixtures:"../fixtures"}}}},
 },"/project/infra/dependency.yml","/project");
 expect((result.services.owner!.build as any).additional_contexts.fixtures).toBe("./fixtures");
});

it("AUDIT-B07 rebases list-form local build.additional_contexts", () => {
 const result=rebaseComposePaths({
  services:{owner:{build:{context:".",additional_contexts:["fixtures=../fixtures"]}}},
 },"/project/infra/dependency.yml","/project");
 expect((result.services.owner!.build as any).additional_contexts).toEqual(["fixtures=./fixtures"]);
});

it.each(["https://github.com/org/repo.git","docker-image://alpine:3.20","git@github.com:org/repo.git"])(
 "AUDIT-B07 preserves remote additional context %s",value=>{
  const result=rebaseComposePaths({
   services:{owner:{build:{context:".",additional_contexts:{remote:value}}}},
  },"/project/infra/dependency.yml","/project");
  expect((result.services.owner!.build as any).additional_contexts.remote).toBe(value);
 },
);

it("AUDIT-B10 adds original dependency service aliases only to dependency-owned networks", () => {
 const root=meshFixture(
  {services:{api:{path:"api"}}},
  {api:{app:{},dependencies:{dbslot:{compose:"d.yml",endpoints:{ready:{service:"owner",port:3000,primary:true}}}}}},
  {"api/d.yml":{services:{owner:{image:"alpine",healthcheck:{test:["CMD","true"]}},db:{image:"alpine"}}}},
 );
 const result=compileMesh("prod",root);
 const owner=result.compose.services[result.endpoints.dependencies.api!.dbslot!.ready!.networkHost]!;
 const dependencyDefault=Object.keys(result.compose.networks??{}).find(name=>name.includes("network--default"))!;
 const attached=owner.networks as Record<string,any>;
 expect(attached[dependencyDefault].aliases).toContain("owner");
 expect(attached["mesh--api"]).toBeNull();
 expect(attached["mesh"]).toBeUndefined();
});
