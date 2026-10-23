import { describe, expect, it } from "vitest";
import { iso27001Controls } from "../frameworks/iso27001";
import { hipaa } from "./hipaa";

const securitySubArticles = hipaa.articles
  .filter((article) => /^hipaa-164-3(08|10|12|14|16)$/.test(article.id))
  .flatMap((article) => article.subArticles ?? []);

const isoById = new Map(iso27001Controls.map((control) => [control.id, control.name]));

describe("HIPAA Security Rule catalog", () => {
  it("lists every standard and implementation specification in 45 CFR 164.308, 164.310, 164.312, 164.314, and 164.316", () => {
    expect(securitySubArticles).toHaveLength(69);
    expect(new Set(securitySubArticles.map((item) => item.id)).size).toBe(69);

    const bySection = Object.fromEntries(
      ["308", "310", "312", "314", "316"].map((section) => [
        section,
        securitySubArticles.filter((item) => item.citation?.includes(`164.${section}`)).length,
      ]),
    );
    expect(bySection).toEqual({ "308": 31, "310": 12, "312": 12, "314": 9, "316": 5 });
  });

  it("marks standards required and implementation specifications required or addressable", () => {
    for (const item of securitySubArticles) {
      expect(item.kind === "standard" || item.kind === "implementation-specification").toBe(true);
      expect(item.obligation === "required" || item.obligation === "addressable").toBe(true);
      expect(item.citation).toMatch(/^45 CFR 164\.3(08|10|12|14|16)\(/);
      expect(item.description.trim().length).toBeGreaterThan(10);
      if (item.kind === "standard") expect(item.obligation).toBe("required");
    }

    expect(securitySubArticles.filter((item) => item.obligation === "addressable")).toHaveLength(22);
    expect(securitySubArticles.find((item) => item.id === "164-308-a-1-ii-A")?.obligation).toBe("required");
    expect(securitySubArticles.find((item) => item.id === "164-312-a-2-iv")?.obligation).toBe("addressable");
    expect(securitySubArticles.find((item) => item.id === "164-312-e-2-ii")?.obligation).toBe("addressable");
    expect(securitySubArticles.find((item) => item.id === "164-310-d-2-iii")?.description).toContain("therefore");
  });

  it("maps ISO 27001 values to this repository's control id and short title", () => {
    const isoValues = securitySubArticles.flatMap((item) => item.mappedControls?.["ISO 27001"] ?? []);
    expect(isoValues.length).toBeGreaterThan(0);
    for (const value of isoValues) {
      const id = value.split(" ")[0];
      const name = isoById.get(id);
      expect(name, value).toBeDefined();
      expect(value).toBe(`${id} ${name}`);
    }
  });

  it("keeps breach and privacy articles and points questions at security-rule rows", () => {
    expect(hipaa.articles.map((article) => article.id)).toEqual([
      "hipaa-164-308",
      "hipaa-164-310",
      "hipaa-164-312",
      "hipaa-164-314",
      "hipaa-164-316",
      "hipaa-164-400",
      "hipaa-164-500",
    ]);
    const known = new Set([
      ...hipaa.articles.map((article) => article.id),
      ...hipaa.articles.flatMap((article) => (article.subArticles ?? []).map((item) => item.id)),
    ]);
    for (const question of hipaa.questions ?? []) {
      for (const related of question.relatedArticles ?? []) {
        expect(known.has(related), `${question.id} -> ${related}`).toBe(true);
      }
    }
  });
});
