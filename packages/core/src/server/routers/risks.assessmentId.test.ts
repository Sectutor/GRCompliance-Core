import { describe, expect, it, vi } from 'vitest';
import { initTRPC } from '@trpc/server';
import { riskAssessments, userClients } from '../../schema';

const dbState: { db: any } = { db: null };

vi.mock('../../db', () => ({
    getDb: async () => dbState.db,
    getClientControls: async () => [],
}));

const { createRisksRouter } = await import('./risks');

function callerFor(ctx: any) {
    const t = initTRPC.context<any>().create();
    const router = t.router({
        risks: createRisksRouter(t, t.procedure, t.procedure),
    });
    return router.createCaller(ctx);
}

function createFakeDb(options: { ids?: { assessment_id: string }[]; failOnce?: boolean }) {
    const ops: { op: string; data: any }[] = [];
    let failed = false;
    const db: any = {
        ops,
        select() {
            const state: any = { table: null };
            const rows = () => (state.table === userClients
                ? [{ userId: 7, clientId: 2, role: 'editor', accessExpiresAt: null }]
                : []);
            const chain: any = {
                from(table: unknown) {
                    state.table = table;
                    return chain;
                },
                where() {
                    return chain;
                },
                limit() {
                    return Promise.resolve(rows());
                },
                then(resolve: any, reject: any) {
                    return Promise.resolve(rows()).then(resolve, reject);
                },
            };
            return chain;
        },
        execute: vi.fn(async () => options.ids ?? []),
        insert(table: unknown) {
            const state: any = { op: 'insert', table, data: null };
            const chain: any = {
                values(data: unknown) {
                    state.data = data;
                    return chain;
                },
                returning() {
                    if (options.failOnce && !failed && table === riskAssessments) {
                        failed = true;
                        const error = Object.assign(new Error('duplicate'), { code: '23505' });
                        return Promise.reject(error);
                    }
                    ops.push(state);
                    return Promise.resolve([{ id: 9, ...(state.data ?? {}) }]);
                },
                then(resolve: any, reject: any) {
                    return Promise.resolve([]).then(resolve, reject);
                },
            };
            return chain;
        },
        transaction(fn: (tx: any) => Promise<unknown>) {
            return fn(db);
        },
    };
    return db;
}

describe('allocated risk assessment ids', () => {
    const year = new Date().getFullYear();

    it('assigns max+1 padded to four digits from upsert', async () => {
        const db = createFakeDb({ ids: [{ assessment_id: `RA-${year}-0010` }] });
        dbState.db = db;
        const caller = callerFor({ user: { id: 7 }, clientRole: 'editor', clientId: 2 });

        await caller.risks.upsert({
            clientId: 2,
            title: 'Next id',
            likelihood: 2,
            impact: 2,
        });

        const inserted = db.ops.find((op) => op.table === riskAssessments);
        expect(inserted?.data.assessmentId).toBe(`RA-${year}-0011`);
        expect(db.execute).toHaveBeenCalled();
        const lockQuery = JSON.stringify(db.execute.mock.calls[0][0]);
        expect(lockQuery).toContain('pg_advisory_xact_lock');
    });

    it('retries createRiskAssessment after a unique conflict', async () => {
        const db = createFakeDb({ ids: [], failOnce: true });
        dbState.db = db;
        const caller = callerFor({ user: { id: 7 }, clientRole: 'editor', clientId: 2 });

        const created = await caller.risks.createRiskAssessment({
            clientId: 2,
            title: 'Retried',
            likelihood: 1,
            impact: 1,
        });

        expect(created.assessmentId).toBe(`RA-${year}-0001`);
        expect(db.ops.filter((op) => op.table === riskAssessments)).toHaveLength(1);
    });
});
