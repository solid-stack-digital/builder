import { describe,expect,it } from "vitest";
import { buildV3Catalog,validateV3Report,caseTest } from "../v3/requirements.js";
const catalog=buildV3Catalog();
describe("V3 requirements registry",()=>{
 caseTest(catalog.find(record=>record.id==="PKG07")!,()=>{
  expect(catalog).toHaveLength(271);
  expect(catalog.every(record=>record.testFile.length>0)).toBe(true);
  const passed=catalog.map(record=>({id:record.id,status:"passed" as const}));
  expect(validateV3Report(catalog,passed)).toEqual([]);
  expect(validateV3Report(catalog,passed.slice(1))).toEqual(expect.arrayContaining([expect.stringMatching(/unexecuted catalog ID/)]));
  expect(validateV3Report(catalog,[...passed.slice(1),{id:catalog[0]!.id,status:"skipped"}])).toEqual(expect.arrayContaining([expect.stringMatching(/non-passing catalog ID/)]));
  expect(validateV3Report([...catalog,catalog[0]!],passed)).toEqual(expect.arrayContaining([expect.stringMatching(/duplicate catalog ID/)]));
  expect(validateV3Report([{...catalog[0]!,invariantIds:[999]},...catalog.slice(1)],passed)).toEqual(expect.arrayContaining([expect.stringMatching(/unknown invariant/)]));
 });
 it("[PKG07] every catalog entry has a positive invariant or feature section",()=>{for(const record of catalog){expect(record.specSections.length,record.id).toBeGreaterThan(0);expect(record.setup.length,record.id).toBeGreaterThan(0);expect(record.expected.length,record.id).toBeGreaterThan(0);}});
});
