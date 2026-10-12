import { afterEach, expect, it } from 'vitest';
import { cleanupFixtures, compileService, compileMesh, fixture, meshFixture, ownerBundle, dep, http } from './fixture.js';
afterEach(cleanupFixtures);
const local=()=>compileService('prod',fixture({app:{},dependencies:{db:dep()}},{'dependency.yml':ownerBundle()}));
it("LIFE-031 blocks app on local owner health, with no started fallback",()=>{
 expect(local().compose.services.app?.depends_on).toEqual({'dep--db--owner':{condition:'service_healthy'}});
});
it("LIFE-032 retains the enabled owner healthcheck used by app readiness",()=>{
 const c=local();expect(c.compose.services['dep--db--owner']?.healthcheck).toEqual({test:['CMD','true']});
 expect(c.compose.services.app?.depends_on).toEqual({'dep--db--owner':{condition:'service_healthy'}});
});
it("LIFE-033 gates dependent mesh app on backend health",()=>{
 const c=compileMesh('prod',meshFixture({services:{backend:{path:'backend'},gateway:{path:'gateway',dependsOn:['backend']}}},{backend:{app:{endpoints:{http:http()}}},gateway:{app:{}}}));
 expect(c.compose.services.gateway?.depends_on).toEqual({backend:{condition:'service_healthy'}});
});
it("LIFE-034 gates global tester on every effective app",()=>{
 const root=meshFixture({services:{a:{path:'a'},b:{path:'b'}},tester:{compose:'t.yml',service:'runner'}},{a:{app:{}},b:{app:{}}},{'t.yml':{services:{runner:{image:'alpine'}}}});
 const c=compileMesh('e2e',root);expect(c.compose.services[c.testerServiceName!]?.depends_on).toEqual({a:{condition:'service_healthy'},b:{condition:'service_healthy'}});
});
it("LIFE-035 gates service tester on app readiness",()=>{
 expect(compileService('e2e',fixture()).compose.services.tester?.depends_on).toEqual({app:{condition:'service_healthy'}});
});
