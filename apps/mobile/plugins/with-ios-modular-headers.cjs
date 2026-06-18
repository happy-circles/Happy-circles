const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const POD_DECLARATIONS = [
  "  pod 'GoogleUtilities', :modular_headers => true",
  "  pod 'RecaptchaInterop', :modular_headers => true",
];

function withIosModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (POD_DECLARATIONS.every((declaration) => contents.includes(declaration))) {
        return modConfig;
      }

      const insertion = `${POD_DECLARATIONS.join('\n')}\n`;
      const marker = '  use_expo_modules!';

      if (!contents.includes(marker)) {
        throw new Error(`Could not find "${marker}" in ${podfilePath}`);
      }

      contents = contents.replace(marker, `${insertion}${marker}`);
      fs.writeFileSync(podfilePath, contents);

      return modConfig;
    },
  ]);
}

module.exports = withIosModularHeaders;
