import * as XLSX from "xlsx";

export interface BringYourOwnControl {
    controlId: string;
    name: string;
    description: string;
}

const ID_HEADERS = ["control id", "control_id", "control identifier", "requirement id", "identifier", "id", "ref"];
const NAME_HEADERS = ["control title", "control name", "title", "name"];
const DESCRIPTION_HEADERS = ["description", "control specification", "requirement text", "statement", "text", "requirement"];

function findHeader(headers: string[], candidates: string[], used: Set<number>): number {
    for (const candidate of candidates) {
        const exact = headers.findIndex((header, index) => header === candidate && !used.has(index));
        if (exact >= 0) return exact;
    }
    for (const candidate of candidates) {
        const partial = headers.findIndex((header, index) => header.includes(candidate) && !used.has(index));
        if (partial >= 0) return partial;
    }
    return -1;
}

/**
 * Reads a user-supplied .xlsx or .csv workbook. The publisher's requirement
 * text is not bundled. Columns are the control id, a title, and a description.
 */
export function parseBringYourOwnCatalog(file: Buffer): BringYourOwnControl[] {
    if (!file || file.length === 0) {
        throw new Error("Upload the workbook you obtained from the publisher.");
    }
    const workbook = XLSX.read(file, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error("The workbook has no sheets.");

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
    let headerRow = -1;
    let headers: string[] = [];
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const candidate = (rows[i] ?? []).map((cell) => String(cell ?? "").trim().toLowerCase());
        if (findHeader(candidate, ID_HEADERS, new Set()) >= 0) {
            headerRow = i;
            headers = candidate;
            break;
        }
    }
    if (headerRow < 0) {
        throw new Error("The workbook needs a column for the control id (id, control id, or identifier).");
    }

    const used = new Set<number>();
    const idIdx = findHeader(headers, ID_HEADERS, used);
    used.add(idIdx);
    const nameIdx = findHeader(headers, NAME_HEADERS, used);
    if (nameIdx >= 0) used.add(nameIdx);
    const descriptionIdx = findHeader(headers, DESCRIPTION_HEADERS, used);
    if (nameIdx < 0 && descriptionIdx < 0) {
        throw new Error("The workbook needs a title or description column.");
    }

    const controls: BringYourOwnControl[] = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const controlId = String(row[idIdx] ?? "").trim();
        if (!controlId) continue;
        if (controlId.length > 50) {
            throw new Error(`Control id "${controlId.slice(0, 60)}" is longer than 50 characters.`);
        }
        const title = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
        const description = descriptionIdx >= 0 ? String(row[descriptionIdx] ?? "").trim() : "";
        const nameSource = title || description;
        if (!nameSource) continue;
        controls.push({
            controlId,
            name: nameSource.slice(0, 255),
            description: description || title,
        });
    }
    if (controls.length === 0) {
        throw new Error("The workbook did not contain any control rows.");
    }
    return controls;
}
