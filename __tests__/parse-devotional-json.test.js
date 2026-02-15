const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  normalizeHashValue,
  writeFileIfChanged,
  saveHashIfChanged,
  shouldForceRebuildForHash,
  buildProcessingPlan,
  readLocalHash,
  resolveLocalHashPaths
} = require('../parse-devotional-json');

describe('parse-devotional-json behavior', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devo-tests-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writeFileIfChanged writes a new file and returns true', () => {
    const filePath = path.join(tmpDir, 'example.html');
    const changed = writeFileIfChanged(filePath, '<h1>Hola</h1>');

    expect(changed).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('<h1>Hola</h1>');
  });

  test('writeFileIfChanged does not rewrite when content is identical', () => {
    const filePath = path.join(tmpDir, 'example.html');
    fs.writeFileSync(filePath, '<h1>Hola</h1>', 'utf8');

    const changed = writeFileIfChanged(filePath, '<h1>Hola</h1>');

    expect(changed).toBe(false);
  });

  test('saveHashIfChanged writes hash file when remote hash is new', () => {
    const hashPath = path.join(tmpDir, '2026-02-14.mp3.hash');
    const changed = saveHashIfChanged(hashPath, 'newhash');

    expect(changed).toBe(true);
    expect(fs.readFileSync(hashPath, 'utf8')).toBe('newhash\n');
  });

  test('saveHashIfChanged does not rewrite when hash is unchanged', () => {
    const hashPath = path.join(tmpDir, '2026-02-14.mp3.hash');
    fs.writeFileSync(hashPath, 'samehash\n', 'utf8');

    const changed = saveHashIfChanged(hashPath, 'samehash');

    expect(changed).toBe(false);
    expect(fs.readFileSync(hashPath, 'utf8')).toBe('samehash\n');
  });

  test('saveHashIfChanged creates missing file even when hash exists in another file', () => {
    const primary = path.join(tmpDir, '2026-02-14.hash');
    const legacy = path.join(tmpDir, '2026-02-14.mp3.hash');
    fs.writeFileSync(primary, 'samehash\n', 'utf8');

    const changed = saveHashIfChanged(legacy, 'samehash');

    expect(changed).toBe(true);
    expect(fs.readFileSync(legacy, 'utf8')).toBe('samehash\n');
  });

  test('normalizeHashValue extracts hash token from hash file formats', () => {
    const raw = 'b1946ac92492d2347c6235b4d2611184  2026-02-14.mp3';
    expect(normalizeHashValue(raw)).toBe('b1946ac92492d2347c6235b4d2611184');
  });

  test('shouldForceRebuildForHash returns true when remote hash is new (no local hash)', () => {
    const rebuild = shouldForceRebuildForHash({
      downloadAudioEnabled: true,
      remoteHash: 'newremotehash',
      localHash: null
    });

    expect(rebuild).toBe(true);
  });

  test('shouldForceRebuildForHash returns true when remote hash changed', () => {
    const rebuild = shouldForceRebuildForHash({
      downloadAudioEnabled: true,
      remoteHash: 'remotehash-v2',
      localHash: 'remotehash-v1'
    });

    expect(rebuild).toBe(true);
  });

  test('shouldForceRebuildForHash returns false when remote hash is equal to local hash', () => {
    const rebuild = shouldForceRebuildForHash({
      downloadAudioEnabled: true,
      remoteHash: 'samehash',
      localHash: 'samehash'
    });

    expect(rebuild).toBe(false);
  });

  test('resolveLocalHashPaths returns primary and legacy paths', () => {
    const paths = resolveLocalHashPaths(tmpDir, '2026-02-14');
    expect(paths.primary).toBe(path.join(tmpDir, '2026-02-14.hash'));
    expect(paths.legacy).toBe(path.join(tmpDir, '2026-02-14.mp3.hash'));
  });

  test('readLocalHash prefers primary .hash over legacy .mp3.hash', () => {
    const primary = path.join(tmpDir, '2026-02-14.hash');
    const legacy = path.join(tmpDir, '2026-02-14.mp3.hash');
    fs.writeFileSync(legacy, 'legacyhash\n', 'utf8');
    fs.writeFileSync(primary, 'primaryhash\n', 'utf8');

    const localHash = readLocalHash(primary, legacy);
    expect(localHash).toBe('primaryhash');
  });

  test('buildProcessingPlan skips all when remote hash is missing', () => {
    const plan = buildProcessingPlan({
      hashState: { reason: 'missing_remote_hash' },
      generateImagesEnabled: true,
      downloadAudioEnabled: true
    });

    expect(plan).toEqual({
      shouldProcess: false,
      reason: 'missing_remote_hash',
      processHtml: false,
      processImage: false,
      processAudio: false,
      shouldSaveHash: false
    });
  });

  test('buildProcessingPlan skips all when hash is unchanged', () => {
    const plan = buildProcessingPlan({
      hashState: { reason: 'hash_unchanged' },
      generateImagesEnabled: true,
      downloadAudioEnabled: true
    });

    expect(plan).toEqual({
      shouldProcess: false,
      reason: 'hash_unchanged',
      processHtml: false,
      processImage: false,
      processAudio: false,
      shouldSaveHash: false
    });
  });

  test('buildProcessingPlan processes html+image+audio when hash changed and flags enabled', () => {
    const plan = buildProcessingPlan({
      hashState: { reason: 'hash_changed_or_new' },
      generateImagesEnabled: true,
      downloadAudioEnabled: true
    });

    expect(plan).toEqual({
      shouldProcess: true,
      reason: 'hash_changed_or_new',
      processHtml: true,
      processImage: true,
      processAudio: true,
      shouldSaveHash: true
    });
  });

  test('buildProcessingPlan processes only html when hash changed and flags disabled', () => {
    const plan = buildProcessingPlan({
      hashState: { reason: 'hash_changed_or_new' },
      generateImagesEnabled: false,
      downloadAudioEnabled: false
    });

    expect(plan).toEqual({
      shouldProcess: true,
      reason: 'hash_changed_or_new',
      processHtml: true,
      processImage: false,
      processAudio: false,
      shouldSaveHash: true
    });
  });
});
