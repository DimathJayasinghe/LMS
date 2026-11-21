import { runOwnerCli } from './owner-cli';
runOwnerCli('reset').catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
