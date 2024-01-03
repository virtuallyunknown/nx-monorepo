import { execSync } from 'node:child_process';
import { inc, clean } from 'semver';
import Enquirer from "enquirer";
import { releasePublish, releaseVersion } from 'nx/src/command-line/release/index.js';
import { releaseChangelog } from './changelog.old.js';

const { prompt } = Enquirer;

function git() {
    function getLatestVersion() {
        const currentVersion = clean(execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }));

        if (!currentVersion) {
            throw new Error('Unable to retrieve current version from git tags.');
        }

        return currentVersion;
    }

    /**
     * Get the hash to which the tag points to (not the hash of the tag itself)
     * 
     * NB: Trim the output, else it will return multiline string
     * @see https://stackoverflow.com/a/24469132/3258251
     */
    function getCommitHashFromTag(tag: string) {
        return execSync(`git rev-parse ${tag}^{}`, { encoding: 'utf-8' }).trim();
    }

    return {
        getLatestVersion,
        getCommitHashFromTag
    }
}

const versions = {
    current: git().getLatestVersion(),
    new: 'HEAD'
}

const bumpedVersions = (['patch', 'minor', 'major'] as const)
    .map(type => ({ type: type, bump: inc(versions.current, type) }));

const options = await prompt([
    {
        name: 'version',
        type: 'select',
        message: 'What kind of change is this for your packages?',
        choices: bumpedVersions.map(ver => {
            if (!ver.bump) {
                throw new Error(`Unable to create bump for ${ver.type}.`);
            }
            return {
                name: ver.bump,
                message: `${ver.type}: (${ver.bump})`
            }
        })
    },
    {
        name: 'publish',
        type: 'confirm',
        initial: true,
        required: true,
        message: 'Do you want to publish this release?'
    },
    {
        name: 'dryRun',
        type: 'confirm',
        initial: true,
        required: true,
        message: 'Do you want to dry run these commands?'
    },
]) as { version: string, dryRun: boolean, publish: boolean };

const { projectsVersionData, workspaceVersion } = await releaseVersion({
    dryRun: options.dryRun,
    specifier: options.version,
    verbose: true,
    gitCommit: true,
    gitCommitMessage: 'chore: release v{version}',
    gitTag: true,
    stageChanges: true,
});

if (!options.dryRun) {
    versions.new = git().getCommitHashFromTag(options.version)
}

// import { execCommand } from "nx/src/command-line/release/utils/exec-command";

// async function wait() {
//     try {
//         const versionsCurrent = (await execCommand('git', ['rev-parse', versions.current])).trim();
//         const versionsNew = (await execCommand('git', ['rev-parse', versions.new])).trim();

//         console.log('versionsCurrent:', versionsCurrent);
//         console.log('versionsNew    :', versionsNew);

//         return new Promise(res => setTimeout(() => {
//             res(true);
//         }, 10000000))
//     } catch (error) {
//         console.error(error);
//     }

// }

// await wait();

/**
 * The value for releaseChangelog needs to point to a commit hash.
 * You can't pass a tag name as version, because it will behind the
 * scenes it will resolve the hash of the tag itself, and after that
 * it will call the GitHub API with a `target_commitish` value of
 * the tag hash itself rather than the commit hash.
 * 
 * The GitHub API will return an unhelpful and misleading error 500
 * and fail.
 * 
 * @see https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#create-a-release
 */
await releaseChangelog({
    dryRun: options.dryRun,
    verbose: true,
    version: workspaceVersion,
    gitTag: false,
    gitCommit: false,
    from: versions.current,
    to: versions.new,
});

// await releasePublish({
//     dryRun: options.dryRun,
//     maxParallel: 1,
//     verbose: true,
//     registry: 'http://localhost:4873'
// });

process.exit(0);