import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("../../src/core/runners/runTestUnit.js",()=>({runTestUnit:vi.fn()}));
vi.mock("../../src/core/runners/runTestE2e.js",()=>({runTestE2e:vi.fn()}));
import {runTestUnit} from "../../src/core/runners/runTestUnit.js";
import {runTestE2e} from "../../src/core/runners/runTestE2e.js";
import {runTest} from "../../src/core/runners/runTest.js";
const unit=vi.mocked(runTestUnit),e2e=vi.mocked(runTestE2e);
afterEach(()=>vi.clearAllMocks());
describe("service test orchestration",()=>{
 it("stops before E2E when unit tests fail",async()=>{unit.mockResolvedValueOnce(4);expect(await runTest({projectDir:"/tmp",debug:false,detach:false})).toBe(4);expect(e2e).not.toHaveBeenCalled();});
 it("runs E2E after successful unit tests",async()=>{unit.mockResolvedValueOnce(0);e2e.mockResolvedValueOnce(0);expect(await runTest({projectDir:"/tmp",debug:false,detach:false})).toBe(0);expect(e2e).toHaveBeenCalledOnce();});
});

it("stops before E2E when unit cleanup rejects", async () => {
 const error = new Error("teardown failed");
 unit.mockRejectedValueOnce(error);
 await expect(runTest({projectDir:"/tmp",debug:false,detach:false})).rejects.toBe(error);
 expect(e2e).not.toHaveBeenCalled();
});
