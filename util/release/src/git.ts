import { clean } from 'semver';
import { runCommand } from './index.js';

export const gitConfig = {
    commitTypes: {
        'build': { type: 'build', title: 'Build' },
        'chore': { type: 'chore', title: 'Chores' },
        'ci': { type: 'ci', title: 'CI' },
        'docs': { type: 'docs', title: 'Documentation' },
        'feat': { type: 'feat', title: 'Features' },
        'fix': { type: 'fix', title: 'Fixes' },
        'perf': { type: 'perf', title: 'Performance' },
        'refactor': { type: 'refactor', title: 'Refactor' },
        'revert': { type: 'revert', title: 'Revert' },
        'style': { type: 'style', title: 'Styles' },
        'test': { type: 'test', title: 'Testing' }
    },
    placeholders: {
        newLine: '%n',
        commitHash: '%H',
        commitHashAbbr: '%h',
        parentHash: '%P',
        parentHashAbbr: '%p',
        authorName: '%an',
        authorEmail: '%ae',
        authorDateRel: '%ar',
        authorDateUnix: '%at',
        subject: '%s',
        body: '%b'
    },
    markers: {
        begin: '__BEGIN__',
        body: '__BODY__',
        files: '__FILES__',
        delim: '__DELIM__'
    }
}

export type CommitType = keyof typeof gitConfig['commitTypes'];

type CommitDetail = {
    type: CommitType;
    breaking: boolean;
}

export type Commit = {
    commitHashAbbr: string;
    authorName: string;
    authorDate: Date;
    subject: string;
    files: string[];
} & CommitDetail;

type CommitGroup = { [key in CommitType | 'breaking']+?: Commit[] };

/**
 * Assert commit is a valid type
 * 
 * @see https://github.com/conventional-changelog/commitlint/tree/master/%40commitlint/config-conventional
 * @see https://www.conventionalcommits.org/en/v1.0.0/
 */
function assertCommitType(type: string): asserts type is CommitType {
    if (!Object.keys(gitConfig.commitTypes).includes(type)) {
        throw new Error(`Commit type "${type}" does not match allowed types by config-conventional.`);
    }
}

/**
 * Find the latest version tag from git describe
 */
export async function getLatestVersionTag() {
    const output = await runCommand('git', ['describe', '--tags', '--abbrev=0'])

    const tag = clean(output);

    if (!tag) {
        throw new Error(`${tag} is not a valid semver`);
    }

    return tag;
}

/**
 * Get the hash to which the tag points to (not the hash of the tag itself)
 * 
 * NB: Make sure the output is trimmed, else it will return multiline string and fail
 * @see https://stackoverflow.com/a/24469132/3258251
 */
export async function getParentHashFromVersionTag(tag: string) {
    return await runCommand('git', ['rev-parse', `${tag}^{}`])
}

export async function getCommits({ from, to }: { from: string, to: string }) {
    const args = [
        '--no-pager',
        'log',
        '--name-only',
        `--pretty=format:"${getGitLogFormat()}"`,
        `${from}...${to}`
    ];

    const output = await runCommand('git', args);

    return parseCommits(output);
}

/**
 * Prepare git-log "format" placeholders.
 * @see https://git-scm.com/docs/git-log
 */
function getGitLogFormat() {
    return [
        gitConfig.markers.begin,
        [
            gitConfig.placeholders.commitHashAbbr,
            gitConfig.placeholders.authorName,
            gitConfig.placeholders.authorDateUnix,
            gitConfig.placeholders.subject,
        ].join(gitConfig.markers.delim),
        gitConfig.markers.body,
        gitConfig.placeholders.body,
        gitConfig.markers.files,
    ].join('')
}

function getCommitDetail(subject: string, body?: string): CommitDetail {
    const [, type, breakingInType] = subject.match(`^(${Object.keys(gitConfig.commitTypes).join('|')})(\\!?):`) ?? [];
    const breaking = breakingInType === '!' || (body?.toLowerCase().startsWith('breaking change:') ?? false);

    assertCommitType(type);

    return { type, breaking }
}

export async function createGitHubPush() {
    await runCommand('git', ['push', '--follow-tags']);
}

function parseCommits(output: string) {
    const contributors = new Set();
    const commitGroups = output.split(gitConfig.markers.begin).toSpliced(0, 1).reduce<CommitGroup>((acc, curr) => {
        const [, header, body, files] = curr
            .match(
                new RegExp(`(.*)${gitConfig.markers.body}([\\s\\S]+)?${gitConfig.markers.files}([\\s\\S]+)?`)
            ) ?? [];

        const [commitHashAbbr, authorName, authorDateUnix, subject] = header.split(gitConfig.markers.delim);

        const commit = {
            commitHashAbbr,
            authorName,
            authorDate: new Date(parseInt(authorDateUnix) * 1000),
            subject,
            files: files.split('\n').filter(Boolean),
            ...getCommitDetail(subject, body)
        }

        contributors.add(authorName);

        if (commit.breaking) {
            acc.breaking = [...acc.breaking ?? [], commit];
            return acc;
        }

        acc[commit.type] = acc[commit.type]
            ? [...acc[commit.type] ?? [], commit]
            : [commit]

        return acc;
    }, {});

    return {
        commitGroups,
        contributors: contributors
    }
}

