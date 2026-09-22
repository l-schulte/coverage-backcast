import { CoverageDB, MERGE_SUITE } from './db';
import type { ColorMetric, CommitMeta, DatasetMeta, TimelinePoint } from './types';

class AppState {
  readonly db = new CoverageDB();

  commits = $state<CommitMeta[]>([]);
  timeline = $state<TimelinePoint[]>([]);
  suites = $state<string[]>([]);
  meta = $state<DatasetMeta | null>(null);

  current = $state(0);
  suite = $state<string>(MERGE_SUITE);
  metric = $state<ColorMetric>('lines');
  focusPath = $state('');
  playing = $state(false);
  speed = $state(4);
  minLines = $state(0);
  hideTests = $state(false);

  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  error = $state<string | null>(null);

  get commit(): CommitMeta | undefined {
    return this.commits[this.current];
  }

  get suiteOptions(): { value: string; label: string }[] {
    const options = this.suites.map((s) => ({ value: s, label: s }));
    if (this.suites.length > 1) {
      options.unshift({ value: MERGE_SUITE, label: 'combined (approx.)' });
    }
    return options;
  }

  async init(): Promise<void> {
    this.status = 'loading';
    try {
      this.meta = await this.db.init();
      const [commits, suites, timeline] = await Promise.all([
        this.db.commits(),
        this.db.suites(),
        this.db.timeline(),
      ]);
      this.commits = commits;
      this.suites = suites;
      this.timeline = timeline;
      this.suite = suites.length > 1 ? MERGE_SUITE : suites[0] ?? MERGE_SUITE;
      let lastWithCoverage = commits.length - 1;
      for (let i = commits.length - 1; i >= 0; i -= 1) {
        if (commits[i].status === 'ok' || commits[i].status === 'tests_failed') {
          lastWithCoverage = i;
          break;
        }
      }
      this.current = Math.max(0, lastWithCoverage);
      this.status = 'ready';
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.status = 'error';
    }
  }

  goTo(index: number): void {
    if (!this.commits.length) return;
    this.current = Math.max(0, Math.min(this.commits.length - 1, index));
    this.focusPath = '';
  }

  step(delta: number): void {
    this.goTo(this.current + delta);
  }
}

export const ui = new AppState();
