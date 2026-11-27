export type HelpArticle = {
    id: string;
    title: string;
    screen: string;
    body: string;
};

/**
 * Short help, bundled with the app. English only. Control IDs are named.
 * The text of a standard is not copied here.
 */
export const HELP_ARTICLES: HelpArticle[] = [
    {
        id: "dashboard",
        title: "What the dashboard is for",
        screen: "Dashboard",
        body: "The dashboard is the first screen after you sign in. It shows how far this workspace has got and a short list of what to do next. We keep that list to four checks: a framework, an owner on each control, evidence, and reviews that are overdue.",
    },
    {
        id: "first-run",
        title: "The first hour",
        screen: "Dashboard",
        body: "A new workspace asks for a company name, a framework, an optional spreadsheet, and an invite link. You can skip the spreadsheet. The invite link is copied, not emailed. It works once and expires after 7 days.",
    },
    {
        id: "controls",
        title: "Controls",
        screen: "Controls",
        body: "A control is something you do, such as the item numbered A.5.1. Open Controls, set an owner, and link evidence. We show the control ID. We do not paste the text of the standard.",
    },
    {
        id: "risks",
        title: "Risks",
        screen: "Risks",
        body: "A risk is something that could go wrong. Give it a title, a likelihood from 1 to 5, and an impact from 1 to 5. Words such as low and high are accepted when you import a spreadsheet.",
    },
    {
        id: "policies",
        title: "Policies",
        screen: "Policies",
        body: "A policy is a document people are asked to follow. When a review date has passed, it shows up in What to do next and opens that policy.",
    },
    {
        id: "evidence",
        title: "Evidence",
        screen: "Evidence",
        body: "Evidence is the file or note that shows a control is in place. Link it to the control. A control with no evidence stays on the next-steps list.",
    },
    {
        id: "import",
        title: "Import a spreadsheet",
        screen: "Settings",
        body: "Settings, then Frameworks, then Bring a spreadsheet. Use a CSV file for controls or risks. We check the rows before anything is saved. Fix a cell and check again. The file stays in your browser until you save it on this server. We do not upload it.",
    },
    {
        id: "invite",
        title: "Invite someone",
        screen: "Dashboard",
        body: "Create an invite link from the first-run screen. Share it yourself. Email is not sent. The link expires in 7 days and cannot be used twice.",
    },
    {
        id: "backups",
        title: "Backups and updates",
        screen: "Settings",
        body: "Settings, then Updates, shows the last backup, whether a restore was checked, and whether this version is current. A restore check uses a temporary database and does not change the live one. An update takes a backup first and puts the previous version back if the new one does not start.",
    },
    {
        id: "diagnostics",
        title: "Download diagnostics",
        screen: "Help",
        body: "An administrator can download a small file of version, health, container status, redacted log lines, and the names of settings. It does not include database rows, uploaded files, or secret values. The file stays on your computer. We do not upload it.",
    },
    {
        id: "ai",
        title: "AI on this server",
        screen: "AI",
        body: "You can skip AI, bring your own key, or run a small model on this server. The built-in model is optional. It is not downloaded until an administrator asks for it. Questions stay on this server. A key test tells you in plain words when a key, address, or model name needs a change.",
    },
    {
        id: "videos",
        title: "Walkthrough videos",
        screen: "Help",
        body: "Some screens have a video slot in the page guide. The clip plays from this install when it was included. We do not load a video from the internet.",
    },
];
