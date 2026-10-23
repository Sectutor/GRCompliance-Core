export interface Regulation {
    id: string;
    name: string;
    description: string;
    type: string;
    isObligation?: boolean;
    logo?: string;
    articles: Article[];
    questions?: Question[];
    link?: string;
}

export interface Article {
    id: string;
    numericId: string;
    title: string;
    description: string;
    subArticles?: SubArticle[];
    mappedControls?: Record<string, string[]>;
}

export interface SubArticle {
    id: string;
    title: string;
    description: string;
    mappedControls?: Record<string, string[]>;
    /** HIPAA Security Rule: a standard, or an implementation specification under a standard. */
    kind?: "standard" | "implementation-specification";
    /** HIPAA Security Rule obligation. Standards are required. Specifications use the eCFR parenthetical. */
    obligation?: "required" | "addressable";
    /** Official citation, for example "45 CFR 164.308(a)(1)(ii)(A)". */
    citation?: string;
}

export interface Question {
    id: string;
    text: string;
    type: string;
    options?: string[];
    relatedArticles?: string[];
    section?: string;
    subSection?: string;
    boolean?: boolean;
    /** Existing questionnaire hint. Not part of the legal requirement text. */
    failureGuidance?: string;
}
