import { readFile } from "node:fs/promises";
import { GENERATED_GITHUB_PATH, readSiteConfig, writeJsonFile } from "./site-utils.mjs";

const REPOS_PER_PAGE = 100;
const SEARCH_RESULTS_PER_PAGE = 100;
const MAX_PAGES = 10;
const FETCH_RETRY_COUNT = 3;
const FETCH_RETRY_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 10_000;

function normalizeRepositoryReference(value) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\/+$/, "");
  return normalized || null;
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function fetchJson(url, headers = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= FETCH_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "minkin.tech-build-script",
          ...headers
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= FETCH_RETRY_COUNT) break;

      await new Promise((resolve) => {
        setTimeout(resolve, FETCH_RETRY_DELAY_MS * attempt);
      });
    }
  }

  throw lastError;
}

async function fetchPublicRepos(username) {
  const repositories = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const items = await fetchJson(
      `https://api.github.com/users/${username}/repos?type=all&sort=pushed&per_page=${REPOS_PER_PAGE}&page=${page}`
    );

    repositories.push(...items.filter((repo) => !repo.private));
    if (items.length < REPOS_PER_PAGE) break;
  }

  return repositories;
}

async function fetchRepositoryByFullName(fullName) {
  return fetchJson(`https://api.github.com/repos/${fullName}`);
}

