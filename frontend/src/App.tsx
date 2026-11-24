import { useEffect, useState } from 'react';
import { DiscogsManagerApplication } from './DiscogsManagerApplication';

export default function App() {
  const [discogsMode, setDiscogsMode] = useState<'mock' | 'live-read'>();
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const response = await fetch('/api/stage/identity', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) return;
      const identity = await response.json();
      if (identity.environment === 'stage' && (identity.discogsMode === 'mock' || identity.discogsMode === 'live-read')) {
        setDiscogsMode(identity.discogsMode);
      }
    })().catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <>
      {discogsMode && (
        <p className="stage-mode">
          {discogsMode === 'live-read' ? 'Stage - Live Discogs search and release metadata' : 'Stage - Mocked Discogs'}
        </p>
      )}
      <DiscogsManagerApplication />
    </>
  );
}
