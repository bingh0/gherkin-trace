'use strict';
const { GtRefusal } = require('./errors');

// gherkin-trace is a read-only consumer of its three sources — permanently.
// These entry points exist so a caller asking for a write is refused with
// the owner named, instead of discovering an absence.

/** @returns {never} */
function editFeature() {
  throw new GtRefusal(
    'gherkin-trace never edits feature files — feature edits belong to the normal BDD flow.');
}

/** @returns {never} */
function writeJournalNote() {
  throw new GtRefusal(
    'gherkin-trace never writes the journal — journal writes belong to treecontext.');
}

/** @returns {never} */
function markReviewed() {
  throw new GtRefusal(
    'review status is mined from ruling evidence and never set by hand — '
    + 'a ruling in the journal is what marks a scenario reviewed.');
}

module.exports = { editFeature, writeJournalNote, markReviewed };
