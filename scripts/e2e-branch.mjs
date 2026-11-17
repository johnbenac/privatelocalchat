// Which branch the browser suite runner builds a suite for (scripts/e2e.mjs).
// Most suites drive the dev build with the fixture site (tests/helpers/dev-site.mjs), so the runner's default is dev. A suite that builds a
// download target (TARGET=app or runkit, docs/RUN-IT.md) can never be built on dev (scripts/targets.mjs refuses it), so its default is main,
// the build people receive. A branch the caller chose with PLC_E2E_BRANCH is kept; asking for dev with a neutral suite is a contradiction
// and is refused here, before a build is attempted, with the reason.

/** Suites (file names) that build only the neutral download targets. */
export const NEUTRAL_SUITES = Object.freeze(["run-kit.e2e.mjs"]);

/** @returns {string} the branch to give the suite, or throws a message that says what to change. */
export function suiteBranch(file, env = process.env) {
  const chosen = env.PLC_E2E_BRANCH || "";
  if (NEUTRAL_SUITES.includes(file)) {
    if (chosen === "dev") throw new Error(`${file} builds the app and runkit targets, which cannot be built on dev (development tooling belongs to the site target): unset PLC_E2E_BRANCH or use another branch`);
    return chosen || "main";
  }
  return chosen || "dev";
}
