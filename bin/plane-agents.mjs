#!/usr/bin/env node

import { run } from "../lib/setup.mjs";

run(process.argv.slice(2)).catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
