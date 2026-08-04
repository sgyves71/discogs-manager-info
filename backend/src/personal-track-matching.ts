export type PersonalTrackDescriptor = {
  trackKey: string;
  title: string;
  sequenceNumber?: number;
};

function positionFromTrackKey(trackKey: string): string {
  return trackKey.split('|', 1)[0]?.trim() ?? '';
}

function subtrackStem(position: string): string | null {
  const match = /^(.*\d)([a-z])$/iu.exec(position);
  return match?.[1]?.toLocaleLowerCase() ?? null;
}

export function physicalTrackKeys(tracks: PersonalTrackDescriptor[]): Map<string, string> {
  const stems = tracks
    .map((track) => subtrackStem(positionFromTrackKey(track.trackKey)))
    .filter((stem): stem is string => Boolean(stem));
  const siblingCounts = new Map<string, number>();
  for (const stem of stems) siblingCounts.set(stem, (siblingCounts.get(stem) ?? 0) + 1);

  return new Map(tracks.map((track) => {
    const position = positionFromTrackKey(track.trackKey);
    const stem = subtrackStem(position);
    return [track.trackKey, stem && (siblingCounts.get(stem) ?? 0) > 1 ? `subtracks:${stem}` : `track:${track.trackKey}`];
  }));
}
