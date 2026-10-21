import PDFDocument from "pdfkit";
import type { ReadinessReport, ReportTable } from "./types";

function latin1(value: string): string {
  return value.replace(/[^\n\r\t\x20-\x7E]/g, "?");
}

/** Accept a Buffer, a byte array, or a Postgres hex bytea (`\\x...`). */
export function pdfBytesToBase64(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (typeof value === "string") {
    if (value.startsWith("\\x") || value.startsWith("\\X")) {
      return Buffer.from(value.slice(2), "hex").toString("base64");
    }
    return Buffer.from(value, "latin1").toString("base64");
  }
  throw new Error("Stored PDF could not be read");
}

function drawTable(doc: InstanceType<typeof PDFDocument>, table: ReportTable) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columns = Math.max(table.headers.length, 1);
  const colWidth = width / columns;
  const drawRow = (cells: string[], header: boolean) => {
    const height = 28;
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    cells.forEach((cell, index) => {
      doc.text(latin1(cell || ""), left + index * colWidth, y, {
        width: colWidth - 4,
        height: height - 2,
        ellipsis: true,
      });
    });
    doc.y = y + height;
  };
  drawRow(table.headers, true);
  for (const row of table.rows) drawRow(row, false);
  doc.moveDown(0.4);
}

/** PDFKit is already in the server image. Standard fonts need no Chromium or extra packages. */
export function renderReadinessPdf(report: ReadinessReport): Promise<Buffer> {
  const doc = new PDFDocument({ compress: false, size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#1C4D8D").text("Monthly Compliance Readiness Report", { align: "center" });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(9).fillColor("#111111");
  for (const row of report.meta) {
    doc.font("Helvetica-Bold").text(`${row.label}: `, { continued: true });
    doc.font("Helvetica").text(latin1(row.value));
  }
  doc.moveDown(0.6);

  for (const section of report.sections) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1C4D8D").text(latin1(section.title));
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#111111");
    for (const paragraph of section.paragraphs) {
      doc.text(latin1(paragraph), { paragraphGap: 4 });
    }
    for (const bullet of section.bullets) {
      doc.text(latin1(`- ${bullet}`), { indent: 12, paragraphGap: 2 });
    }
    if (section.table && section.table.rows.length > 0) {
      doc.moveDown(0.3);
      drawTable(doc, section.table);
    } else {
      doc.moveDown(0.4);
    }
  }

  doc.end();
  return done;
}
