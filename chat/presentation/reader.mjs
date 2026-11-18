// Where the shared character package validator comes from (board T444, T705): the vendored package in vendor/authored-profiles, loaded only when a package is opened.
// This is the version for our own deployment. scripts/build.mjs replaces this file with `export const loadValidator = null;` in a copy made for others, because that copy must carry
// nothing of ours (tests/neutrality.test.mjs) and the validator names other projects and hosts; the page shows the "Preview character package" button only when this is a function.
export const loadValidator = () => import('../../vendor/authored-profiles/authored-profiles/index.mjs');
