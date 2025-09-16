module.exports = {
  bumpDeps: false,
  tag: 'latest',
  generateChangelog: true,
  changedFilesPath: 'change',
  changeDir: 'change',
  changelogDir: '.',

  // Configure for PR-based releases instead of direct pushes
  publish: false,
  push: false,

  // Allow deleted change files (they get removed during bump)
  disallowDeletedChangeFiles: false,

  // Git configuration
  gitTags: true,
  access: 'public',

  // Repository info
  repository: {
    url: 'https://github.com/altinokdarici/exportmapify.git',
    directory: '.'
  }
};