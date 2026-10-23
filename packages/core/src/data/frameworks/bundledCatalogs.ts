import aisvsCatalog from "./owaspAisvs.catalog.json";
import apiCatalog from "./owaspApiTop10.catalog.json";
import asvsCatalog from "./owaspAsvs.catalog.json";
import masvsCatalog from "./owaspMasvs.catalog.json";
import mlCatalog from "./owaspMlTop10.catalog.json";
import sammCatalog from "./owaspSamm.catalog.json";
import top10_2021Catalog from "./owaspTop10_2021.catalog.json";
import top10_2025Catalog from "./owaspTop10_2025.catalog.json";
import csfCatalog from "./nistCsf20.catalog.json";
import essentialEightCatalog from "./essentialEight.catalog.json";
import nist800161Catalog from "./nist800161.catalog.json";

export interface CatalogControl {
    id: string;
    name: string;
    description: string;
    category: string;
    grouping?: string;
    implementationGuidance?: string;
}

interface CatalogFile {
    license: string;
    source: string;
    attribution?: string;
    controls: CatalogControl[];
}

export interface BundledFramework {
    type: string;
    frameworkName: string;
    grouping: string;
    version: number;
    guidance: string;
    controls: CatalogControl[];
}

function catalog(file: CatalogFile, entry: Omit<BundledFramework, "controls" | "guidance"> & { guidance?: string }): BundledFramework {
    return {
        ...entry,
        guidance: entry.guidance ?? `${file.attribution ?? file.license} Source: ${file.source}`,
        controls: file.controls,
    };
}

export const bundledFrameworks: BundledFramework[] = [
    catalog(csfCatalog as CatalogFile, {
        type: "nist_csf_2",
        frameworkName: "NIST CSF 2.0",
        grouping: "NIST CSF 2.0",
        version: 2,
        guidance: "NIST Cybersecurity Framework 2.0 subcategory outcomes, CSWP 29, public domain. Source: https://doi.org/10.6028/NIST.CSWP.29",
    }),
    catalog(essentialEightCatalog as CatalogFile, {
        type: "essential_eight",
        frameworkName: "Australian Essential Eight",
        grouping: "Essential Eight",
        version: 2023,
        guidance: "Essential Eight Maturity Model, November 2023, Appendices A–C. © Commonwealth of Australia 2023, CC BY 4.0. Local IDs are not ACSC identifiers. Source: https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/essential-eight/essential-eight-maturity-model",
    }),
    catalog(nist800161Catalog as CatalogFile, {
        type: "nist_800_161",
        frameworkName: "NIST SP 800-161",
        grouping: "NIST SP 800-161",
        version: 1,
        guidance: "NIST SP 800-161 Rev. 1 Update 1, Appendix B, Table 6. Public domain. Source: https://doi.org/10.6028/NIST.SP.800-161r1-upd1",
    }),
    catalog(asvsCatalog as CatalogFile, {
        type: "owasp_asvs",
        frameworkName: "OWASP ASVS (App Security)",
        grouping: "OWASP ASVS",
        version: 4,
    }),
    catalog(masvsCatalog as CatalogFile, {
        type: "owasp_masvs",
        frameworkName: "OWASP MASVS (Mobile Security)",
        grouping: "OWASP MASVS",
        version: 2,
    }),
    catalog(aisvsCatalog as CatalogFile, {
        type: "owasp_aisvs",
        frameworkName: "OWASP AISVS (AI Security)",
        grouping: "OWASP AISVS",
        version: 1,
    }),
    catalog(sammCatalog as CatalogFile, {
        type: "owasp_samm",
        frameworkName: "OWASP SAMM (Maturity Model)",
        grouping: "OWASP SAMM",
        version: 2,
    }),
    catalog(apiCatalog as CatalogFile, {
        type: "owasp_api_top10",
        frameworkName: "OWASP API Security Top 10",
        grouping: "OWASP API Security Top 10",
        version: 2023,
    }),
    catalog(top10_2025Catalog as CatalogFile, {
        type: "owasp_top10",
        frameworkName: "OWASP Web Top 10",
        grouping: "OWASP Top 10",
        version: 2025,
    }),
    catalog(top10_2021Catalog as CatalogFile, {
        type: "owasp_top10_2021",
        frameworkName: "OWASP Web Top 10 (2021)",
        grouping: "OWASP Top 10",
        version: 2021,
    }),
    catalog(mlCatalog as CatalogFile, {
        type: "owasp_ml_top10",
        frameworkName: "OWASP ML Security Top 10",
        grouping: "OWASP ML Security Top 10",
        version: 2023,
    }),
];

export function bundledFramework(type: string): BundledFramework | undefined {
    return bundledFrameworks.find((entry) => entry.type === type);
}

export const bringYourOwnFrameworks: Record<string, { frameworkName: string; grouping: string }> = {
    soc1: { frameworkName: "SOC 1 Type II", grouping: "SOC 1" },
    tisax: { frameworkName: "TISAX", grouping: "TISAX" },
    scf: { frameworkName: "Secure Controls Framework (SCF)", grouping: "SCF" },
};
