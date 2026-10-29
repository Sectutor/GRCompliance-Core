/** Canonical ids shared by the truth-file schema and the workspace comparison. */

export const PRICE_TBD = "PRICE TBD (owner)";
export const TO_BE_ADDED = "to be added";

export function isPlaceholder(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalised = value.trim().toLowerCase();
  return normalised === "" || normalised === TO_BE_ADDED;
}

/**
 * Maps a truth-file id or a workspace framework name onto one canonical id.
 * Returns null when the name is not in the allowed list.
 */
export function canonicalFramework(input: string): string | null {
  const flat = input.trim().toLowerCase().replace(/[^a-z0-9\u0400-\u04FF]+/gi, "");
  if (
    flat === "iso27001" ||
    flat === "iso270012022" ||
    flat === "isoiec27001" ||
    flat === "isoiec270012022"
  ) {
    return "ISO27001:2022";
  }
  if (flat === "soc2" || flat === "soc2typei" || flat === "soc2typeii") return "SOC2";
  if (flat === "nis2" || flat === "nis2зкс") return "NIS2";
  if (flat === "gdpr") return "GDPR";
  if (flat === "dora") return "DORA";
  if (flat === "cra" || flat === "cyberresilienceact") return "CRA";
  return null;
}

export function bandForScore(
  score: number,
  bands: { min: number; max: number; label: string }[],
): string | null {
  const band = bands.find((item) => score >= item.min && score <= item.max);
  return band?.label ?? null;
}
