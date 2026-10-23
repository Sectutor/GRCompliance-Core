import { describe, expect, it } from "vitest";
import { nis2 } from "./nis2";

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
