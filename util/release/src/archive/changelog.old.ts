import { clean } from 'semver';
import { execSync } from 'node:child_process';

type CommitType = keyof typeof commitTypes;

type CommitDetail = {
    type: CommitType;
    breaking: boolean;
}

type Commit = {
    commitHashAbbr: string;
    authorName: string;
    authorDate: Date;
    subject: string;
    files: string[];
} & CommitDetail;

type CommitGroup = { [key in CommitType | 'breaking']+?: Commit[] };

type Markers = {
    begin: string;
    body: string;
    files: string;
    delim: string;
}

type Placeholders = {
    newLine: string;
    commitHash: string;
    commitHashAbbr: string;
    parentHash: string;
    parentHashAbbr: string;
    authorName: string;
    authorEmail: string;
    authorDateRel: string;
    authorDateUnix: string;
    subject: string;
    body: string;
}

const commitTypes = {
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
} as const;

/**
 * Generate a changelog from git-logs.
 * 
 * Resources:
 * @see https://github.com/conventional-changelog/commitlint/tree/master/%40commitlint/config-conventional
 * @see https://www.conventionalcommits.org/en/v1.0.0/
 * @see https://git-scm.com/docs/git-log
 */
class ReleaseChangelog {
    private markers: Markers;
    private placeholders: Placeholders;

    constructor() {
        this.markers = {
            begin: '__BEGIN__',
            body: '__BODY__',
            files: '__FILES__',
            delim: '__DELIM__'
        }

        /**
         * Full list of git log placeholders:
         * @see https://git-scm.com/docs/pretty-formats
         */
        this.placeholders = {
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
        }
    }

    private prepareGitFormat() {
        return [
            this.markers.begin,
            [
                this.placeholders.commitHashAbbr,
                this.placeholders.authorName,
                this.placeholders.authorDateUnix,
                this.placeholders.subject,
            ].join(this.markers.delim),
            this.markers.body,
            this.placeholders.body,
            this.markers.files,
        ].join('')
    }

    private assertCommitType(type: string): asserts type is CommitType {
        if (!Object.keys(commitTypes).includes(type)) {
            throw new Error(`Commit type "${type}" does not match allowed types by config-conventional.`);
        }
    }

    private getCommitDetail(subject: string, body?: string): CommitDetail {
        const [, type, breakingInType] = subject.match(`^(${Object.keys(commitTypes).join('|')})(\\!?):`) ?? [];
        const breaking = breakingInType === '!' || (body?.toLowerCase().startsWith('breaking change:') ?? false);

        this.assertCommitType(type);

        return { type, breaking }
    }

    private parseCommits(output: string) {
        const contributors = new Set<string>();
        const commitGroups = output.split(this.markers.begin).toSpliced(0, 1).reduce<CommitGroup>((acc, curr) => {
            const [, header, body, files] = curr
                .match(
                    new RegExp(`(.*)${this.markers.body}([\\s\\S]+)?${this.markers.files}([\\s\\S]+)?`)
                ) ?? [];

            const [commitHashAbbr, authorName, authorDateUnix, subject] = header.split(this.markers.delim);

            const commit = {
                commitHashAbbr,
                authorName,
                authorDate: new Date(parseInt(authorDateUnix) * 1000),
                subject,
                files: files.split('\n').filter(Boolean),
                ...this.getCommitDetail(subject, body)
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

    private getLatestVersionTag() {
        const tag = clean(execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }));

        if (!tag) {
            throw new Error(`${tag} is not a valid semver`);
        }

        return tag;
    }

    private getCommits({ from, to }: { from?: string, to?: string }) {
        /**
         * Use the caret (^) operator to go to the parent (previous)
         * commit if "to" is not undefined. The goal is that we exclude
         * the commit itself from the range, since the last commit is
         * just "chore: release v..." and we don't want that in the
         * changelog.
         * 
         * The "from" value should be the latest version, unless we
         * manually provide another version for the purposes of
         * debugging.
        */
        const fromRef = from ? from : this.getLatestVersionTag();
        const toRef = to ? `${to}^` : 'HEAD';
        const cmd = `git --no-pager log --name-only --pretty=format:"${this.prepareGitFormat()}" ${fromRef}...${toRef}`;
        const output = execSync(cmd, { encoding: 'utf-8' });

        return this.parseCommits(output);
    }

    public renderToMarkdown({ from, to }: { from?: string, to?: string }) {
        const { commitGroups, contributors } = this.getCommits({ from, to });
        let output = '';

        if (Array.isArray(commitGroups.breaking) && commitGroups.breaking.length > 0) {
            output += '## Breaking Changes:\n';
            output += commitGroups.breaking.map(commit => {
                return `- (${commit.commitHashAbbr}) ${commit.subject}`
            }).join('\n');
        }

        for (const [key, commits] of Object.entries(commitGroups) as [[CommitType | 'breaking', Commit[]]]) {
            if (key === 'breaking' || commits.length < 1) {
                continue;
            }

            output += `\n## ${commitTypes[key].title}:\n`;
            output += commits.map(commit => {
                return `- (${commit.commitHashAbbr}) ${commit.subject}`
            }).join('\n');
        }

        output += '\n## Thanks:\n'
        output += [...contributors].map(contributor => `@${contributor}`).join(', ')

        return output.trim();
    }
}

export const releaseChangelog = new ReleaseChangelog();
// const res = releaseChangelog.renderToMarkdown({});

// console.log(res);