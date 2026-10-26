import { Regulation } from "./types";

/**
 * HIPAA Security Rule standards and implementation specifications.
 * Wording is the text of 45 CFR 164.308, 164.310, 164.312, 164.314, and 164.316
 * (U.S. government work, public domain), transcribed from the Legal Information
 * Institute presentation of the eCFR because the eCFR HTML endpoint blocked
 * automated access:
 * https://www.law.cornell.edu/cfr/text/45/164.308
 * https://www.law.cornell.edu/cfr/text/45/164.310
 * https://www.law.cornell.edu/cfr/text/45/164.312
 * https://www.law.cornell.edu/cfr/text/45/164.314
 * https://www.law.cornell.edu/cfr/text/45/164.316
 * NIST values are SP 800-53 Rev. 5 control identifiers (public domain).
 * ISO values are this repository's ISO/IEC 27001:2022 control id and short title only.
 * A standard is marked required. An implementation specification uses the
 * parenthetical Required or Addressable in the regulation.
 */

export const hipaa: Regulation = {
    id: "hipaa",
    name: "HIPAA (Health Insurance Portability and Accountability Act)",
    description: "The HIPAA Security Rule (45 CFR Part 164 Subpart C) requires covered entities and business associates to protect electronic protected health information. The Security Rule rows below are the standards and implementation specifications in §§ 164.308, 164.310, 164.312, 164.314, and 164.316.",
    type: "Privacy",
    logo: "/frameworks/hipaa.svg",
    link: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C",
    articles: [
        {
            id: "hipaa-164-308",
            numericId: "\u00a7 164.308",
            title: "Security Rule: Administrative Safeguards",
            description: "Administrative safeguards in 45 CFR 164.308. A covered entity or business associate must, in accordance with \u00a7 164.306, implement these standards and implementation specifications. Requirement text is the eCFR wording (public domain), transcribed from the Legal Information Institute presentation at https://www.law.cornell.edu/cfr/text/45/164.308.",
            mappedControls: {
                "NIST 800-53": ["RA-1", "PL-1", "PS-1", "IR-1", "CP-1"],
                "ISO 27001": ["5.1 Policies for information security", "5.2 Information security roles and responsibilities"]
            },
            subArticles: [
                {
                    id: "164-308-a-1-i",
                    title: "Security management process",
                    description: "Implement policies and procedures to prevent, detect, contain, and correct security violations.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(1)(i)",
                    mappedControls: {
                        "NIST 800-53": ["RA-1", "PL-1"],
                        "ISO 27001": ["5.1 Policies for information security"]
                    }
                },
                {
                    id: "164-308-a-1-ii-A",
                    title: "Risk analysis",
                    description: "Conduct an accurate and thorough assessment of the potential risks and vulnerabilities to the confidentiality, integrity, and availability of electronic protected health information held by the covered entity or business associate.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(1)(ii)(A)",
                    mappedControls: {
                        "NIST 800-53": ["RA-3"],
                        "ISO 27001": ["6.1.2_C Information security risk assessment"]
                    }
                },
                {
                    id: "164-308-a-1-ii-B",
                    title: "Risk management",
                    description: "Implement security measures sufficient to reduce risks and vulnerabilities to a reasonable and appropriate level to comply with \u00a7 164.306(a).",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(1)(ii)(B)",
                    mappedControls: {
                        "NIST 800-53": ["RA-7"],
                        "ISO 27001": ["6.1.3_C Information security risk treatment"]
                    }
                },
                {
                    id: "164-308-a-1-ii-C",
                    title: "Sanction policy",
                    description: "Apply appropriate sanctions against workforce members who fail to comply with the security policies and procedures of the covered entity or business associate.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(1)(ii)(C)",
                    mappedControls: {
                        "NIST 800-53": ["PS-8"],
                        "ISO 27001": ["6.4 Disciplinary process"]
                    }
                },
                {
                    id: "164-308-a-1-ii-D",
                    title: "Information system activity review",
                    description: "Implement procedures to regularly review records of information system activity, such as audit logs, access reports, and security incident tracking reports.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(1)(ii)(D)",
                    mappedControls: {
                        "NIST 800-53": ["AU-6", "AU-2"],
                        "ISO 27001": ["8.15 Logging", "8.16 Monitoring activities"]
                    }
                },
                {
                    id: "164-308-a-2",
                    title: "Assigned security responsibility",
                    description: "Identify the security official who is responsible for the development and implementation of the policies and procedures required by this subpart for the covered entity or business associate.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(2)",
                    mappedControls: {
                        "NIST 800-53": ["PM-2"],
                        "ISO 27001": ["5.2 Information security roles and responsibilities"]
                    }
                },
                {
                    id: "164-308-a-3-i",
                    title: "Workforce security",
                    description: "Implement policies and procedures to ensure that all members of its workforce have appropriate access to electronic protected health information, as provided under paragraph (a)(4) of this section, and to prevent those workforce members who do not have access under paragraph (a)(4) of this section from obtaining access to electronic protected health information.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(3)(i)",
                    mappedControls: {
                        "NIST 800-53": ["PS-1", "AC-2"],
                        "ISO 27001": ["5.18 Access rights", "6.1 Screening"]
                    }
                },
                {
                    id: "164-308-a-3-ii-A",
                    title: "Authorization and/or supervision",
                    description: "Implement procedures for the authorization and/or supervision of workforce members who work with electronic protected health information or in locations where it might be accessed.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(3)(ii)(A)",
                    mappedControls: {
                        "NIST 800-53": ["AC-3", "AC-5"],
                        "ISO 27001": ["5.15 Access control", "8.2 Privileged access rights"]
                    }
                },
                {
                    id: "164-308-a-3-ii-B",
                    title: "Workforce clearance procedure",
                    description: "Implement procedures to determine that the access of a workforce member to electronic protected health information is appropriate.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(3)(ii)(B)",
                    mappedControls: {
                        "NIST 800-53": ["PS-3"],
                        "ISO 27001": ["6.1 Screening"]
                    }
                },
                {
                    id: "164-308-a-3-ii-C",
                    title: "Termination procedures",
                    description: "Implement procedures for terminating access to electronic protected health information when the employment of, or other arrangement with, a workforce member ends or as required by determinations made as specified in paragraph (a)(3)(ii)(B) of this section.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(3)(ii)(C)",
                    mappedControls: {
                        "NIST 800-53": ["PS-4", "AC-2"],
                        "ISO 27001": ["6.5 Responsibilities after termination or change of employment", "5.18 Access rights"]
                    }
                },
                {
                    id: "164-308-a-4-i",
                    title: "Information access management",
                    description: "Implement policies and procedures for authorizing access to electronic protected health information that are consistent with the applicable requirements of subpart E of this part.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(4)(i)",
                    mappedControls: {
                        "NIST 800-53": ["AC-1", "AC-3"],
                        "ISO 27001": ["5.15 Access control", "5.18 Access rights"]
                    }
                },
                {
                    id: "164-308-a-4-ii-A",
                    title: "Isolating health care clearinghouse functions",
                    description: "If a health care clearinghouse is part of a larger organization, the clearinghouse must implement policies and procedures that protect the electronic protected health information of the clearinghouse from unauthorized access by the larger organization.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(4)(ii)(A)",
                    mappedControls: {
                        "NIST 800-53": ["AC-4", "SC-7"],
                        "ISO 27001": ["8.23 Segregation in networks"]
                    }
                },
                {
                    id: "164-308-a-4-ii-B",
                    title: "Access authorization",
                    description: "Implement policies and procedures for granting access to electronic protected health information, for example, through access to a workstation, transaction, program, process, or other mechanism.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(4)(ii)(B)",
                    mappedControls: {
                        "NIST 800-53": ["AC-2", "AC-6"],
                        "ISO 27001": ["5.18 Access rights", "8.2 Privileged access rights"]
                    }
                },
                {
                    id: "164-308-a-4-ii-C",
                    title: "Access establishment and modification",
                    description: "Implement policies and procedures that, based upon the covered entity's or the business associate's access authorization policies, establish, document, review, and modify a user's right of access to a workstation, transaction, program, or process.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(4)(ii)(C)",
                    mappedControls: {
                        "NIST 800-53": ["AC-2"],
                        "ISO 27001": ["5.18 Access rights"]
                    }
                },
                {
                    id: "164-308-a-5-i",
                    title: "Security awareness and training",
                    description: "Implement a security awareness and training program for all members of its workforce (including management).",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(5)(i)",
                    mappedControls: {
                        "NIST 800-53": ["AT-1", "AT-2"],
                        "ISO 27001": ["6.3 Information security awareness, education and training"]
                    }
                },
                {
                    id: "164-308-a-5-ii-A",
                    title: "Security reminders",
                    description: "Periodic security updates.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(5)(ii)(A)",
                    mappedControls: {
                        "NIST 800-53": ["AT-2"],
                        "ISO 27001": ["6.3 Information security awareness, education and training"]
                    }
                },
                {
                    id: "164-308-a-5-ii-B",
                    title: "Protection from malicious software",
                    description: "Procedures for guarding against, detecting, and reporting malicious software.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(5)(ii)(B)",
                    mappedControls: {
                        "NIST 800-53": ["SI-3"],
                        "ISO 27001": ["8.7 Protection against malware"]
                    }
                },
                {
                    id: "164-308-a-5-ii-C",
                    title: "Log-in monitoring",
                    description: "Procedures for monitoring log-in attempts and reporting discrepancies.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(5)(ii)(C)",
                    mappedControls: {
                        "NIST 800-53": ["AC-7", "AU-2"],
                        "ISO 27001": ["8.5 Secure authentication", "8.15 Logging"]
                    }
                },
                {
                    id: "164-308-a-5-ii-D",
                    title: "Password management",
                    description: "Procedures for creating, changing, and safeguarding passwords.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(5)(ii)(D)",
                    mappedControls: {
                        "NIST 800-53": ["IA-5"],
                        "ISO 27001": ["5.17 Authentication information"]
                    }
                },
                {
                    id: "164-308-a-6-i",
                    title: "Security incident procedures",
                    description: "Implement policies and procedures to address security incidents.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(6)(i)",
                    mappedControls: {
                        "NIST 800-53": ["IR-1", "IR-8"],
                        "ISO 27001": ["5.24 Information security incident management planning and preparation"]
                    }
                },
                {
                    id: "164-308-a-6-ii",
                    title: "Response and reporting",
                    description: "Identify and respond to suspected or known security incidents; mitigate, to the extent practicable, harmful effects of security incidents that are known to the covered entity or business associate; and document security incidents and their outcomes.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(6)(ii)",
                    mappedControls: {
                        "NIST 800-53": ["IR-4", "IR-6"],
                        "ISO 27001": ["5.25 Management of information security incidents", "5.29 Information security event reporting"]
                    }
                },
                {
                    id: "164-308-a-7-i",
                    title: "Contingency plan",
                    description: "Establish (and implement as needed) policies and procedures for responding to an emergency or other occurrence (for example, fire, vandalism, system failure, and natural disaster) that damages systems that contain electronic protected health information.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(7)(i)",
                    mappedControls: {
                        "NIST 800-53": ["CP-1", "CP-2"],
                        "ISO 27001": ["5.30 ICT readiness for business continuity", "5.28 Information security during disruption"]
                    }
                },
                {
                    id: "164-308-a-7-ii-A",
                    title: "Data backup plan",
                    description: "Establish and implement procedures to create and maintain retrievable exact copies of electronic protected health information.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(7)(ii)(A)",
                    mappedControls: {
                        "NIST 800-53": ["CP-9"],
                        "ISO 27001": ["8.13 Information backup"]
                    }
                },
                {
                    id: "164-308-a-7-ii-B",
                    title: "Disaster recovery plan",
                    description: "Establish (and implement as needed) procedures to restore any loss of data.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(7)(ii)(B)",
                    mappedControls: {
                        "NIST 800-53": ["CP-10"],
                        "ISO 27001": ["5.30 ICT readiness for business continuity"]
                    }
                },
                {
                    id: "164-308-a-7-ii-C",
                    title: "Emergency mode operation plan",
                    description: "Establish (and implement as needed) procedures to enable continuation of critical business processes for protection of the security of electronic protected health information while operating in emergency mode.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(7)(ii)(C)",
                    mappedControls: {
                        "NIST 800-53": ["CP-2"],
                        "ISO 27001": ["5.28 Information security during disruption"]
                    }
                },
                {
                    id: "164-308-a-7-ii-D",
                    title: "Testing and revision procedures",
                    description: "Implement procedures for periodic testing and revision of contingency plans.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(7)(ii)(D)",
                    mappedControls: {
                        "NIST 800-53": ["CP-4"],
                        "ISO 27001": ["5.30 ICT readiness for business continuity"]
                    }
                },
                {
                    id: "164-308-a-7-ii-E",
                    title: "Applications and data criticality analysis",
                    description: "Assess the relative criticality of specific applications and data in support of other contingency plan components.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.308(a)(7)(ii)(E)",
                    mappedControls: {
                        "NIST 800-53": ["RA-9", "CP-2"],
                        "ISO 27001": ["5.9 Inventory of information and other associated assets"]
                    }
                },
                {
                    id: "164-308-a-8",
                    title: "Evaluation",
                    description: "Perform a periodic technical and nontechnical evaluation, based initially upon the standards implemented under this rule and, subsequently, in response to environmental or operational changes affecting the security of electronic protected health information, that establishes the extent to which a covered entity's or business associate's security policies and procedures meet the requirements of this subpart.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(a)(8)",
                    mappedControls: {
                        "NIST 800-53": ["CA-2"],
                        "ISO 27001": ["5.35 Independent review of information security", "5.36 Compliance with policies and standards for information security"]
                    }
                },
                {
                    id: "164-308-b-1",
                    title: "Business associate contracts and other arrangements",
                    description: "A covered entity may permit a business associate to create, receive, maintain, or transmit electronic protected health information on the covered entity's behalf only if the covered entity obtains satisfactory assurances, in accordance with \u00a7 164.314(a), that the business associate will appropriately safeguard the information. A covered entity is not required to obtain such satisfactory assurances from a business associate that is a subcontractor.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(b)(1)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.19 Information security in supplier relationships", "5.20 Addressing information security within supplier agreements"]
                    }
                },
                {
                    id: "164-308-b-2",
                    title: "Subcontractor assurances",
                    description: "A business associate may permit a business associate that is a subcontractor to create, receive, maintain, or transmit electronic protected health information on its behalf only if the business associate obtains satisfactory assurances, in accordance with \u00a7 164.314(a), that the subcontractor will appropriately safeguard the information.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.308(b)(2)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.21 Managing information security in the ICT supply chain", "5.22 Monitoring, review and change management of supplier services"]
                    }
                },
                {
                    id: "164-308-b-3",
                    title: "Written contract or other arrangement",
                    description: "Document the satisfactory assurances required by paragraph (b)(1) or (b)(2) of this section through a written contract or other arrangement with the business associate that meets the applicable requirements of \u00a7 164.314(a).",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.308(b)(3)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.20 Addressing information security within supplier agreements"]
                    }
                }
            ]
        },
        {
            id: "hipaa-164-310",
            numericId: "\u00a7 164.310",
            title: "Security Rule: Physical Safeguards",
            description: "Physical safeguards in 45 CFR 164.310. A covered entity or business associate must, in accordance with \u00a7 164.306, implement these standards and implementation specifications. Requirement text is the eCFR wording (public domain), transcribed from https://www.law.cornell.edu/cfr/text/45/164.310.",
            mappedControls: {
                "NIST 800-53": ["PE-1", "PE-3", "MP-1"],
                "ISO 27001": ["7.1 Physical security perimeters", "7.2 Physical entry"]
            },
            subArticles: [
                {
                    id: "164-310-a-1",
                    title: "Facility access controls",
                    description: "Implement policies and procedures to limit physical access to its electronic information systems and the facility or facilities in which they are housed, while ensuring that properly authorized access is allowed.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.310(a)(1)",
                    mappedControls: {
                        "NIST 800-53": ["PE-1", "PE-3"],
                        "ISO 27001": ["7.1 Physical security perimeters", "7.2 Physical entry"]
                    }
                },
                {
                    id: "164-310-a-2-i",
                    title: "Contingency operations",
                    description: "Establish (and implement as needed) procedures that allow facility access in support of restoration of lost data under the disaster recovery plan and emergency mode operations plan in the event of an emergency.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.310(a)(2)(i)",
                    mappedControls: {
                        "NIST 800-53": ["CP-6", "PE-17"],
                        "ISO 27001": ["7.2 Physical entry", "5.30 ICT readiness for business continuity"]
                    }
                },
                {
                    id: "164-310-a-2-ii",
                    title: "Facility security plan",
                    description: "Implement policies and procedures to safeguard the facility and the equipment therein from unauthorized physical access, tampering, and theft.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.310(a)(2)(ii)",
                    mappedControls: {
                        "NIST 800-53": ["PE-3"],
                        "ISO 27001": ["7.1 Physical security perimeters"]
                    }
                },
                {
                    id: "164-310-a-2-iii",
                    title: "Access control and validation procedures",
                    description: "Implement procedures to control and validate a person's access to facilities based on their role or function, including visitor control, and control of access to software programs for testing and revision.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.310(a)(2)(iii)",
                    mappedControls: {
                        "NIST 800-53": ["PE-2", "PE-3"],
                        "ISO 27001": ["7.2 Physical entry"]
                    }
                },
                {
                    id: "164-310-a-2-iv",
                    title: "Maintenance records",
                    description: "Implement policies and procedures to document repairs and modifications to the physical components of a facility which are related to security (for example, hardware, walls, doors, and locks).",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.310(a)(2)(iv)",
                    mappedControls: {
                        "NIST 800-53": ["MA-2"],
                        "ISO 27001": ["7.13 Equipment maintenance"]
                    }
                },
                {
                    id: "164-310-b",
                    title: "Workstation use",
                    description: "Implement policies and procedures that specify the proper functions to be performed, the manner in which those functions are to be performed, and the physical attributes of the surroundings of a specific workstation or class of workstation that can access electronic protected health information.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.310(b)",
                    mappedControls: {
                        "NIST 800-53": ["PL-4"],
                        "ISO 27001": ["5.10 Acceptable use of information and other associated assets", "8.1 User endpoint devices"]
                    }
                },
                {
                    id: "164-310-c",
                    title: "Workstation security",
                    description: "Implement physical safeguards for all workstations that access electronic protected health information, to restrict access to authorized users.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.310(c)",
                    mappedControls: {
                        "NIST 800-53": ["PE-5"],
                        "ISO 27001": ["8.1 User endpoint devices", "7.7 Clear desk and clear screen"]
                    }
                },
                {
                    id: "164-310-d-1",
                    title: "Device and media controls",
                    description: "Implement policies and procedures that govern the receipt and removal of hardware and electronic media that contain electronic protected health information into and out of a facility, and the movement of these items within the facility.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.310(d)(1)",
                    mappedControls: {
                        "NIST 800-53": ["MP-1", "MP-5"],
                        "ISO 27001": ["7.10 Storage media"]
                    }
                },
                {
                    id: "164-310-d-2-i",
                    title: "Disposal",
                    description: "Implement policies and procedures to address the final disposition of electronic protected health information, and/or the hardware or electronic media on which it is stored.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.310(d)(2)(i)",
                    mappedControls: {
                        "NIST 800-53": ["MP-6"],
                        "ISO 27001": ["7.14 Secure disposal or re-use of equipment", "8.10 Information deletion"]
                    }
                },
                {
                    id: "164-310-d-2-ii",
                    title: "Media re-use",
                    description: "Implement procedures for removal of electronic protected health information from electronic media before the media are made available for re-use.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.310(d)(2)(ii)",
                    mappedControls: {
                        "NIST 800-53": ["MP-6"],
                        "ISO 27001": ["7.14 Secure disposal or re-use of equipment"]
                    }
                },
                {
                    id: "164-310-d-2-iii",
                    title: "Accountability",
                    description: "Maintain a record of the movements of hardware and electronic media and any person responsible therefore.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.310(d)(2)(iii)",
                    mappedControls: {
                        "NIST 800-53": ["MP-4", "MP-5"],
                        "ISO 27001": ["7.10 Storage media"]
                    }
                },
                {
                    id: "164-310-d-2-iv",
                    title: "Data backup and storage",
                    description: "Create a retrievable, exact copy of electronic protected health information, when needed, before movement of equipment.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.310(d)(2)(iv)",
                    mappedControls: {
                        "NIST 800-53": ["CP-9"],
                        "ISO 27001": ["8.13 Information backup"]
                    }
                }
            ]
        },
        {
            id: "hipaa-164-312",
            numericId: "\u00a7 164.312",
            title: "Security Rule: Technical Safeguards",
            description: "Technical safeguards in 45 CFR 164.312. A covered entity or business associate must, in accordance with \u00a7 164.306, implement these standards and implementation specifications. Requirement text is the eCFR wording (public domain), transcribed from https://www.law.cornell.edu/cfr/text/45/164.312.",
            mappedControls: {
                "NIST 800-53": ["AC-3", "AU-2", "IA-2", "SC-8"],
                "ISO 27001": ["5.15 Access control", "8.15 Logging", "8.24 Use of cryptography"]
            },
            subArticles: [
                {
                    id: "164-312-a-1",
                    title: "Access control",
                    description: "Implement technical policies and procedures for electronic information systems that maintain electronic protected health information to allow access only to those persons or software programs that have been granted access rights as specified in \u00a7 164.308(a)(4).",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.312(a)(1)",
                    mappedControls: {
                        "NIST 800-53": ["AC-1", "AC-3"],
                        "ISO 27001": ["5.15 Access control", "8.3 Information access restriction"]
                    }
                },
                {
                    id: "164-312-a-2-i",
                    title: "Unique user identification",
                    description: "Assign a unique name and/or number for identifying and tracking user identity.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.312(a)(2)(i)",
                    mappedControls: {
                        "NIST 800-53": ["IA-2", "IA-4"],
                        "ISO 27001": ["5.16 Identity management"]
                    }
                },
                {
                    id: "164-312-a-2-ii",
                    title: "Emergency access procedure",
                    description: "Establish (and implement as needed) procedures for obtaining necessary electronic protected health information during an emergency.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.312(a)(2)(ii)",
                    mappedControls: {
                        "NIST 800-53": ["AC-2", "CP-2"],
                        "ISO 27001": ["5.15 Access control"]
                    }
                },
                {
                    id: "164-312-a-2-iii",
                    title: "Automatic logoff",
                    description: "Implement electronic procedures that terminate an electronic session after a predetermined time of inactivity.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.312(a)(2)(iii)",
                    mappedControls: {
                        "NIST 800-53": ["AC-11"],
                        "ISO 27001": ["8.1 User endpoint devices", "8.5 Secure authentication"]
                    }
                },
                {
                    id: "164-312-a-2-iv",
                    title: "Encryption and decryption",
                    description: "Implement a mechanism to encrypt and decrypt electronic protected health information.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.312(a)(2)(iv)",
                    mappedControls: {
                        "NIST 800-53": ["SC-13", "SC-28"],
                        "ISO 27001": ["8.24 Use of cryptography"]
                    }
                },
                {
                    id: "164-312-b",
                    title: "Audit controls",
                    description: "Implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use electronic protected health information.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.312(b)",
                    mappedControls: {
                        "NIST 800-53": ["AU-2", "AU-3", "AU-12"],
                        "ISO 27001": ["8.15 Logging", "8.16 Monitoring activities"]
                    }
                },
                {
                    id: "164-312-c-1",
                    title: "Integrity",
                    description: "Implement policies and procedures to protect electronic protected health information from improper alteration or destruction.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.312(c)(1)",
                    mappedControls: {
                        "NIST 800-53": ["SI-7"],
                        "ISO 27001": ["8.24 Use of cryptography"]
                    }
                },
                {
                    id: "164-312-c-2",
                    title: "Mechanism to authenticate electronic protected health information",
                    description: "Implement electronic mechanisms to corroborate that electronic protected health information has not been altered or destroyed in an unauthorized manner.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.312(c)(2)",
                    mappedControls: {
                        "NIST 800-53": ["SI-7"],
                        "ISO 27001": ["8.24 Use of cryptography"]
                    }
                },
                {
                    id: "164-312-d",
                    title: "Person or entity authentication",
                    description: "Implement procedures to verify that a person or entity seeking access to electronic protected health information is the one claimed.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.312(d)",
                    mappedControls: {
                        "NIST 800-53": ["IA-2", "IA-8"],
                        "ISO 27001": ["5.17 Authentication information", "8.5 Secure authentication"]
                    }
                },
                {
                    id: "164-312-e-1",
                    title: "Transmission security",
                    description: "Implement technical security measures to guard against unauthorized access to electronic protected health information that is being transmitted over an electronic communications network.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.312(e)(1)",
                    mappedControls: {
                        "NIST 800-53": ["SC-8"],
                        "ISO 27001": ["8.20 Networks security", "8.24 Use of cryptography"]
                    }
                },
                {
                    id: "164-312-e-2-i",
                    title: "Integrity controls",
                    description: "Implement security measures to ensure that electronically transmitted electronic protected health information is not improperly modified without detection until disposed of.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.312(e)(2)(i)",
                    mappedControls: {
                        "NIST 800-53": ["SC-8", "SI-7"],
                        "ISO 27001": ["8.24 Use of cryptography"]
                    }
                },
                {
                    id: "164-312-e-2-ii",
                    title: "Encryption",
                    description: "Implement a mechanism to encrypt electronic protected health information whenever deemed appropriate.",
                    kind: "implementation-specification",
                    obligation: "addressable",
                    citation: "45 CFR 164.312(e)(2)(ii)",
                    mappedControls: {
                        "NIST 800-53": ["SC-8", "SC-13"],
                        "ISO 27001": ["8.24 Use of cryptography"]
                    }
                }
            ]
        },
        {
            id: "hipaa-164-314",
            numericId: "\u00a7 164.314",
            title: "Security Rule: Organizational Requirements",
            description: "Organizational requirements in 45 CFR 164.314 for business associate contracts and group health plan documents. Requirement text is the eCFR wording (public domain), transcribed from https://www.law.cornell.edu/cfr/text/45/164.314.",
            mappedControls: {
                "NIST 800-53": ["SA-9", "IR-6"],
                "ISO 27001": ["5.19 Information security in supplier relationships", "5.20 Addressing information security within supplier agreements"]
            },
            subArticles: [
                {
                    id: "164-314-a-1",
                    title: "Business associate contracts or other arrangements",
                    description: "The contract or other arrangement required by \u00a7 164.308(b)(3) must meet the requirements of paragraph (a)(2)(i), (a)(2)(ii), or (a)(2)(iii) of this section, as applicable.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.314(a)(1)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.20 Addressing information security within supplier agreements"]
                    }
                },
                {
                    id: "164-314-a-2-i",
                    title: "Business associate contracts",
                    description: "The contract must provide that the business associate will: (A) comply with the applicable requirements of this subpart; (B) in accordance with \u00a7 164.308(b)(2), ensure that any subcontractors that create, receive, maintain, or transmit electronic protected health information on behalf of the business associate agree to comply with the applicable requirements of this subpart by entering into a contract or other arrangement that complies with this section; and (C) report to the covered entity any security incident of which it becomes aware, including breaches of unsecured protected health information as required by \u00a7 164.410.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.314(a)(2)(i)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9", "IR-6"],
                        "ISO 27001": ["5.20 Addressing information security within supplier agreements", "5.21 Managing information security in the ICT supply chain"]
                    }
                },
                {
                    id: "164-314-a-2-ii",
                    title: "Other arrangements",
                    description: "The covered entity is in compliance with paragraph (a)(1) of this section if it has another arrangement in place that meets the requirements of \u00a7 164.504(e)(3).",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.314(a)(2)(ii)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.19 Information security in supplier relationships"]
                    }
                },
                {
                    id: "164-314-a-2-iii",
                    title: "Business associate contracts with subcontractors",
                    description: "The requirements of paragraphs (a)(2)(i) and (a)(2)(ii) of this section apply to the contract or other arrangement between a business associate and a subcontractor required by \u00a7 164.308(b)(4) in the same manner as such requirements apply to contracts or other arrangements between a covered entity and business associate.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.314(a)(2)(iii)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.21 Managing information security in the ICT supply chain"]
                    }
                },
                {
                    id: "164-314-b-1",
                    title: "Requirements for group health plans",
                    description: "Except when the only electronic protected health information disclosed to a plan sponsor is disclosed pursuant to \u00a7 164.504(f)(1)(ii) or (iii), or as authorized under \u00a7 164.508, a group health plan must ensure that its plan documents provide that the plan sponsor will reasonably and appropriately safeguard electronic protected health information created, received, maintained, or transmitted to or by the plan sponsor on behalf of the group health plan.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.314(b)(1)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.20 Addressing information security within supplier agreements", "5.31 Legal, statutory, regulatory and contractual requirements"]
                    }
                },
                {
                    id: "164-314-b-2-i",
                    title: "Plan sponsor safeguards",
                    description: "Implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of the electronic protected health information that it creates, receives, maintains, or transmits on behalf of the group health plan.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.314(b)(2)(i)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.31 Legal, statutory, regulatory and contractual requirements"]
                    }
                },
                {
                    id: "164-314-b-2-ii",
                    title: "Adequate separation",
                    description: "Ensure that the adequate separation required by \u00a7 164.504(f)(2)(iii) is supported by reasonable and appropriate security measures.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.314(b)(2)(ii)",
                    mappedControls: {
                        "NIST 800-53": ["AC-6"],
                        "ISO 27001": ["5.3 Segregation of duties"]
                    }
                },
                {
                    id: "164-314-b-2-iii",
                    title: "Agents of the plan sponsor",
                    description: "Ensure that any agent to whom it provides this information agrees to implement reasonable and appropriate security measures to protect the information.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.314(b)(2)(iii)",
                    mappedControls: {
                        "NIST 800-53": ["SA-9"],
                        "ISO 27001": ["5.20 Addressing information security within supplier agreements"]
                    }
                },
                {
                    id: "164-314-b-2-iv",
                    title: "Security incident reporting by the plan sponsor",
                    description: "Report to the group health plan any security incident of which it becomes aware.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.314(b)(2)(iv)",
                    mappedControls: {
                        "NIST 800-53": ["IR-6"],
                        "ISO 27001": ["5.29 Information security event reporting"]
                    }
                }
            ]
        },
        {
            id: "hipaa-164-316",
            numericId: "\u00a7 164.316",
            title: "Security Rule: Policies and Procedures and Documentation Requirements",
            description: "Policies, procedures, and documentation requirements in 45 CFR 164.316. Requirement text is the eCFR wording (public domain), transcribed from https://www.law.cornell.edu/cfr/text/45/164.316.",
            mappedControls: {
                "NIST 800-53": ["PL-1"],
                "ISO 27001": ["5.1 Policies for information security", "5.33 Protection of records"]
            },
            subArticles: [
                {
                    id: "164-316-a",
                    title: "Policies and procedures",
                    description: "Implement reasonable and appropriate policies and procedures to comply with the standards, implementation specifications, or other requirements of this subpart, taking into account those factors specified in \u00a7 164.306(b)(2)(i), (ii), (iii), and (iv). This standard is not to be construed to permit or excuse an action that violates any other standard, implementation specification, or other requirements of this subpart. A covered entity or business associate may change its policies and procedures at any time, provided that the changes are documented and are implemented in accordance with this subpart.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.316(a)",
                    mappedControls: {
                        "NIST 800-53": ["PL-1"],
                        "ISO 27001": ["5.1 Policies for information security", "5.37 Documented operating procedures"]
                    }
                },
                {
                    id: "164-316-b-1",
                    title: "Documentation",
                    description: "Maintain the policies and procedures implemented to comply with this subpart in written (which may be electronic) form; and if an action, activity or assessment is required by this subpart to be documented, maintain a written (which may be electronic) record of the action, activity, or assessment.",
                    kind: "standard",
                    obligation: "required",
                    citation: "45 CFR 164.316(b)(1)",
                    mappedControls: {
                        "NIST 800-53": ["PL-1"],
                        "ISO 27001": ["5.33 Protection of records", "5.37 Documented operating procedures"]
                    }
                },
                {
                    id: "164-316-b-2-i",
                    title: "Time limit",
                    description: "Retain the documentation required by paragraph (b)(1) of this section for 6 years from the date of its creation or the date when it last was in effect, whichever is later.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.316(b)(2)(i)",
                    mappedControls: {
                        "NIST 800-53": ["AU-11"],
                        "ISO 27001": ["5.33 Protection of records"]
                    }
                },
                {
                    id: "164-316-b-2-ii",
                    title: "Availability",
                    description: "Make documentation available to those persons responsible for implementing the procedures to which the documentation pertains.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.316(b)(2)(ii)",
                    mappedControls: {
                        "NIST 800-53": ["PL-1"],
                        "ISO 27001": ["5.37 Documented operating procedures"]
                    }
                },
                {
                    id: "164-316-b-2-iii",
                    title: "Updates",
                    description: "Review documentation periodically, and update as needed, in response to environmental or operational changes affecting the security of the electronic protected health information.",
                    kind: "implementation-specification",
                    obligation: "required",
                    citation: "45 CFR 164.316(b)(2)(iii)",
                    mappedControls: {
                        "NIST 800-53": ["PL-1"],
                        "ISO 27001": ["5.1 Policies for information security"]
                    }
                }
            ]
        },
        {
            id: "hipaa-164-400",
            numericId: "§ 164.400",
            title: "Breach Notification Rule Requirements",
            description: "The Breach Notification Rule eliminates obscurity. It strictly regulates the absolute mandatory corporate timeline and communication mechanisms utilized to inform the government, the public, and the directly affected victims immediately following the discovery of unauthorized acquisition, access, use, or disclosure of unsecured PHI.",
            mappedControls: {
                "NIST 800-53": ["IR-6", "IR-8"],
                "ISO 27001": ["A.16.1.1"]
            },
            subArticles: [
                { id: "164-404", title: "Statutory Notification to Individuals", description: "Victims cannot be kept in the dark. Covered entities must aggressively orchestrate the notification of affected individuals without unreasonable delay—and under severe legal penalty, absolutely no later than 60 calendar days post-discovery of the systemic ePHI breach." },
                { id: "164-408", title: "Federal Notification Constraints", description: "Breaches affecting 500 or more individuals must be immediately, concurrently reported to the Secretary of Health and Human Services (HHS) and prominent regional media outlets, triggering immediate federal OCR investigation parameters." }
            ]
        },
        {
            id: "hipaa-164-500",
            numericId: "§ 164.500",
            title: "Privacy Rule: Permitted Uses and Disclosures",
            description: "The Privacy Rule strikes the balance between facilitating high-quality healthcare and defending civil privacy. It defines what constitutes Individually Identifiable Health Information and strictly limits the exact, legally defensible scenarios under which this data can be utilized, monetized, or shared by Covered Entities and connected business networks.",
            mappedControls: {
                "NIST 800-53": ["PT-2", "PT-5"],
                "ISO 27001": ["A.18.1.4"]
            },
            subArticles: [
                { id: "164-502", title: "The Minimum Necessary Standard", description: "Unless a specific exemption applies, the 'Minimum Necessary' legal standard dictates that personnel accessing PHI must inherently be restricted to retrieving only the exact subset of information absolutely critical to fulfilling their immediate clinical or operational function.", mappedControls: { "NIST 800-53": ["PT-2"] } },
                { id: "164-520", title: "Notice of Privacy Practices & Patient Rights", description: "The foundation of medical transparency. Patients hold the unalienable right to receive a crystal-clear public notice detailing how their PHI will be legally leveraged. Furthermore, patients maintain the sovereign right to demand access to, inspect, and extract literal copies of their Designated Record Set.", mappedControls: { "NIST 800-53": ["PT-5"] } }
            ]
        }
    ],
        questions: [
        {
            id: "q_hipaa_entity",
            text: "Organizational Designation: Has legal counsel definitively classified the operational boundary of the organization as either a direct HIPAA 'Covered Entity' (e.g., healthcare provider, clearinghouse) or a downstream 'Business Associate' liable for managing ePHI infrastructure?",
            type: "select",
            options: ["Covered Entity", "Business Associate", "Neither (Out of Scope)"],
            relatedArticles: ["hipaa-164-500"]
        },
        {
            id: "q_hipaa_baa",
            text: "Supply Chain Governance (BAAs): Are there legally binding, meticulously reviewed Business Associate Agreements (BAAs) fully executed with every single third-party vendor, cloud provider, and subcontractor that interacts with the organization's ePHI workflows?",
            type: "boolean",
            relatedArticles: ["hipaa-164-308", "hipaa-164-500"]
        },
        {
            id: "q_hipaa_ra",
            text: "Mandatory Risk Analysis: Can the Chief Information Security Officer (CISO) provide a documented, mathematically verified Security Risk Analysis—executed within the preceding 12 months—that fundamentally maps all ePHI persistence layers and network flow vulnerabilities?",
            type: "boolean",
            relatedArticles: ["164-308-a-1-ii-A"]
        },
        {
            id: "q_hipaa_encryption",
            text: "Cryptographic Defenses: Is the entirety of the ePHI ecosystem aggressively encrypted both computationally at-rest (database/disk) and in-transit (network traversal) exclusively utilizing robust, NIST-approved cryptographic architectures (such as FIPS 140-2 validated modules and modern TLS)?",
            type: "boolean",
            relatedArticles: ["164-312-e-2-ii", "164-312-a-2-iv"]
        },
        {
            id: "q_hipaa_audit",
            text: "SIEM & Forensic Auditing: Has engineering deployed an immutable logging architecture that persistently records all logical access attempts (successful and denied) against ePHI databases, and are these forensic access logs subjected to routine, automated security review?",
            type: "boolean",
            relatedArticles: ["164-312-b"]
        }
    ]
};
