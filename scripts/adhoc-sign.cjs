// A build without a signing identity (CI has none) used to leave the Electron binaries with their own signatures but
// a bundle whose seal does not match its Info.plist: `codesign --verify` fails ("code has no resources but signature
// indicates they must be present"). With the quarantine mark a browser puts on a download, macOS then refuses to open
// the app without offering "Open Anyway". An ad-hoc signature over the whole bundle makes it consistent, and macOS
// treats it as an app from an unidentified developer, which the release notes describe how to open.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function verifies(appPath) {
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // A real identity has signed the app already; do not replace its signature.
  if (verifies(appPath)) return;
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], { stdio: 'inherit' });
  if (!verifies(appPath)) throw new Error(`The ad-hoc signature of ${appPath} does not verify`);
};
