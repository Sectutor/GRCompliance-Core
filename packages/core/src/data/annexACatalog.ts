/**
 * ISO/IEC 27001:2022 Annex A catalog (93 controls).
 * Titles are the official 2022 control names. Descriptions are short original
 * wording for this product and are not the standard's control text.
 */

export type AnnexTheme = "Organizational" | "People" | "Physical" | "Technological";

export type AnnexControl = {
    controlId: string;
    name: string;
    description: string;
    theme: AnnexTheme;
};

export const ANNEX_A_FRAMEWORK = "ISO 27001:2022";

const THEME_BY_GROUP: Record<string, AnnexTheme> = {
    "5": "Organizational",
    "6": "People",
    "7": "Physical",
    "8": "Technological",
};

export function annexTheme(controlId: string): AnnexTheme | null {
    const match = /^A\.(\d+)\.\d+$/.exec(controlId.trim());
    if (!match) return null;
    return THEME_BY_GROUP[match[1]] ?? null;
}

function group(theme: AnnexTheme, rows: ReadonlyArray<readonly [string, string, string]>): AnnexControl[] {
    return rows.map(([controlId, name, description]) => ({ controlId, name, description, theme }));
}

export const ANNEX_A_CONTROLS: readonly AnnexControl[] = [
    ...group("Organizational", [
        ["A.5.1", "Policies for information security", "Publish the security rules leadership has approved, and make sure people can find them."],
        ["A.5.2", "Information security roles and responsibilities", "Name the people accountable for security work and tell them what they own."],
        ["A.5.3", "Segregation of duties", "Split sensitive tasks so the same person cannot both request and approve them."],
        ["A.5.4", "Management responsibilities", "Managers make sure their own teams follow the security rules that apply to the work."],
        ["A.5.5", "Contact with authorities", "Keep an up-to-date list of regulators and law-enforcement contacts, and know when to use it."],
        ["A.5.6", "Contact with special interest groups", "Stay in touch with industry groups that share practical security warnings."],
        ["A.5.7", "Threat intelligence", "Collect and review information about threats that could affect this organisation."],
        ["A.5.8", "Information security in project management", "Put security tasks into projects from the start, rather than after go-live."],
        ["A.5.9", "Inventory of information and other associated assets", "Keep a list of the information the organisation depends on and the assets that hold it."],
        ["A.5.10", "Acceptable use of information and other associated assets", "Write down how people are allowed to use information and equipment."],
        ["A.5.11", "Return of assets", "Get equipment and access back when someone leaves or a contract ends."],
        ["A.5.12", "Classification of information", "Mark information by how sensitive it is so people know how to handle it."],
        ["A.5.13", "Labelling of information", "Put the classification where people can see it on documents and data."],
        ["A.5.14", "Information transfer", "Protect information when it is sent inside the organisation or to someone outside."],
        ["A.5.15", "Access control", "Decide who may reach which information, based on the work they do."],
        ["A.5.16", "Identity management", "Give each person a unique identity and close it when they no longer need it."],
        ["A.5.17", "Authentication information", "Look after passwords and other secrets so they stay hard to guess or steal."],
        ["A.5.18", "Access rights", "Grant, review, and remove access so people keep only what the role needs."],
        ["A.5.19", "Information security in supplier relationships", "Set security expectations for suppliers and check that they are being met."],
        ["A.5.20", "Addressing information security within supplier agreements", "Write the supplier's security duties into the contract, including what happens if they are missed."],
        ["A.5.21", "Managing information security in the ICT supply chain", "Understand security risks that arrive through the chain of technology suppliers."],
        ["A.5.22", "Monitoring, review and change management of supplier services", "Review supplier services on a schedule and control the changes they make."],
        ["A.5.23", "Information security for use of cloud services", "Decide how cloud services are chosen, used, and left, including where the data sits."],
        ["A.5.24", "Information security incident management planning and preparation", "Agree roles, steps, and contacts before an incident happens."],
        ["A.5.25", "Assessment and decision on information security events", "Decide whether an event is an incident and choose the next step."],
        ["A.5.26", "Response to information security incidents", "Follow the prepared steps to contain an incident and restore the service."],
        ["A.5.27", "Learning from information security incidents", "Record what happened and change the way of working so it is less likely again."],
        ["A.5.28", "Collection of evidence", "Gather and keep evidence from an incident so it can be used later."],
        ["A.5.29", "Information security during disruption", "Keep security in place while the organisation is running in a fallback mode."],
        ["A.5.30", "ICT readiness for business continuity", "Plan and test that technology can be recovered in line with what the business needs."],
        ["A.5.31", "Legal, statutory, regulatory and contractual requirements", "Know the legal and contractual security duties that apply, and meet them."],
        ["A.5.32", "Intellectual property rights", "Use software and other material only where the organisation actually has the rights."],
        ["A.5.33", "Protection of records", "Keep records safe and retrievable for as long as the business or the law needs them."],
        ["A.5.34", "Privacy and protection of PII", "Handle personal data in line with the privacy duties that apply to it."],
        ["A.5.35", "Independent review of information security", "Have someone independent look at the security arrangements on a planned cycle."],
        ["A.5.36", "Compliance with policies, rules and standards for information security", "Check that people and systems follow the organisation's own security rules."],
        ["A.5.37", "Documented operating procedures", "Write down how to run the systems so the work can be repeated the same way."],
    ]),
    ...group("People", [
        ["A.6.1", "Screening", "Check candidates and contractors to a depth that matches the access they will have."],
        ["A.6.2", "Terms and conditions of employment", "Put security duties into employment or contractor terms before the work starts."],
        ["A.6.3", "Information security awareness, education and training", "Train people so they recognise the threats and know what they are expected to do."],
        ["A.6.4", "Disciplinary process", "Have a fair process for someone who breaks the security rules."],
        ["A.6.5", "Responsibilities after termination or change of employment", "When a role ends or changes, remove access and remind the person of duties that still apply."],
        ["A.6.6", "Confidentiality or non-disclosure agreements", "Use a written confidentiality term for anyone who will see sensitive information."],
        ["A.6.7", "Remote working", "Set rules so work done away from the office stays protected."],
        ["A.6.8", "Information security event reporting", "Make it easy, and expected, for people to report security events quickly."],
    ]),
    ...group("Physical", [
        ["A.7.1", "Physical security perimeters", "Define the boundary of each secure area and control how people cross it."],
        ["A.7.2", "Physical entry", "Let people into secure areas only when they are allowed to be there."],
        ["A.7.3", "Securing offices, rooms and facilities", "Lock the rooms and facilities that hold sensitive work or equipment."],
        ["A.7.4", "Physical security monitoring", "Watch physical areas so an unauthorised entry can be noticed."],
        ["A.7.5", "Protecting against physical and environmental threats", "Protect sites against fire, flood, and similar physical threats."],
        ["A.7.6", "Working in secure areas", "Set extra rules for how people behave inside a secure area."],
        ["A.7.7", "Clear desk and clear screen", "Put papers away and lock screens so a passer-by cannot read them."],
        ["A.7.8", "Equipment siting and protection", "Place equipment where it is harder to damage, steal, or overlook."],
        ["A.7.9", "Security of assets off-premises", "Protect equipment and information that leave the site."],
        ["A.7.10", "Storage media", "Store, move, and dispose of disks and other media without exposing what is on them."],
        ["A.7.11", "Supporting utilities", "Keep power, cooling, and the other utilities reliable enough for the systems that need them."],
        ["A.7.12", "Cabling security", "Protect power and network cables from damage and from tapping."],
        ["A.7.13", "Equipment maintenance", "Maintain equipment so it keeps working, and stays secure, while it is being serviced."],
        ["A.7.14", "Secure disposal or re-use of equipment", "Wipe or destroy storage before equipment is reused or thrown away."],
    ]),
    ...group("Technological", [
        ["A.8.1", "User endpoint devices", "Set the rules for laptops, phones, and other devices people use for work."],
        ["A.8.2", "Privileged access rights", "Limit administrator rights and review who still has them."],
        ["A.8.3", "Information access restriction", "Limit access to information and to system functions to the people who need them."],
        ["A.8.4", "Access to source code", "Limit who can read or change source code."],
        ["A.8.5", "Secure authentication", "Use sign-in methods that match the risk, including a second factor where it matters."],
        ["A.8.6", "Capacity management", "Watch capacity so systems keep up with the demand placed on them."],
        ["A.8.7", "Protection against malware", "Protect systems against malware and keep that protection current."],
        ["A.8.8", "Management of technical vulnerabilities", "Find technical weaknesses and deal with the ones that matter."],
        ["A.8.9", "Configuration management", "Set a secure configuration and control later changes to it."],
        ["A.8.10", "Information deletion", "Delete information when it is no longer needed so copies do not linger."],
        ["A.8.11", "Data masking", "Hide personal or sensitive values when a full copy is not required."],
        ["A.8.12", "Data leakage prevention", "Reduce the chance that sensitive information leaves by mistake."],
        ["A.8.13", "Information backup", "Take backups and test that they can actually be restored."],
        ["A.8.14", "Redundancy of information processing facilities", "Provide spare capacity for the systems the business cannot pause."],
        ["A.8.15", "Logging", "Record the events that help detect and investigate a security problem."],
        ["A.8.16", "Monitoring activities", "Watch networks and systems for unusual activity and act on it."],
        ["A.8.17", "Clock synchronization", "Keep system clocks aligned so logs and evidence agree on the time."],
        ["A.8.18", "Use of privileged utility programs", "Restrict tools that can bypass the normal security controls."],
        ["A.8.19", "Installation of software on operational systems", "Control which software can be installed on live systems."],
        ["A.8.20", "Networks security", "Protect the network and separate traffic that does not belong together."],
        ["A.8.21", "Security of network services", "Agree the security features with whoever provides the network services."],
        ["A.8.22", "Segregation of networks", "Separate groups of systems that have different security needs."],
        ["A.8.23", "Web filtering", "Limit access to websites that are likely to be harmful."],
        ["A.8.24", "Use of cryptography", "Define how encryption is used to protect information."],
        ["A.8.25", "Secure development life cycle", "Build security checks into the way software is developed."],
        ["A.8.26", "Application security requirements", "State the security needs when an application is built or bought."],
        ["A.8.27", "Secure system architecture and engineering principles", "Apply the agreed design principles when systems are engineered."],
        ["A.8.28", "Secure coding", "Follow coding rules that avoid the common security mistakes."],
        ["A.8.29", "Security testing in development and acceptance", "Test security before a system is accepted into use."],
        ["A.8.30", "Outsourced development", "Supervise development work that another organisation does."],
        ["A.8.31", "Separation of development, test and production environments", "Keep development, test, and live environments apart."],
        ["A.8.32", "Change management", "Approve and record changes to systems before they reach the live service."],
        ["A.8.33", "Test information", "Protect any real data used in testing, or use data that is not real."],
        ["A.8.34", "Protection of information systems during audit testing", "Plan audit tests so they do not knock over live systems."],
    ]),
];

/**
 * Short titles used by the original Latore seed. Aligned to the official title
 * only while the stored name is still exactly this string.
 */
export const SEEDED_SHORT_TITLES: Readonly<Record<string, string>> = {
    "A.5.2": "Information security roles",
    "A.5.9": "Inventory of information",
    "A.5.10": "Acceptable use",
    "A.5.19": "Supplier relationships",
    "A.5.23": "Cloud services",
    "A.5.24": "Incident planning",
    "A.5.30": "ICT readiness",
    "A.6.3": "Security awareness",
    "A.8.2": "Privileged access",
    "A.8.8": "Technical vulnerabilities",
    "A.8.16": "Monitoring",
    "A.8.24": "Cryptography",
};

export const LEGACY_ANNEX_REFERENCES = [
    {
        from: "A.5-Policies",
        to: "A.5.1",
        seedName: "Information Security Policies",
        officialName: "Policies for information security",
    },
    {
        from: "A.9-Access",
        to: "A.5.15",
        seedName: "Access Control",
        officialName: "Access control",
    },
] as const;

export function annexControlById(controlId: string): AnnexControl | undefined {
    return ANNEX_A_CONTROLS.find((control) => control.controlId === controlId);
}
