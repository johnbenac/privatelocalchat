// Where the shared character package validator comes from: the NEUTRAL entry of the vendored package in vendor/authored-profiles (authored-profiles 1.1.0, Cosmogenitor),
// loaded only when a package is opened. Its ten-file import closure names no other project and no web address, so every build, including a copy made for others, ships it
// (tests/neutrality.test.mjs checks the built output; tests/presentation-build.test.mjs checks that the build ships exactly that closure).
export const loadValidator = () => import('../../vendor/authored-profiles/neutral/index.mjs');
