import { request, type FullConfig } from '@playwright/test';

export default function verifyMockStage(config: FullConfig) {
  return verifyStage(config, 'mock');
}

export async function verifyStage(config: FullConfig, mode: 'mock' | 'live-read') {
  if (process.env.E2E_STAGE !== 'true') {
    throw new Error('Browser and API tests require verified Stage. Use npm run test:e2e:stage.');
  }

  const api = process.env.E2E_API_URL;
  const app = config.projects[0]?.use.baseURL;
  if (api !== 'http://127.0.0.1:3101' ||
      (app !== 'http://127.0.0.1:5174' && app !== 'https://127.0.0.1:5174')) {
    throw new Error('Stage tests require the loopback Stage API and frontend. Use npm run test:e2e:stage.');
  }

  const context = await request.newContext({ ignoreHTTPSErrors: true, timeout: 5000 });
  try {
    const identities = await Promise.all([api, app].map(async (origin) => {
      const response = await context.get(`${origin}/api/stage/identity`, { maxRedirects: 0 });
      if (response.status() !== 200) throw new Error('Stage identity is unavailable.');
      const identity = await response.json();
      if (identity.environment !== 'stage' || identity.fixture !== 'synthetic-catalog-v1' ||
          typeof identity.instance !== 'string' || !identity.instance) {
        throw new Error('Stage identity did not confirm the synthetic catalog.');
      }
      if (identity.discogsMode !== mode) {
        throw new Error(mode === 'mock'
          ? 'Stage tests require mocked Discogs. Stop Stage and use npm run stage:dev.'
          : 'Live smoke tests require live-read Stage. Stop Stage and use npm run stage:live-read.');
      }
      return identity.instance;
    }));
    if (identities[0] !== identities[1]) throw new Error('The Stage frontend proxies to a different API instance.');
  } finally {
    await context.dispose();
  }
}
