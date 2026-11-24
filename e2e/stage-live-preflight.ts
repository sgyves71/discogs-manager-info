import type { FullConfig } from '@playwright/test';
import { verifyStage } from './stage-preflight';

export default async function verifyLiveStage(config: FullConfig) {
  if (process.env.CI || process.env.E2E_STAGE_MODE !== 'live-read') {
    throw new Error('Live smoke tests require the local test:e2e:stage:live launcher.');
  }

  if (!/^\d{8,14}$/.test(process.env.STAGE_LIVE_BARCODE ?? '') ||
      !/^[1-9]\d*$/.test(process.env.STAGE_LIVE_RELEASE_ID ?? '') ||
      !Number.isSafeInteger(Number(process.env.STAGE_LIVE_RELEASE_ID))) {
    throw new Error('Set STAGE_LIVE_BARCODE and STAGE_LIVE_RELEASE_ID for a known public CD pressing.');
  }

  await verifyStage(config, 'live-read');
}
