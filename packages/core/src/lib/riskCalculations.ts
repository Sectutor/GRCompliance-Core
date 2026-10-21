/**
 * Risk Calculation Utilities
 * Provides automated residual risk calculation based on inherent risk and control effectiveness
 */

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Very High' | 'Critical';

// Support both database format (effective, partially_effective, ineffective) 
// and UI format (Effective, Partially Effective, Ineffective)
export type ControlEffectiveness = 'effective' | 'partially_effective' | 'ineffective' | 'Effective' | 'Partially Effective' | 'Ineffective' | '';

/**
 * Map risk levels to numeric scores for calculation (1-5 scale)
 */
const RISK_SCORES: Record<RiskLevel, number> = {
    'Low': 1,
    'Medium': 2,
    'High': 3,
    'Very High': 4,
    'Critical': 5,
};

/**
 * Map control effectiveness to reduction values (percentage-based for 1-25 scale)
 * Effective: 40% reduction, Partially Effective: 20% reduction, Ineffective: 0%
 */
const CONTROL_REDUCTION: Record<string, number> = {
    'effective': 0.40,
    'partially_effective': 0.20,
    'ineffective': 0,
    'Effective': 0.40,
    'Partially Effective': 0.20,
    'Ineffective': 0,
    '': 0,
};

/**
 * Normalize control effectiveness to handle both DB and UI formats
 */
export function normalizeControlEffectiveness(value: string | null | undefined): string {
    if (!value) return '';
    
    const normalized = value.toLowerCase().replace(' ', '_');
    if (normalized === 'effective' || normalized === 'partially_effective' || normalized === 'ineffective') {
        return normalized;
    }
    // Fallback: try original value
    if (value in CONTROL_REDUCTION) {
        return value;
    }
    return '';
}

/**
 * Safely convert likelihood/impact to number (handles string values from VARCHAR fields)
 */
export function parseLikelihoodImpact(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') return 0;
    
    const num = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (isNaN(num)) return 0;
    
    // Clamp to valid range (1-5)
    return Math.max(1, Math.min(5, num));
}

/**
 * Convert a 1-5 axis score back to a risk level.
 * Do not call this with a 1-25 matrix product; use getMatrixScoreLevel.
 */
export function scoreToRiskLevel(score: number): RiskLevel {
    if (score <= 1) return 'Low';
    if (score <= 2) return 'Medium';
    if (score <= 3) return 'High';
    if (score <= 4) return 'Very High';
    return 'Critical';
}

/**
 * Bands for a 1-25 likelihood × impact score.
 * High starts at 8. Critical starts at 20.
 * This list is the only band table. UI legends and stored words call getMatrixScoreLevel.
 */
export const MATRIX_SCORE_BANDS: readonly { min: number; max: number; level: RiskLevel }[] = [
    { min: 20, max: 25, level: 'Critical' },
    { min: 15, max: 19, level: 'Very High' },
    { min: 8, max: 14, level: 'High' },
    { min: 4, max: 7, level: 'Medium' },
    { min: 1, max: 3, level: 'Low' },
];

/**
 * Convert a 1-25 matrix score to a risk level.
 * Scores above 25 stay Critical. Scores below 1 stay Low.
 */
export function getMatrixScoreLevel(score: number): RiskLevel {
    const band = MATRIX_SCORE_BANDS.find((item) => score >= item.min);
    return band?.level ?? 'Low';
}

/**
 * Calculate residual risk based on inherent risk and control effectiveness
 */
export function calculateResidualRisk(
    inherentRisk: RiskLevel | '',
    controlEffectiveness: ControlEffectiveness
): RiskLevel | '' {
    if (!inherentRisk) return '';

    const inherentScore = RISK_SCORES[inherentRisk];
    
    // Normalize control effectiveness and get reduction
    const normalizedEffectiveness = normalizeControlEffectiveness(controlEffectiveness);
    const reduction = CONTROL_REDUCTION[normalizedEffectiveness] || 0;

    // Calculate residual score using percentage-based reduction (minimum of 1)
    const residualScore = Math.max(1, Math.round(inherentScore * (1 - reduction)));

    return scoreToRiskLevel(residualScore);
}

/**
 * Calculate residual score (numeric) based on inherent score and control effectiveness
 * Uses percentage-based reduction for 1-25 scale
 */
export function calculateResidualScore(
    inherentScore: number,
    controlEffectiveness: ControlEffectiveness
): number {
    // Normalize the control effectiveness value
    const normalizedEffectiveness = normalizeControlEffectiveness(controlEffectiveness);
    const reduction = CONTROL_REDUCTION[normalizedEffectiveness] || 0;
    
    // Calculate residual score using percentage-based reduction (minimum of 1)
    const result = Math.max(1, Math.round(inherentScore * (1 - reduction)));
    
    return result;
}

/**
 * Calculate inherent score from likelihood and impact
 * @param likelihood - 1-5
 * @param impact - 1-5
 * @returns 1-25
 */
export function calculateInherentScore(likelihood: number, impact: number): number {
    return likelihood * impact;
}

/**
 * Get risk level color for UI display
 */
export function getRiskLevelColor(riskLevel: RiskLevel | ''): string {
    switch (riskLevel) {
        case 'Critical':
            return 'bg-red-800 text-white';
        case 'Very High':
            return 'bg-red-600 text-white';
        case 'High':
            return 'bg-orange-500 text-white';
        case 'Medium':
            return 'bg-amber-400 text-amber-950';
        case 'Low':
            return 'bg-green-600 text-white';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-400';
    }
}

export function getRiskLevelTextColor(riskLevel: RiskLevel | ''): string {
    switch (riskLevel) {
        case 'Critical':
            return 'text-red-900';
        case 'Very High':
            return 'text-red-700';
        case 'High':
            return 'text-orange-700';
        case 'Medium':
            return 'text-amber-700';
        case 'Low':
            return 'text-green-700';
        default:
            return 'text-gray-900';
    }
}

/**
 * Calculate risk score (numeric) for sorting and filtering
 */
export function getRiskScore(riskLevel: RiskLevel | ''): number {
    return riskLevel ? RISK_SCORES[riskLevel] : 0;
}
