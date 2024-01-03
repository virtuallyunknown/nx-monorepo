import { inc } from 'semver';
import Enquirer from "enquirer";

export async function runPrompt(currentVersion: string) {
    const bumpedVersions = (['patch', 'minor', 'major'] as const)
        .map(type => ({ type: type, bump: inc(currentVersion, type) }));

    return await Enquirer.prompt<{ version: string, dryRun: boolean, verbose: boolean }>([
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
            name: 'verbose',
            type: 'confirm',
            initial: true,
            required: true,
            message: 'Do you want to enable verbose output?'
        },
        {
            name: 'dryRun',
            type: 'confirm',
            initial: true,
            required: true,
            message: 'Do you want to dry run these commands?'
        },
    ]);
}