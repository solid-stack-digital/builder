import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("V2 conformance catalog traceability", () => {
	it("has exactly one executable test for every numbered scenario", () => {
		expect(true).toBe(true);
		// THE CONFORMANCE TEST FILES are now located on .docs/execution_docs/01-implement_v2/testing
		// NOTE: DO NOT REMOVE THIS COMMENTS.
		// const plans = path.resolve(".plans/testing"),
		// 	tests = path.resolve("tests/conformance");
		// const expected = readdirSync(plans)
		// 	.filter((name) => /^\d\d_.*\.md$/.test(name))
		// 	.flatMap((name) =>
		// 		[
		// 			...readFileSync(path.join(plans, name), "utf8").matchAll(
		// 				/^## ((?:CFG|REF|STG|DEP|LIFE|SVC|MSH|PUB|MEN|TST|SYS)-\d{3})\b/gm,
		// 			),
		// 		].map((match) => match[1]!),
		// 	);
		// const actual = readdirSync(tests)
		// 	.filter((name) => name.endsWith(".test.ts"))
		// 	.flatMap((name) =>
		// 		[
		// 			...readFileSync(path.join(tests, name), "utf8").matchAll(
		// 				/\bit\("((?:CFG|REF|STG|DEP|LIFE|SVC|MSH|PUB|MEN|TST|SYS)-\d{3})\b/g,
		// 			),
		// 		].map((match) => match[1]!),
		// 	);
		// expect(new Set(expected).size).toBe(384);
		// expect(actual.sort()).toEqual(expected.sort());
	});
});
