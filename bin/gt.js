#!/usr/bin/env node
'use strict';
const gt = require('../index');

// The CLI face of the query surface. Queries print JSON (the agent is the
// primary consumer); `report` prints the human artifact.
//
// Exit codes are contract (ruled after the foreign-corpus campaign):
//   0  answered — picture built or query answered; degraded states are
//      disclosed in the output, never fatal
//   1  failure — a refresh failed partway (picture marked broken), or an
//      unexpected error
//   2  refusal — declined with its teaching on stderr and nothing touched;
//      contract refusals and usage errors alike (a typo'd command must
//      never read as a broken picture)

const USAGE = `gherkin-trace — traceability projection for agent-authored BDD corpora

usage: gt <command> [args] [options]      (gherkin-trace is the same command)

commands:
  refresh                 project feature files, binding status, and journal
                          into the picture
  report                  emit the refresh report (markdown, stdout)
  attention               the ranked attention list
  exceptions              orphan design scenarios and unrefined UAT intent
  orphans                 orphan design scenarios only
  invariant               the reviewed-set invariant check
  heat                    discussion regions, hottest first
  dilution <title>        one scenario's full dated dilution timeline
  up <title>              what intent a scenario traces to
  down <title>            what refines a scenario
  neighborhood <title>    everything around a scenario
  mark-reviewed | edit-feature | write-journal
                          write-shaped: always refuse, exit 2, naming the owner

options:
  --help, -h              this text
  --version, -v           the installed version
  --root <dir>            project root (default: cwd)
  --features <dir>        features directory (default: <root>/features)
  --manifest <path>       run manifest (default: <root>/run-manifest.ndjson)
  --journal <path>        treecontext journal store (default: none)
  --journal-namespace <ns>  journal namespace (default: project)
  --fence <path>          out-of-scope file (default: probe
                          <features>/OUT-OF-SCOPE.md, then <root>/OUT-OF-SCOPE.md)

exit codes:
  0  answered (degraded states are disclosed, never fatal)
  1  failure (refresh failed partway and the picture is marked broken,
     or an unexpected error)
  2  refusal (declined by contract or usage error; nothing touched)
`;

async function main() {
  const argv = process.argv.slice(2);
  /** @type {Record<string, string>} */
  const opts = {};
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      // Help must never fall through to a command: `gt refresh --help` used
      // to swallow the flag as an option value and run a real refresh.
      process.stdout.write(USAGE);
      return;
    }
    if (a === '--version' || a === '-v') {
      // Same rule as --help: the flag answers on its own, never as a value.
      const { version } = /** @type {{version: string}} */ (require('../package.json'));
      process.stdout.write(`gherkin-trace ${version}\n`);
      return;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = argv[++i];
    } else {
      positional.push(a);
    }
  }
  const [command, ...args] = positional;
  /** @type {import('../src/sources').GtOptions} */
  const gtOpts = {
    root: opts.root,
    featuresDir: opts.features,
    manifest: opts.manifest,
    journal: opts.journal,
    journalNamespace: opts.journalNamespace,
    fence: opts.fence,
  };

  switch (command) {
    case 'refresh': {
      const summary = await gt.refresh(gtOpts);
      process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
      return;
    }
    case 'report':
      process.stdout.write(gt.emitReport(gtOpts));
      return;
    case 'attention':
      json(gt.queryAttention(gtOpts));
      return;
    case 'exceptions':
      json(gt.queryExceptions(gtOpts));
      return;
    case 'orphans':
      json(gt.queryOrphans(gtOpts));
      return;
    case 'invariant':
      json(gt.queryInvariant(gtOpts));
      return;
    case 'heat':
      json(gt.queryHeat(gtOpts));
      return;
    case 'dilution':
      json(gt.queryDilution(need(args[0], 'dilution <title>'), gtOpts));
      return;
    case 'up':
      json(gt.queryUp(gtOpts, need(args[0], 'up <title>')));
      return;
    case 'down':
      json(gt.queryDown(gtOpts, need(args[0], 'down <title>')));
      return;
    case 'neighborhood':
      json(gt.queryNeighborhood(gtOpts, need(args[0], 'neighborhood <title>')));
      return;
    // asked for a write: refuse naming the owner
    case 'mark-reviewed':
      gt.markReviewed();
      return;
    case 'edit-feature':
      gt.editFeature();
      return;
    case 'write-journal':
      gt.writeJournalNote();
      return;
    case undefined:
    case 'help':
    case '--help':
      process.stdout.write(USAGE);
      return;
    default:
      process.stderr.write(`unknown command: ${command}\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

/** @param {unknown} v */
function json(v) {
  process.stdout.write(JSON.stringify(v, null, 2) + '\n');
}

/** @param {string | undefined} v @param {string} usage @returns {string} */
function need(v, usage) {
  if (v === undefined) {
    process.stderr.write(`usage: gt ${usage}\n`);
    process.exit(2);
  }
  return v;
}

main().catch((e) => {
  if (e instanceof gt.GtRefusal) {
    process.stderr.write(`refused: ${e.message}\n`);
    process.exitCode = 2;
  } else if (e instanceof gt.GtRefreshFailure) {
    process.stderr.write(`failed: ${e.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
});
