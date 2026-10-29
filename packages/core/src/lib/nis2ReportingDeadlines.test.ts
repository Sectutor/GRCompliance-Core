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
