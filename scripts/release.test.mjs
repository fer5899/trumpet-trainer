// Unit tests for scripts/release.mjs, run with `npm run test:scripts` (node:test, no Vitest).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bumpVersion,
  parseBump,
  parseVersion,
  releaseNotes,
  setPackageVersion,
  tagChangelog,
  unreleasedSection,
} from './release.mjs';

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Added
- New thing.

## [0.1.0] - Released on 2026-10-01 by Someone

### Added
- Old thing.
`;

describe('parseVersion', () => {
  for (const [input, expected] of [
    ['0.0.0', '0.0.0'],
    ['1.2.3\n', '1.2.3'],
    ['0.0.0-SNAPSHOT-create-mvp', '0.0.0'],
    ['1.0.1-SNAPSHOT-feature/with-slash\r\n', '1.0.1'],
  ]) {
    it(`reads ${JSON.stringify(input)} as ${expected}`, () => {
      assert.equal(parseVersion(input).join('.'), expected);
    });
  }

  for (const input of ['', '1.2', 'v1.2.3', '1.2.3-beta', '01.2.3x']) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      assert.throws(() => parseVersion(input), /version\.txt/);
    });
  }
});

describe('parseBump', () => {
  for (const type of ['patch', 'minor', 'major']) {
    it(`accepts ${type}`, () => assert.equal(parseBump(`${type}\n`), type));
  }
  for (const input of ['', 'Minor', 'feature', 'patch minor']) {
    it(`rejects ${JSON.stringify(input)}`, () => assert.throws(() => parseBump(input), /bump\.txt/));
  }
});

describe('bumpVersion', () => {
  for (const [base, type, expected] of [
    [[0, 0, 0], 'patch', '0.0.1'],
    [[0, 0, 0], 'minor', '0.1.0'],
    [[1, 2, 3], 'patch', '1.2.4'],
    [[1, 2, 3], 'minor', '1.3.0'],
    [[1, 2, 3], 'major', '2.0.0'],
  ]) {
    it(`${base.join('.')} + ${type} = ${expected}`, () => {
      assert.equal(bumpVersion(base, type), expected);
    });
  }
});

describe('unreleasedSection', () => {
  it('returns the content up to the next release heading', () => {
    assert.equal(unreleasedSection(CHANGELOG), '### Added\n- New thing.');
  });
  it('returns the content up to the end of the file', () => {
    assert.equal(unreleasedSection('# C\n\n## [Unreleased]\n\n### Fixed\n- Bug.\n'), '### Fixed\n- Bug.');
  });
  it('returns an empty string for an empty section', () => {
    assert.equal(unreleasedSection('# C\n\n## [Unreleased]\n\n## [0.1.0] - x\n'), '');
  });
  it('returns null without an Unreleased heading', () => {
    assert.equal(unreleasedSection('# C\n\n## [0.1.0] - x\n'), null);
  });
  it('handles CRLF line endings', () => {
    assert.equal(unreleasedSection(CHANGELOG.replace(/\n/g, '\r\n')), '### Added\n- New thing.');
  });
});

describe('tagChangelog', () => {
  it('turns Unreleased into the release and adds an empty Unreleased above it', () => {
    const tagged = tagChangelog(CHANGELOG, '0.2.0', '2026-10-03', 'Fer');
    assert.match(
      tagged,
      /## \[Unreleased\]\n\n## \[0\.2\.0\] - Released on 2026-10-03 by Fer\n\n### Added\n- New thing\.\n\n## \[0\.1\.0\]/,
    );
    assert.equal(unreleasedSection(tagged), '');
  });
  it('throws without an Unreleased heading', () => {
    assert.throws(() => tagChangelog('# C\n', '1.0.0', '2026-10-03', 'Fer'), /Unreleased/);
  });
});

describe('releaseNotes', () => {
  it('returns the body of the given release', () => {
    assert.equal(releaseNotes(CHANGELOG, '0.1.0'), '### Added\n- Old thing.');
  });
  it('returns null for an unknown release', () => {
    assert.equal(releaseNotes(CHANGELOG, '9.9.9'), null);
  });
});

describe('setPackageVersion', () => {
  it('updates package.json and keeps the formatting', () => {
    const input = '{\n  "name": "x",\n  "version": "0.0.0",\n  "private": true\n}\n';
    assert.equal(setPackageVersion(input, '0.1.0'), input.replace('0.0.0', '0.1.0'));
  });
  it('updates both versions in package-lock.json', () => {
    const lock = JSON.stringify(
      { name: 'x', version: '0.0.0', packages: { '': { name: 'x', version: '0.0.0' }, 'node_modules/a': { version: '1.0.0' } } },
      null,
      2,
    );
    const updated = JSON.parse(setPackageVersion(lock, '0.1.0'));
    assert.equal(updated.version, '0.1.0');
    assert.equal(updated.packages[''].version, '0.1.0');
    assert.equal(updated.packages['node_modules/a'].version, '1.0.0');
  });
});
