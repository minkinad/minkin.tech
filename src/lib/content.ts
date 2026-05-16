import githubData from "../content/generated/github-data.json";
import siteConfig from "../content/site-config.json";
import { parseDateToTimestamp } from "./dates";
import { parseMarkdown, stripMarkdown, type FrontmatterObject, type FrontmatterValue } from "./markdown";

export type ContentSource = "local" | "github";

export interface ContentEntry {
  slug: string;
  title: string;
  date?: string;
  tags: string[];
  summary: string;
  link?: string;
  order?: number;
  html: string;
  repository?: string;
  logoKey?: string;
  section?: string;
  source: ContentSource;
}

export interface HomeStackItem {
  name: string;
  href?: string;
  logoSrc?: string;
  logoAlt?: string;
}

export interface HomeStackGroup {
  title: string;
  separator?: string;
  items: HomeStackItem[];
}

export interface HomeContent {
  eyebrow: string;
  title: string;
  lead: string;
  subtitle: string;
  supportTitle: string;
  supportText: string;
  stackGroups: HomeStackGroup[];
  html: string;
}

export interface GithubActivity {
  commitSha: string;
  commitUrl: string;
  commitMessage: string;
  repoName: string;
  repoUrl: string;
  projectDescription: string;
  createdAt: string;
}

export interface GithubRepository {
  fullName: string;
  name: string;
  owner: string;
  htmlUrl: string;
  description: string;
  language: string;
  topics: string[];
  startedAt: string | null;
  pushedAt: string | null;
  updatedAt: string | null;
  activityAt: string | null;
  isPinned: boolean;
}

export interface GithubDataStatus {
  generatedAt: string | null;
  username: string | null;
  source: "github" | "fallback" | "stale";
  isStale: boolean;
}

interface GithubDataPayload {
  generatedAt?: string;
  username?: string;
  source?: "github" | "fallback";
  activity: {
    commitSha: string;
    commitUrl: string;
    commitMessage: string;
    repoName: string;
    repoUrl: string;
    projectDescription: string;
    createdAt: string;
  } | null;
  repositories: GithubRepository[];
}

type GithubActivityPayload = NonNullable<GithubDataPayload["activity"]>;

export const siteMetadata = siteConfig;
const githubPayload = githubData as GithubDataPayload;
const payloadUsername = typeof githubPayload.username === "string" && githubPayload.username.trim()
  ? githubPayload.username.trim()
  : null;
const payloadMatchesConfiguredUser = payloadUsername?.toLowerCase() === siteConfig.githubUsername.toLowerCase();

const toStringValue = (value: FrontmatterValue | undefined): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

const toNumberValue = (value: FrontmatterValue | undefined): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return undefined;
};

const toStringArray = (value: FrontmatterValue | undefined): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return [value];
  return [];
};

const isObjectValue = (value: FrontmatterValue | undefined): value is FrontmatterObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getSlug = (path: string): string => {
  const file = path.split("/").at(-1) ?? "";
  return file.replace(/\.md$/, "");
};

const createSummary = (rawBody: string): string => {
  const plain = stripMarkdown(rawBody);
  if (plain.length <= 170) return plain;
  return `${plain.slice(0, 167).trimEnd()}...`;
};

const normalizeRepository = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  return value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\/+$/, "");
};

const normalizeLogoKey = (value: string | undefined): string | undefined => {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "mylogo") {
    return "brand";
  }

  return normalized;
};

const getRepositoryFromLink = (link: string | undefined): string | undefined => {
  if (!link) return undefined;

  try {
    const url = new URL(link);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return undefined;
    return `${segments[0]}/${segments[1]}`;
  } catch {
    return undefined;
  }
};

const createContentEntry = (path: string, raw: string, source: ContentSource): ContentEntry => {
  const { attributes, body, html } = parseMarkdown(raw);
  const slug = getSlug(path);
  const title = toStringValue(attributes.title) ?? slug;
  const date = toStringValue(attributes.date);
  const summary = toStringValue(attributes.summary) ?? createSummary(body);
  const link = toStringValue(attributes.link);
  const order = toNumberValue(attributes.order);
  const repository = normalizeRepository(toStringValue(attributes.repository) ?? getRepositoryFromLink(link));
  const logoKey = normalizeLogoKey(toStringValue(attributes.logoKey));
  const section = toStringValue(attributes.section);

  return {
    slug,
    title,
    date,
    tags: toStringArray(attributes.tags),
    summary,
    link,
    order,
    html,
    repository,
    logoKey,
    section,
    source
  };
};

