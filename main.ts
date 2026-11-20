// Vice Cover Studio — entrypoint (Node 22, standard library only).
//
// Hands the entry in: copies app/ and screenshots/ from this repository
// into the output directory and writes dossier.json with buildDossier
// from the kit's vendored library. Run it as:
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { buildDossier } from './vendor/makefun-app.ts';
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var REPO_ROOT = dirname(fileURLToPath(import.meta.url));
var OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

var DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648
};

// Copy a directory tree, plain files only. Symbolic links are refused:
// the dossier refuses them too, so fail here with a clear message.
function copyTree(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  var entries = readdirSync(srcDir, { withFileTypes: true });
  var count = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var src = join(srcDir, entry.name);
    var dest = join(destDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('Refusing to copy symbolic link: ' + src);
    }
    if (entry.isDirectory()) {
      count += copyTree(src, dest);
    } else if (entry.isFile()) {
      copyFileSync(src, dest);
      count += 1;
    }
  }
  return count;
}

function main() {
  var appDir = join(REPO_ROOT, 'app');
  var shotsDir = join(REPO_ROOT, 'screenshots');
  if (!statSync(appDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('Missing app/ directory next to main.ts: ' + appDir);
  }
  if (!statSync(shotsDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('Missing screenshots/ directory next to main.ts: ' + shotsDir);
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  var appFiles = copyTree(appDir, join(OUTPUT_DIR, 'app'));
  var shotFiles = copyTree(shotsDir, join(OUTPUT_DIR, 'screenshots'));
  if (appFiles < 1) {
    throw new Error('Nothing copied from app/: the entry would be empty.');
  }
  // The bounty wants 3 or 4 screenshots; the dossier refuses fewer than
  // 1 and more than 4, so catch a wrong count here with a plain message.
  if (shotFiles < 3 || shotFiles > 4) {
    throw new Error('Expected 3 or 4 screenshots, found ' + shotFiles + ' files in screenshots/.');
  }
  var dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
  return { appFiles: appFiles, shotFiles: shotFiles, dossierBytes: dossier.length };
}

main();
