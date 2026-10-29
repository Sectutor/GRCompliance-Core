import { Regulation } from "./types";
import { nis2AnnexSubArticles } from "./nis2Annex";
import { nis2GapById } from "../frameworks/nis2Gap";

/**
 * Article 21(2) sub-articles are the Annex to Commission Implementing Regulation
 * (EU) 2024/2690 (OJ L, 2024/2690, 17 October 2024), EU law, reusable:
 * https://eur-lex.europa.eu/eli/reg_impl/2024/2690/oj
 * An annex section whose heading cites more than one Article 21(2) point is
 * listed under each of those points. The annex sentences are unchanged, including
 * a sentence that names only one of the points. Section 11 (access control) is
 * under points (i) and (j). Section 13 (environmental and physical security) is
 * under points (c), (e), and (i).
 */

export const nis2: Regulation = {
    id: "nis2",
    name: "EU NIS2 Directive",
    description: "The Network and Information Security (NIS2) Directive is EU-wide legislation on cybersecurity. It provides legal measures to boost the overall level of cybersecurity in the EU.",
    type: "Security",
    logo: "/frameworks/eu_flag.svg",
    questions: [
        {
            id: "nis2-q1",
            text: "Does the management body actively approve and oversee cybersecurity risk-management measures and accept accountability for breaches?",
            type: "boolean",
            relatedArticles: ["nis2-art-20"],
            failureGuidance: "Establish a charter for the Board/Management that explicitly includes cybersecurity oversight duties. Schedule quarterly security reviews with leadership."
        },
        {
            id: "nis2-q2",
            text: "Do you maintain up-to-date policies on risk analysis and information system security?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-a"],
            failureGuidance: "Draft an Information Security Policy (ISP) and a Risk Assessment Methodology. Review and update these documents at least annually."
        },
        {
            id: "nis2-q3",
            text: "Is there a formal incident handling process in place to prevent, detect, and respond to cyber incidents?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-b"],
            failureGuidance: "Develop an Incident Response Plan (IRP) defining roles, communication channels, and classification of incidents. Test it with a tabletop exercise."
        },
        {
            id: "nis2-q4",
            text: "Do you have business continuity and disaster recovery plans that are regularly tested?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-c"],
            failureGuidance: "Create a Business Continuity Plan (BCP) and Disaster Recovery Plan (DRP). Perform a backup restoration test to ensure data integrity."
        },
        {
            id: "nis2-q5",
            text: "Are supply chain security risks identified, involving assessments of direct suppliers and service providers?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-d"],
            failureGuidance: "Implement a Third-Party Risk Management (TPRM) program. Send security questionnaires to critical vendors and include security clauses in contracts."
        },
        {
            id: "nis2-q6",
            text: "Are security measures integrated into the acquisition, development, and maintenance of network systems (including vulnerability handling)?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-e"],
            failureGuidance: "Adopt a Vulnerability Management Policy. Scan systems regularly and patch critical vulnerabilities within 14 days. Use Secure Software Development Lifecycle (SSDLC) practices."
        },
        {
            id: "nis2-q7",
            text: "Do you conduct regular audits and assessments to measure the effectiveness of your security controls?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-f"],
            failureGuidance: "Schedule an independent yearly security audit or penetration test. Define KPIs (e.g., Mean Time to Detect) to measure security performance."
        },
        {
            id: "nis2-q8",
            text: "Is there a mandatory cybersecurity training program and basic cyber hygiene practice (e.g., strong passwords, updates) for all staff?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-g"],
            failureGuidance: "Launch a Security Awareness Training platform. Enforce a Password Policy requiring complexity or passkeys. Run phishing simulations."
        },
        {
            id: "nis2-q9",
            text: "Are cryptography and encryption used effectively to protect data at rest and in transit?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-h"],
            failureGuidance: "Enable full-disk encryption on all endpoints (BitLocker/FileVault). Ensure all web traffic uses TLS 1.2+. Encrypt sensitive databases."
        },
        {
            id: "nis2-q10",
            text: "Are human resources security procedures (background checks, access control) implemented for sensitive roles?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-i"],
            failureGuidance: "Update HR policies to include background checks for privileged roles. Automate access revocation immediately upon employee termination."
        },
        {
            id: "nis2-q11",
            text: "Where appropriate, do you use multi-factor or continuous authentication, secured voice, video and text communications, and secured emergency communication systems?",
            type: "boolean",
            relatedArticles: ["nis2-art-21-2-j"],
            failureGuidance: "Enforce MFA on all remote access points (VPN, Cloud Email, SaaS). Require Phishing-Resistant MFA for administrators."
        },
        {
            id: "nis2-q12",
            text: "Do you have a procedure to notify the competent authority/CSIRT of significant incidents without undue delay?",
            type: "boolean",
            relatedArticles: ["nis2-art-23"],
            failureGuidance: "Identify your competent authority (CSIRT). Create a notification template to ensure you can report significant incidents within the 24-hour deadline."
        }
    ],
    articles: [
        {
            id: "nis2-art-20",
            numericId: "20",
            title: nis2GapById("NIS2-20").name,
            description: nis2GapById("NIS2-20").description,
            mappedControls: { "NIST CSF": ["GV.GO-01", "GV.RM-01"] }
        },
        {
            id: "nis2-art-21-intro",
            numericId: "21.1",
            title: "Cybersecurity risk-management duty",
            description: "Essential and important entities shall take appropriate and proportionate technical, operational and organisational measures to manage the risks posed to the security of network and information systems.",
            mappedControls: { "NIST CSF": ["GV.RM-02"] }
        },
        // The "10 Major Points" explicitly broken out as actionable items
        {
            id: "nis2-art-21-2-a",
            numericId: "21.2(a)",
            title: nis2GapById("NIS2-21-a").name,
            description: nis2GapById("NIS2-21-a").description,
            mappedControls: { "NIST 800-53": ["RA-1", "PL-2", "CA-1"], "ISO 27001": ["A.5.1.1", "A.8.2"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-a"]
        },
        {
            id: "nis2-art-21-2-b",
            numericId: "21.2(b)",
            title: nis2GapById("NIS2-21-b").name,
            description: nis2GapById("NIS2-21-b").description,
            mappedControls: { "NIST 800-53": ["IR-1", "IR-4", "IR-6"], "ISO 27001": ["A.16.1"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-b"]
        },
        {
            id: "nis2-art-21-2-c",
            numericId: "21.2(c)",
            title: nis2GapById("NIS2-21-c").name,
            description: nis2GapById("NIS2-21-c").description,
            mappedControls: { "NIST 800-53": ["CP-1", "CP-2", "CP-9"], "ISO 27001": ["A.17.1"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-c"]
        },
        {
            id: "nis2-art-21-2-d",
            numericId: "21.2(d)",
            title: nis2GapById("NIS2-21-d").name,
            description: nis2GapById("NIS2-21-d").description,
            mappedControls: { "NIST 800-53": ["SR-1", "SR-3"], "ISO 27001": ["A.15.1", "A.15.2"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-d"]
        },
        {
            id: "nis2-art-21-2-e",
            numericId: "21.2(e)",
            title: nis2GapById("NIS2-21-e").name,
            description: nis2GapById("NIS2-21-e").description,
            mappedControls: { "NIST 800-53": ["SA-3", "SA-8", "SI-2"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-e"]
        },
        {
            id: "nis2-art-21-2-f",
            numericId: "21.2(f)",
            title: nis2GapById("NIS2-21-f").name,
            description: nis2GapById("NIS2-21-f").description,
            mappedControls: { "NIST 800-53": ["CA-2", "CA-7"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-f"]
        },
        {
            id: "nis2-art-21-2-g",
            numericId: "21.2(g)",
            title: nis2GapById("NIS2-21-g").name,
            description: nis2GapById("NIS2-21-g").description,
            mappedControls: { "NIST 800-53": ["AT-2", "AT-3", "SI-2"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-g"]
        },
        {
            id: "nis2-art-21-2-h",
            numericId: "21.2(h)",
            title: nis2GapById("NIS2-21-h").name,
            description: nis2GapById("NIS2-21-h").description,
            mappedControls: { "NIST 800-53": ["SC-13", "SC-28"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-h"]
        },
        {
            id: "nis2-art-21-2-i",
            numericId: "21.2(i)",
            title: nis2GapById("NIS2-21-i").name,
            description: nis2GapById("NIS2-21-i").description,
            mappedControls: { "NIST 800-53": ["PS-1", "AC-1", "CM-8"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-i"]
        },
        {
            id: "nis2-art-21-2-j",
            numericId: "21.2(j)",
            title: nis2GapById("NIS2-21-j").name,
            description: nis2GapById("NIS2-21-j").description,
            mappedControls: { "NIST 800-53": ["IA-2", "AC-17"] },
            subArticles: nis2AnnexSubArticles["nis2-art-21-2-j"]
        },
        {
            id: "nis2-art-23",
            numericId: "23",
            title: nis2GapById("NIS2-23").name,
            description: nis2GapById("NIS2-23").description,
            mappedControls: { "NIST 800-53": ["IR-6"] }
        }
    ]
};
