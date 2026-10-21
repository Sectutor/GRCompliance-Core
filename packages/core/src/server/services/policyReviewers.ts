import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { userClients, users } from "../../schema";

interface WorkspaceReviewerDb {
    select(shape: { id: unknown; email: unknown; name: unknown }): {
        from(table: unknown): {
            innerJoin(table: unknown, on: SQL | undefined): {
                where(condition: SQL): PromiseLike<WorkspaceReviewer[]>;
            };
        };
    };
}

export type WorkspaceReviewer = {
    id: number;
    email: string | null;
    name: string | null;
};

export class InvalidReviewerIdError extends Error {
    constructor() {
        super("Reviewers must be workspace member ids");
        this.name = "InvalidReviewerIdError";
    }
}

/**
 * The review dialog sends `users.id` values (see listWorkspaceMembers).
 * Accept only canonical positive integer ids, in request order, without duplicates.
 */
export function parseReviewerUserIds(reviewers: readonly string[]): number[] {
    const ids: number[] = [];
    const seen = new Set<number>();

    for (const raw of reviewers) {
        const value = String(raw).trim();
        if (!/^[1-9]\d*$/.test(value)) {
            throw new InvalidReviewerIdError();
        }
        const id = Number(value);
        if (!Number.isSafeInteger(id)) {
            throw new InvalidReviewerIdError();
        }
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }

    return ids;
}

/**
 * Members of this workspace only. `employees.id` is a different global sequence
 * and must not be used: user N is not employee N, and employee N may belong to
 * another client.
 */
export function workspaceReviewersQuery(dbConn: WorkspaceReviewerDb, clientId: number, reviewerIds: number[]) {
    const where = and(
        eq(userClients.clientId, clientId),
        inArray(users.id, reviewerIds),
        isNull(users.deletedAt),
    );
    if (!where) {
        throw new Error("Reviewer filter was empty");
    }

    return dbConn
        .select({
            id: users.id,
            email: users.email,
            name: users.name,
        })
        .from(users)
        .innerJoin(userClients, eq(users.id, userClients.userId))
        .where(where);
}

export async function findWorkspaceReviewers(
    dbConn: WorkspaceReviewerDb,
    clientId: number,
    reviewerIds: number[],
): Promise<WorkspaceReviewer[]> {
    if (reviewerIds.length === 0) return [];

    const rows = await workspaceReviewersQuery(dbConn, clientId, reviewerIds);
    const allowed = new Set(reviewerIds);
    const byId = new Map<number, WorkspaceReviewer>();

    for (const row of rows) {
        if (!allowed.has(row.id) || byId.has(row.id)) continue;
        byId.set(row.id, {
            id: row.id,
            email: row.email ?? null,
            name: row.name ?? null,
        });
    }

    return reviewerIds.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
}
