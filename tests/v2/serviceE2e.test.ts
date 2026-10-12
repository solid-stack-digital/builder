import { describe, expect, it } from "vitest";
import { assertTesterReferencesArePublic } from "../../src/core/config/references.js";
import { validateAndPrepareAppOverride } from "../../src/core/composition/validateOverrideCompose.js";
describe("service E2E and app override",()=>{
 it("allows public tester refs and rejects network refs",()=>{expect(()=>assertTesterReferencesArePublic({URL:"${app.endpoints.http.public_url}"},"build",{sourceFile:"build.json",configPath:"tester.env",stage:"e2e",composition:"service"})).not.toThrow();expect(()=>assertTesterReferencesArePublic({URL:"${app.endpoints.http.network_url}"},"build",{sourceFile:"build.json",configPath:"tester.env",stage:"e2e",composition:"service"})).toThrow();});
 it("rejects override endpoint and lifecycle ownership while retaining build args",()=>{expect(()=>validateAndPrepareAppOverride({services:{app:{ports:["1:1"]}}} as any,{file:"override.yml",stage:"dev",expectedBuildContext:".",buildContextBaseDir:process.cwd()})).toThrow();const prepared=validateAndPrepareAppOverride({services:{app:{build:{args:{FLAG:"yes"}},environment:{A:"b"},healthcheck:{interval:"5s"}}}} as any,{file:"override.yml",stage:"dev",expectedBuildContext:".",buildContextBaseDir:process.cwd()});expect((prepared.app.build as any).args.FLAG).toBe("yes");expect(prepared.app.environment).toEqual({A:"b"});});
});
