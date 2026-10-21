import { describe, expect, it } from "vitest";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { InvalidReviewerIdError, parseReviewerUserIds, workspaceReviewersQuery } from "./policyReviewers";

describe("parseReviewerUserIds", () => {
    it("keeps workspace user ids in order and drops duplicates", () => {
        expect(parseReviewerUserIds([" 2 ", "1", "2"])).toEqual([2, 1]);
    });

    it("rejects values that are not user ids", () => {
        for (const bad of ["0", "-1", "1.5", "1e2", "abc", "1; drop table users", "", "9007199254740993"]) {
            expect(() => parseReviewerUserIds([bad])).toThrow(InvalidReviewerIdError);
        }
    });
});

describe("workspaceReviewersQuery", () => {
    it("loads users joined to this workspace and never the employees table", () => {
        const query = workspaceReviewersQuery(new QueryBuilder(), 10, [1, 3]).toSQL();

        expect(query.sql).toContain('from "users"');
        expect(query.sql).toContain('inner join "user_clients"');
        expect(query.sql).toContain('"users"."id" = "user_clients"."user_id"');
        expect(query.sql).toContain('"user_clients"."client_id" = $1');
        expect(query.sql).toContain('"users"."id" in ($2, $3)');
        expect(query.sql).toContain('"users"."deleted_at" is null');
        expect(query.sql.toLowerCase()).not.toContain("employee");
        expect(query.params).toEqual([10, 1, 3]);
    });
});
