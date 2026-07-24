import { runSnapshotCommand } from './snapshot-command.js';

const usage = `Usage:
  std-toolkit snapshot
  std-toolkit snapshot -u

Options:
  -u, --update  Write the current contract as the approved snapshot
  -h, --help    Show this help`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(usage);
    return 0;
  }
  if (args[0] !== 'snapshot') {
    console.error(usage);
    return 2;
  }
  const options = args.slice(1);
  if (options.some((value) => !['-u', '--update'].includes(value))) {
    console.error(`Unknown option: ${options.join(' ')}\n\n${usage}`);
    return 2;
  }
  return runSnapshotCommand({
    cwd: process.cwd(),
    update: options.includes('-u') || options.includes('--update'),
    write: console.log,
  });
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
