import { describe, expect, it, vi } from 'vitest';
import { initTRPC } from '@trpc/server';
import { riskAssessments, riskTreatments, treatmentControls, userClients } from '../../schema';

const dbState: { db: any } = { db: null };

vi.mock('../../db', () => ({
    getDb: async () => dbState.db,
    getClientControls: async () => [],
}));

const { assertRiskRowWorkspace, createRisksRouter } = await import('./risks');

function sqlFacts(node: unknown): { columns: string[]; values: unknown[] } {
    const columns: string[] = [];
    const values: unknown[] = [];
    const seen = new Set<unknown>();
    const visit = (current: any) => {
        if (!current || typeof current !== 'object' || seen.has(current)) return;
        seen.add(current);
        if (typeof current.name === 'string' && current.table) columns.push(current.name);
        if (current.encoder && 'value' in current && current.value !== undefined && typeof current.value !== 'object') {
            values.push(current.value);
        }
        if (Array.isArray(current.queryChunks)) current.queryChunks.forEach(visit);
        if (Array.isArray(current)) current.forEach(visit);
    };
    visit(node);
    return { columns, values };
}

function createFakeDb(rowsFor: (table: unknown) => any[]) {
    const ops: { op: string; table: unknown; where: unknown; data: unknown }[] = [];
    const db: any = {
        ops,
        select() {
            const state: any = { op: 'select', table: null, where: null, data: null };
            const rows = () => rowsFor(state.table) ?? [];
            const chain: any = {
                from(table: unknown) {
                    state.table = table;
                    return chain;
                },
                where(cond: unknown) {
                    state.where = cond;
                    ops.push(state);
                    return chain;
                },
                limit() {
                    return Promise.resolve(rows());
                },
                orderBy() {
                    return Promise.resolve(rows());
                },
                then(resolve: any, reject: any) {
                    return Promise.resolve(rows()).then(resolve, reject);
                },
            };
            return chain;
        },
        update(table: unknown) {
            const state: any = { op: 'update', table, where: null, data: null };
            const chain: any = {
                set(data: unknown) {
                    state.data = data;
                    return chain;
                },
                where(cond: unknown) {
                    state.where = cond;
                    ops.push(state);
                    return chain;
                },
                returning() {
                    const data = state.data ?? {};
                    return Promise.resolve([{ id: 1, ...data }]);
                },
                then(resolve: any, reject: any) {
                    return Promise.resolve([]).then(resolve, reject);
                },
            };
            return chain;
        },
        delete(table: unknown) {
            const state: any = { op: 'delete', table, where: null, data: null };
            return {
                where(cond: unknown) {
                    state.where = cond;
                    ops.push(state);
                    return Promise.resolve();
                },
            };
        },
        insert(table: unknown) {
            const state: any = { op: 'insert', table, where: null, data: null };
            let pushed = false;
            const push = () => {
                if (!pushed) {
                    ops.push(state);
                    pushed = true;
                }
            };
            const chain: any = {
                values(data: unknown) {
                    state.data = data;
                    return chain;
                },
                returning() {
                    push();
                    const data = Array.isArray(state.data) ? state.data[0] : (state.data ?? {});
                    return Promise.resolve([{ id: 50, ...data }]);
                },
                then(resolve: any, reject: any) {
                    push();
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

function callerFor(ctx: any) {
    const t = initTRPC.context<any>().create();
    const router = t.router({
        risks: createRisksRouter(t, t.procedure, t.procedure),
    });
    return router.createCaller(ctx);
}

const member = (role: string, clientId = 2) => ({
    userId: 7,
    clientId,
    role,
    accessExpiresAt: null,
});

describe('assertRiskRowWorkspace', () => {
    it('rejects a supplied workspace that does not own the row', async () => {
        const db = createFakeDb(() => [member('owner', 2)]);
        await expect(assertRiskRowWorkspace(db, { user: { id: 7 }, clientId: 2 }, 2, 9))
            .rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Risk does not belong to this workspace' });
        expect(db.ops).toHaveLength(0);
    });

    it('rejects callers who are not members of the owning workspace', async () => {
        const db = createFakeDb(() => []);
        await expect(assertRiskRowWorkspace(db, { user: { id: 7 }, clientId: 2 }, 2, 2))
            .rejects.toMatchObject({ message: 'No access to this client workspace. Membership required.' });
        const facts = sqlFacts(db.ops[0].where);
        expect(facts.columns).toContain('client_id');
        expect(facts.values).toContain(2);
    });

    it('rejects an expired membership', async () => {
        const db = createFakeDb(() => [{ ...member('owner'), accessExpiresAt: new Date('2000-01-01') }]);
        await expect(assertRiskRowWorkspace(db, { user: { id: 7 } }, 2, 2))
            .rejects.toMatchObject({ message: 'Your access to this workspace has expired.' });
    });
});

describe('risk workspace binding', () => {
    const ownerCtx = { user: { id: 7 }, clientRole: 'owner', clientId: 2 };

    it('does not move a risk into the caller workspace', async () => {
        const assessment = { id: 11, clientId: 2, title: 'Owned' };
        const db = createFakeDb((table) => {
            if (table === userClients) return [member('editor')];
            if (table === riskAssessments) return [assessment];
            return [];
        });
        dbState.db = db;
        const caller = callerFor({ user: { id: 7 }, clientRole: 'editor', clientId: 1 });

        await expect(caller.risks.upsert({
            id: 11,
            clientId: 1,
            title: 'Moved',
            likelihood: 3,
            impact: 3,
        })).rejects.toMatchObject({ message: 'Risk does not belong to this workspace' });

        expect(db.ops.some((op) => op.op === 'update')).toBe(false);
    });

    it('updates only the owning workspace and keeps that client id', async () => {
        const assessment = { id: 11, clientId: 2, title: 'Owned' };
        const db = createFakeDb((table) => {
            if (table === userClients) return [member('editor')];
            if (table === riskAssessments) return [assessment];
            return [];
        });
        dbState.db = db;
        const caller = callerFor({ user: { id: 7 }, clientRole: 'editor', clientId: 2 });

        const result = await caller.risks.upsert({
            id: 11,
            clientId: 2,
            title: 'Updated',
            likelihood: 4,
            impact: 4,
        });

        expect(result).toEqual({ id: 1, success: true });
        const update = db.ops.find((op) => op.op === 'update' && op.table === riskAssessments);
        expect(update).toBeTruthy();
        expect((update!.data as any).clientId).toBe(2);
        const facts = sqlFacts(update!.where);
        expect(facts.columns).toEqual(expect.arrayContaining(['id', 'client_id']));
        expect(facts.values).toEqual(expect.arrayContaining([11, 2]));
    });

    it('deletes only when the caller owns the row workspace', async () => {
        const assessment = { id: 11, clientId: 2 };
        const db = createFakeDb((table) => {
            if (table === userClients) return [member('owner')];
            if (table === riskAssessments) return [assessment];
            return [];
        });
        dbState.db = db;

        await expect(callerFor({ user: { id: 7 }, clientRole: 'owner', clientId: 1 }).risks.delete({
            id: 11,
            clientId: 1,
        })).rejects.toMatchObject({ message: 'Risk does not belong to this workspace' });
        expect(db.ops.some((op) => op.op === 'delete')).toBe(false);

        const ok = createFakeDb((table) => {
            if (table === userClients) return [member('owner')];
            if (table === riskAssessments) return [assessment];
            return [];
        });
        dbState.db = ok;
        await callerFor(ownerCtx).risks.delete({ id: 11, clientId: 2 });
        const deleted = ok.ops.find((op) => op.op === 'delete');
        const facts = sqlFacts(deleted!.where);
        expect(facts.columns).toEqual(expect.arrayContaining(['id', 'client_id']));
        expect(facts.values).toEqual(expect.arrayContaining([11, 2]));
    });

    it('refuses to attach a treatment plan to another workspace risk', async () => {
        const db = createFakeDb((table) => {
            if (table === userClients) return [member('editor', 2)];
            if (table === riskAssessments) return [{ id: 11, clientId: 2 }];
            return [];
        });
        dbState.db = db;
        await expect(callerFor({ user: { id: 7 }, clientRole: 'editor', clientId: 4 }).risks.saveTreatmentPlan({
            riskAssessmentId: 11,
            clientId: 4,
            treatmentType: 'mitigate',
            controlIds: [3],
        })).rejects.toMatchObject({ message: 'Risk does not belong to this workspace' });
        expect(db.ops.some((op) => op.op === 'insert' || op.op === 'update')).toBe(false);
    });

    it('links a control only for a treatment in the caller workspace', async () => {
        const foreign = createFakeDb((table) => {
            if (table === userClients) return [member('editor', 2)];
            if (table === riskTreatments) return [{ id: 8, clientId: 2, riskAssessmentId: 11 }];
            if (table === riskAssessments) return [{ id: 11, clientId: 2 }];
            return [];
        });
        dbState.db = foreign;
        await expect(callerFor({ user: { id: 7 }, clientRole: 'editor', clientId: 4 }).risks.linkControl({
            treatmentId: 8,
            controlId: 3,
            clientId: 4,
        })).rejects.toMatchObject({ message: 'Risk does not belong to this workspace' });
        expect(foreign.ops.some((op) => op.op === 'insert')).toBe(false);

        const db = createFakeDb((table) => {
            if (table === userClients) return [member('editor')];
            if (table === riskTreatments) return [{ id: 8, clientId: 2, riskAssessmentId: 11 }];
            if (table === riskAssessments) return [{ id: 11, clientId: 2 }];
            if (table === treatmentControls) return [];
            return [];
        });
        dbState.db = db;
        await callerFor({ user: { id: 7 }, clientRole: 'editor', clientId: 2 }).risks.linkControl({
            treatmentId: 8,
            controlId: 3,
            clientId: 2,
        });
        const inserted = db.ops.find((op) => op.op === 'insert' && op.table === treatmentControls);
        expect((inserted!.data as any).clientId).toBe(2);
        const lookup = db.ops.find((op) => op.op === 'select' && op.table === treatmentControls);
        expect(sqlFacts(lookup!.where).columns).toContain('client_id');
    });

    it('does not return treatments for a workspace the caller is not in', async () => {
        const hidden = createFakeDb((table) => {
            if (table === riskAssessments) return [{ id: 11, clientId: 2 }];
            if (table === userClients) return [];
            if (table === riskTreatments) return [{ id: 1, strategy: 'secret', owner: 'Ada', clientId: 2, riskAssessmentId: 11 }];
            return [];
        });
        dbState.db = hidden;
        await expect(callerFor({ user: { id: 7 }, clientId: 2 }).risks.getRiskTreatments({
            riskAssessmentId: 11,
        })).rejects.toMatchObject({ message: 'No access to this client workspace. Membership required.' });

        const db = createFakeDb((table) => {
            if (table === riskAssessments) return [{ id: 11, clientId: 2 }];
            if (table === userClients) return [member('viewer')];
            if (table === riskTreatments) return [{ id: 1, strategy: 'mitigate', owner: 'Ada', clientId: null, riskAssessmentId: 11 }];
            return [];
        });
        dbState.db = db;
        const rows = await callerFor({ user: { id: 7 }, clientId: 2, clientRole: 'viewer' }).risks.getRiskTreatments({
            riskAssessmentId: 11,
            clientId: 2,
        });
        expect(rows).toHaveLength(1);
        const treatmentRead = db.ops.find((op) => op.op === 'select' && op.table === riskTreatments);
        const facts = sqlFacts(treatmentRead!.where);
        expect(facts.columns).toContain('client_id');
        expect(facts.values).toContain(2);
    });
});
