<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ProjectEntryRow from "../components/ProjectEntryRow.vue";
import { getProjects, type ContentEntry } from "../lib/content";
import { usePageMeta } from "../lib/meta";
import { getProjectYearSections } from "../lib/projectCatalog";
import { getStaticPageMeta } from "../lib/site";

usePageMeta(getStaticPageMeta("projects"));

const caseStudies = ref<ContentEntry[]>([]);
const isLoadingCaseStudies = ref(true);
const yearSections = getProjectYearSections();
const hasCaseStudies = computed(() => caseStudies.value.length > 0);

onMounted(async () => {
  const projects = await getProjects();
  caseStudies.value = projects.filter((project) => project.source === "local");
  isLoadingCaseStudies.value = false;
});
</script>

<template>
  <section class="page-header reveal projects-catalog-hero">
    <div class="projects-catalog-copy">
      <p class="eyebrow">Projects</p>
      <h1 class="page-title">Проекты, кейсы и живая карта GitHub</h1>
      <p class="page-lead">
        Сначала оформленные кейсы с отдельными страницами, ниже публичные репозитории,
        сгруппированные по году старта и активности.
      </p>
    </div>
  </section>

  <section class="list-section reveal">
    <h2 class="section-title">Оформленные кейсы</h2>
    <p class="home-status">
      Здесь собраны проекты, для которых уже есть отдельные страницы с описанием, summary и ссылками.
    </p>

    <p v-if="isLoadingCaseStudies" class="gh-muted">Загружаю кейсы...</p>
    <p v-else-if="!hasCaseStudies" class="gh-muted">Пока нет оформленных кейсов.</p>

    <div v-else class="entry-list">
      <ProjectEntryRow
        v-for="project in caseStudies"
        :key="project.slug"
        :project="project"
        :show-logo="true"
      />
    </div>
  </section>

  <section class="list-section reveal">
    <h2 class="section-title">Живая карта GitHub</h2>
    <p class="home-status">
      Публичные репозитории и активные проекты, сгруппированные по времени старта и текущей активности.
    </p>
  </section>

  <section
    v-for="section in yearSections"
    :key="section.year"
    class="reveal projects-year-section"
    :aria-labelledby="section.anchorId"
  >
    <header class="projects-year-head">
      <p class="project-section-kicker">Year</p>
      <h2 :id="section.anchorId" class="projects-year-title">{{ section.year }}</h2>
      <p class="projects-year-summary">{{ section.projects.length }} проектов в этом разделе.</p>
    </header>

    <div class="projects-card-grid">
      <article
        v-for="project in section.projects"
        :key="project.id"
        class="project-catalog-card"
      >
        <div class="project-catalog-meta">
          <p class="project-catalog-repo">{{ project.repository }}</p>
          <span v-if="project.isPinned" class="project-catalog-badge">Pinned</span>
        </div>

        <h3 class="project-catalog-title">
          <a :href="project.href" target="_blank" rel="noreferrer noopener" class="project-catalog-link">
            <span class="project-catalog-title-row">
              <span
                :class="[
                  'project-catalog-icon-shell',
                  project.icon.type === 'image'
                    ? 'project-catalog-icon-shell-image'
                    : 'project-catalog-icon-shell-monogram'
                ]"
              >
                <img
                  v-if="project.icon.type === 'image'"
                  :src="project.icon.src"
                  :alt="project.icon.alt"
                  class="project-catalog-icon project-catalog-icon-image"
                  loading="lazy"
                  decoding="async"
                />
                <span
                  v-else
                  class="project-catalog-icon project-catalog-icon-monogram"
                  aria-hidden="true"
                >
                  {{ project.icon.text }}
                </span>
              </span>
              <span>{{ project.title }}</span>
            </span>
          </a>
        </h3>

        <p class="project-catalog-summary">{{ project.summary }}</p>

        <div class="project-catalog-footer">
          <p class="project-catalog-timeline">
            <span>Started {{ project.startedLabel }}</span>
            <span class="project-catalog-divider">/</span>
            <span>Active {{ project.updatedLabel }}</span>
          </p>
          <p v-if="project.tags.length" class="project-catalog-tags">{{ project.tags.join(" · ") }}</p>
        </div>
      </article>
    </div>
  </section>
</template>
