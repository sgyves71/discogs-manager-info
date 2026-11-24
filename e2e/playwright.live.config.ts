import { defineConfig } from '@playwright/test';
import stageConfig from './playwright.config';

export default defineConfig({
  ...stageConfig,
  testDir: './live-tests',
  globalSetup: './stage-live-preflight.ts',
  outputDir: './live-test-results',
  reporter: [['list']],
  use: { ...stageConfig.use, screenshot: 'off', trace: 'off' },
});
