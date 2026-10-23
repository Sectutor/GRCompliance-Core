import type { SubArticle } from "./types";
import catalog from "./nis2Annex.catalog.json";

/**
 * Annex to Commission Implementing Regulation (EU) 2024/2690.
 * EU law, reusable. Source: https://eur-lex.europa.eu/eli/reg_impl/2024/2690/oj
 * Page furniture from the Official Journal conversion ("N/34 ELI: ...") is removed.
 * Requirement sentences are otherwise the annex text.
 */
export const NIS2_ANNEX_SOURCE = catalog.source;
export const NIS2_ANNEX_TOTAL = catalog.total;

export const nis2AnnexSubArticles = catalog.articles as Record<string, SubArticle[]>;
