
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "../../db";
import { clientControls, employees, taskAssignments, users } from "../../schema";
import { employeeInWorkspace, raciAssignmentTarget } from "../raciAssignment";

export const createTaskAssignmentsRouter = (t: any, clientProcedure: any) => {
    return t.router({
        // Get assignments for a specific task
        summary: clientProcedure
            .input(z.object({
                clientId: z.number().optional(),
                taskType: z.string(), // 'control', etc.
                taskId: z.number(),
            }))
            .query(async ({ input, ctx }: any) => {
                const db = await getDb();
                const clientId = input.clientId || ctx.clientId; // Should usually be present via clientProcedure

                const assignments = await db.select({
                    id: taskAssignments.id,
                    userId: taskAssignments.userId,
                    employeeId: taskAssignments.employeeId,
                    role: taskAssignments.raciRole,
                    userName: users.name,
                    userEmail: users.email,
                    employeeFirst: employees.firstName,
                    employeeLast: employees.lastName,
                    employeeEmail: employees.email,
                })
                    .from(taskAssignments)
                    .leftJoin(users, eq(taskAssignments.userId, users.id))
                    .leftJoin(employees, eq(taskAssignments.employeeId, employees.id))
                    .where(and(
                        eq(taskAssignments.taskType, input.taskType),
                        eq(taskAssignments.taskId, input.taskId),
                        clientId ? eq(taskAssignments.clientId, clientId) : undefined
                    ));

                // Group by role
                const result = {
                    responsible: [] as any[],
                    accountable: [] as any[],
                    consulted: [] as any[],
                    informed: [] as any[]
                };

                for (const assign of assignments) {
                    const userObj = assign.employeeId != null
                        ? {
                            id: assign.employeeId,
                            kind: "employee" as const,
                            firstName: assign.employeeFirst || "",
                            lastName: assign.employeeLast || "",
                            email: assign.employeeEmail,
                            assignmentId: assign.id,
                        }
                        : (() => {
                            const names = (assign.userName || "").split(" ");
                            return {
                                id: assign.userId,
                                kind: "user" as const,
                                firstName: names[0] || "",
                                lastName: names.length > 1 ? names.slice(1).join(" ") : "",
                                email: assign.userEmail,
                                assignmentId: assign.id,
                            };
                        })();

                    if (assign.role === 'responsible') result.responsible.push(userObj);
                    else if (assign.role === 'accountable') result.accountable.push(userObj);
                    else if (assign.role === 'consulted') result.consulted.push(userObj);
                    else if (assign.role === 'informed') result.informed.push(userObj);
                }

                return result;
            }),

        // Assign a user to a role
        assignUser: clientProcedure
            .input(z.object({
                clientId: z.number(),
                taskType: z.string(),
                taskId: z.number(),
                userId: z.number().optional(),
                employeeId: z.number().optional(),
                raciRole: z.enum(['responsible', 'accountable', 'consulted', 'informed']),
            }))
            .mutation(async ({ input, ctx }: any) => {
                const db = await getDb();
                const target = raciAssignmentTarget(input);

                if (input.taskType === "control") {
                    const [control] = await db.select({ clientId: clientControls.clientId })
                        .from(clientControls)
                        .where(eq(clientControls.id, input.taskId))
                        .limit(1);
                    if (!control || control.clientId !== input.clientId) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "Control is not in this workspace" });
                    }
                }

                if (target.employeeId != null) {
                    const [employee] = await db.select({ clientId: employees.clientId })
                        .from(employees)
                        .where(eq(employees.id, target.employeeId))
                        .limit(1);
                    if (!employeeInWorkspace(employee, input.clientId)) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "That person is not in this workspace" });
                    }
                }

                await db.insert(taskAssignments)
                    .values({
                        clientId: input.clientId,
                        taskType: input.taskType,
                        taskId: input.taskId,
                        userId: target.userId,
                        employeeId: target.employeeId,
                        raciRole: input.raciRole,
                        assignedBy: ctx.user?.id
                    })
                    .onConflictDoNothing();

                return { success: true };
            }),

        // Remove an assignment
        remove: clientProcedure
            .input(z.object({
                assignmentId: z.number().optional(), // If we have the ID
                // Or by composite key
                taskType: z.string().optional(),
                taskId: z.number().optional(),
                userId: z.number().optional(),
                raciRole: z.string().optional()
            }))
            .mutation(async ({ input }: any) => {
                const db = await getDb();

                if (input.assignmentId) {
                    await db.delete(taskAssignments).where(eq(taskAssignments.id, input.assignmentId));
                } else if (input.taskType && input.taskId && input.userId && input.raciRole) {
                    await db.delete(taskAssignments)
                        .where(and(
                            eq(taskAssignments.taskType, input.taskType),
                            eq(taskAssignments.taskId, input.taskId),
                            eq(taskAssignments.userId, input.userId),
                            // @ts-ignore
                            eq(taskAssignments.raciRole, input.raciRole)
                        ));
                } else {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Missing parameters for removal' });
                }

                return { success: true };
            }),
    });
};
