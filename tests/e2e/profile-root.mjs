// Where a browser suite that needs a persistent profile keeps it. PLC_E2E_PROFILE_ROOT names a folder (on this box: a dedicated one on /media/Vivarium); unset, the operating
// system's temporary folder is used, so the suites run anywhere. Every call makes a new, empty folder inside the root; nothing outside it is touched or cleared.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function newProfileDir(name) {
  const root = process.env.PLC_E2E_PROFILE_ROOT || join(tmpdir(), 'plc-e2e-profiles');
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, name + '-'));
}
