import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nis2 } from "./nis2";
import { nis2Article21Controls } from "../frameworks/nis2Gap";

const points = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
const expected: Record<(typeof points)[number], number> = {
  a: 19,
  b: 22,
  c: 23,
  d: 7,
  e: 40,
  f: 3,
  g: 8,
  h: 3,
  i: 53,
  j: 21,
};

describe("NIS2 questionnaire wording", () => {
  const question = (id: string) => nis2.questions?.find((item) => item.id === id);

  it("states Article 20(1) liability as infringements, not breaches", () => {
    expect(question("nis2-q1")?.text).toBe(
      "Does management approve the Art. 21 measures, oversee their implementation, and accept that it can be held liable for infringements (Art. 20(1))?",
    );
    expect(question("nis2-q1")?.text).not.toMatch(/breaches/i);
  });

  it("keeps intervals and absolutes out of the Article 20 and 21 requirement", () => {
    for (const id of ["nis2-q1", "nis2-q6", "nis2-q7", "nis2-q8", "nis2-q11"]) {
      expect(question(id)?.failureGuidance?.startsWith("Good practice (not a NIS2 requirement):")).toBe(true);
    }
    expect(question("nis2-q8")?.text).toBe("Do you have basic cyber hygiene practices and cybersecurity training?");
    expect(question("nis2-q8")?.text).not.toMatch(/mandatory|all staff/i);
    expect(question("nis2-q11")?.failureGuidance).toContain("Where appropriate");
    expect(question("nis2-q11")?.failureGuidance).not.toContain("all remote access points");
  });

  it("separates the CSIRT from the competent authority and both reporting stages", () => {
    const guidance = question("nis2-q12")?.failureGuidance ?? "";
    expect(guidance).toBe(
      "Identify your CSIRT and, where applicable, your competent authority. Send an early warning without undue delay and within 24 hours, then an incident notification within 72 hours (24 hours for trust service providers).",
    );
    expect(guidance).not.toContain("competent authority (CSIRT)");
    expect(question("nis2-q12")?.text).toBe(
      "Do you have a procedure to notify your CSIRT or, where applicable, your competent authority of significant incidents without undue delay?",
    );
  });

  it("cites the Official Journal publication date of Implementing Regulation (EU) 2024/2690", () => {
    const source = readFileSync(path.join(import.meta.dirname, "nis2.ts"), "utf8");
    expect(source).toContain("of 17 October 2024 (OJ L, 2024/2690, 18.10.2024)");
    expect(source).not.toContain("OJ L, 2024/2690, 17 October 2024");
  });
});

describe("NIS2 Article 21(2) requirement text", () => {
  it("uses the same official labels as the gap-analysis catalog", () => {
    for (const item of nis2Article21Controls) {
      const article = nis2.articles.find((entry) => entry.id === `nis2-art-21-2-${item.point}`);
      expect(article?.title).toBe(item.name);
      expect(article?.description).toContain(item.requirement);
      expect(article?.description).toContain("https://eur-lex.europa.eu/eli/dir/2022/2555/oj");
    }
  });
});

describe("NIS2 Implementing Regulation (EU) 2024/2690 annex", () => {
  it("attaches every annex point under the Article 21(2) item named in the annex heading", () => {
    const counts = Object.fromEntries(
      points.map((point) => {
        const article = nis2.articles.find((item) => item.id === `nis2-art-21-2-${point}`);
        return [point, article?.subArticles?.length ?? 0];
      }),
    );
    expect(counts).toEqual(expected);
    const all = points.flatMap((point) => {
      const article = nis2.articles.find((item) => item.id === `nis2-art-21-2-${point}`);
      return article?.subArticles ?? [];
    });
    expect(all).toHaveLength(199);
    for (const item of all) {
      expect(item.citation).toMatch(/^Commission Implementing Regulation \(EU\) 2024\/2690, Annex, point /);
      expect(item.description).not.toContain("ELI:");
      expect(item.description.length).toBeGreaterThan(40);
    }
  });

  it("keeps the annex sentences, including multi-mapped sections 11 and 13", () => {
    const byId = (articleId: string) =>
      nis2.articles.find((article) => article.id === articleId)?.subArticles ?? [];
    const incident = byId("nis2-art-21-2-b").find((item) => item.id === "ir-2024-2690-3.1.1");
    expect(incident?.description.startsWith("For the purpose of Article 21(2), point (b)")).toBe(true);
    const mfa = byId("nis2-art-21-2-j").find((item) => item.id === "ir-2024-2690-11.7.1-j");
    expect(mfa?.description).toContain("multiple authentication factors or continuous authentication mechanisms");
    const admin = byId("nis2-art-21-2-j").find((item) => item.id === "ir-2024-2690-11.4.2-j");
    expect(admin?.description).toContain("(a) only use system administration systems for system administration purposes");
    expect(admin?.description).not.toMatch(/\d+\/34/);
    expect(byId("nis2-art-21-2-c").some((item) => item.id === "ir-2024-2690-13.1.1-c")).toBe(true);
    expect(byId("nis2-art-21-2-e").some((item) => item.id === "ir-2024-2690-13.1.1-e")).toBe(true);
    expect(byId("nis2-art-21-2-i").some((item) => item.id === "ir-2024-2690-13.1.1-i")).toBe(true);
  });
});
