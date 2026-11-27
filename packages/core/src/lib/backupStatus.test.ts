import { describe, expect, it } from "vitest";
import { backupStatusSentences } from "./backupStatus";

describe("backup status sentences", () => {
    it("describes the newest backup, a restore check, and the version in plain words", () => {
        const lines = backupStatusSentences({
            now: new Date("2026-11-27T12:00:00.000Z"),
            version: "1.0.0",
            updateAvailable: false,
            backups: [{
                id: "run-1",
                bytes: 340 * 1024 * 1024,
                modifiedAt: "2026-11-25T12:00:00.000Z",
                checksum: "ok",
                location: "/backups/run-1",
            }],
            restoreTest: { at: "2026-11-25T08:00:00.000Z", passed: true },
        });
        expect(lines[0]).toBe("Last backup: 2 days ago, 340 MB, checksum OK, stored in /backups/run-1");
        expect(lines[1]).toBe("Restore tested: yes, 25 Nov");
        expect(lines[2]).toBe("Version 1.0.0, up to date");
    });

    it("says when nothing has been backed up or checked", () => {
        const lines = backupStatusSentences({
            now: new Date("2026-11-27T12:00:00.000Z"),
            version: "1.0.0",
            updateAvailable: true,
            backups: [],
            restoreTest: null,
        });
        expect(lines[0]).toMatch(/none yet/);
        expect(lines[1]).toBe("Restore tested: not yet");
        expect(lines[2]).toMatch(/an update is available/);
    });
});
