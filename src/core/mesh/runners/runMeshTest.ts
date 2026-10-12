import pc from "picocolors";
import type { MeshRunOptions } from "../MeshRunOptions.js";
import { runMeshServiceTests } from "./runMeshServiceTests.js";
import { runMeshTestE2e } from "./runMeshTestE2e.js";

export async function runMeshTest(options:MeshRunOptions={}):Promise<number>{
 console.log(pc.bold(pc.blue("\n========================================\nMESH TEST PIPELINE\n========================================\n")));
 console.log(pc.bold(pc.blue("[1/2] ROOT SERVICE TEST LIFECYCLES")));
 const serviceStatus=await runMeshServiceTests(options);
 if(serviceStatus!==0)return serviceStatus;
 console.log(pc.bold(pc.blue("[2/2] GLOBAL MESH E2E")));
 return runMeshTestE2e(options);
}
