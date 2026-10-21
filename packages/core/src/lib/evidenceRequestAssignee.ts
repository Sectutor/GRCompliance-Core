export type EvidenceRequestAssignee = {
    assigneeId: number | null;
    assigneeEmployeeId: number | null;
};

/**
 * A request stores either a platform user (assignee_id) or a People & Org employee
 * (assignee_employee_id). The two ids are not interchangeable.
 */
export function evidenceRequestAssignee(input: {
    assigneeId?: number | null;
    assigneeEmployeeId?: number | null;
}): EvidenceRequestAssignee {
    const hasUser = input.assigneeId != null;
    const hasEmployee = input.assigneeEmployeeId != null;
    if (hasUser === hasEmployee) {
        throw new Error("Choose a platform user or a workspace employee");
    }
    if (hasEmployee) return { assigneeId: null, assigneeEmployeeId: input.assigneeEmployeeId! };
    return { assigneeId: input.assigneeId!, assigneeEmployeeId: null };
}

export function decodeAssigneeChoice(value: string): { assigneeId?: number; assigneeEmployeeId?: number } | null {
    const [kind, idStr] = value.split(":");
    const id = Number.parseInt(idStr ?? "", 10);
    if (!Number.isFinite(id)) return null;
    if (kind === "employee") return { assigneeEmployeeId: id };
    if (kind === "user") return { assigneeId: id };
    return null;
}

export function evidenceRequestAssigneeLabel(row: {
    assigneeEmployeeId?: number | null;
    assigneeId?: number | null;
    employeeFirst?: string | null;
    employeeLast?: string | null;
    userName?: string | null;
}): { name: string; kind: "employee" | "user"; label: "Person" | "User" } | null {
    if (row.assigneeEmployeeId != null) {
        const name = [row.employeeFirst, row.employeeLast].filter(Boolean).join(" ").trim();
        return { name: name || "Person", kind: "employee", label: "Person" };
    }
    if (row.assigneeId != null) {
        return { name: row.userName?.trim() || "User", kind: "user", label: "User" };
    }
    return null;
}