const buildEntries = (modules: Record<string, string>, source: ContentSource = "local"): ContentEntry[] =>
  Object.entries(modules).map(([path, raw]) => createContentEntry(path, raw, source));

const buildEntriesAsync = async (
  modules: Record<string, () => Promise<string>>,
  source: ContentSource = "local"
): Promise<ContentEntry[]> => {
  const loadedModules = await Promise.all(
    Object.entries(modules).map(async ([path, load]) => [path, await load()] as const)
  );

  return buildEntries(Object.fromEntries(loadedModules), source);
};

export const getRepositoryTags = (repository: GithubRepository, limit = 5): string[] =>
  [repository.language, ...repository.topics].filter(Boolean).slice(0, limit);

export const getRepositoryActivityDate = (repository: GithubRepository): string | undefined =>
  repository.isPinned ? "Pinned" : repository.activityAt ?? repository.updatedAt ?? repository.pushedAt ?? undefined;

const getRepositoryKey = (repository: Pick<GithubRepository, "fullName">): string => repository.fullName.toLowerCase();

const sortEntriesByOrderAndDate = (left: ContentEntry, right: ContentEntry): number => {
  if (typeof left.order === "number" && typeof right.order === "number") {
    return left.order - right.order;
  }

  if (typeof left.order === "number") return -1;
  if (typeof right.order === "number") return 1;
  return parseDateToTimestamp(right.date) - parseDateToTimestamp(left.date) || left.title.localeCompare(right.title);
};

const normalizeHomeStackGroups = (value: FrontmatterValue | undefined): HomeStackGroup[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isObjectValue)
    .map((group) => {
      const itemsValue = group.items;
      const items = Array.isArray(itemsValue)
        ? itemsValue
            .filter(isObjectValue)
            .map((item) => ({
              name: toStringValue(item.name) ?? "",
              href: toStringValue(item.href),
              logoSrc: toStringValue(item.logoSrc),
              logoAlt: toStringValue(item.logoAlt)
            }))
            .filter((item) => item.name)
        : [];

      return {
        title: toStringValue(group.title) ?? "",
        separator: toStringValue(group.separator),
        items
      };
    })
    .filter((group) => group.title && group.items.length > 0);
};

const homeModules = import.meta.glob("../content/home.md", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

const blogModules = import.meta.glob("../content/blog/*.md", {
  query: "?raw",
  import: "default"
}) as Record<string, () => Promise<string>>;

const projectModules = import.meta.glob("../content/projects/*.md", {
  query: "?raw",
  import: "default"
}) as Record<string, () => Promise<string>>;

let blogPostsPromise: Promise<ContentEntry[]> | null = null;
let projectEntriesPromise: Promise<ContentEntry[]> | null = null;

export const getHomePageContent = (): HomeContent => {
  const raw = Object.values(homeModules)[0] ?? "# Home\n";
  const { attributes, body, html } = parseMarkdown(raw);

  return {
    eyebrow: toStringValue(attributes.eyebrow) ?? "FullStack Developer",
    title: toStringValue(attributes.title) ?? siteConfig.displayName,
    lead: toStringValue(attributes.lead) ?? siteConfig.defaultDescription,
    subtitle: toStringValue(attributes.subtitle) ?? "",
    supportTitle: toStringValue(attributes.supportTitle) ?? "Поддержка",
    supportText: toStringValue(attributes.supportText) ?? "",
    stackGroups: normalizeHomeStackGroups(attributes.stackGroups),
    html: body ? html : ""
  };
};

export const getBlogPosts = async (): Promise<ContentEntry[]> => {
  blogPostsPromise ??= buildEntriesAsync(blogModules).then((posts) =>
    posts.sort((a, b) => parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date))
  );

  return blogPostsPromise;
};

export const getBlogPostBySlug = async (slug: string): Promise<ContentEntry | undefined> =>
  (await getBlogPosts()).find((post) => post.slug === slug);

const mapGithubActivity = (activity: GithubActivityPayload): GithubActivity => ({
  commitSha: activity.commitSha,
  commitUrl: activity.commitUrl,
  commitMessage: activity.commitMessage,
  repoName: activity.repoName,
  repoUrl: activity.repoUrl,
  projectDescription: activity.projectDescription,
  createdAt: activity.createdAt
});

