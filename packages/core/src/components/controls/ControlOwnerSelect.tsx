import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@complianceos/ui/ui/select";

type Person = { id: number; firstName?: string | null; lastName?: string | null; name?: string | null };

const UNASSIGNED = "__unassigned__";

function personName(person: Person): string {
    if (person.name?.trim()) return person.name.trim();
    return `${person.firstName || ""} ${person.lastName || ""}`.trim();
}

export function ControlOwnerSelect({
    value,
    onChange,
    employees,
    users,
    disabled,
    className,
}: {
    value: string | null | undefined;
    onChange: (owner: string | null) => void;
    employees?: Person[];
    users?: Person[];
    disabled?: boolean;
    className?: string;
}) {
    const people = (employees || []).map(personName).filter(Boolean);
    const userNames = (users || []).map(personName).filter((name) => name && !people.includes(name));
    const known = new Set([...people, ...userNames]);
    const current = value?.trim() || "";

    return (
        <Select
            value={current || UNASSIGNED}
            onValueChange={(next) => onChange(next === UNASSIGNED ? null : next)}
            disabled={disabled}
        >
            <SelectTrigger className={className}>
                <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {current && !known.has(current) && (
                    <SelectItem value={current}>{current}</SelectItem>
                )}
                <SelectGroup>
                    <SelectLabel>People</SelectLabel>
                    {people.map((name) => (
                        <SelectItem key={`person-${name}`} value={name}>{name}</SelectItem>
                    ))}
                </SelectGroup>
                <SelectGroup>
                    <SelectLabel>Users</SelectLabel>
                    {userNames.map((name) => (
                        <SelectItem key={`user-${name}`} value={name}>{name}</SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}
