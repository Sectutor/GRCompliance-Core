/**
 * 2017 Trust Services Criteria identifier catalog (AICPA TSP Section 100).
 *
 * The criterion IDs and the grouping into Security (common criteria), Availability,
 * Confidentiality, Processing Integrity, and Privacy are facts of that catalog,
 * including the privacy criteria P1.1–P8.1. AICPA criterion statements and points
 * of focus are copyrighted and are not reproduced. Each row is an ID plus a short
 * original title. Upload the licensed Trust Services Criteria for the full wording.
 *
 * Identifier source: AICPA Trust Services Criteria for Security, Availability,
 * Processing Integrity, Confidentiality, and Privacy (2017), with the 2022
 * revised points of focus (criterion IDs unchanged).
 */

export const SOC2_VERSION = "2017";

const NOTICE =
    "Identifier and short title only. The AICPA criterion statement and points of focus are not included. Upload the licensed 2017 Trust Services Criteria for the full wording.";

function criterion(id: string, name: string, category: string) {
    return { id, name, description: NOTICE, category };
}

export const soc2Controls = [
    criterion("CC1.1", "Integrity and ethical values", "Control environment"),
    criterion("CC1.2", "Board independence and oversight", "Control environment"),
    criterion("CC1.3", "Structures, reporting lines, and authority", "Control environment"),
    criterion("CC1.4", "Commitment to competent people", "Control environment"),
    criterion("CC1.5", "Accountability for internal control", "Control environment"),

    criterion("CC2.1", "Quality information for internal control", "Information and communication"),
    criterion("CC2.2", "Internal communication of control responsibilities", "Information and communication"),
    criterion("CC2.3", "External communication about internal control", "Information and communication"),

    criterion("CC3.1", "Objectives specific enough to identify risk", "Risk assessment"),
    criterion("CC3.2", "Identification and analysis of risk", "Risk assessment"),
    criterion("CC3.3", "Consideration of fraud risk", "Risk assessment"),
    criterion("CC3.4", "Identification of significant change", "Risk assessment"),

    criterion("CC4.1", "Ongoing and separate evaluations", "Monitoring"),
    criterion("CC4.2", "Communication of control deficiencies", "Monitoring"),

    criterion("CC5.1", "Control activities that mitigate risk", "Control activities"),
    criterion("CC5.2", "General controls over technology", "Control activities"),
    criterion("CC5.3", "Policies that deploy control activities", "Control activities"),

    criterion("CC6.1", "Logical access security architecture", "Logical and physical access"),
    criterion("CC6.2", "Registration before credentials are issued", "Logical and physical access"),
    criterion("CC6.3", "Access changes for role changes", "Logical and physical access"),
    criterion("CC6.4", "Physical access restrictions", "Logical and physical access"),
    criterion("CC6.5", "Removal of access when it is no longer authorized", "Logical and physical access"),
    criterion("CC6.6", "Protection against threats from outside the boundary", "Logical and physical access"),
    criterion("CC6.7", "Restrictions on moving information", "Logical and physical access"),
    criterion("CC6.8", "Protection from unauthorized or malicious software", "Logical and physical access"),

    criterion("CC7.1", "Detection of new vulnerabilities", "System operations"),
    criterion("CC7.2", "Monitoring for anomalies", "System operations"),
    criterion("CC7.3", "Evaluation of security events", "System operations"),
    criterion("CC7.4", "Incident response", "System operations"),
    criterion("CC7.5", "Recovery from security incidents", "System operations"),

    criterion("CC8.1", "Change management", "Change management"),

    criterion("CC9.1", "Mitigation of business-disruption risk", "Risk mitigation"),
    criterion("CC9.2", "Vendor and business-partner risk", "Risk mitigation"),

    criterion("A1.1", "Capacity management", "Availability"),
    criterion("A1.2", "Environmental protection, backup, and recovery", "Availability"),
    criterion("A1.3", "Recovery-plan testing", "Availability"),

    criterion("C1.1", "Identification of confidential information", "Confidentiality"),
    criterion("C1.2", "Disposal of confidential information", "Confidentiality"),

    criterion("PI1.1", "Processing-integrity objectives", "Processing integrity"),
    criterion("PI1.2", "Complete and accurate inputs", "Processing integrity"),
    criterion("PI1.3", "Complete, accurate, and timely processing", "Processing integrity"),
    criterion("PI1.4", "Complete, accurate, and timely outputs", "Processing integrity"),
    criterion("PI1.5", "Storage of inputs, items in processing, and outputs", "Processing integrity"),

    criterion("P1.1", "Privacy notice", "Privacy"),
    criterion("P2.1", "Choice and consent", "Privacy"),
    criterion("P3.1", "Collection consistent with objectives", "Privacy"),
    criterion("P3.2", "Consent for collection", "Privacy"),
    criterion("P4.1", "Use limited to identified purposes", "Privacy"),
    criterion("P4.2", "Retention limited to identified purposes", "Privacy"),
    criterion("P4.3", "Disposal of personal information", "Privacy"),
    criterion("P5.1", "Data-subject access", "Privacy"),
    criterion("P5.2", "Data-subject correction", "Privacy"),
    criterion("P6.1", "Disclosure to third parties", "Privacy"),
    criterion("P6.2", "Record of authorized disclosures", "Privacy"),
    criterion("P6.3", "Record of unauthorized disclosures", "Privacy"),
    criterion("P6.4", "Privacy commitments from vendors", "Privacy"),
    criterion("P6.5", "Vendor notice of unauthorized disclosures", "Privacy"),
    criterion("P6.6", "Notice of a breach to affected data subjects", "Privacy"),
    criterion("P6.7", "Accounting of disclosures", "Privacy"),
    criterion("P7.1", "Quality of personal information", "Privacy"),
    criterion("P8.1", "Privacy inquiries, complaints, and disputes", "Privacy"),
];

export const SOC2_CRITERIA_COUNT = soc2Controls.length;
