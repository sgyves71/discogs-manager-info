import { useState } from 'react';
import type { CatalogDetailsForm, CdEntry, DiscogsReleaseTrack, PersonalTrackMatch, SavedYouTubeTrackMatch, YouTubePlayer, YouTubeVideoMatch } from '../types';

export type EBayActiveListingStats = { listingCount: number; sampledListingCount: number; lowestPrice: number | null; averagePrice: number | null; highestPrice: number | null; currency: string | null; searchMethod: 'catalogNumber' | 'artistTitle' };
export type DiscogsMarketStats = { lastSoldAt: string | null; low: number | null; median: number | null; high: number | null; currency: string | null };
export type DiscogsReleaseContext = { description: string | null; descriptionSource: 'release' | 'album' | 'artist' | null; artistProfile: string | null; genre: string | null; style: string | null };
export type MusicBrainzCatalogContext = { artist: { id: string; name: string; type: string | null; country: string | null; disambiguation: string | null; beginDate: string | null; endDate: string | null; ended: boolean | null; annotation: string | null; genres: string[] } | null; releaseGroup: { id: string; title: string; primaryType: string | null; firstReleaseDate: string | null; annotation: string | null; genres: string[] } | null };
export type DiscogsReleaseImage = { url: string; thumbnailUrl: string };
export type LocalAudioPlayerState = { trackId: number; catalogEntryId: number; title: string; subtitle: string };
export type PersonalArtistFolder = { folderPath: string; name: string; trackCount: number };
export type PersonalBrowsableAlbumFolder = { folderPath: string; name: string; album: string; trackCount: number };

export function useCatalogDetailController() {
  const [viewedEntry, setViewedEntry] = useState<CdEntry | null>(null);
  const [detailCoverImage, setDetailCoverImage] = useState<string | null>(null);
  const [detailContext, setDetailContext] = useState<DiscogsReleaseContext | null>(null);
  const [detailMusicBrainzContext, setDetailMusicBrainzContext] = useState<MusicBrainzCatalogContext | null>(null);
  const [detailEbayStats, setDetailEbayStats] = useState<EBayActiveListingStats | null>(null);
  const [detailStatus, setDetailStatus] = useState('');
  const [editingEstimatedValue, setEditingEstimatedValue] = useState(false);
  const [editingCatalogDetails, setEditingCatalogDetails] = useState(false);
  const [catalogDetailsForm, setCatalogDetailsForm] = useState<CatalogDetailsForm | null>(null);
  const [catalogDetailsStatus, setCatalogDetailsStatus] = useState('');
  const [estimatedValueInput, setEstimatedValueInput] = useState('');
  const [estimatedValueStatus, setEstimatedValueStatus] = useState('');
  const [detailImages, setDetailImages] = useState<DiscogsReleaseImage[]>([]);
  const [detailImagesStatus, setDetailImagesStatus] = useState('');
  const [showDetailImages, setShowDetailImages] = useState(false);
  const [detailTracks, setDetailTracks] = useState<DiscogsReleaseTrack[]>([]);
  const [detailTracksStatus, setDetailTracksStatus] = useState('');
  const [showTracklist, setShowTracklist] = useState(false);
  const [detailActionMenuOpen, setDetailActionMenuOpen] = useState(false);
  const [youTubeStatus, setYouTubeStatus] = useState('');
  const [youTubeCandidates, setYouTubeCandidates] = useState<{ track: DiscogsReleaseTrack; videos: YouTubeVideoMatch[] } | null>(null);
  const [savedYouTubeMatches, setSavedYouTubeMatches] = useState<SavedYouTubeTrackMatch[]>([]);
  const [youTubePlayer, setYouTubePlayer] = useState<YouTubePlayer | null>(null);
  const [personalTrackMatches, setPersonalTrackMatches] = useState<PersonalTrackMatch[]>([]);
  const [personalMusicStatus, setPersonalMusicStatus] = useState('');
  const [personalLocationSyncing, setPersonalLocationSyncing] = useState(false);
  const [localAudioPlayer, setLocalAudioPlayer] = useState<LocalAudioPlayerState | null>(null);
  const [personalArtistFolders, setPersonalArtistFolders] = useState<PersonalArtistFolder[] | null>(null);
  const [personalBrowsableAlbumFolders, setPersonalBrowsableAlbumFolders] = useState<PersonalBrowsableAlbumFolder[] | null>(null);
  const [showPersonalFolderMapping, setShowPersonalFolderMapping] = useState(false);
  const [selectedPersonalArtistFolderPath, setSelectedPersonalArtistFolderPath] = useState('');
  const [selectedPersonalAlbumFolderPath, setSelectedPersonalAlbumFolderPath] = useState('');
  const [personalAlbumValidation, setPersonalAlbumValidation] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [personalTrackNotFoundPrompt, setPersonalTrackNotFoundPrompt] = useState<DiscogsReleaseTrack | null>(null);
  const [personalAlbumMappingStatus, setPersonalAlbumMappingStatus] = useState('');
  return { viewedEntry,setViewedEntry,detailCoverImage,setDetailCoverImage,detailContext,setDetailContext,detailMusicBrainzContext,setDetailMusicBrainzContext,detailEbayStats,setDetailEbayStats,detailStatus,setDetailStatus,editingEstimatedValue,setEditingEstimatedValue,editingCatalogDetails,setEditingCatalogDetails,catalogDetailsForm,setCatalogDetailsForm,catalogDetailsStatus,setCatalogDetailsStatus,estimatedValueInput,setEstimatedValueInput,estimatedValueStatus,setEstimatedValueStatus,detailImages,setDetailImages,detailImagesStatus,setDetailImagesStatus,showDetailImages,setShowDetailImages,detailTracks,setDetailTracks,detailTracksStatus,setDetailTracksStatus,showTracklist,setShowTracklist,detailActionMenuOpen,setDetailActionMenuOpen,youTubeStatus,setYouTubeStatus,youTubeCandidates,setYouTubeCandidates,savedYouTubeMatches,setSavedYouTubeMatches,youTubePlayer,setYouTubePlayer,personalTrackMatches,setPersonalTrackMatches,personalMusicStatus,setPersonalMusicStatus,personalLocationSyncing,setPersonalLocationSyncing,localAudioPlayer,setLocalAudioPlayer,personalArtistFolders,setPersonalArtistFolders,personalBrowsableAlbumFolders,setPersonalBrowsableAlbumFolders,showPersonalFolderMapping,setShowPersonalFolderMapping,selectedPersonalArtistFolderPath,setSelectedPersonalArtistFolderPath,selectedPersonalAlbumFolderPath,setSelectedPersonalAlbumFolderPath,personalAlbumValidation,setPersonalAlbumValidation,personalTrackNotFoundPrompt,setPersonalTrackNotFoundPrompt,personalAlbumMappingStatus,setPersonalAlbumMappingStatus };
}

export type CatalogDetailController = ReturnType<typeof useCatalogDetailController>;
