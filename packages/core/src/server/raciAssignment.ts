import { TRPCError } from "@trpc/server";

export type RaciTarget = {
    userId: number | null;
    employeeId: number | null;
};

/** An assignment stores either a platform user or a People & Org employee. */
export function raciAssignmentTarget(input: {
    userId?: number | null;
    employeeId?: number | null;
}): RaciTarget {
    const hasUser = input.userId != null;
    const hasEmployee = input.employeeId != null;
    if (hasUser === hasEmployee) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a platform user or a workspace employee",
        });
    }
    if (hasEmployee) return { userId: null, employeeId: input.employeeId! };
    return { userId: input.userId!, employeeId: null };
}

export function employeeInWorkspace(
    employee: { clientId: number } | null | undefined,
    workspaceId: number
): boolean {
    return !!employee && employee.clientId === workspaceId;
}
