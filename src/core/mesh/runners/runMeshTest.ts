import pc from "picocolors";
import type { MeshRunOptions } from "../MeshRunOptions.js";
import { runMeshServiceTests } from "./runMeshServiceTests.js";
import { runMeshTestE2e } from "./runMeshTestE2e.js";
import { compileMeshComposition } from "../compileMeshComposition.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import type { TestRuntimeAdapters } from "../../runners/runTest.js";
import type { E2eRuntimeAdapters } from "../../runners/runTestE2e.js";

export interface MeshTestRuntimeAdapters { source?:TestRuntimeAdapters; global?:E2eRuntimeAdapters }
export async function runMeshTest(options:MeshRunOptions={},runtime:MeshTestRuntimeAdapters={}):Promise<number>{
 compileMeshComposition("e2e",resolveProjectDir(options.projectDir),{validationMode:true});
 console.log(pc.bold(pc.blue("\n========================================\nMESH TEST PIPELINE\n========================================\n")));
 console.log(pc.bold(pc.blue("[1/2] ROOT SERVICE TEST LIFECYCLES")));
 const serviceStatus=await runMeshServiceTests(options,runtime.source);
 if(serviceStatus!==0)return serviceStatus;
 console.log(pc.bold(pc.blue("[2/2] GLOBAL MESH E2E")));
 return runMeshTestE2e(options,runtime.global);
}
