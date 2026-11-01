/** User-facing due date. A real date is "Due <date>"; anything else is "No due date". */
export function duePhrase(value: Date | string | number | null | undefined): string {
    if (value == null || value === "") return "No due date";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "No due date";
    return `Due ${date.toLocaleDateString()}`;
}
