// electron-builder afterPack hook.
//
// The backend is a PyInstaller one-dir bundle dropped into the app's Resources as
// an extraResource. For notarization, every mach-O inside the app must be signed
// with the hardened runtime — but extraResources aren't reliably covered by the
// default app signing. So here we explicitly sign the frozen backend (its dylibs
// first, then the launcher) with the Developer ID identity + our entitlements,
// before electron-builder signs the surrounding .app.
//
// If no "Developer ID Application" certificate is present we skip signing, so the
// build still produces a (unsigned) artifact.
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function developerIdIdentity() {
  try {
    const out = execSync("security find-identity -v -p codesigning", { encoding: "utf8" });
    const m = out.match(/"(Developer ID Application:[^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function machOFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) machOFiles(p, acc);
    else if (/\.(dylib|so)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const identity = developerIdIdentity();
  if (!identity) {
    console.log("[afterPack] No Developer ID Application cert found — leaving the frozen backend unsigned (unsigned build).");
    return;
  }

  const appName = context.packager.appInfo.productFilename + ".app";
  const backendDir = path.join(context.appOutDir, appName, "Contents", "Resources", "inkubus-backend");
  if (!fs.existsSync(backendDir)) {
    console.warn("[afterPack] frozen backend not found at", backendDir);
    return;
  }
  const entitlements = path.join(context.packager.projectDir, "electron", "entitlements.mac.plist");
  const sign = (file, withEntitlements) => {
    const ent = withEntitlements ? `--entitlements "${entitlements}" ` : "";
    execSync(`/usr/bin/codesign --force --options runtime --timestamp ${ent}-s "${identity}" "${file}"`, { stdio: "inherit" });
  };

  console.log("[afterPack] signing frozen backend with:", identity);
  for (const lib of machOFiles(backendDir)) sign(lib, false);          // nested dylibs/.so first
  sign(path.join(backendDir, "inkubus-backend"), true);                // then the launcher
};
