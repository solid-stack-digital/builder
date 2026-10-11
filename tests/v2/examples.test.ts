import path from "node:path";
import {describe,expect,it} from "vitest";
import {compileServiceComposition} from "../../src/core/composition/compileServiceComposition.js";
import {compileMeshComposition} from "../../src/core/mesh/v2/compileMeshComposition.js";
const root=path.resolve(__dirname,"../../examples");
const services=["backend","largeProject/services/auth-api","largeProject/services/backend",...(["filesystem","mailer","backend","frontend","gateway"].map(name=>`fullstack/services/${name}`))];
describe("repository V2 examples",()=>{
 for(const service of services)it(`compiles ${service} in every stage`,()=>{
  for(const stage of ["dev","prod","test","e2e"] as const)expect(()=>compileServiceComposition(stage,path.join(root,service),{validationMode:true,full:true})).not.toThrow();
 });
 for(const mesh of ["fullstack","largeProject"])it(`compiles ${mesh} mesh in every global stage`,()=>{
  for(const stage of ["dev","prod","e2e"] as const)expect(()=>compileMeshComposition(stage,path.join(root,mesh),{validationMode:true})).not.toThrow();
 });
});
