import path from "node:path";
import {describe,expect,it} from "vitest";
import {compileServiceComposition} from "../../src/core/composition/compileServiceComposition.js";
import {compileMeshComposition} from "../../src/core/mesh/v2/compileMeshComposition.js";
const root=path.resolve(__dirname,"../fixtures/v2/invalid");
describe("V2 invalid configuration fixtures",()=>{
 for(const [name,error] of [["legacy-build-port","Unrecognized"],["invalid-primary","primary"],["missing-dependency-owner","owner"],["owner-without-health","healthcheck"],["dependency-compose-ports","ports"],["dependency-cycle","cycle"],["unpublished-public-reference","public"]] as const){
  it(`rejects ${name}`,()=>expect(()=>compileServiceComposition(name==="unpublished-public-reference"?"e2e":"prod",path.join(root,name),{validationMode:true})).toThrow(new RegExp(error,"i")));
 }
 for(const [name,error] of [["legacy-mesh-preserve-port","Unrecognized"],["mesh-lifecycle-cycle","cycle"],["provider-missing-used-endpoint","endpoint"],["tester-network-reference","public"]] as const){
  it(`rejects ${name}`,()=>expect(()=>compileMeshComposition("e2e",path.join(root,name),{validationMode:true,allowMissingTester:true})).toThrow(new RegExp(error,"i")));
 }
});
