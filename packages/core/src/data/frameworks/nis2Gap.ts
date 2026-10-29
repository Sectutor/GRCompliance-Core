/**
 * NIS2 gap-analysis items.
 *
 * Article 21(2)(a)–(j), Article 20 and Article 23 titles and requirement text
 * follow the English text of Directive (EU) 2022/2555 in the Official Journal
 * (OJ L 333, 27.12.2022, p. 80):
 * https://eur-lex.europa.eu/eli/dir/2022/2555/oj
 *
 * Implementation notes are guidance only. Commission Implementing Regulation
 * (EU) 2024/2690 adds technical detail that is binding for the entity types
 * named in Article 21(5); for other entities it is a reference model.
 */

export const NIS2_GAP_FRAMEWORK = "NIS2";
export const NIS2_ELI = "https://eur-lex.europa.eu/eli/dir/2022/2555/oj";

export const NIS2_ARTICLE_21_CHAPEAU =
    "The measures referred to in Article 21(1) shall be based on an all-hazards approach that aims to protect network and information systems and the physical environment of those systems from incidents, and shall include at least the following";

const IR_NOTE =
    "Guidance only, not the legal requirement. Implementing Regulation (EU) 2024/2690 is binding for the entity types named in Article 21(5); other entities can use it as a reference model.";

export interface Nis2GapControl {
    controlId: string;
    /** "a"–"j" for Article 21(2), or "20" / "23". */
    point: string;
    name: string;
    /** Official requirement wording, without the source line. */
    requirement: string;
    description: string;
    source: string;
    category: string;
    owner: string;
    frequency: string;
    evidenceType: string;
    implementationGuidance: string;
}

export function nis2Source(citation: string): string {
    return `Directive (EU) 2022/2555, ${citation}, OJ L 333, 27.12.2022, p. 80. ${NIS2_ELI}`;
}

function article21(point: string, name: string, listItem: string, fields: Omit<Nis2GapControl, "controlId" | "point" | "name" | "requirement" | "description" | "source">): Nis2GapControl {
    const requirement = `${NIS2_ARTICLE_21_CHAPEAU}: ${listItem}`;
    const source = nis2Source(`Article 21(2)(${point})`);
    return {
        controlId: `NIS2-21-${point}`,
        point,
        name,
        requirement,
        description: `${requirement} Source: ${source}`,
        source,
        ...fields,
    };
}

