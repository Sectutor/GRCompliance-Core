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

/** Same 1-5 reading the register uses for heat-map drill-down. */
export function normalizeAxisValue(val: unknown): number {
    if (!val) return 0;
    const strVal = val.toString().toLowerCase().trim();
    let num = parseInt(strVal.charAt(0), 10);

    if (isNaN(num)) {
        if (strVal.includes("critical") || strVal.includes("extreme") || strVal.includes("catastrophic")) num = 5;
        else if (strVal.includes("very high") || strVal.includes("almost certain")) num = 4;
        else if (strVal.includes("high") || strVal.includes("likely") || strVal.includes("major")) num = 3;
        else if (strVal.includes("medium") || strVal.includes("moderate") || strVal.includes("possible")) num = 2;
        else if (strVal.includes("low") || strVal.includes("unlikely") || strVal.includes("minor") || strVal.includes("rare") || strVal.includes("insignificant")) num = 1;
    }

    if (num >= 1 && num <= 5) return num;
    return 0;
}

/**
 * Residual drill-down matches both stored axes.
 * A likelihood-only match is not enough. Missing axes do not match a cell.
 */
export function matchesResidualHeatmapCell(
    risk: {
        residualLikelihood?: unknown;
        residualImpact?: unknown;
        contextSnapshot?: { residualLikelihood?: unknown; residualImpact?: unknown } | null;
    } | null | undefined,
    likelihood: number,
    impact: number,
): boolean {
    const snapshot = risk?.contextSnapshot && typeof risk.contextSnapshot === "object"
        ? risk.contextSnapshot
        : {};
    const storedLikelihood = normalizeAxisValue(risk?.residualLikelihood ?? snapshot.residualLikelihood);
    const storedImpact = normalizeAxisValue(risk?.residualImpact ?? snapshot.residualImpact);
    return storedLikelihood === likelihood && storedImpact === impact;
}
