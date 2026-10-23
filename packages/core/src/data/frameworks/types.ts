export interface Framework {
    id: string;
    name: string;
    version?: string;
    description: string;
    type: 'Security' | 'Privacy' | 'Quality' | 'Business Continuity' | 'AI & Data' | 'Governance' | 'Other';
    isObligation?: boolean;
    logo?: string;
    /** Number of bundled criteria or controls, when this catalog ships them. */
    controlsCount?: number;
    /** How requirement text is shipped. Omitted means the historical catalog entry. */
    contentPolicy?: "bundled" | "bring-your-own";
    /** SPDX identifier or a short license name for bundled requirement text. */
    contentLicense?: string;
}
