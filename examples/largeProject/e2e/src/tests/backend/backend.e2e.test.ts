import { beforeAll, describe, expect, it } from "vitest";
import { loadEnvironment } from "@/configs/index.js";
import { waitForService } from "@/utils/waitForService.js";

const env = loadEnvironment();

describe("Backend API E2E Suite (via Gateway Instance)", () => {
	beforeAll(async () => {
		console.log(`\n========================================`);
		console.log(`Testing Backend API:`);
		console.log(`========================================\n`);

		await waitForService(
			`${process.env.BACKEND_URL}/health`,
			"Backend API",
			30000,
		);
	});

	describe("Backend Health Check", () => {
		it("GET /api/health through Gateway returns healthy status", async () => {
			const res = await fetch(`${process.env.BACKEND_URL}/health`);
			expect(res.status).toBe(200);

			const contentType = res.headers.get("content-type") || "";
			expect(contentType).toContain("application/json");

			const body = (await res.json()) as { status: string };
			expect(body).toEqual({ status: "success" });
		});
	});
});
