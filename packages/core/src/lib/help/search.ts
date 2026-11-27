import { HELP_ARTICLES, type HelpArticle } from "./articles";

export function searchHelp(query: string, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
    if (terms.length === 0) return articles.slice(0, 8);
    return articles
        .map((article) => {
            const haystack = `${article.title} ${article.screen} ${article.body}`.toLowerCase();
            const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
            return { article, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
        .map((item) => item.article);
}
