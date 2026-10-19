/**
 * Community edition navigation.
 *
 * VITE_ENABLE_PREMIUM=false is the community build (the published image and
 * docker-compose.yml). Premium-only entries stay in the menu data so a
 * commercial build can show them with a Pro badge. The community build omits
 * them instead of advertising a plan that is not included.
 */

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

export function isCommunityEdition(premiumFlag: string | boolean | undefined | null): boolean {
    return premiumFlag === false || premiumFlag === "false";
}

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
