import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const read = name => {
  const path = new URL(name, import.meta.url);
  const bytes = readFileSync(path);
  const value = JSON.parse(name.endsWith('.gz') ? gunzipSync(bytes).toString() : bytes.toString());
  return value.result ?? value;
};
const stats = values => {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  const at = q => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : null;
  return { n: a.length, median: at(.5), p95: at(.95), max: a.at(-1) ?? null };
};
const baseline = read('baseline.json.gz');
const candidate = read('candidate.json.gz');
const configs = [
  ['baseline-remote', baseline.filter(r => r.host === 'remote')],
  ['baseline-local', baseline.filter(r => r.host === 'local')],
  ['candidate-local', candidate],
];
if (existsSync(new URL('html5.json.gz', import.meta.url))) configs.push(['candidate-html5', read('html5.json.gz')]);

console.log(JSON.stringify({
  encounter: configs.map(([config, runs]) => ({
    config, runs: runs.length,
    framesOver50: runs.reduce((n, r) => n + r.framesOver50, 0),
    longTasks: runs.reduce((n, r) => n + r.longTasks.length, 0),
    metrics: Object.fromEntries(['frames', 'render', 'snapshot', 'correction', 'tick', 'simulation', 'clone', 'inputAck', 'delivery']
      .map(key => [key, stats(runs.flatMap(r => r.raw[key]))])),
  })),
  keyboard: ['baseline-response.json', 'candidate-response.json'].map(name => ({
    config: name.replace('-response.json', '-local'),
    metrics: Object.fromEntries(['sendWait', 'ack', 'visible'].map(key => [key, stats(read(name).samples.map(s => s[key]))])),
  })),
}, null, 2));
