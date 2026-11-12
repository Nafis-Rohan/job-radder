import weWorkRemotely from './weworkremotely.js';
import remotive from './remotive.js';
import careerPage from './careerPage.js';

// Every collector has the same shape: { name, enabled, collect() -> NormalizedJob[] }.
// Adding a site = one new file + one line here.
const ALL_COLLECTORS = [weWorkRemotely, remotive, careerPage];

export function getCollectors() {
  return ALL_COLLECTORS.filter((collector) => collector.enabled);
}
