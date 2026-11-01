function asDate(value: Date | string | number | null | undefined): Date | null {
    if (value == null || value === "") return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** User-facing due date. A real date is "Due <date>"; anything else is "No due date". */
export function duePhrase(value: Date | string | number | null | undefined): string {
    const date = asDate(value);
    if (!date) return "No due date";
    return `Due ${date.toLocaleDateString()}`;
}

/** Policy review date. A real date is "Review due <date>"; anything else is "No review date". */
export function reviewDuePhrase(value: Date | string | number | null | undefined): string {
    const date = asDate(value);
    if (!date) return "No review date";
    return `Review due ${date.toLocaleDateString()}`;
}
