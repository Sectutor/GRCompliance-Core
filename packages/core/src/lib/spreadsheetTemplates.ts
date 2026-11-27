import type { SpreadsheetKind } from "./spreadsheetImport";

const TEMPLATES: Record<SpreadsheetKind, { filename: string; csv: string }> = {
    controls: {
        filename: "grcompliance-controls-template.csv",
        csv: "controlCode,title,description,grouping,owner,dueDate\nA.5.1,Example control,What this control is for in your own words,Organizational,Ada Lovelace,2026-06-01\n",
    },
    risks: {
        filename: "grcompliance-risks-template.csv",
        csv: "title,description,likelihood,impact,status,owner\nPhishing email,Someone opens a harmful attachment,low,high,identified,Ada Lovelace\n",
    },
};

export function spreadsheetTemplate(kind: SpreadsheetKind): { filename: string; csv: string } {
    return TEMPLATES[kind];
}

export function downloadSpreadsheetTemplate(kind: SpreadsheetKind): void {
    const template = spreadsheetTemplate(kind);
    const blob = new Blob([template.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = template.filename;
    link.click();
    URL.revokeObjectURL(url);
}
