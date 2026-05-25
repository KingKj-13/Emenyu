const { spawnSync } = require('child_process');

const { validatePrismaEnvironment } = require('./validate-prisma-env');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

try {
  const envResult = validatePrismaEnvironment();
  console.log(JSON.stringify({ status: 'ok', step: 'env', warnings: envResult.warnings, summary: envResult.summary }, null, 2));

  run(npx, ['prisma', 'validate']);

  if (String(process.env.PRISMA_RUN_MIGRATIONS || '').toLowerCase() === 'true') {
    run(npx, ['prisma', 'migrate', 'deploy']);
  } else {
    console.log('Prisma migrations skipped. Set PRISMA_RUN_MIGRATIONS=true to run migrate deploy during startup.');
  }
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
