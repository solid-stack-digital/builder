import { it } from "vitest";
export { buildV3Catalog,validateV3Report,type V3Case,type CaseResult } from "./requirementsCatalog.js";
import type { V3Case } from "./requirementsCatalog.js";

export function caseTest(record:V3Case,callback:()=>void|Promise<void>):void {
  it(`[${record.id}] ${record.title}`,callback);
}
