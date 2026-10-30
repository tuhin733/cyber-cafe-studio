const { author, build, version } = require("./package.json");

module.exports = {
  ...build,
  extraResources: [
    {
      from: "electron/scan-document.ps1",
      to: "scanner/scan-document.ps1",
    },
  ],
  extraMetadata: {
    ...build.extraMetadata,
    description: `${build.productName} v${version} | Developer: ${author}`,
  },
};
