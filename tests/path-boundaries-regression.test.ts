import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { resolveInsideProject } from '../src/core/config/pathSafety.js';
import { checkDockerfile } from '../src/core/checkers/checkDockerfile.js';
import { checkDockerfileContract } from '../src/core/checkers/checkDockerfileContract.js';
import { cleanupFixtures, fixture, compileService, compileMesh, meshFixture, write } from './conformance/fixture.js';
afterEach(cleanupFixtures);
it('rejects both compiler and checker Dockerfiles that resolve outside the project',()=>{
 const external=fixture(),root=fixture({app:{},dockerfile:'linked'});symlinkSync(path.join(external,'Dockerfile'),path.join(root,'linked'));
 expect(()=>compileService('dev',root)).toThrow(/escapes/);
 expect(()=>checkDockerfile({app:{},dockerfile:'linked'},root)).toThrow(/escapes/);
 expect(()=>checkDockerfileContract({app:{},dockerfile:'linked'},root)).toThrow(/escapes/);
});
it('rejects a directory selected as application Dockerfile',()=>{
 const root=fixture();rmSync(path.join(root,'Dockerfile'));mkdirSync(path.join(root,'Dockerfile'));
 expect(()=>compileService('dev',root)).toThrow(/Dockerfile.*regular file/);
 expect(()=>checkDockerfile({app:{}},root)).toThrow(/Dockerfile.*regular file/);
});
it('rejects missing children of an escaping symlink before checking artifact existence',()=>{
 const external=fixture(),root=fixture();symlinkSync(external,path.join(root,'escape'),'dir');
 expect(()=>resolveInsideProject(root,'escape/not-yet-created/file',{sourceFile:'build.json',configPath:'compose'})).toThrow(/escapes/);
});
it('accepts internal symlinks and a symlinked project root',()=>{
 const root=fixture(),holder=fixture();symlinkSync(path.join(root,'Dockerfile'),path.join(root,'internal'));symlinkSync(root,path.join(holder,'project'),'dir');
 write(root,'build.json',{app:{},dockerfile:'internal'});expect(()=>compileService('dev',root)).not.toThrow();expect(()=>compileService('dev',path.join(holder,'project'))).not.toThrow();
});
it('rejects escaping override Compose symlinks',()=>{
 const external=fixture({}, {'o.yml':{services:{app:{}}}}),root=fixture({app:{},dev:{'override-compose':'o.yml'}});symlinkSync(path.join(external,'o.yml'),path.join(root,'o.yml'));
 expect(()=>compileService('dev',root)).toThrow(/escapes/);
});
it('rejects escaping mesh service paths',()=>{
 const external=fixture(),root=meshFixture({services:{api:{path:'api'}}},{});symlinkSync(external,path.join(root,'api'),'dir');expect(()=>compileMesh('dev',root)).toThrow(/escapes/);
});
it('rejects escaping tester Compose paths',()=>{
 const external=fixture({}, {'t.yml':{services:{runner:{image:'alpine'}}}}),root=meshFixture({services:{api:{path:'api'}},tester:{compose:'t.yml',service:'runner'}},{api:{app:{}}});symlinkSync(path.join(external,'t.yml'),path.join(root,'t.yml'));
 expect(()=>compileMesh('e2e',root)).toThrow(/escapes/);
});
it('rejects missing targets behind dangling escaping symlinks',()=>{
 const external=fixture(),root=fixture();symlinkSync(path.join(external,'future-directory'),path.join(root,'escape'),'dir');
 expect(()=>resolveInsideProject(root,'escape/future.yml',{sourceFile:'build.json',configPath:'compose'})).toThrow(/escapes/);
});