export const getGithubActivity = (): GithubActivity | null => {
  if (!payloadMatchesConfiguredUser) return null;

  const activity = githubPayload.activity;
  if (!activity?.createdAt) return null;

  return mapGithubActivity(activity);
};

export const getGithubDataStatus = (): GithubDataStatus => ({
  generatedAt: typeof githubPayload.generatedAt === "string" ? githubPayload.generatedAt : null,
  username: payloadUsername,
  source: payloadMatchesConfiguredUser ? (githubPayload.source ?? "fallback") : "stale",
  isStale: !payloadMatchesConfiguredUser
});

export const getGithubRepositories = (): GithubRepository[] =>
  payloadMatchesConfiguredUser
    ? [...githubPayload.repositories].map((repository) => ({
        fullName: repository.fullName,
        name: repository.name,
        owner: repository.owner,
        htmlUrl: repository.htmlUrl,
        description: repository.description,
        language: repository.language,
        topics: repository.topics,
        startedAt: repository.startedAt,
        pushedAt: repository.pushedAt,
        updatedAt: repository.updatedAt,
        activityAt: repository.activityAt,
        isPinned: repository.isPinned
      }))
    : [];

export const shouldExposeRepository = (repository: GithubRepository): boolean => {
  const normalizedName = repository.name.trim().toLowerCase();
  const normalizedOwner = repository.owner.trim().toLowerCase();

  if (!normalizedName || normalizedName.startsWith(".")) return false;
  if (normalizedName === normalizedOwner) return false;

  return true;
};

export const getPublicGithubProjectRepositories = (): GithubRepository[] =>
  getGithubRepositories().filter(
    (repository) =>
      repository.name.toLowerCase() !== siteConfig.githubUsername.toLowerCase() && shouldExposeRepository(repository)
  );

const mapGithubRepoToProject = (repository: GithubRepository): ContentEntry => {
  return {
    slug: repository.name.toLowerCase(),
    title: repository.name,
    date: repository.startedAt ?? getRepositoryActivityDate(repository),
    tags: getRepositoryTags(repository),
    summary: repository.description || "Описание проекта не заполнено на GitHub.",
    link: repository.htmlUrl,
    repository: repository.fullName,
    html: "",
    source: "github"
  };
};

const matchesProjectRepository = (project: ContentEntry, repository: GithubRepository): boolean => {
  const explicitRepository = normalizeRepository(project.repository);
  if (explicitRepository) {
    return explicitRepository.toLowerCase() === repository.fullName.toLowerCase();
  }

  const fromLink = normalizeRepository(getRepositoryFromLink(project.link));
  if (fromLink) {
    return fromLink.toLowerCase() === repository.fullName.toLowerCase();
  }

  return project.slug.toLowerCase() === repository.name.toLowerCase();
};

const mergeProjectWithRepository = (project: ContentEntry, repository: GithubRepository | undefined): ContentEntry => {
  if (!repository) return project;

  const tags = project.tags.length > 0 ? project.tags : getRepositoryTags(repository);

  return {
    ...project,
    date: project.date ?? getRepositoryActivityDate(repository),
    tags,
    summary: project.summary || repository.description || "Описание проекта не заполнено на GitHub.",
    link: project.link ?? repository.htmlUrl,
    repository: project.repository ?? repository.fullName,
    section: project.section
  };
};

export const getProjects = async (): Promise<ContentEntry[]> => {
  projectEntriesPromise ??= buildEntriesAsync(projectModules).then((localProjects) => {
    const repositories = getPublicGithubProjectRepositories();

    const matchedRepositories = new Set<string>();
    const mergedLocalProjects = localProjects.map((project) => {
      const repository = repositories.find((entry) => matchesProjectRepository(project, entry));
      if (repository) {
        matchedRepositories.add(getRepositoryKey(repository));
      }
      return mergeProjectWithRepository(project, repository);
    });

    const generatedProjects = repositories
      .filter((repository) => !matchedRepositories.has(getRepositoryKey(repository)))
      .map(mapGithubRepoToProject);

    return [...mergedLocalProjects, ...generatedProjects].sort(sortEntriesByOrderAndDate);
  });

  return projectEntriesPromise;
};

export const getProjectBySlug = async (slug: string): Promise<ContentEntry | undefined> =>
  (await getProjects()).find((project) => project.source === "local" && project.slug === slug);
