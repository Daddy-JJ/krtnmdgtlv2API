'use strict';

// LiteSpeed's Node launcher loads the startup file through CommonJS require().
// Defer the ESM/TypeScript graph so top-level await inside server.ts remains
// compatible with that synchronous loader.
void import('./src/server.ts').catch((error) => {
  console.error('Passenger application startup failed.', error);
  process.exitCode = 1;
});
