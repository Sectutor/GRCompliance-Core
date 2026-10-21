import { getMatrixScoreLevel, type RiskLevel } from "@/lib/riskCalculations";

/**
 * Register view helpers.
 * Level words come from stored numeric scores through getMatrixScoreLevel.
 * The level filter and the High/Critical footer use the inherent score only.
 * Residual words use residualScore and ignore contextSnapshot.residualRisk.
 */

function numericScore(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

export function inherentScoreOf(risk: {
    inherentScore?: unknown;
    likelihood?: unknown;
    impact?: unknown;
} | null | undefined): number | null {
    const stored = numericScore(risk?.inherentScore);
    if (stored !== null) return stored;
    const likelihood = numericScore(risk?.likelihood);
    const impact = numericScore(risk?.impact);
    if (likelihood === null || impact === null) return null;
    return likelihood * impact;
}

export function residualScoreOf(risk: { residualScore?: unknown } | null | undefined): number | null {
    return numericScore(risk?.residualScore);
}

export function inherentLevel(risk: Parameters<typeof inherentScoreOf>[0]): RiskLevel | "" {
    const score = inherentScoreOf(risk);
    if (score === null) return "";
    return getMatrixScoreLevel(score);
}

export function residualLevel(risk: Parameters<typeof residualScoreOf>[0]): RiskLevel | "" {
    const score = residualScoreOf(risk);
    if (score === null) return "";
    return getMatrixScoreLevel(score);
}

export function matchesInherentLevel(
    risk: Parameters<typeof inherentScoreOf>[0],
    level: string,
): boolean {
    if (!level || level === "all") return true;
    return inherentLevel(risk) === level;
}

/** Ascending numeric comparison. Rows without a score sort before scored rows. */
export function compareRegisterScores(
    a: Parameters<typeof inherentScoreOf>[0] & Parameters<typeof residualScoreOf>[0],
    b: Parameters<typeof inherentScoreOf>[0] & Parameters<typeof residualScoreOf>[0],
    field: "inherent" | "residual",
): number {
    const scoreOf = field === "inherent" ? inherentScoreOf : residualScoreOf;
    const aScore = scoreOf(a);
    const bScore = scoreOf(b);
    if (aScore === null && bScore === null) return 0;
    if (aScore === null) return -1;
    if (bScore === null) return 1;
    return aScore - bScore;
}

export function isHighOrCritical(risk: Parameters<typeof inherentScoreOf>[0]): boolean {
    const level = inherentLevel(risk);
    return level === "High" || level === "Very High" || level === "Critical";
}

/** The same string the Treatment column shows, without the empty-state dash. */
export function displayedTreatmentOption(risk: {
    contextSnapshot?: { treatmentStrategy?: unknown } | null;
    treatmentOption?: unknown;
} | null | undefined): string {
    const strategy = risk?.contextSnapshot?.treatmentStrategy;
    const option = risk?.treatmentOption;
    const raw = typeof strategy === "string" && strategy.trim() !== "" ? strategy : option;
    return typeof raw === "string" ? raw.trim() : "";
}

export function hasTreatmentOption(risk: Parameters<typeof displayedTreatmentOption>[0]): boolean {
    return displayedTreatmentOption(risk).length > 0;
}
