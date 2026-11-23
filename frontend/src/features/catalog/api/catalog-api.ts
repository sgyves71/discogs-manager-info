import type { CatalogDetailsForm, CatalogStatistics, CdEntry } from '../../../types';
import { jsonRequest } from '../../../api/http';

type CatalogSaveBody = {
  title: string;
  artist: string;
  year: number | null;
  country: string | null;
  label: string | null;
  format: string | null;
  discogsId: number | null;
  discogsUri: string | null;
  catalogNumber: string | null;
  barcode: string | null;
  mediaCondition: string | null;
  estimatedValueOverride: number | null;
  notes: string;
};

export const catalogApi = {
  list: (params: URLSearchParams): Promise<{ items?: CdEntry[]; total?: number }> =>
    fetch(`/api/cds?${params}`).then((response) => response.json()),
  styles: (): Promise<{ styles?: string[] }> =>
    fetch('/api/catalog/styles').then((response) => response.ok ? response.json() : { styles: [] }),
  statistics: (): Promise<CatalogStatistics> =>
    fetch('/api/catalog/statistics').then((response) => response.json()),
  save: (payload: CatalogSaveBody, id?: number) =>
    fetch(id === undefined ? '/api/cds' : `/api/cds/${id}`, jsonRequest(id === undefined ? 'POST' : 'PATCH', payload)),
  remove: (id: number) => fetch(`/api/cds/${id}`, { method: 'DELETE' }),
  updateValue: (id: number, estimatedValue: number | null) =>
    fetch(`/api/cds/${id}/estimated-value`, jsonRequest('PATCH', { estimatedValue })),
  updateDetails: (id: number, details: Omit<CatalogDetailsForm, 'year'> & { year: number | null }) =>
    fetch(`/api/cds/${id}/details`, jsonRequest('PATCH', details)),
};
