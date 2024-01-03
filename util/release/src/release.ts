import { releasePublish, releaseVersion } from 'nx/release';
import { generateChangelog, getLatestVersionTag, runPrompt } from './index.js';

const currentVersion = await getLatestVersionTag();
const { version: newVersion, dryRun, verbose } = await runPrompt(currentVersion);

await releaseVersion({
    dryRun: dryRun,
    specifier: newVersion,
    verbose: verbose,
    gitCommit: true,
    gitCommitMessage: 'chore: release v{version}',
    gitTag: true,
    stageChanges: true,
});

await generateChangelog({
    dryRun: dryRun,
    repo: 'nx-monorepo',
    owner: 'virtuallyunknown',
    from: currentVersion,
    to: newVersion,
});

await releasePublish({
    dryRun: dryRun,
    maxParallel: 1,
    verbose: true,

    /** Uncomment when publishing to local registry (verdaccio) */
    registry: 'http://localhost:4873'
});

process.exit(0);