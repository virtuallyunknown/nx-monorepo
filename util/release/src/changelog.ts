import axios from 'axios';
import { getCommits, getParentHashFromVersionTag, createGitHubPush, gitConfig } from './index.js';
import type { Commit, CommitType } from './index.js';

type GenerateChangelogParams = {
    from: string;
    to: string;
    owner: string;
    repo: string;
    dryRun: boolean;
}

type CreateGitHubReleaseParams = {
    tag: string;
    body: string;
    commitHash: string;
    repo: string;
    owner: string
}

/**
 * @see https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#create-a-release
 */
type GitHubReleaseRequest = {
    name: string;
    tag_name: string;
    body: string;
    target_commitish: string;
}

type GitHubReleaseResponse = {
    url: string;
    assets_url: string;
    upload_url: string;
    html_url: string;
    id: number,
    created_at: string;
    published_at: string;
}

async function createGitHubRelease({ tag, body, commitHash, repo, owner }: CreateGitHubReleaseParams) {
    if (!process.env.GITHUB_TOKEN) {
        throw new Error('No "GH_TOKEN" found in environment variables.')
    };

    const payload: GitHubReleaseRequest = {
        name: `Release v${tag}`,
        tag_name: tag,
        body,
        target_commitish: commitHash
    }

    const res = await axios<GitHubReleaseResponse>({
        url: `https://api.github.com/repos/${owner}/${repo}/releases`,
        method: 'post',
        headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        },
        data: payload
    });

    console.log(`Release published: ${res.data.html_url}`);
}

async function renderChangeLogMarkdown({ from, to }: { from: string, to: string }) {
    const { commitGroups, contributors } = await getCommits({ from, to });
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

        output += `\n## ${gitConfig.commitTypes[key].title}:\n`;
        output += commits.map(commit => {
            return `- (${commit.commitHashAbbr}) ${commit.subject}`
        }).join('\n');
    }

    output += '\n## Thanks:\n'
    output += [...contributors].map(contributor => `@${contributor}`).join(', ')

    return output.trim();
}

export async function generateChangelog({ from, to, owner, repo, dryRun }: GenerateChangelogParams) {
    /**
     * The release command creates a separate release commit which
     * we want to exclude from the changelog, unless in "dryRun" mode.
     * To do so, use the caret (^) operator to go to the parent
     * (previous) commit.
     */
    const markdown = await renderChangeLogMarkdown({ from, to: dryRun ? 'HEAD' : `${to}^` });
    console.log(markdown);

    if (dryRun) {
        console.log('Skipping github push and release because dry run was set...');
        return;
    }

    await createGitHubPush();
    await createGitHubRelease({
        owner,
        repo,
        tag: to,
        commitHash: await getParentHashFromVersionTag(to),
        body: markdown
    })
}