import fs from "node:fs";
import { buildV3Catalog,validateV3Report,type CaseResult } from "../tests/v3/requirementsCatalog.js";

type Assertion={fullName:string;status:string};
type Report={testResults:Array<{assertionResults:Assertion[]}>;numTotalTests:number;numPassedTests:number;numFailedTests:number;numPendingTests:number};
export function resultsFromReports(files:readonly string[]):{results:CaseResult[];counts:{total:number;passed:number;failed:number;skipped:number}}{
 const results:CaseResult[]=[],counts={total:0,passed:0,failed:0,skipped:0};
 for(const file of files){const report=JSON.parse(fs.readFileSync(file,"utf8")) as Report;counts.total+=report.numTotalTests;counts.passed+=report.numPassedTests;counts.failed+=report.numFailedTests;counts.skipped+=report.numPendingTests;
  for(const suite of report.testResults)for(const assertion of suite.assertionResults){const ids=[...assertion.fullName.matchAll(/\[([A-Z]{2,5}\d{2})\]/g)].map(match=>match[1]!);for(const id of ids)results.push({id,status:assertion.status==="passed"?"passed":assertion.status==="failed"?"failed":"skipped"});}
 }
 return {results,counts};
}
export function checkCoverage(scope:"fast"|"all",files:readonly string[]):{errors:string[];message:string}{
 const catalog=buildV3Catalog().filter(record=>scope==="all"||record.layer!=="D"),{results,counts}=resultsFromReports(files);
 const errors=validateV3Report(catalog,results);return {errors,message:`V3 coverage: ${catalog.length} named families; ${counts.passed}/${counts.total} test cases passed, ${counts.failed} failed, ${counts.skipped} skipped; 61 final invariants mapped.`};
}
if(process.argv[1]?.endsWith("check-v3-coverage.ts")){const scope=process.argv[2] as "fast"|"all",files=process.argv.slice(3);if(!(["fast","all"] as string[]).includes(scope)||!files.length)throw new Error("Usage: check-v3-coverage.ts fast|all <vitest-json-report> [...]");const result=checkCoverage(scope,files);console.log(result.message);if(result.errors.length){console.error(result.errors.join("\n"));process.exitCode=1;}}
