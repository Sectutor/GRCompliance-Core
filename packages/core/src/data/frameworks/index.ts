import { Framework } from "./types";

export const frameworks: Framework[] = [
    {
        id: "iso-27001",
        name: "ISO 27001:2022",
        description: "The leading international standard for information security management systems (ISMS).",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/iso27001.svg"
    },
    {
        id: "iso-22301",
        name: "ISO 22301:2019",
        description: "International standard for Business Continuity Management Systems (BCMS).",
        type: "Business Continuity",
        isObligation: true,
        logo: "/frameworks/iso27001.svg"
    },
    {
        id: "hitrust",
        name: "HITRUST-Aligned (Representative)",
        description: "Representative control set aligned with HITRUST domains (e1, i1, r2) for readiness and simulation. Not the official licensed CSF text.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/hitrust.svg"
    },
    {
        id: "soc-2",
        name: "SOC 2 Type II",
        description: "Service Organization Control 2 - Trust Services Criteria for security, availability, processing integrity, confidentiality and privacy.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/soc2.svg"
    },
    {
        id: "nist-csf",
        name: "NIST CSF 2.0",
        description: "National Institute of Standards and Technology Cybersecurity Framework. Voluntary guidance based on existing standards.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/nist.svg",
        version: "2.0",
        controlsCount: 106,
        contentPolicy: "bundled",
        contentLicense: "NIST CSWP 29 (public domain)"
    },
    {
        id: "nist-800-171",
        name: "NIST SP 800-171 r2",
        description: "Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/nist.svg"
    },
    {
        id: "pci-dss-v4",
        name: "PCI DSS v4.0",
        description: "Payment Card Industry Data Security Standard v4.0.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/pci.svg"
    },
    {
        id: "cis-controls",
        name: "CIS Controls v8",
        description: "Center for Internet Security Critical Security Controls. Prioritized set of actions to protect from cyber attacks.",
        type: "Security",
        logo: "/frameworks/cis.svg"
    },
    {
        id: "csa-ccm",
        name: "CSA CCM v4",
        description: "Cloud Security Alliance Cloud Controls Matrix. Fundamental security principles to guide cloud vendors and to assist prospective cloud customers.",
        type: "Security",
        logo: "/frameworks/csa.svg"
    },
    {
        id: "nist-800-53",
        name: "NIST SP 800-53 Rev 5",
        description: "Security and Privacy Controls for Information Systems and Organizations.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/nist.svg"
    },
    {
        id: "fedramp-moderate",
        name: "FedRAMP Moderate",
        description: "Federal Risk and Authorization Management Program - Moderate Baseline (Representative).",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/fedramp.svg"
    },
    {
        id: "cyber-essentials",
        name: "Cyber Essentials / Plus",
        description: "UK Government-backed scheme focusing on 5 technical control themes.",
        type: "Security",
        logo: "/frameworks/cyber_essentials.svg"
    },
    {
        id: "nist-ai-rmf",
        name: "NIST AI RMF",
        description: "NIST AI Risk Management Framework (1.0) for trustworthy and responsible AI.",
        type: "AI & Data",
        logo: "/frameworks/nist.svg"
    },
    {
        id: "owasp-aisvs",
        name: "OWASP AISVS (AI Security)",
        description: "OWASP Artificial Intelligence Security Verification Standard (1.0). structured checklist to evaluate AI-driven applications.",
        type: "AI & Data",
        logo: "/frameworks/owasp.svg",
        version: "1.0",
        controlsCount: 191,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-SA-4.0"
    },
    {
        id: "owasp-asvs",
        name: "OWASP ASVS (App Security)",
        description: "OWASP Application Security Verification Standard (4.0.3). Basis for testing technical security controls.",
        type: "Security",
        logo: "/frameworks/owasp.svg",
        version: "4.0.3",
        controlsCount: 286,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-SA-3.0"
    },
    {
        id: "owasp_masvs",
        name: "OWASP MASVS (Mobile Security)",
        description: "OWASP Mobile Application Security Verification Standard (2.0). The industry standard for mobile app security.",
        type: "Security",
        logo: "/frameworks/owasp.svg",
        version: "2.0.0",
        controlsCount: 20,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-SA-4.0"
    },
    {
        id: "owasp_samm",
        name: "OWASP SAMM (Maturity Model)",
        description: "OWASP Software Assurance Maturity Model. An effective and measurable way for all types of organizations to analyze and improve their software security posture.",
        type: "Governance",
        logo: "/frameworks/owasp.svg",
        version: "2",
        controlsCount: 90,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-SA-4.0"
    },
    {
        id: "owasp_api_top10",
        name: "OWASP API Security Top 10",
        description: "The most critical API security risks. Focuses on strategies and solutions to understand and mitigate the unique vulnerabilities and security risks of APIs.",
        type: "Security",
        logo: "/frameworks/owasp.svg",
        version: "2023",
        controlsCount: 10,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-SA-4.0"
    },
    {
        id: "owasp_top10",
        name: "OWASP Web Top 10",
        description: "The standard awareness document for developers and web application security (2025).",
        version: "2025",
        type: "Security",
        logo: "/frameworks/owasp.svg",
        controlsCount: 10,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-SA-4.0"
    },
    {
        id: "owasp_top10_2021",
        name: "OWASP Web Top 10 (2021)",
        description: "The standard awareness document for developers and web application security (2021).",
        version: "2021",
        type: "Security",
        logo: "/frameworks/owasp.svg",
        controlsCount: 10,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-SA-4.0"
    },
    {
        id: "essential-eight",
        name: "Australian Essential Eight",
        description: "Eight prioritized mitigation strategies for cyber resilience with maturity levels 0–3.",
        type: "Security",
        logo: "/frameworks/australia.svg",
        version: "2023-11",
        controlsCount: 304,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-4.0"
    },
    {
        id: "cmmc-2",
        name: "CMMC 2.0",
        description: "Cybersecurity Maturity Model Certification for Defense Industrial Base (DIB).",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/cmmc.svg"
    },
    {
        id: "soc-1",
        name: "SOC 1 Type II",
        description: "Service Organization Control 1 - Internal Control over Financial Reporting (ICFR). Control objectives are entity-specific and are not bundled.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/soc1.svg",
        contentPolicy: "bring-your-own",
        contentLicense: "bring-your-own (AICPA text is not redistributed; there is no universal control catalog)"
    },
    {
        id: "tisax",
        name: "TISAX",
        description: "Trusted Information Security Assessment Exchange - Automotive industry standard. The VDA ISA catalog is not bundled.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/tisax.svg",
        contentPolicy: "bring-your-own",
        contentLicense: "bring-your-own (VDA ISA text is not redistributed)"
    },
    {
        id: "nist-800-161",
        name: "NIST SP 800-161",
        description: "Cybersecurity Supply Chain Risk Management (SCRM) Practices.",
        type: "Security",
        isObligation: true,
        logo: "/frameworks/nist.svg",
        version: "r1-upd1",
        controlsCount: 297,
        contentPolicy: "bundled",
        contentLicense: "NIST SP 800-161r1-upd1 (public domain)"
    },
    {
        id: "scf",
        name: "Secure Controls Framework (SCF)",
        description: "A comprehensive library of cybersecurity and privacy control meta-framework. Control text is not bundled; upload the workbook you obtained.",
        type: "Security",
        logo: "/frameworks/scf.svg",
        contentPolicy: "bring-your-own",
        contentLicense: "bring-your-own (CC BY-ND 4.0 text is not redistributed)"
    },
    {
        id: "owasp_ml_top10",
        name: "OWASP ML Security Top 10",
        description: "Vulnerabilities in machine learning models and systems through the ML lifecycle (2023).",
        version: "2023",
        type: "AI & Data",
        logo: "/frameworks/owasp.svg",
        controlsCount: 10,
        contentPolicy: "bundled",
        contentLicense: "CC-BY-SA-4.0"
    }
];

export const getFramework = (id: string) => frameworks.find(f => f.id === id);
