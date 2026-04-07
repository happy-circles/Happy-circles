const userAgent = process.env.npm_config_user_agent ?? '';
const isPnpm = userAgent.includes('pnpm/');

if (isPnpm) {
  process.exit(0);
}

console.error('');
console.error('This monorepo uses pnpm workspaces.');
console.error('Do not run `npm install` or `npx expo` from the repo root.');
console.error('');
console.error('Use one of these commands instead:');
console.error('  pnpm install');
console.error('  pnpm dev:mobile');
console.error('  pnpm dev:mobile:clear');
console.error('');

process.exit(1);
