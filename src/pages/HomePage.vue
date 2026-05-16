<script setup lang="ts">
import { RouterLink } from "vue-router";
import GithubActivityWidget from "../components/GithubActivityWidget.vue";
import { getGithubActivity, getGithubDataStatus, getHomePageContent } from "../lib/content";
import { usePageMeta } from "../lib/meta";
import { GITHUB_AVATAR_URL, getStaticPageMeta } from "../lib/site";

const home = getHomePageContent();
const activity = getGithubActivity();
const githubStatus = getGithubDataStatus();
const offerCards = [
  {
    title: "Backend и API",
    text: "Проектирую серверную логику, REST API, интеграции и сервисы, которые удобно сопровождать."
  },
  {
    title: "Архитектура и надёжность",
    text: "Помогаю выстроить структуру проекта, снизить хрупкость кода и сделать backend предсказуемым для команды."
  },
  {
    title: "Автоматизация и данные",
    text: "Собираю очереди, фоновые процессы, обработку данных и понятные технические материалы вокруг решений."
  }
];

const workSignals = [
  "Нужен аккуратный backend без ощущения временного решения",
  "Команде важно качество кода, API и данных, а не только скорость релиза",
  "Хочется собрать сервис, интеграцию или внутренний инструмент",
  "Нужен человек, который может думать про архитектуру, доменную логику и поддержку проекта"
];

usePageMeta({
  ...getStaticPageMeta("home"),
  description: home.lead,
  path: "/"
});
</script>

<template>
  <section class="page-header reveal home-hero">
    <p class="eyebrow">{{ home.eyebrow }}</p>
    <div class="home-title-row">
      <img
        class="home-title-avatar"
        :src="GITHUB_AVATAR_URL"
        :alt="`${home.title} GitHub avatar`"
        width="56"
        height="56"
        decoding="async"
      />
      <h1 class="page-title">{{ home.title }}</h1>
    </div>
    <p class="page-lead">{{ home.lead }}</p>
    <p class="home-line">{{ home.subtitle }}</p>

    <div v-if="home.stackGroups.length" class="stack-lines" aria-label="Affiliations">
      <div v-for="group in home.stackGroups" :key="group.title" class="stack-line">
        <span class="stack-title">{{ group.title }}</span>
        <div class="stack-items">
          <template v-for="(item, index) in group.items" :key="`${group.title}-${item.name}`">
            <component
              :is="item.href ? 'a' : 'span'"
              class="stack-chip"
              :href="item.href"
              :target="item.href ? '_blank' : undefined"
              :rel="item.href ? 'noreferrer noopener' : undefined"
            >
              <img
                v-if="item.logoSrc"
                :src="item.logoSrc"
                :alt="item.logoAlt ?? `${item.name} logo`"
                class="stack-chip-logo"
                width="16"
                height="16"
                loading="lazy"
                decoding="async"
              />
              {{ item.name }}
            </component>
            <span v-if="group.separator && index < group.items.length - 1" class="stack-separator">
              {{ group.separator }}
            </span>
          </template>
        </div>
      </div>
    </div>

    <article v-if="home.html" class="markdown-body home-copy" v-html="home.html" />
  </section>

  <hr class="divider reveal" />

  <section class="reveal home-support">
    <h2 class="section-title">Чем могу помочь</h2>
    <div class="support-card-grid home-offer-grid">
      <article v-for="card in offerCards" :key="card.title" class="support-card home-offer-card">
        <h3 class="support-card-title">{{ card.title }}</h3>
        <p class="home-status">{{ card.text }}</p>
      </article>
    </div>

    <article class="support-panel">
      <h3 class="support-panel-title">Когда точно полезно написать?</h3>
      <ul class="support-checklist">
        <li v-for="signal in workSignals" :key="signal">{{ signal }}</li>
      </ul>
    </article>
  </section>

  <hr class="divider reveal" />

  <GithubActivityWidget :activity="activity" :status="githubStatus" />

  <hr class="divider reveal" />

  <section class="reveal home-support">
    <h2 class="section-title">{{ home.supportTitle }}</h2>
    <p class="home-status">{{ home.supportText }}</p>
    <div class="action-row">
      <RouterLink class="text-button" to="/projects">Посмотреть проекты</RouterLink>
      <RouterLink class="text-button" to="/contact">Связаться</RouterLink>
      <RouterLink class="text-button" to="/support">Поддержать автора</RouterLink>
    </div>
  </section>
</template>
