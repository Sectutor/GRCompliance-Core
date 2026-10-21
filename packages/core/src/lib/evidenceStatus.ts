/** Stored evidence_status values and the one label both Evidence Collection and Audit Preparation show. */
export const EVIDENCE_STATUSES = [
    "pending",
    "collected",
    "verified",
    "rejected",
    "expired",
    "not_applicable",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
    pending: "Pending",
    collected: "Collected",
    verified: "Verified",
    rejected: "Rejected",
    expired: "Expired",
    not_applicable: "Not applicable",
};

export function evidenceStatusLabel(status: string | null | undefined): string {
    if (!status) return EVIDENCE_STATUS_LABELS.pending;
    if (status in EVIDENCE_STATUS_LABELS) return EVIDENCE_STATUS_LABELS[status as EvidenceStatus];
    return status;
}

export function evidenceStatusDotClass(status: string | null | undefined): string {
    switch (status) {
        case "verified":
            return "bg-green-500";
        case "collected":
            return "bg-amber-400";
        case "pending":
            return "bg-blue-400";
        case "expired":
        case "rejected":
            return "bg-red-500";
        default:
            return "bg-slate-300";
    }
}

export function evidenceStatusBadgeClass(status: string | null | undefined): string {
    switch (status) {
        case "verified":
            return "bg-emerald-100 text-emerald-700 border-emerald-200";
        case "collected":
            return "bg-amber-100 text-amber-700 border-amber-200";
        case "rejected":
            return "bg-rose-100 text-rose-700 border-rose-200";
        case "expired":
            return "bg-red-100 text-red-700 border-red-200";
        case "not_applicable":
            return "bg-slate-100 text-slate-500 border-slate-200";
        default:
            return "bg-slate-100 text-slate-700 border-slate-200";
    }
}
