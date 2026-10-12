import { expect, it } from "vitest";
import { extractHostPorts } from "../../src/utils/checkPortCollision.js";

it("AUDIT-B09 extracts published port from IPv4 short syntax", () => {
  expect(extractHostPorts(`
services:
  helper:
    image: alpine
    ports:
      - "127.0.0.1:18080:80"
`)).toEqual([18080]);
});

it("AUDIT-B09 ignores target-only short syntax", () => {
  expect(extractHostPorts(`
services:
  helper:
    image: alpine
    ports:
      - "3000"
`)).toEqual([]);
});

it("AUDIT-B09 extracts ordinary HOST:TARGET short syntax", () => {
  expect(extractHostPorts(`
services:
  helper:
    image: alpine
    ports:
      - "18081:81"
`)).toEqual([18081]);
});

it("AUDIT-B09 extracts protocol-qualified IPv4 short syntax", () => {
  expect(extractHostPorts(`
services:
  helper:
    image: alpine
    ports:
      - "127.0.0.1:18082:82/tcp"
`)).toEqual([18082]);
});

it("AUDIT-B09 extracts bracketed IPv6 published host port", () => {
  expect(extractHostPorts(`
services:
  helper:
    image: alpine
    ports:
      - "[::1]:18083:83"
`)).toEqual([18083]);
});
