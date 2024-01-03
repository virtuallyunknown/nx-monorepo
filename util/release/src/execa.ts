import { $ } from 'execa';

export async function runCommand(command: string, args: string[]) {
    const { stdout } = await $({
        encoding: 'utf8',
        verbose: false,
        stripFinalNewline: true,
    })`${command} ${args}`;

    return stdout;
}