import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  BLOG_DIR,
  DIST_DIR,
  GENERATED_GITHUB_PATH,
  PROJECTS_DIR,
  readSiteConfig,
  readMarkdownEntries
} from "./site-utils.mjs";

const verifyDist = process.argv.includes("--dist");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyMarkdownEntries() {
  const [blogEntries, projectEntries] = await Promise.all([
    readMarkdownEntries(BLOG_DIR),
    readMarkdownEntries(PROJECTS_DIR)
  ]);

  assert(blogEntries.length > 0, "Blog content is empty.");
  assert(projectEntries.length > 0, "Project content is empty.");

  for (const entry of [...blogEntries, ...projectEntries]) {
    const title = entry.attributes.title;
    const summary = entry.attributes.summary;
    assert(typeof title === "string" && title.trim().length > 0, `Missing title in ${entry.absolutePath}`);
    assert(typeof summary === "string" && summary.trim().length > 0, `Missing summary in ${entry.absolutePath}`);
  }
}

async function verifyGeneratedGithubPayload() {
  const siteConfig = await readSiteConfig();
  const payload = JSON.parse(await readFile(GENERATED_GITHUB_PATH, "utf8"));
  assert(Array.isArray(payload.repositories), "Generated GitHub payload must include repositories array.");
  assert("activity" in payload, "Generated GitHub payload must include activity key.");
  assert(typeof payload.username === "string" && payload.username.trim().length > 0, "Generated GitHub payload must include username.");
  assert(
    payload.username.toLowerCase() === siteConfig.githubUsername.toLowerCase(),
    "Generated GitHub payload username must match site config."
  );
}

async function verifyBuildOutput() {
  const [blogEntries, projectEntries] = await Promise.all([
    readMarkdownEntries(BLOG_DIR),
    readMarkdownEntries(PROJECTS_DIR)
  ]);
  const requiredFiles = [
    "index.html",
    "404.html",
    path.join("404", "index.html"),
    "CNAME",
    "sitemap.xml",
    "robots.txt",
    path.join("blog", "index.html"),
    path.join("blog", "rss.xml"),
    path.join("talks", "index.html"),
    path.join("support", "index.html"),
    path.join("projects", "index.html"),
    path.join("contact", "index.html")
  ]
    .concat(blogEntries.map((entry) => path.join("blog", entry.slug, "index.html")))
    .concat(projectEntries.map((entry) => path.join("projects", entry.slug, "index.html")));

  await Promise.all(requiredFiles.map((relativePath) => access(path.join(DIST_DIR, relativePath))));

  const htmlFiles = requiredFiles.filter((relativePath) => relativePath.endsWith(".html"));

  for (const relativePath of htmlFiles) {
    const html = await readFile(path.join(DIST_DIR, relativePath), "utf8");

    assert(!html.includes("<meta   <meta"), `Malformed meta tags found in ${relativePath}`);
    assert(!html.includes('content="website" />'), `Broken meta content leaked into body markup in ${relativePath}`);
    assert(!html.includes("https://minaledm.github.io"), `Outdated GitHub Pages URL found in ${relativePath}`);
    assert(html.includes('property="og:title"'), `Missing Open Graph title tag in ${relativePath}`);
    assert(html.includes('name="twitter:title"'), `Missing Twitter title tag in ${relativePath}`);
  }
}

async function main() {
  await verifyMarkdownEntries();
  await verifyGeneratedGithubPayload();

  if (verifyDist) {
    await verifyBuildOutput();
  }

  console.log(verifyDist ? "Site verification passed (including dist)." : "Content verification passed.");
}

await main();
