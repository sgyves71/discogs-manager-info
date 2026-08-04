export type CatalogStatisticsEntry = {
  style: string | null;
  year: number | null;
};

export type CatalogStatistics = {
  totalEntries: number;
  discogsMedian: { count: number; total: number };
  estimatedValue: { count: number; total: number };
  styles: Array<{ style: string; count: number; percentage: number }>;
  decades: Array<{ decade: string; count: number; percentage: number }>;
};

export type CatalogStatisticsRepository = {
  countEntries(): Promise<number>;
  aggregateDiscogsMedian(): Promise<{ count: number; total: number }>;
  aggregateEstimatedValue(): Promise<{ count: number; total: number }>;
  findStatisticsEntries(): Promise<CatalogStatisticsEntry[]>;
};

export class CatalogStatisticsService {
  constructor(private readonly repository: CatalogStatisticsRepository) {}

  async getStatistics(): Promise<CatalogStatistics> {
    const [totalEntries, discogsMedian, estimatedValue, entries] = await Promise.all([
      this.repository.countEntries(),
      this.repository.aggregateDiscogsMedian(),
      this.repository.aggregateEstimatedValue(),
      this.repository.findStatisticsEntries(),
    ]);

    return {
      totalEntries,
      discogsMedian,
      estimatedValue,
      styles: this.buildStyleDistribution(entries, totalEntries),
      decades: this.buildDecadeDistribution(entries, totalEntries),
    };
  }

  private buildStyleDistribution(entries: CatalogStatisticsEntry[], totalEntries: number) {
    const styleCounts = new Map<string, number>();
    for (const entry of entries) {
      const styles = entry.style?.split(',').map((style) => style.trim()).filter(Boolean) ?? [];
      for (const style of styles.length ? styles : ['Uncategorized']) {
        styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
      }
    }
    return [...styleCounts.entries()]
      .map(([style, count]) => ({ style, count, percentage: totalEntries ? (count / totalEntries) * 100 : 0 }))
      .sort((left, right) => right.count - left.count || left.style.localeCompare(right.style));
  }

  private buildDecadeDistribution(entries: CatalogStatisticsEntry[], totalEntries: number) {
    const decadeCounts = new Map<string, number>();
    for (const entry of entries) {
      const decade = entry.year && entry.year >= 1000 && entry.year <= 9999
        ? `${Math.floor(entry.year / 10) * 10}s`
        : 'Unknown Year';
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
    }
    return [...decadeCounts.entries()]
      .map(([decade, count]) => ({
        decade,
        count,
        percentage: totalEntries ? (count / totalEntries) * 100 : 0,
        sortYear: decade === 'Unknown Year' ? Number.POSITIVE_INFINITY : Number.parseInt(decade, 10),
      }))
      .sort((left, right) => left.sortYear - right.sortYear)
      .map(({ sortYear: _sortYear, ...decade }) => decade);
  }
}
