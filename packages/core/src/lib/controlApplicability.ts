export type ApplicabilityPatch = {
    status?: string;
    applicability?: string;
};

/**
 * Keep implementation status and SoA applicability on the same side of "not applicable".
 * An empty patch leaves unrelated updates (notes, owner) alone.
 */
export function reconcileControlApplicability(
    input: { status?: string | null; applicability?: string | null },
    previous?: { status?: string | null; applicability?: string | null }
): ApplicabilityPatch {
    const status = input.status ?? undefined;
    const applicability = input.applicability ?? undefined;
    if (status === undefined && applicability === undefined) return {};

    if (status === "not_applicable" || applicability === "not_applicable") {
        return { status: "not_applicable", applicability: "not_applicable" };
    }

    if (applicability === "applicable" && status == null && previous?.status === "not_applicable") {
        return { status: "not_implemented", applicability: "applicable" };
    }

    if (status) {
        const inherited = previous?.applicability === "not_applicable"
            ? "applicable"
            : previous?.applicability || "applicable";
        return { status, applicability: applicability || inherited };
    }

    return applicability ? { applicability } : {};
}
