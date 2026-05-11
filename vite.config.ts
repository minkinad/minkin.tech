import siteConfig from "./src/content/site-config.json";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const getBasePath = (baseUrl: string): string => {
  const pathname = new URL(baseUrl).pathname || "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
};

export default defineConfig({
  plugins: [vue()],
  base: getBasePath(siteConfig.baseUrl)
});
