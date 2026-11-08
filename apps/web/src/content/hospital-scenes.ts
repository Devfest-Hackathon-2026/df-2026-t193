import registered from '../../../../flows/hospital-recheck.json';
import type { Flow } from '@tonari/shared';
export const asset = (name: string) => `/assets/tonari/${name}.svg`;
export const scenes: Record<string, { name: string; x?: number; y?: number }> = {
  s1: { name: 'terminal', x: 286, y: 274 },
  s2: { name: 'terminal-choices' },
  's3-internal': { name: 'terminal-internal', x: 106.5, y: 161 },
  's3-surgery': { name: 'terminal-surgery', x: 198.5, y: 161 },
  's3-orthopedics': { name: 'terminal-orthopedics', x: 290.5, y: 161 },
  s4: { name: 'terminal-choices' },
  s5: { name: 'terminal-confirm', x: 286, y: 274 },
  s6: { name: 'terminal-done' },
};
export function assertSupportedScenes(flow: Flow) {
  if (
    flow.flow_id !== 'hospital-recheck' ||
    flow.version !== '1' ||
    flow.machine_id !== 'mock-hospital-v1' ||
    flow.source !== 'mock' ||
    Object.keys(flow.steps).some((id) => !scenes[id])
  )
    throw new Error('Unsupported scene version');
  // This version's reviewed graph is pinned locally; a response cannot remove the personal-info stop.
  const graph = (steps: Flow['steps']) =>
    Object.entries(steps)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, s]) => [
        id,
        s.type,
        s.type === 'guide'
          ? s.next
          : s.type === 'choice'
            ? s.options.map((o) => [o.id, o.label, o.next])
            : s.type === 'stop'
              ? [s.reason, s.resumable, s.next]
              : null,
      ]);
  if (JSON.stringify(graph(flow.steps)) !== JSON.stringify(graph(registered.steps as Flow['steps'])))
    throw new Error('Registered graph mismatch');
  const expected: Record<string, [string, number, number]> = {
    s1: ['受付', 3, 3],
    's3-internal': ['内科', 1, 1],
    's3-surgery': ['外科', 1, 2],
    's3-orthopedics': ['整形外科', 1, 3],
    s5: ['確定', 3, 3],
  };
  for (const [id, [label, row, col]] of Object.entries(expected)) {
    const step = flow.steps[id];
    if (
      step?.type !== 'guide' ||
      step.target.label !== label ||
      step.target.row !== row ||
      step.target.col !== col
    )
      throw new Error('Scene target mismatch');
  }
}
