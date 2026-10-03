// Release versioning used by .github/workflows/ci.yml. Node built-ins only.
//
//   node scripts/release.mjs validate        PR check: version.txt, bump.txt and a non-empty
//                                            `## [Unreleased]` section in CHANGELOG.md
//   node scripts/release.mjs release         On the deploy branch: version.txt (SNAPSHOT suffix
//                                            stripped) + bump.txt -> X.Y.Z. Writes version.txt,
//                                            package.json, package-lock.json, tags CHANGELOG.md,
//                                            deletes bump.txt and prints the new version.
//                                            Env: RELEASE_AUTHOR, RELEASE_DATE (default: today UTC).
//   node scripts/release.mjs notes <X.Y.Z>   Prints that release's CHANGELOG.md section.
//
// version.txt is `X.Y.Z` on the deploy branch and `X.Y.Z-SNAPSHOT-<branch>` on feature branches.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUMP_TYPES = ['patch', 'minor', 'major'];
const UNRELEASED_HEADING = '## [Unreleased]';

const normalize = (text) => text.replace(/\r\n/g, '\n');

/** `X.Y.Z` or `X.Y.Z-SNAPSHOT-<anything>` -> [X, Y, Z]. */
export function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-SNAPSHOT-.+)?$/.exec(text.trim());
  if (!match) throw new Error(`version.txt must be X.Y.Z or X.Y.Z-SNAPSHOT-<branch>, got ${JSON.stringify(text.trim())}`);
  return match.slice(1, 4).map(Number);
}

export function parseBump(text) {
  const type = text.trim();
  if (!BUMP_TYPES.includes(type)) {
    throw new Error(`bump.txt must contain one of ${BUMP_TYPES.join(', ')}, got ${JSON.stringify(type)}`);
  }
  return type;
}

export function bumpVersion([major, minor, patch], type) {
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Trimmed body of the section starting at `heading` (a full line), or null if absent. */
function sectionBody(changelog, headingPrefix) {
  const lines = normalize(changelog).split('\n');
  const start = lines.findIndex((line) => line.startsWith(headingPrefix));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## ['));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

export function unreleasedSection(changelog) {
  return sectionBody(changelog, UNRELEASED_HEADING);
}

export function releaseNotes(changelog, version) {
  return sectionBody(changelog, `## [${version}]`);
}

/** Renames `## [Unreleased]` to the release heading and adds a fresh empty one above it. */
export function tagChangelog(changelog, version, date, author) {
  const text = normalize(changelog);
  if (!text.includes(`${UNRELEASED_HEADING}\n`) && !text.endsWith(UNRELEASED_HEADING)) {
    throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  }
  return text.replace(
    UNRELEASED_HEADING,
    `${UNRELEASED_HEADING}\n\n## [${version}] - Released on ${date} by ${author}`,
  );
}

/** Sets `version` (and the root package entry of a lockfile) keeping 2-space JSON formatting. */
export function setPackageVersion(jsonText, version) {
  const data = JSON.parse(jsonText);
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
}

function main([command, arg]) {
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const path = (name) => join(root, name);
  const read = (name) => readFileSync(path(name), 'utf8');

  if (command === 'validate') {
    const errors = [];
    const check = (fn) => {
      try {
        fn();
      } catch (error) {
        errors.push(error.message);
      }
    };
    check(() => parseVersion(read('version.txt')));
    check(() => parseBump(existsSync(path('bump.txt')) ? read('bump.txt') : ''));
    check(() => {
      const section = existsSync(path('CHANGELOG.md')) ? unreleasedSection(read('CHANGELOG.md')) : null;
      if (!section) throw new Error('CHANGELOG.md needs entries under "## [Unreleased]"');
    });
    if (errors.length > 0) throw new Error(errors.join('\n'));
    console.log('Release metadata OK');
    return;
  }

  if (command === 'release') {
    const version = bumpVersion(parseVersion(read('version.txt')), parseBump(read('bump.txt')));
    const date = process.env.RELEASE_DATE || new Date().toISOString().slice(0, 10);
    const author = process.env.RELEASE_AUTHOR || 'CI';
    writeFileSync(path('version.txt'), `${version}\n`);
    for (const file of ['package.json', 'package-lock.json']) {
      writeFileSync(path(file), setPackageVersion(read(file), version));
    }
    writeFileSync(path('CHANGELOG.md'), tagChangelog(read('CHANGELOG.md'), version, date, author));
    rmSync(path('bump.txt'));
    console.log(version);
    return;
  }

  if (command === 'notes' && arg) {
    const notes = releaseNotes(read('CHANGELOG.md'), arg);
    if (notes === null) throw new Error(`CHANGELOG.md has no "## [${arg}]" section`);
    console.log(notes);
    return;
  }

  throw new Error('Usage: node scripts/release.mjs validate | release | notes <X.Y.Z>');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
