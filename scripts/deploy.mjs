import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm', ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
}

function output(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr.trim() || `${command} ${args.join(' ')} failed`);
    return result.stdout.trim();
}

try {
    const branch = output('git', ['branch', '--show-current']);
    if (!branch) throw new Error('Deploy requires a checked-out branch');
    output('git', ['remote', 'get-url', 'origin']);

    // A failed earlier deploy may already have bumped the working version.
    if (output('git', ['status', '--porcelain', '--', 'src/version.ts'])) {
        console.log('Using the version already changed in src/version.ts');
    } else {
        run('npm', ['run', 'increment-version']);
    }

    run('npm', ['run', 'build:prod']);
    run('git', ['add', '-A']);
    const version = readFileSync('src/version.ts', 'utf8').match(/VERSION = "([^"]+)"/)?.[1];
    if (!version) throw new Error('Could not read src/version.ts');
    run('git', ['commit', '-m', `Deploy ${version}`]);
    run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`]);
    run('npm', ['exec', '--', 'gh-pages', '-d', 'dist']);
} catch (error) {
    console.error(`Deploy stopped: ${error.message}`);
    process.exitCode = 1;
}