export const nis2GapControls: Nis2GapControl[] = [
    {
        controlId: "NIS2-20",
        point: "20",
        name: "Governance",
        requirement:
            "Member States shall ensure that the management bodies of essential and important entities approve the cybersecurity risk-management measures taken by those entities in order to comply with Article 21, oversee its implementation and can be held liable for infringements by the entities of that Article. The application of this paragraph shall be without prejudice to national law as regards the liability rules applicable to public institutions, as well as the liability of public servants and elected or appointed officials. Member States shall ensure that the members of the management bodies of essential and important entities are required to follow training, and shall encourage essential and important entities to offer similar training to their employees on a regular basis, in order that they gain sufficient knowledge and skills to enable them to identify risks and assess cybersecurity risk-management practices and their impact on the services provided by the entity.",
        description: "",
        source: nis2Source("Article 20"),
        category: "Governance",
        owner: "Management body",
        frequency: "Annual",
        evidenceType: "Minutes",
        implementationGuidance:
            "Show management-body approval of the Article 21 measures (minutes or a signed resolution, with version and date), regular oversight reports and decisions, a briefing on accountability under the national transposition, and training records for management-body members. Offering similar training to employees is encouraged by Article 20(2). " + IR_NOTE,
    },
    article21("a", "Policies on risk analysis and information system security", "policies on risk analysis and information system security.", {
        category: "Risk analysis",
        owner: "CISO",
        frequency: "Annual",
        evidenceType: "Policy",
        implementationGuidance:
            "Keep an approved, communicated security policy that states the approach to risk analysis and information system security, with version history and topic-specific policies. " + IR_NOTE,
    }),
    article21("b", "Incident handling", "incident handling.", {
        category: "Incident",
        owner: "Security",
        frequency: "Annual",
        evidenceType: "Procedure",
        implementationGuidance:
            "Keep an incident-handling policy with roles, categorisation, escalation and playbooks. Significant-incident reporting to the CSIRT or competent authority is Article 23, not this point. " + IR_NOTE,
    }),
    article21("c", "Business continuity, such as backup management and disaster recovery, and crisis management", "business continuity, such as backup management and disaster recovery, and crisis management.", {
        category: "Continuity",
        owner: "Operations",
        frequency: "Annual",
        evidenceType: "Plan",
        implementationGuidance:
            "Keep a business-continuity and disaster-recovery plan, including backup management and crisis management, and a record that it has been tested. " + IR_NOTE,
    }),
    article21("d", "Supply chain security, including security-related aspects concerning the relationships between each entity and its direct suppliers or service providers", "supply chain security, including security-related aspects concerning the relationships between each entity and its direct suppliers or service providers.", {
        category: "Supply chain",
        owner: "Procurement",
        frequency: "Annual",
        evidenceType: "Assessment",
        implementationGuidance:
            "Cover direct suppliers and service providers, including the vulnerabilities specific to each of them and the quality of their products and cybersecurity practices (Article 21(3)). " + IR_NOTE,
    }),
    article21("e", "Security in network and information systems acquisition, development and maintenance, including vulnerability handling and disclosure", "security in network and information systems acquisition, development and maintenance, including vulnerability handling and disclosure.", {
        category: "Acquisition",
        owner: "Engineering",
        frequency: "Annual",
        evidenceType: "Standard",
        implementationGuidance:
            "Apply security requirements in acquisition, development and maintenance, and keep a vulnerability handling and disclosure process. Vulnerability disclosure sits in point (e), not in the effectiveness assessment in point (f). " + IR_NOTE,
    }),
    article21("f", "Policies and procedures to assess the effectiveness of cybersecurity risk-management measures", "policies and procedures to assess the effectiveness of cybersecurity risk-management measures.", {
        category: "Effectiveness",
        owner: "Security",
        frequency: "Annual",
        evidenceType: "Procedure",
        implementationGuidance:
            "Define what is measured, how often, who analyses the results, and how they are reported to management. This point is about effectiveness, not vulnerability disclosure. " + IR_NOTE,
    }),
    article21("g", "Basic cyber hygiene practices and cybersecurity training", "basic cyber hygiene practices and cybersecurity training.", {
        category: "Awareness",
        owner: "HR",
        frequency: "Annual",
        evidenceType: "Training record",
        implementationGuidance:
            "Run recurring cyber-hygiene practices and cybersecurity training, and keep completion records. " + IR_NOTE,
    }),
    article21("h", "Policies and procedures regarding the use of cryptography and, where appropriate, encryption", "policies and procedures regarding the use of cryptography and, where appropriate, encryption.", {
        category: "Cryptography",
        owner: "Security",
        frequency: "Annual",
        evidenceType: "Policy",
        implementationGuidance:
            "Set a cryptography policy covering where encryption is appropriate and how cryptographic keys are managed. " + IR_NOTE,
    }),
    article21("i", "Human resources security, access control policies and asset management", "human resources security, access control policies and asset management.", {
        category: "HR security",
        owner: "HR",
        frequency: "Annual",
        evidenceType: "Procedure",
        implementationGuidance:
            "Cover human resources security, access control policies, and asset management together. This point is not limited to access or asset management, and it is not the multi-factor authentication duty in point (j). " + IR_NOTE,
    }),
    article21("j", "The use of multi-factor authentication or continuous authentication solutions, secured voice, video and text communications and secured emergency communication systems within the entity, where appropriate", "the use of multi-factor authentication or continuous authentication solutions, secured voice, video and text communications and secured emergency communication systems within the entity, where appropriate.", {
        category: "Authentication",
        owner: "IT Security",
        frequency: "Annual",
        evidenceType: "Configuration",
        implementationGuidance:
            "Where appropriate, use multi-factor or continuous authentication, secured voice, video and text communications, and secured emergency communication systems. Access control policies and asset management are point (i), not this point. " + IR_NOTE,
    }),
    {
        controlId: "NIS2-23",
        point: "23",
        name: "Reporting obligations",
        requirement:
            "Each Member State shall ensure that essential and important entities notify, without undue delay, its CSIRT or, where applicable, its competent authority in accordance with paragraph 4 of any incident that has a significant impact on the provision of their services as referred to in paragraph 3 (significant incident). Where appropriate, entities concerned shall notify, without undue delay, the recipients of their services of significant incidents that are likely to adversely affect the provision of those services. For the purpose of that notification, the entities concerned submit an early warning within 24 hours of becoming aware of the significant incident (Article 23(4)(a)), an incident notification within 72 hours of becoming aware of the significant incident (Article 23(4)(b)), and a final report not later than one month after the submission of the incident notification (Article 23(4)(d)).",
        description: "",
        source: nis2Source("Article 23(1) and Article 23(4)"),
        category: "Reporting",
        owner: "Security",
        frequency: "Event-driven",
        evidenceType: "Notification record",
        implementationGuidance:
            "The 24-hour early warning and the 72-hour incident notification both run from the moment the entity becomes aware of the significant incident. The final report runs from submission of the incident notification, not from awareness and not from the early warning. A trust service provider notifies significant incidents that affect the provision of its trust services within 24 hours of becoming aware (Article 23(4), second subparagraph). If the incident is still ongoing when the final report is due, Article 23(4)(e) requires a progress report at that time and a final report within one month of handling the incident.",
    },
];

