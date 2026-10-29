/**
 * NIS2 Article 23(4) reporting clocks.
 *
 * (a) Early warning: within 24 hours of becoming aware of the significant incident.
 * (b) Incident notification: within 72 hours of becoming aware of the significant
 *     incident. The same awareness moment anchors (a) and (b). Submitting the
 *     early warning does not start the 72-hour clock.
 * (d) Final report: not later than one month after submission of the incident
 *     notification under point (b). Not from awareness, and not from the early warning.
 * (e) If the incident is still ongoing when that final report is due, a progress
 *     report is due then and the final report is due within one month of handling
 *     the incident. That later anchor is not computed here.
 *
 * A trust service provider's 24-hour notification for incidents that affect its
 * trust services (Article 23(4), second subparagraph) is a separate derogation
 * and is not applied by this helper.
 */

export const NIS2_EARLY_WARNING_HOURS = 24;
export const NIS2_INCIDENT_NOTIFICATION_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;

export interface Nis2ReportingClockInput {
    /** When the entity became aware of the significant incident (detection time). */
    awareAt: Date;
    /**
     * When the Article 23(4)(a) early warning was submitted.
     * Recorded for the audit trail. It does not move the 72-hour clock.
     */
    earlyWarningSubmittedAt?: Date | null;
    /**
     * When the Article 23(4)(b) incident notification was submitted.
     * This is the only anchor for the one-month final report.
     */
    incidentNotificationSubmittedAt?: Date | null;
}

export interface Nis2ReportingDeadlines {
    earlyWarningDue: Date;
    incidentNotificationDue: Date;
    /** Null until the incident notification under Article 23(4)(b) has been submitted. */
    finalReportDue: Date | null;
    anchors: {
        earlyWarning: "awareness";
        incidentNotification: "awareness";
        finalReport: "incident-notification-submission";
    };
}

export function addCalendarMonthsUtc(date: Date, months: number): Date {
    const result = new Date(date.getTime());
    const day = result.getUTCDate();
    result.setUTCMonth(result.getUTCMonth() + months);
    if (result.getUTCDate() !== day) {
        result.setUTCDate(0);
    }
    return result;
}

export function nis2ReportingDeadlines(input: Nis2ReportingClockInput): Nis2ReportingDeadlines {
    const aware = new Date(input.awareAt);
    if (Number.isNaN(aware.getTime())) {
        throw new Error("NIS2 reporting clocks need the time the entity became aware of the significant incident");
    }

    const earlyWarningDue = new Date(aware.getTime() + NIS2_EARLY_WARNING_HOURS * HOUR_MS);
    // Article 23(4)(b) uses the same awareness anchor as Article 23(4)(a).
    // earlyWarningSubmittedAt is intentionally not added to this deadline.
    const incidentNotificationDue = new Date(aware.getTime() + NIS2_INCIDENT_NOTIFICATION_HOURS * HOUR_MS);

    let finalReportDue: Date | null = null;
    if (input.incidentNotificationSubmittedAt) {
        const submitted = new Date(input.incidentNotificationSubmittedAt);
        if (!Number.isNaN(submitted.getTime())) {
            finalReportDue = addCalendarMonthsUtc(submitted, 1);
        }
    }

    return {
        earlyWarningDue,
        incidentNotificationDue,
        finalReportDue,
        anchors: {
            earlyWarning: "awareness",
            incidentNotification: "awareness",
            finalReport: "incident-notification-submission",
        },
    };
}

export function withNis2ReportingDeadlines<T extends {
    detectedAt?: Date | string | null;
    earlyWarningSubmittedAt?: Date | string | null;
    incidentNotificationSubmittedAt?: Date | string | null;
}>(incident: T): T & { reportingDeadlines: Nis2ReportingDeadlines | null } {
    if (!incident.detectedAt) {
        return { ...incident, reportingDeadlines: null };
    }
    return {
        ...incident,
        reportingDeadlines: nis2ReportingDeadlines({
            awareAt: new Date(incident.detectedAt),
            earlyWarningSubmittedAt: incident.earlyWarningSubmittedAt
                ? new Date(incident.earlyWarningSubmittedAt)
                : null,
            incidentNotificationSubmittedAt: incident.incidentNotificationSubmittedAt
                ? new Date(incident.incidentNotificationSubmittedAt)
                : null,
        }),
    };
}
