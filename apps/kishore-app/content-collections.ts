import { defineCollection, defineConfig } from '@content-collections/core';
import { execSync } from 'child_process';
import { z } from 'zod';

const directory = './src/routes/blog/_slug/';
const effectPosts = defineCollection({
  name: 'effectPosts',
  directory,
  include: '*/page.mdx',
  schema: z.object({
    title: z.string(),
    summary: z.string(),
  }),

  transform: async (document, context) => {
    const slug = document._meta.filePath.replace(/\/.*$/, '');

    const lastModified = await context
      .cache(document._meta.directory, async (filePath) => {
        const stdout = execSync(
          `git log -1 --format=%ai -- ${directory + '/' + filePath}`,
        );
        if (stdout) {
          return new Date(stdout.toString().trim()).toISOString();
        }
        return new Date().toISOString();
      })
      .catch(() => 'NA');
    const createdAt = await context
      .cache(document._meta.directory, async (filePath) => {
        const stdout = execSync(
          `git log --follow --format=%ai --diff-filter=A -- ${directory + '/' + filePath} | tail -1`,
        );
        if (stdout) {
          return new Date(stdout.toString().trim()).toISOString();
        }
        return new Date().toISOString();
      })
      .catch(() => 'NA');

    return {
      ...document,
      slug,
      lastModified,
      createdAt,
    };
  },
});

export default defineConfig({
  collections: [effectPosts],
});
