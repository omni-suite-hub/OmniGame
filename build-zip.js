/**
 * build-zip.js
 * Generates a clean production release ZIP package for Chrome Web Store.
 * Excludes git, docs, markdown, test deliverables, and development artifacts.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const outZip = path.join(__dirname, `omnigame-v${manifest.version}.zip`);

console.log(`Packaging OmniGame v${manifest.version}...`);

try {
  if (fs.existsSync(outZip)) {
    fs.unlinkSync(outZip);
  }

  // Create clean zip excluding non-extension files
  execSync(`zip -q -r "${outZip}" . -x ".*" "docs/*" "deliverables/*" "*.md" "build-zip.js" "*.zip" "floatwin.js"`, {
    cwd: __dirname
  });

  const stat = fs.statSync(outZip);
  console.log(`\x1b[32m✔ Package created successfully!\x1b[0m`);
  console.log(`File: ${outZip}`);
  console.log(`Size: ${(stat.size / 1024).toFixed(1)} KB (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

  // Sync to Desktop
  const os = require('os');
  const desktopPath = path.join(os.homedir(), 'Desktop');
  if (fs.existsSync(desktopPath)) {
    const desktopZip = path.join(desktopPath, `omnigame-v${manifest.version}.zip`);
    fs.copyFileSync(outZip, desktopZip);
    console.log(`\x1b[32m✔ Synced zip to Desktop:\x1b[0m ${desktopZip}`);

    const desktopFolder = path.join(desktopPath, 'OmniGame');
    execSync(`rsync -av --delete --exclude='.*' --exclude='node_modules' --exclude='build-zip.js' --exclude='*.zip' --exclude='docs' --exclude='deliverables' ./ "${desktopFolder}/"`, {
      cwd: __dirname
    });
    console.log(`\x1b[32m✔ Synced unpacked extension to Desktop folder:\x1b[0m ${desktopFolder}`);
  }
} catch (err) {
  console.error('\x1b[31mFailed to build zip package:\x1b[0m', err.message);
  process.exit(1);
}
