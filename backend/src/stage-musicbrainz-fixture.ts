import type { MusicBrainzSearchCriteria, MusicBrainzSearchResults } from './musicbrainz.js';

export function searchStageMusicBrainz(criteria: MusicBrainzSearchCriteria): MusicBrainzSearchResults {
  const artist = criteria.artist?.trim().toLocaleLowerCase() || '';
  const album = criteria.album?.trim().toLocaleLowerCase() || '';
  const recognized = [artist, album].some((value) => value.includes('stage mock') || value.includes('mocked cd'));
  if (!recognized) return { artists: [], releaseGroups: [] };

  return {
    artists: artist ? [{
      id: '59ba3b22-7b0f-4db5-b81b-a51e4bd4d431', name: 'Stage Mock Artist', sortName: 'Mock Artist, Stage',
      disambiguation: 'Synthetic artist used for automated testing', type: 'Group', country: 'US', score: 100,
      beginDate: '1988', endDate: null, ended: false,
    }] : [],
    releaseGroups: album ? [{
      id: '72de5f3a-a2bd-43da-a9d0-e2c7e9d556ea', title: 'Mocked CD Album', primaryType: 'Album', secondaryTypes: [],
      firstReleaseDate: '1988-01-01', score: 100, releaseCount: 2,
      artistCredits: [{ id: '59ba3b22-7b0f-4db5-b81b-a51e4bd4d431', name: 'Stage Mock Artist', joinPhrase: null }],
    }] : [],
  };
}
