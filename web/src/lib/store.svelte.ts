import { CoverageDB, MERGE_SUITE, fetchProjects, projectBase } from './db';
import type { ColorMetric, CommitMeta, DatasetMeta, ProjectInfo, TimelinePoint } from './types';

const HASH_KEY = 'project';

function readHashProject(): string | null {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return null;
  return new URLSearchParams(raw).get(HASH_KEY);
}

function writeHashProject(id: string): void {
  const params = new URLSearchParams();
  if (id) params.set(HASH_KEY, id);
  const hash = params.toString();
  const { pathname, search } = window.location;
  history.replaceState(null, '', `${pathname}${search}${hash ? `#${hash}` : ''}`);
}

class AppState {
  db = new CoverageDB();

  commits = $state<CommitMeta[]>([]);
  timeline = $state<TimelinePoint[]>([]);
  suites = $state<string[]>([]);
  meta = $state<DatasetMeta | null>(null);
  projects = $state<ProjectInfo[]>([]);
  projectId = $state<string>('');

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

  get project(): ProjectInfo | undefined {
    return this.projects.find((p) => p.id === this.projectId);
  }

  get suiteOptions(): { value: string; label: string }[] {
    const options = this.suites.map((s) => ({ value: s, label: s }));
    if (this.suites.length > 1) {
      options.unshift({ value: MERGE_SUITE, label: 'combined (approx.)' });
    }
    return options;
  }

  async init(projectId?: string): Promise<void> {
    this.status = 'loading';
    try {
      if (!this.projects.length) this.projects = await fetchProjects();
      const requested = projectId ?? readHashProject() ?? '';
      const project = this.projects.find((p) => p.id === requested) ?? this.projects[0];
      await this.load(project);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.status = 'error';
    }
  }

  async switchProject(id: string): Promise<void> {
    if (id === this.projectId) return;
    const project = this.projects.find((p) => p.id === id);
    if (!project) return;
    writeHashProject(project.id);
    try {
      await this.load(project);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.status = 'error';
    }
  }

  private async load(project: ProjectInfo): Promise<void> {
    this.status = 'loading';
    this.db.destroy();
    this.db = new CoverageDB(projectBase(project.id));
    this.projectId = project.id;
    this.commits = [];
    this.timeline = [];
    this.suites = [];
    this.meta = null;
    this.current = 0;
    this.focusPath = '';
    this.playing = false;
    this.error = null;

    const meta = await this.db.init();
    const [commits, suites, timeline] = await Promise.all([
      this.db.commits(),
      this.db.suites(),
      this.db.timeline(),
    ]);
    this.meta = meta;
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
