// Backward-compatible ESM bridge. LiteSpeed deployments must register
// passenger.cjs, whose CommonJS boundary is compatible with lsnode require().
void import('./src/server.ts').catch((error) => {
  console.error('Application startup failed.', error);
  process.exitCode = 1;
});
