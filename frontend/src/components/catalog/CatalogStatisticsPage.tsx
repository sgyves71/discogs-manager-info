import type { CatalogStatistics } from '../../types';

type CatalogStatisticsPageProps = {
  statistics: CatalogStatistics | null;
  status: string;
  formatPrice: (value: number | null | undefined, currency: string | null | undefined) => string;
  onSelectStyle: (style: string) => void;
};

const CHART_COLORS = ['#56a6d2', '#b875dd', '#e89550', '#56c49a', '#e6637d', '#d9bf53', '#7c9ee8', '#d775b7', '#78b4a2', '#d47b53'];

export function CatalogStatisticsPage({ statistics, status, formatPrice, onSelectStyle }: CatalogStatisticsPageProps) {
  return <>
    <h1>Catalog Statistics</h1>
    <p>Collection totals based on the market values currently stored in your local catalog.</p>
    <details className="card catalog-statistics-section">
      <summary>Collection Value Overview</summary>
      <div className="catalog-statistics-section-content">
        <div className="catalog-statistics-grid">
          <section className="card catalog-statistic-card"><span>Catalog Entries</span><strong>{statistics ? statistics.totalEntries.toLocaleString() : '—'}</strong></section>
          <section className="card catalog-statistic-card"><span>Discogs Median Total</span><strong>{statistics ? formatPrice(statistics.discogsMedian.total, 'USD') : '—'}</strong><small>{statistics ? `${statistics.discogsMedian.count.toLocaleString()} releases with a known Discogs median` : 'Loading…'}</small></section>
          <section className="card catalog-statistic-card"><span>Estimated Value Total</span><strong>{statistics ? formatPrice(statistics.estimatedValue.total, 'USD') : '—'}</strong><small>{statistics ? `${statistics.estimatedValue.count.toLocaleString()} releases with an estimated value` : 'Loading…'}</small></section>
        </div>
      </div>
    </details>
    <details className="card catalog-statistics-section">
      <summary>Style Distribution</summary>
      <div className="catalog-statistics-section-content">
        <p className="hint">Each style shows the share of catalog CDs carrying that tag. Multi-style releases appear in every applicable style, so percentages may total more than 100%.</p>
        {statistics ? <DistributionList entries={statistics.styles.map((style) => ({ name: style.style, ...style }))} onSelect={onSelectStyle} /> : <p className="hint">Loading style distribution…</p>}
      </div>
    </details>
    <details className="card catalog-statistics-section">
      <summary>Decade Distribution</summary>
      <div className="catalog-statistics-section-content">
        <p className="hint">Each catalog entry is counted once using its Discogs release year. Entries without a known year are grouped separately.</p>
        {statistics ? <DistributionList entries={statistics.decades.map((decade) => ({ name: decade.decade, ...decade }))} /> : <p className="hint">Loading decade distribution…</p>}
      </div>
    </details>
    {status ? <p className="hint">{status}</p> : null}
  </>;
}

type DistributionEntry = { name: string; count: number; percentage: number };

function DistributionList({ entries, onSelect }: { entries: DistributionEntry[]; onSelect?: (name: string) => void }) {
  return <div className="style-distribution-content">
    <ul className="style-distribution-list">
      {entries.map((entry, index) => <li key={entry.name}>
        {onSelect
          ? <button type="button" className="style-distribution-entry" onClick={() => onSelect(entry.name)} aria-label={`View ${entry.name} catalog entries`}><DistributionBar entry={entry} index={index} /></button>
          : <div className="style-distribution-entry"><DistributionBar entry={entry} index={index} /></div>}
      </li>)}
    </ul>
  </div>;
}

function DistributionBar({ entry, index }: { entry: DistributionEntry; index: number }) {
  const color = CHART_COLORS[index % CHART_COLORS.length];
  return <><div className="style-distribution-label"><span className="genre-legend-swatch" style={{ backgroundColor: color }} aria-hidden="true" /><strong>{entry.name}</strong><span>{entry.percentage.toFixed(1)}% · {entry.count.toLocaleString()} CDs</span></div><div className="style-distribution-bar-track"><span className="style-distribution-bar" style={{ width: `${entry.percentage}%`, backgroundColor: color }} /></div></>;
}