async function fetchContributedRepos(username) {
  const repositories = new Map();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = encodeURIComponent(`author:${username} is:public`);
    const payload = await fetchJson(
      `https://api.github.com/search/commits?q=${query}&sort=author-date&order=desc&per_page=${SEARCH_RESULTS_PER_PAGE}&page=${page}`,
      {
        Accept: "application/vnd.github.cloak-preview+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    );

    const items = payload.items ?? [];
    for (const item of items) {
      const repository = item.repository;
      if (!repository || repository.private) continue;

      const key = repository.full_name.toLowerCase();
      const commitDate = item.commit?.author?.date ?? item.commit?.committer?.date ?? null;
      const previous = repositories.get(key);
      const nextActivity = commitDate ?? repository.pushed_at ?? repository.updated_at ?? null;

      if (!previous) {
        repositories.set(key, {
          ...repository,
          activity_at: nextActivity
        });
        continue;
      }

      const previousMs = Date.parse(previous.activity_at ?? previous.pushed_at ?? previous.updated_at ?? "");
      const nextMs = Date.parse(nextActivity ?? "");

      if (!Number.isNaN(nextMs) && (Number.isNaN(previousMs) || nextMs > previousMs)) {
        repositories.set(key, {
          ...previous,
          ...repository,
          activity_at: nextActivity
        });
      }
    }

    if (items.length < SEARCH_RESULTS_PER_PAGE) break;
  }

  return Array.from(repositories.values());
}

async function fetchLatestCommitSearchResult(username) {
  const query = encodeURIComponent(`author:${username} is:public`);
  const payload = await fetchJson(
    `https://api.github.com/search/commits?q=${query}&sort=author-date&order=desc&per_page=1`,
    {
      Accept: "application/vnd.github.cloak-preview+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  );

  return payload.items?.[0] ?? null;
}

async function fetchLatestActivityFromCommitSearch(username) {
  const latestCommit = await fetchLatestCommitSearchResult(username);
  if (!latestCommit?.repository?.full_name) {
    return null;
  }

  const repoName = latestCommit.repository.full_name;
  const repoUrl = latestCommit.repository.html_url ?? `https://github.com/${repoName}`;
  const commitSha = typeof latestCommit.sha === "string" && latestCommit.sha ? latestCommit.sha.slice(0, 7) : "n/a";
  const commitUrl =
    latestCommit.html_url ??
    (typeof latestCommit.sha === "string" && latestCommit.sha ? `${repoUrl}/commit/${latestCommit.sha}` : repoUrl);
  const commitMessage = latestCommit.commit?.message?.trim() || "Коммит без описания";
  const createdAt = normalizeDate(
    latestCommit.commit?.author?.date ?? latestCommit.commit?.committer?.date ?? latestCommit.repository?.pushed_at
  );

  let repoDescription = latestCommit.repository?.description ?? "";
  if (!repoDescription) {
    try {
      const repoData = await fetchRepositoryByFullName(repoName);
      repoDescription = repoData.description ?? "";
    } catch {
      repoDescription = "";
    }
  }

  return {
    createdAt,
    commitSha,
    commitUrl,
    commitMessage,
    repoName,
    repoUrl,
    projectDescription:
      repoDescription || "Описание проекта не заполнено, ориентируйся по сообщению коммита."
  };
}

async function fetchLatestActivityFromPublicEvents(username) {
  const events = await fetchJson(`https://api.github.com/users/${username}/events/public?per_page=30`);
  const pushEvent = events.find((event) => event.type === "PushEvent" && event.repo?.name);

  if (!pushEvent?.repo?.name) {
    return null;
  }

  const commits = pushEvent.payload?.commits ?? [];
  const headSha = pushEvent.payload?.head ?? commits.at(-1)?.sha ?? "";
  const headCommit = commits.find((commit) => commit.sha === headSha) ?? commits.at(-1);
  const repoName = pushEvent.repo.name;
  const repoUrl = `https://github.com/${repoName}`;
  const commitUrl = headSha ? `${repoUrl}/commit/${headSha}` : repoUrl;

  let commitMessage = headCommit?.message?.trim() ?? "";
  if (!commitMessage && headSha) {
    try {
      const commitData = await fetchJson(`https://api.github.com/repos/${repoName}/commits/${headSha}`);
      commitMessage = commitData.commit?.message?.trim() ?? "";
    } catch {
      commitMessage = "";
    }
  }

  let repoDescription = "";
  try {
    const repoData = await fetchJson(`https://api.github.com/repos/${repoName}`);
    repoDescription = repoData.description ?? "";
  } catch {
    repoDescription = "";
  }

  return {
    createdAt: normalizeDate(pushEvent.created_at),
    commitSha: headSha ? headSha.slice(0, 7) : "n/a",
    commitUrl,
    commitMessage: commitMessage || "Коммит без описания",
    repoName,
    repoUrl,
    projectDescription:
      repoDescription || "Описание проекта не заполнено, ориентируйся по сообщению коммита."
  };
}

async function fetchLatestActivity(username) {
  try {
    const searchActivity = await fetchLatestActivityFromCommitSearch(username);
    if (searchActivity) {
      return searchActivity;
    }
  } catch {
    // Fall back to the public events feed when commit search is temporarily unavailable.
  }

  return fetchLatestActivityFromPublicEvents(username);
}

async function readPreviousPayload() {
  try {
    return JSON.parse(await readFile(GENERATED_GITHUB_PATH, "utf8"));
  } catch {
    return null;
  }
}

function payloadMatchesUsername(payload, username) {
  return typeof payload?.username === "string" && payload.username.toLowerCase() === username.toLowerCase();
}

function mapStoredRepositoryToApiShape(repository) {
  return {
    full_name: repository.fullName,
    name: repository.name,
    owner: { login: repository.owner },
    html_url: repository.htmlUrl,
    description: repository.description ?? "",
    language: repository.language ?? "",
    topics: repository.topics ?? [],
    created_at: repository.startedAt ?? null,
    pushed_at: repository.pushedAt ?? null,
    updated_at: repository.updatedAt ?? null,
    activity_at: repository.activityAt ?? null,
    private: false
  };
}

async function main() {
  const siteConfig = await readSiteConfig();
  const previous = await readPreviousPayload();
  const pinnedRepositoryRefs = Array.isArray(siteConfig.pinnedRepositories)
    ? siteConfig.pinnedRepositories.map(normalizeRepositoryReference).filter(Boolean)
    : [];
  const pinnedRepositoryFullNames = new Set(
    pinnedRepositoryRefs.filter((value) => value.includes("/")).map((value) => value.toLowerCase())
  );
  const pinnedRepositoryNames = new Set(
    pinnedRepositoryRefs.map((value) => value.split("/").at(-1)?.toLowerCase()).filter(Boolean)
  );
  const previousRepositoriesMap = new Map(
    (previous?.repositories ?? []).map((repository) => [repository.fullName.toLowerCase(), repository])
  );

  try {
    const [activity, contributedRepositories, publicRepositories] = await Promise.all([
      fetchLatestActivity(siteConfig.githubUsername),
      fetchContributedRepos(siteConfig.githubUsername).catch(() => []),
      fetchPublicRepos(siteConfig.githubUsername)
    ]);

    const repositoriesMap = new Map();
    for (const repository of [...contributedRepositories, ...publicRepositories]) {
      const key = repository.full_name.toLowerCase();
      if (!repositoriesMap.has(key)) {
        repositoriesMap.set(key, repository);
        continue;
      }

      const previousRepository = repositoriesMap.get(key);
      const previousMs = Date.parse(
        previousRepository.activity_at ?? previousRepository.pushed_at ?? previousRepository.updated_at ?? ""
      );
      const nextMs = Date.parse(repository.activity_at ?? repository.pushed_at ?? repository.updated_at ?? "");

      if (!Number.isNaN(nextMs) && (Number.isNaN(previousMs) || nextMs > previousMs)) {
        repositoriesMap.set(key, { ...previousRepository, ...repository });
      }
    }

    const missingPinnedRepositories = pinnedRepositoryRefs.filter(
      (repositoryRef) => repositoryRef.includes("/") && !repositoriesMap.has(repositoryRef.toLowerCase())
    );

    if (missingPinnedRepositories.length > 0) {
      const pinnedResponses = await Promise.allSettled(
        missingPinnedRepositories.map((repositoryRef) => fetchRepositoryByFullName(repositoryRef))
      );

      pinnedResponses.forEach((result) => {
        if (result.status !== "fulfilled") return;

        const repository = result.value;
        if (!repository?.full_name || repository.private) return;
        repositoriesMap.set(repository.full_name.toLowerCase(), repository);
      });
    }

    if (previous && payloadMatchesUsername(previous, siteConfig.githubUsername)) {
      for (const repository of previous.repositories ?? []) {
        const normalizedFullName = normalizeRepositoryReference(repository.fullName)?.toLowerCase();
        const normalizedName = typeof repository.name === "string" ? repository.name.toLowerCase() : "";
        if (!normalizedFullName || repositoriesMap.has(normalizedFullName)) continue;

        const isConfiguredPinned =
          pinnedRepositoryFullNames.has(normalizedFullName) || pinnedRepositoryNames.has(normalizedName);

        if (!isConfiguredPinned) continue;
        repositoriesMap.set(normalizedFullName, mapStoredRepositoryToApiShape(repository));
      }
    }

    const repositories = Array.from(repositoriesMap.values())
      .filter((repository) => !repository.private)
      .map((repository) => {
        const previousRepository = previousRepositoriesMap.get(repository.full_name.toLowerCase());
        const startedAt = normalizeDate(
          previousRepository?.startedAt ??
          repository.created_at ??
          repository.activity_at ??
          repository.pushed_at ??
          repository.updated_at ??
          null
        );

        return {
          fullName: repository.full_name,
          name: repository.name,
          owner: repository.owner?.login ?? "",
          htmlUrl: repository.html_url,
          description: repository.description ?? "",
          language: repository.language ?? "",
          topics: repository.topics ?? [],
          startedAt,
          pushedAt: normalizeDate(repository.pushed_at),
          updatedAt: normalizeDate(repository.updated_at),
          activityAt: normalizeDate(repository.activity_at ?? repository.pushed_at ?? repository.updated_at),
          isPinned:
            pinnedRepositoryFullNames.has(repository.full_name.toLowerCase()) ||
            pinnedRepositoryNames.has(repository.name.toLowerCase())
        };
      });

    repositories.sort((left, right) => {
      const leftMs = Date.parse(left.activityAt ?? left.updatedAt ?? left.pushedAt ?? "");
      const rightMs = Date.parse(right.activityAt ?? right.updatedAt ?? right.pushedAt ?? "");
      const safeLeftMs = Number.isNaN(leftMs) ? 0 : leftMs;
      const safeRightMs = Number.isNaN(rightMs) ? 0 : rightMs;
      return safeRightMs - safeLeftMs;
    });

    await writeJsonFile(GENERATED_GITHUB_PATH, {
      generatedAt: new Date().toISOString(),
      source: "github",
      username: siteConfig.githubUsername,
      activity,
      repositories
    });

    console.log(`Generated GitHub content: ${repositories.length} repositories.`);
  } catch (error) {
    if (previous && payloadMatchesUsername(previous, siteConfig.githubUsername)) {
      console.warn("GitHub sync failed, keeping existing generated content.");
      console.warn(error instanceof Error ? error.message : String(error));
      return;
    }

    await writeJsonFile(GENERATED_GITHUB_PATH, {
      generatedAt: new Date().toISOString(),
      source: "fallback",
      username: siteConfig.githubUsername,
      activity: null,
      repositories: []
    });

    console.warn(
      previous
        ? "GitHub sync failed and the previous payload belongs to another username. Wrote empty fallback payload."
        : "GitHub sync failed and no previous payload was found. Wrote empty fallback payload."
    );
    console.warn(error instanceof Error ? error.message : String(error));
  }
}

await main();
