// The release: semantic-release decides the version from the commits, scripts/release-hooks.mjs packs the assets and writes the Upgrading notes (docs/RELEASING.md).
module.exports = {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/exec', {
      // The Upgrading section is appended to the notes. Standard output is the notes, so the script says nothing else there.
      generateNotesCmd: 'node scripts/release-hooks.mjs notes --version ${nextRelease.version} --commit ${nextRelease.gitHead} --last-tag ${lastRelease.gitTag}',
      // Two zips, compat.json and SHA256SUMS into release-assets/. A zip that fails the zip test or carries something of ours stops the release before anything is published.
      prepareCmd: 'node scripts/release-hooks.mjs prepare --version ${nextRelease.version} --commit ${nextRelease.gitHead} --out release-assets',
    }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    ['@semantic-release/github', {
      assets: [
        { path: 'release-assets/*.zip' },
        { path: 'release-assets/compat.json' },
        { path: 'release-assets/SHA256SUMS' },
      ],
    }],
  ],
};
