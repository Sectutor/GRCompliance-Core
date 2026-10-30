import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    nis2ReportingDeadlines,
    withNis2ReportingDeadlines,
} from "./nis2ReportingDeadlines";

const aware = new Date("2026-03-01T10:00:00.000Z");

describe("NIS2 Article 23 reporting clocks", () => {
    it("starts the 24-hour early warning and the 72-hour incident notification at awareness", () => {
        const clocks = nis2ReportingDeadlines({ awareAt: aware });
        expect(clocks.anchors.earlyWarning).toBe("awareness");
        expect(clocks.anchors.incidentNotification).toBe("awareness");
        expect(clocks.earlyWarningDue.toISOString()).toBe("2026-03-02T10:00:00.000Z");
        expect(clocks.incidentNotificationDue.toISOString()).toBe("2026-03-04T10:00:00.000Z");
        expect(clocks.finalReportDue).toBeNull();
    });

    it("does not start the 72-hour incident notification from the early warning", () => {
        const earlyWarningSubmittedAt = new Date("2026-03-02T08:00:00.000Z");
        const clocks = nis2ReportingDeadlines({ awareAt: aware, earlyWarningSubmittedAt });
        expect(clocks.incidentNotificationDue.toISOString()).toBe("2026-03-04T10:00:00.000Z");
        const wronglyFromEarlyWarning = new Date(earlyWarningSubmittedAt.getTime() + 72 * 60 * 60 * 1000);
        expect(clocks.incidentNotificationDue.getTime()).not.toBe(wronglyFromEarlyWarning.getTime());
        expect(clocks.earlyWarningDue.toISOString()).toBe("2026-03-02T10:00:00.000Z");
    });

    it("starts the one-month final report when the incident notification is submitted, per Article 23(4)(d)", () => {
        const incidentNotificationSubmittedAt = new Date("2026-03-03T15:30:00.000Z");
        const clocks = nis2ReportingDeadlines({
            awareAt: aware,
            earlyWarningSubmittedAt: new Date("2026-03-01T18:00:00.000Z"),
            incidentNotificationSubmittedAt,
        });
        expect(clocks.anchors.finalReport).toBe("incident-notification-submission");
        expect(clocks.finalReportDue?.toISOString()).toBe("2026-04-03T15:30:00.000Z");
        expect(clocks.finalReportDue?.toISOString()).not.toBe("2026-04-01T10:00:00.000Z");
        expect(clocks.finalReportDue?.toISOString()).not.toBe("2026-04-01T18:00:00.000Z");
    });

    it("clamps a calendar month that has no matching day", () => {
        const clocks = nis2ReportingDeadlines({
            awareAt: new Date("2026-01-15T00:00:00.000Z"),
            incidentNotificationSubmittedAt: new Date("2026-01-31T12:00:00.000Z"),
        });
        expect(clocks.finalReportDue?.toISOString()).toBe("2026-02-28T12:00:00.000Z");
    });

    it("attaches the same clocks to an incident record from its detection time", () => {
        const withDeadlines = withNis2ReportingDeadlines({
            id: 4,
            detectedAt: aware,
            earlyWarningSubmittedAt: new Date("2026-03-01T20:00:00.000Z"),
        });
        expect(withDeadlines.reportingDeadlines?.incidentNotificationDue.toISOString()).toBe("2026-03-04T10:00:00.000Z");
        expect(withDeadlines.reportingDeadlines?.finalReportDue).toBeNull();
        expect(withNis2ReportingDeadlines({ detectedAt: null }).reportingDeadlines).toBeNull();
    });
});

describe("NIS2 reporting screen copy", () => {
    const detail = readFileSync(path.resolve(import.meta.dirname, "../pages/cyber/CyberIncidentDetail.tsx"), "utf8");
    const wizard = readFileSync(path.resolve(import.meta.dirname, "../pages/cyber/CyberIncidentReporting.tsx"), "utf8");

    it("shows the trust-service 24-hour note and the outer-limit wording", () => {
        for (const source of [detail, wizard]) {
            expect(source).toContain("Early warning: without undue delay, at the latest by");
            expect(source).toContain("Incident notification: without undue delay, at the latest by");
            expect(source).toContain("Trust service providers: 24 hours for significant incidents affecting your trust services (Art. 23(4), second subparagraph).");
            expect(source).not.toContain("Incident notification due (72h");
        }
    });

    it("tells the user the clocks run from awareness and that the final date is indicative", () => {
        expect(wizard).toContain("Detected at (UTC)");
        expect(wizard).toContain("Enter when you became aware of the significant incident. The 24h and 72h clocks run from this time.");
        expect(wizard).not.toContain("Detection Time");
        expect(detail).toContain("This time is when you became aware of the significant incident. The 24h and 72h clocks run from this time.");
        expect(detail).toContain("Indicative final report (1 month)");
        expect(wizard).toContain("indicative final-report date");
        expect(detail).toContain("National rules may count that month differently.");
    });

    it("does not claim the wizard notifies a national CSIRT", () => {
        expect(detail).toContain("Marked as reported to your CSIRT / competent authority");
        expect(detail).not.toContain("national CSIRT");
        expect(wizard).toContain("Records your 24h/72h NIS2 reporting steps (it does not send the report).");
        expect(wizard).toContain("Final review before you submit to your CSIRT or competent authority.");
        expect(wizard).not.toContain("for NIS2 compliance auditing");
        expect(wizard).not.toContain("alerting the authorities");
    });
});