for (const item of nis2GapControls) {
    if (!item.description) {
        item.description = `${item.requirement} Source: ${item.source}`;
    }
}

export const nis2Article21Controls = nis2GapControls.filter((item) => item.point.length === 1);

export function nis2GapById(controlId: string): Nis2GapControl {
    const item = nis2GapControls.find((entry) => entry.controlId === controlId);
    if (!item) throw new Error(`Unknown NIS2 gap item ${controlId}`);
    return item;
}

/** Control-id weight used by gap-analysis priority scoring. Null when the id is not NIS2. */
export function nis2GapControlIdScore(controlId: string): number | null {
    const id = controlId.toUpperCase();
    if (!id.startsWith("NIS2-")) return null;
    if (id.startsWith("NIS2-21-J")) return 20;
    if (id.startsWith("NIS2-21-H") || id.startsWith("NIS2-21-I")) return 18;
    if (id.startsWith("NIS2-21-B") || id.startsWith("NIS2-23")) return 16;
    if (id.startsWith("NIS2-21-E")) return 15;
    if (id.startsWith("NIS2-21-F") || id.startsWith("NIS2-21-D")) return 14;
    if (id.startsWith("NIS2-21-C") || id.startsWith("NIS2-21-A") || id.startsWith("NIS2-20")) return 12;
    if (id.startsWith("NIS2-21-G")) return 10;
    return 10;
}

export const NIS2_GAP_DOMAINS = nis2GapControls.map((item) => item.category);

export function nis2GapSeedValues(item: Nis2GapControl) {
    return {
        controlId: item.controlId,
        name: item.name,
        description: item.description,
        framework: NIS2_GAP_FRAMEWORK,
        owner: item.owner,
        frequency: item.frequency,
        evidenceType: item.evidenceType,
        status: "active" as const,
        category: item.category,
        grouping: "NIS2",
        implementationGuidance: item.implementationGuidance,
    };
}
