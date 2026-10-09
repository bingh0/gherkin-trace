'use strict';
const { runFeatures } = require('gherkin-node-test');

// The contract suite: gt's own UAT-tier feature files, run through gnt with
// the run manifest committed at the repo root — the same artifact gt joins
// against in host projects, dogfooded from the first commit. Paths are
// relative (cwd = repo root under `npm test`) so the committed manifest's
// rows are repo-relative, the identity gt's join expects.
runFeatures('features', {
  'answering-scripts': require('./steps/answering-scripts.steps'),
  'building-the-picture': require('./steps/building-the-picture.steps'),
  'collapsing-corpus-conditions': require('./steps/collapsing-corpus-conditions.steps'),
  'surviving-renames': require('./steps/surviving-renames.steps'),
  'review-provenance': require('./steps/review-provenance.steps'),
  'conversation-heat': require('./steps/conversation-heat.steps'),
  'respecting-the-fence': require('./steps/respecting-the-fence.steps'),
  'tracing-intent': require('./steps/tracing-intent.steps'),
  'routing-attention': require('./steps/routing-attention.steps'),
  'reporting-to-the-human': require('./steps/reporting-to-the-human.steps'),
  'sidecar-blob': require('./steps/sidecar-blob.steps'),
  'dilution': require('./steps/dilution.steps'),
}, {
  wip: [],
  manifest: 'run-manifest.ndjson',
});
