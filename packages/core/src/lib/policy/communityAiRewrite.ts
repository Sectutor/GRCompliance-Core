import { isCommunityEdition } from "../communityNav";

/** User-facing copy. Community builds must not name environment variables. */
export const COMMUNITY_AI_REWRITE_NOTE =
    "AI rewrite is available in GRCompliance Premium.";

export function aiRewriteOffered(
    premiumFlag: string | boolean | undefined | null,
): boolean {
    return !isCommunityEdition(premiumFlag);
}
