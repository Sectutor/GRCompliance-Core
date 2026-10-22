import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
    const tables: Record<string, any[]> = {};
    const writes: string[] = [];
    function write(op: string, result: any[] = [{ id: 1 }]) {
        const api: any = {
            set() { return api; },
            where() { writes.push(op); return api; },
            values() { return api; },
            returning() { return Promise.resolve(result); },
            then(ok: any, err: any) { return Promise.resolve(result).then(ok, err); },
        };
        return api;
    }
    return {
        tables,
        writes,
        reset() {
            writes.length = 0;
            for (const key of Object.keys(tables)) delete tables[key];
        },
        async getDb() {
            const { getTableName } = await import("drizzle-orm");
            const db = {
                select() {
                    let name = "";
                    const rows = () => tables[name] ?? [];
                    const api: any = {
                        from(table: any) {
                            name = getTableName(table);
                            return api;
                        },
                        where() { return api; },
                        orderBy() { return api; },
                        leftJoin() { return api; },
                        innerJoin() { return api; },
                        groupBy() { return api; },
                        limit(n?: number) {
                            const all = rows();
                            return Promise.resolve(typeof n === "number" ? all.slice(0, n) : all);
                        },
                        offset() { return api; },
                        then(ok: any, err: any) { return Promise.resolve(rows()).then(ok, err); },
                    };
                    return api;
                },
                insert: () => write("insert"),
                update: () => write("update"),
                delete: () => write("delete"),
                execute: async () => ({ rows: [] }),
                transaction: async (fn: any) => fn(db),
                query: {
                    employees: { findFirst: async () => null },
                },
            };
            return db;
        },
    };
});

vi.mock("../db", () => ({
    getDb: () => harness.getDb(),
    getUserById: async () => ({ id: 4, maxClients: 2 }),
    getVendors: async () => [],
}));

import { appRouter } from "../routers";

function member(clientId: number, role = "editor") {
    harness.tables.user_clients = [{ userId: 4, clientId, role, joinedAt: new Date(0) }];
}

function foreignRows() {
    const row = { id: 7, clientId: 9, userId: 99, threatModelId: 1, checklistId: 1, name: "Other", status: "pending" };
    const names = [
        "processing_activities",
        "data_protection_impact_assessments",
        "international_transfers",
        "project_tasks",
        "questionnaires",
        "vendor_assessments",
        "vendor_contacts",
        "vendor_contracts",
        "vendor_dpas",
        "gap_assessments",
        "intake_items",
        "knowledge_base_entries",
        "comments",
        "risk_scenarios",
        "federal_ssps",
        "federal_poams",
        "control_policy_mappings",
    ];
    for (const name of names) harness.tables[name] = [{ ...row }];
    harness.tables.vendors = [{ id: 7, clientId: 9, name: "Other" }];
    harness.tables.vendor_requests = [{ ...row }];
    harness.tables.federal_rmf_workflows = [{ ...row, stepStatus: {} }];
    harness.tables.federal_disa_stig_items = [{ id: 7, checklistId: 1 }];
    harness.tables.federal_disa_stig_checklists = [{ id: 1, clientId: 9 }];
    harness.tables.threat_model_components = [{ id: 7, threatModelId: 1 }];
    harness.tables.threat_model_data_flows = [{ id: 7, threatModelId: 1 }];
    harness.tables.threat_models = [{ id: 1, clientId: 9 }];
}

describe("record-by-id workspace binding", () => {
    it("forbids a row from another workspace, including when the id equals the caller workspace", async () => {
        harness.reset();
        member(7, "editor");
        foreignRows();
        const caller = appRouter.createCaller({ user: { id: 4, role: "user" } } as any);
        const forbidden = [
            () => caller.processingActivities.get({ id: 7 }),
            () => caller.processingActivities.update({ id: 7, activityName: "x" }),
            () => caller.processingActivities.scheduleReview({ id: 7 }),
            () => caller.processingActivities.getCompletenessScore({ id: 7 }),
            () => caller.dpia.get({ id: 7 }),
            () => caller.dpia.delete({ id: 7 }),
            () => caller.dpia.saveResponses({ id: 7, responses: {} }),
            () => caller.transfers.get({ id: 7 }),
            () => caller.transfers.update({ id: 7, clientId: 7, title: "x" }),
            () => caller.transfers.delete({ id: 7 }),
            () => caller.projectTasks.update({ id: 7, title: "x" }),
            () => caller.projectTasks.delete({ id: 7 }),
            () => caller.questionnaire.get({ id: 7 }),
            () => caller.questionnaire.update({ id: 7, status: "draft" }),
            () => caller.questionnaire.delete({ id: 7 }),
            () => caller.vendors.get({ id: 7 }),
            () => caller.vendors.update({ id: 7, status: "done" }),
            () => caller.vendors.updateAssessment({ id: 7, status: "done" }),
            () => caller.vendors.getLatestScan({ vendorId: 7 }),
            () => caller.vendors.listAssessments({ vendorId: 7 }),
            () => caller.vendors.deleteContact({ id: 7 }),
            () => caller.vendors.deleteContract({ id: 7 }),
            () => caller.vendors.deleteDpa({ id: 7 }),
            () => caller.gapAnalysis.get({ id: 7 }),
            () => caller.gapAnalysis.complete({ id: 7 }),
            () => caller.intake.triage({ id: 7, classification: "Policy" }),
            () => caller.intake.delete({ id: 7 }),
            () => caller.threatModels.removeComponent({ id: 7 }),
            () => caller.threatModels.updateComponentPosition({ id: 7, x: 1, y: 2 }),
            () => caller.threatModels.updateFlow({ id: 7, protocol: "HTTPS" }),
            () => caller.threatModels.removeFlow({ id: 7 }),
            () => caller.vendorRequests.approve({ id: 7, clientId: 7 }),
            () => caller.vendorRequests.reject({ id: 7, reason: "no" }),
            () => caller.vendorContracts.delete({ id: 7 }),
            () => caller.vendorContacts.delete({ id: 7 }),
            () => caller.mappings.delete({ id: 7 }),
            () => caller.knowledgeBase.delete({ id: 7 }),
            () => caller.comments.delete({ id: 7, clientId: 7 }),
            () => caller.devProjects.deleteRisk({ id: 7, clientId: 7 }),
            () => caller.federal.getSSP({ id: 7, clientId: 7 }),
            () => caller.federal.updateSSP({ id: 7, clientId: 7, content: "{}" }),
            () => caller.federal.getSspControls({ sspId: 7, clientId: 7 }),
            () => caller.federal.getPoamWithItems({ id: 7, clientId: 7 }),
            () => caller.federal.updateRmfStep({ id: 7, clientId: 7, step: 1, status: "done" }),
            () => caller.federal.updateDisaStigItem({ id: 7, status: "open" }),
        ];

        for (const call of forbidden) {
            await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
        expect(harness.writes).not.toContain("delete");
    });

    it("rejects anonymous assessment lists and still lets a viewer read their own row", async () => {
        harness.reset();
        foreignRows();
        const anon = appRouter.createCaller({ user: null } as any);
        await expect(anon.vendors.listAssessments({ vendorId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

        member(9, "viewer");
        harness.tables.processing_activities = [{ id: 42, clientId: 9, activityName: "Payroll" }];
        const caller = appRouter.createCaller({ user: { id: 4, role: "user" } } as any);
        const activity = await caller.processingActivities.get({ id: 42 });
        expect(activity.clientId).toBe(9);
        await expect(caller.processingActivities.update({ id: 42, activityName: "nope" })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
    });
});
