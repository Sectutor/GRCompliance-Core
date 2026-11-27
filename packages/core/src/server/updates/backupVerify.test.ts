/**
 * @vitest-environment node
 */
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyBackupCopy } from "../../../../../updater/src/backupStatus.mjs";

describe("restore check", () => {
    it("uses a throwaway container and does not pass a live database URL", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "grc-backup-"));
        const dir = path.join(root, "run-1");
        await import("node:fs/promises").then((fs) => fs.mkdir(dir));
        await writeFile(path.join(dir, "database.sql"), "SELECT 1;\n");
        const calls: string[][] = [];
        const result = await verifyBackupCopy({
            root,
            id: "run-1",
            freeBytes: 2 * 1024 * 1024 * 1024,
            docker: async (args: string[]) => {
                calls.push(args);
                const joined = args.join(" ");
                if (joined.includes("DATABASE_URL") || joined.includes("postgres://grc")) {
                    throw new Error("live database was referenced");
                }
            },
        });
        expect(result.ok).toBe(true);
        expect(result.message).toMatch(/live database was not changed/);
        expect(calls.some((args) => args[0] === "run" && args.includes("--network") && args.includes("none"))).toBe(true);
        expect(calls.some((args) => args[0] === "rm" && args.includes("-f"))).toBe(true);
        const recorded = JSON.parse(await readFile(path.join(dir, "restore-test.json"), "utf8"));
        expect(recorded.passed).toBe(true);
    });
});
