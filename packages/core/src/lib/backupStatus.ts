export type BackupChecksum = "ok" | "mismatch" | "unknown";

export type BackupRecord = {
    id: string;
    bytes: number;
    modifiedAt: string;
    checksum: BackupChecksum;
    location: string;
};

export type RestoreTest = {
    at: string;
    passed: boolean;
} | null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${Math.max(1, Math.round(mb))} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}

export function agePhrase(iso: string, now: Date): string {
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return "on an unknown date";
    const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
}

function checksumPhrase(checksum: BackupChecksum): string {
    if (checksum === "ok") return "checksum OK";
    if (checksum === "mismatch") return "checksum does not match";
    return "checksum not recorded";
}

export function backupStatusSentences(input: {
    now: Date;
    version: string;
    updateAvailable: boolean;
    backups: BackupRecord[];
    restoreTest: RestoreTest;
}): string[] {
    const newest = [...input.backups].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))[0];
    const backupLine = newest
        ? `Last backup: ${agePhrase(newest.modifiedAt, input.now)}, ${formatBytes(newest.bytes)}, ${checksumPhrase(newest.checksum)}, stored in ${newest.location}`
        : "Last backup: none yet. A backup is taken before an update, or you can run one from the server.";
    let restoreLine = "Restore tested: not yet";
    if (input.restoreTest?.at) {
        const when = new Date(input.restoreTest.at);
        const day = Number.isNaN(when.getTime()) ? "an unknown date" : `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}`;
        restoreLine = input.restoreTest.passed ? `Restore tested: yes, ${day}` : `Restore tested: no, ${day}. The live database was not changed.`;
    }
    const version = input.version || "unknown";
    const versionLine = input.updateAvailable ? `Version ${version}, an update is available` : `Version ${version}, up to date`;
    return [backupLine, restoreLine, versionLine];
}
