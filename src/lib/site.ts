import type { PageMeta } from "./meta";
import { siteMetadata } from "./content";

export type NavigationItemName = "home" | "projects" | "blog" | "talks" | "support" | "contact";
export type StaticPageKey = NavigationItemName | "not-found";

export interface NavigationItem {
  name: NavigationItemName;
  path: string;
  label: string;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const getLastPathSegment = (value: string): string => trimTrailingSlash(value).split("/").at(-1) ?? "";

const buildSectionTitle = (label: string): string => `${label} — ${siteMetadata.displayName}`;
export const getGithubAvatarUrl = (account: string, size = 96): string =>
  `https://github.com/${account.replace(/^@/, "").trim()}.png?size=${size}`;

export const GITHUB_USERNAME = siteMetadata.githubUsername;
export const GITHUB_PROFILE_URL = trimTrailingSlash(siteMetadata.social.github);
export const GITHUB_AVATAR_URL = getGithubAvatarUrl(GITHUB_USERNAME);
export const GITHUB_PROFILE_LABEL = GITHUB_PROFILE_URL.replace(/^https?:\/\//, "");
export const TELEGRAM_URL = trimTrailingSlash(siteMetadata.social.telegram);
export const TELEGRAM_HANDLE = getLastPathSegment(TELEGRAM_URL);
export const TELEGRAM_LABEL = TELEGRAM_HANDLE ? `@${TELEGRAM_HANDLE}` : TELEGRAM_URL.replace(/^https?:\/\//, "");
export const getGithubRepositoryUrl = (repository: string): string =>
  repository.includes("/")
    ? `https://github.com/${repository.replace(/^\/+|\/+$/g, "")}`
    : `${GITHUB_PROFILE_URL}/${repository.replace(/^\/+|\/+$/g, "")}`;

export const PRIMARY_NAV_ITEMS: NavigationItem[] = [
  { name: "home", path: "/", label: "Home" },
  { name: "projects", path: "/projects", label: "Projects" },
  { name: "blog", path: "/blog", label: "Blog" },
  { name: "talks", path: "/talks", label: "Talks" },
  { name: "support", path: "/support", label: "Support" },
  { name: "contact", path: "/contact", label: "Contact" }
];

export const HEADER_NAV_ITEMS: NavigationItem[] = PRIMARY_NAV_ITEMS.filter((item) => item.name !== "talks");

const STATIC_PAGE_META: Record<StaticPageKey, PageMeta> = {
  home: {
    title: siteMetadata.defaultTitle,
    description: siteMetadata.defaultDescription,
    path: "/"
  },
  projects: {
    title: buildSectionTitle("Projects"),
    description: "Backend, API, автоматизация и pet-проекты: от идеи до рабочего релиза.",
    path: "/projects"
  },
  blog: {
    title: buildSectionTitle("Blog"),
    description: "Статьи про backend-разработку, архитектуру, автоматизацию и инженерную практику.",
    path: "/blog"
  },
  talks: {
    title: buildSectionTitle("Talks"),
    description: "Лекции, заметки и будущие выпуски Podcast Lab про backend и инженерную практику.",
    path: "/talks"
  },
  support: {
    title: buildSectionTitle("Support"),
    description: "Как поддержать автора сайта: обратная связь, репосты, сотрудничество и идеи.",
    path: "/support"
  },
  contact: {
    title: buildSectionTitle("Contact"),
    description: "Каналы связи для backend-задач, технических вопросов и сотрудничества.",
    path: "/contact"
  },
  "not-found": {
    title: `Страница не найдена — ${siteMetadata.displayName}`,
    description: "Запрошенная страница не найдена. Вернитесь на главную или откройте список материалов.",
    path: "/404"
  }
};

export const getStaticPageMeta = (page: StaticPageKey): PageMeta => STATIC_PAGE_META[page];
