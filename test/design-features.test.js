'use strict';
const { runFeatures } = require('gherkin-node-test');

// The design tier: implementation-vocabulary contracts (one file so far —
// the pane-blob v1 conformance surface). Separate runFeatures call because
// gnt discovers flat, one call per test file. No manifest on this call yet:
// gt's join reads one manifest, and splitting it is a decision for when
// these bind.
runFeatures('features/design', {
  'sidecar-blob': require('./steps/design-sidecar-blob.steps'),
}, {
  wip: [],
});
