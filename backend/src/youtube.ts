import axios from 'axios';

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

type YouTubeSearchResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
  }>;
};

type YouTubeVideosResponse = {
  items?: Array<{
    id?: string;
    contentDetails?: { duration?: string };
  }>;
};

export type YouTubeVideoMatch = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  watchUrl: string;
  embedUrl: string;
  durationSeconds: number | null;
  score: number;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseIsoDuration(duration: string | undefined): number | null {
  const match = duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3_600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function isCandidateMatch(videoTitle: string, artist: string, track: string): boolean {
  const normalizedVideoTitle = normalize(videoTitle);
  const normalizedArtist = normalize(artist);
  const normalizedTrack = normalize(track);
  return Boolean(normalizedArtist && normalizedTrack)
    && normalizedVideoTitle.includes(normalizedArtist)
    && normalizedVideoTitle.includes(normalizedTrack);
}

function scoreMatch(videoTitle: string, description: string, artist: string, album: string, track: string, trackDurationSeconds: number | null, videoDurationSeconds: number | null): number {
  const normalizedVideoTitle = normalize(videoTitle);
  const normalizedDescription = normalize(description);
  const phrases = [artist, album, track].map(normalize).filter(Boolean);
  const phraseScore = phrases.reduce((score, phrase, index) => (
    score + (normalizedVideoTitle.includes(phrase) ? [8, 2, 12][index] : normalizedDescription.includes(phrase) ? 1 : 0)
  ), 0);
  const bonus = /\b(?:official|topic|audio|provided to youtube)\b/i.test(videoTitle) ? 3 : 0;
  const penalty = /\b(?:full album|full album stream|playlist|cover|karaoke|reaction)\b/i.test(videoTitle) ? 30
    : /\b(?:live|remix|slowed|nightcore)\b/i.test(videoTitle) ? 7 : 0;
  const durationScore = trackDurationSeconds != null && videoDurationSeconds != null
    ? Math.abs(trackDurationSeconds - videoDurationSeconds) <= 8 ? 8
      : Math.abs(trackDurationSeconds - videoDurationSeconds) <= 20 ? 3
        : Math.abs(trackDurationSeconds - videoDurationSeconds) > 60 ? -12 : 0
    : 0;
  return phraseScore + bonus + durationScore - penalty;
}

export async function findYouTubeMatches(
  artist: string,
  album: string,
  track: string,
  trackDurationSeconds: number | null,
  apiKey: string,
): Promise<YouTubeVideoMatch[]> {
  const query = [artist, album, track].filter(Boolean).join(' ');
  const response = await axios.get<YouTubeSearchResponse>(YOUTUBE_SEARCH_URL, {
    params: {
      key: apiKey,
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: 15,
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
    },
    timeout: 8_000,
  });

  const searchCandidates = (response.data.items ?? []).flatMap((item) => {
    const videoId = item.id?.videoId?.trim();
    const snippet = item.snippet;
    const title = snippet?.title?.trim();
    if (!videoId || !title || !snippet) return [];
    return [{
      videoId,
      title,
      channelTitle: snippet.channelTitle?.trim() || null,
      thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
      description: snippet.description?.trim() || '',
    }];
  }).filter((candidate) => isCandidateMatch(candidate.title, artist, track));
  if (!searchCandidates.length) return [];

  const detailResponse = await axios.get<YouTubeVideosResponse>(YOUTUBE_VIDEOS_URL, {
    params: { key: apiKey, part: 'contentDetails', id: searchCandidates.map((candidate) => candidate.videoId).join(',') },
    timeout: 8_000,
  });
  const durations = new Map((detailResponse.data.items ?? []).map((item) => [item.id, parseIsoDuration(item.contentDetails?.duration)]));
  return searchCandidates
    .map((candidate) => {
      const durationSeconds = durations.get(candidate.videoId) ?? null;
      return {
        videoId: candidate.videoId,
        title: candidate.title,
        channelTitle: candidate.channelTitle,
        thumbnailUrl: candidate.thumbnailUrl,
        watchUrl: `https://www.youtube.com/watch?v=${candidate.videoId}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${candidate.videoId}?autoplay=1&rel=0`,
        durationSeconds,
        score: scoreMatch(candidate.title, candidate.description, artist, album, track, trackDurationSeconds, durationSeconds),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}
