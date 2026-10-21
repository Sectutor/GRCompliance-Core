import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
    allocateRiskAssessmentId,
    isUniqueViolation,
    nextAssessmentId,
    withUniqueAssessmentIdRetry,
} from "./riskAssessmentIds";
import { ensureRiskAssessmentIdUniqueIndex } from "./riskAssessmentIdIndex";

describe("nextAssessmentId", () => {
    it("continues after the highest numeric suffix and pads to four digits", () => {
        const seeded = Array.from({ length: 10 }, (_, index) => `RA-2026-${String(index + 1).padStart(3, "0")}`);
        expect(nextAssessmentId(seeded, 2026)).toBe("RA-2026-0011");
    });

    it("keeps suffixes that are already wider than four digits", () => {
        expect(nextAssessmentId(["RA-2026-9200", "RA-2026-0"], 2026)).toBe("RA-2026-9201");
    });

    it("ignores other years, other prefixes, and gaps", () => {
        expect(nextAssessmentId([
            "RA-2025-0099",
            "TM-4-1710000000000-1",
            "RA-2026-0001",
            "RA-2026-0003",
            "RA-2026-extra",
            null,
        ], 2026)).toBe("RA-2026-0004");
    });

    it("starts at 0001 when the client has no ids for that year", () => {
        expect(nextAssessmentId([], 2026)).toBe("RA-2026-0001");
    });
});

describe("allocateRiskAssessmentId", () => {
    it("takes a transaction lock and reads the existing suffixes", async () => {
        const calls: unknown[] = [];
        const tx = {
            execute: vi.fn(async (query: unknown) => {
                calls.push(query);
                if (calls.length === 1) return [];
                return [{ assessment_id: "RA-2026-0010" }];
            }),
        };

        await expect(allocateRiskAssessmentId(tx, 4, 2026)).resolves.toBe("RA-2026-0011");
        const lockSql = JSON.stringify(calls[0]);
        expect(lockSql).toContain("pg_advisory_xact_lock");
        expect(lockSql).toContain("4:2026");
    });
});

describe("withUniqueAssessmentIdRetry", () => {
    it("retries a unique violation and then returns the inserted row", async () => {
        const conflict = Object.assign(new Error("duplicate"), { code: "23505" });
        const work = vi.fn()
            .mockRejectedValueOnce(conflict)
            .mockResolvedValueOnce({ id: 3 });

        await expect(withUniqueAssessmentIdRetry(work)).resolves.toEqual({ id: 3 });
        expect(work).toHaveBeenCalledTimes(2);
    });

    it("does not retry an unrelated error", async () => {
        const work = vi.fn().mockRejectedValue(Object.assign(new Error("down"), { code: "08006" }));
        await expect(withUniqueAssessmentIdRetry(work)).rejects.toThrow("down");
        expect(work).toHaveBeenCalledTimes(1);
    });

    it("recognises a unique violation nested on the cause", () => {
        expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
        expect(isUniqueViolation(new Error("no"))).toBe(false);
    });
});

describe("ensureRiskAssessmentIdUniqueIndex", () => {
    it("creates the index when no duplicate pair exists", async () => {
        const queries: string[] = [];
        const db = {
            execute: vi.fn(async (query: unknown) => {
                queries.push(sqlText(query));
                return [];
            }),
        };

        await expect(ensureRiskAssessmentIdUniqueIndex(db, silentLog())).resolves.toEqual({
            created: true,
            skipped: false,
        });
        expect(queries[0]).toContain("having count(*) > 1");
        expect(queries[1]).toContain("create unique index if not exists idx_ra_client_assessment_id");
        expect(queries[1]).toContain("(client_id, assessment_id)");
    });

    it("logs and skips when a duplicate pair exists", async () => {
        const log = silentLog();
        const db = {
            execute: vi.fn(async () => [{ client_id: 1, assessment_id: "RA-2026-0001" }]),
        };

        await expect(ensureRiskAssessmentIdUniqueIndex(db, log)).resolves.toEqual({
            created: false,
            skipped: true,
        });
        expect(db.execute).toHaveBeenCalledTimes(1);
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining("duplicate"));
    });

    it("is invoked from docker bootstrap after the default seed", () => {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const bootstrap = readFileSync(path.resolve(here, "../../../../../docker/bootstrap.ts"), "utf8");
        const seedAt = bootstrap.indexOf("await ensureDefaultDataSeeded()");
        const indexAt = bootstrap.indexOf("await ensureRiskAssessmentIdUniqueIndex(");
        expect(seedAt).toBeGreaterThan(-1);
        expect(indexAt).toBeGreaterThan(seedAt);
    });
});

function silentLog() {
    return { error: vi.fn(), log: vi.fn() };
}

function sqlText(query: unknown): string {
    const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
    return JSON.stringify(chunks, (_key, value) => {
        if (value && typeof value === "object" && "encoder" in value && "value" in value) return value.value;
        if (value && typeof value === "object" && Array.isArray(value.value)) return value.value.join("");
        return value;
    });
}
