import { describe, it, expect, afterEach, vi } from "vitest";
import { builtinModules } from "module";
import { spawn } from "child_process";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { str } from "@/lib/parsers";
import { parserDebug, setTraceHost } from "@/lib/trace";

const libDir = path.resolve(__dirname, "../lib");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("browser safety", () => {
  it("lib/ imports no Node built-in modules", () => {
    const builtins = new Set(builtinModules);
    const offenders: string[] = [];
    for (const file of sourceFiles(libDir)) {
      const source = readFileSync(file, "utf8");
      for (const [, id] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
        if (id.startsWith("node:") || builtins.has(id.split("/")[0])) {
          offenders.push(`${path.relative(libDir, file)}: ${id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// Needs Node 20.16+ for process.getBuiltinModule; older Node posts with an
// async fetch instead.
const canPostSynchronously =
  typeof (process as { getBuiltinModule?: unknown }).getBuiltinModule ===
  "function";

describe("trace host", () => {
  afterEach(() => {
    setTraceHost("");
    vi.restoreAllMocks();
  });

  it.skipIf(!canPostSynchronously)(
    "posts start and end events, including input with quotes",
    async () => {
      // The host runs in its own process: the synchronous curl blocks this
      // one, so an in-process server could never answer.
      const server = spawn(process.execPath, [
        "-e",
        `const http = require("http");
         const s = http.createServer((req, res) => {
           let body = "";
           req.on("data", (c) => (body += c));
           req.on("end", () => { process.stdout.write(body + "\\n"); res.end(); });
         });
         s.listen(0, () => process.stdout.write("PORT " + s.address().port + "\\n"));`,
      ]);
      let output = "";
      server.stdout.on("data", (chunk) => (output += chunk));
      try {
        const port = await new Promise<string>((resolve) => {
          const check = () => {
            const match = output.match(/PORT (\d+)/);
            if (match) resolve(match[1]);
            else setTimeout(check, 10);
          };
          check();
        });

        vi.spyOn(console, "log").mockImplementation(() => {});
        setTraceHost(`http://127.0.0.1:${port}`);
        const input = `it's "quoted"`;
        parserDebug("quotes", () => str("it's")(input));

        // The server's stdout reaches us on later event-loop turns.
        const jsonLines = () =>
          output.split("\n").filter((line) => line.startsWith("{"));
        await vi.waitFor(() => expect(jsonLines().length).toBe(2), {
          timeout: 2000,
        });
        const events = jsonLines().map((line) => JSON.parse(line));
        expect(events.map((e) => e.type)).toEqual(["start", "end"]);
        expect(events[1].result.rest).toBe(` "quoted"`);
      } finally {
        server.kill();
      }
    },
  );
});
