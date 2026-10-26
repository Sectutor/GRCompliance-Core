import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseBringYourOwnCatalog } from "./bringYourOwnCatalog";

describe("bring-your-own catalog parser", () => {
    it("reads id, title, and description columns from a csv workbook", () => {
        const csv = Buffer.from("id,title,description\nX-1,Board oversight,The board reviews the control objectives.\n");
        expect(parseBringYourOwnCatalog(csv)).toEqual([
            {
                controlId: "X-1",
                name: "Board oversight",
                description: "The board reviews the control objectives.",
            },
        ]);
    });

    it("reads an xlsx sheet and rejects a workbook without an id column", () => {
        const sheet = XLSX.utils.aoa_to_sheet([
            ["Control ID", "Control Title", "Description"],
            ["ISA-1", "Information security", "Question text supplied by the user."],
        ]);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "Controls");
        const file = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
        expect(parseBringYourOwnCatalog(file)[0].controlId).toBe("ISA-1");
        expect(() => parseBringYourOwnCatalog(Buffer.from("title,description\nA,B\n"))).toThrow(/control id/);
        expect(() => parseBringYourOwnCatalog(Buffer.alloc(0))).toThrow(/publisher/);
    });
});
