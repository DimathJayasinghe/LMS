import { runOwnerCli } from './owner-cli';
runOwnerCli('add').catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
