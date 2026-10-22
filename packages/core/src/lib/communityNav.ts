/**
 * Community edition navigation.
 *
 * Community is the default. Premium-only entries stay in the menu data so a
 * build with the exact flag VITE_ENABLE_PREMIUM=true can show them with a Pro
 * badge. Every other value, including unset, omits them.
 */

export { isCommunityEdition } from "./edition";

export type EditionNavItem = {
    label: string;
    path: string;
    isPremium?: boolean;
    submenu?: EditionNavItem[];
};

export type EditionNavGroup<T extends EditionNavItem = EditionNavItem> = {
    label: string;
    items: T[];
};

export function filterNavForEdition<T extends EditionNavItem>(
    groups: EditionNavGroup<T>[],
    community: boolean,
): EditionNavGroup<T>[] {
    if (!community) return groups;

    return groups
        .map((group) => {
            const items = group.items
                .filter((item) => !item.isPremium)
                .map((item) => {
                    if (!item.submenu) return item;
                    return {
                        ...item,
                        submenu: item.submenu.filter((sub) => !sub.isPremium),
                    };
                });
            return { ...group, items };
        })
        .filter((group) => group.items.length > 0);
}
