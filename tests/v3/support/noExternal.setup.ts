import { vi } from "vitest";

const forbidden=new Set(["docker","curl","wget","npm","pnpm"]);
vi.mock("node:child_process",async importOriginal=>{
  const actual=await importOriginal<typeof import("node:child_process")>();
  return {...actual,
    spawnSync:(command:string,...args:unknown[])=>{if(forbidden.has(command))throw new Error(`V3 fast suite forbids external process: ${command}`);return (actual.spawnSync as any)(command,...args);},
    spawn:(command:string,...args:unknown[])=>{if(forbidden.has(command))throw new Error(`V3 fast suite forbids external process: ${command}`);return (actual.spawn as any)(command,...args);}
  };
});
