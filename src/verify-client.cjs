#!/usr/bin/env node
/**
 * Dependency-free build/asset verifier.
 *
 * 1. Rebuilds client.js in memory from src/client.template.js + assets/.
 * 2. Fails if the committed client.js is stale or malformed.
 * 3. Sanity-checks the bundle manifest, locales, icon and audio/pose headers.
 *
 * Usage: node src/verify-client.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildClient } = require('./build-client.cjs');

const pkgDir = path.dirname(__dirname);
const problems = [];
const check = (condition, message) => { if (!condition) problems.push(message); };
const read = (name) => fs.readFileSync(path.join(pkgDir, name));

// 1) artifact is in sync + parses
let built;
try {
  built = buildClient();
} catch (error) {
  problems.push('build failed: ' + error.message);
}
if (built) {
  const current = fs.readFileSync(path.join(pkgDir, 'client.js'), 'utf8');
  check(current === built.source, 'client.js is stale: run `node src/build-client.cjs`');
  check((current.match(/data:image\/webp;base64,/g) || []).length === 8, 'client.js should embed 8 pose images');
  check(!/__POSE_[A-Z]+__|__PIKA_CLIPS__/.test(current), 'client.js still contains template markers');
}

// 2) manifest and bundled entry files
const pkg = JSON.parse(read('package.json').toString('utf8'));
check(pkg.name === '@local/dsh-pikachu-pet', 'package name changed');
check(pkg.license === 'MIT', 'package license should be MIT');
check(Boolean(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch), 'missing dsh.bundle.patch');
check(Boolean(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web'), 'dsh.client.platform must be "web"');
check(Boolean(pkg.exports && pkg.exports['./client'] === './client.js'), 'exports["./client"] must point at client.js');
check(Boolean(pkg.exports && pkg.exports['./icon'] === './icon.png'), 'exports["./icon"] must point at icon.png');
for (const name of ['index.js', 'client.js', 'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'icon.png', 'README.md', 'LICENSE', 'NOTICE']) {
  check(fs.existsSync(path.join(pkgDir, name)), 'missing file: ' + name);
}

// 3) locales
for (const locale of ['en', 'zh']) {
  try {
    const dict = JSON.parse(read('locale/' + locale + '.json').toString('utf8'));
    check(Boolean(dict.meta && dict.meta.title), 'locale/' + locale + '.json missing meta.title');
    check(Boolean(dict.meta && dict.meta.description), 'locale/' + locale + '.json missing meta.description');
  } catch (error) {
    problems.push('invalid locale/' + locale + '.json: ' + error.message);
  }
}

// 4) icon is a 256x256 PNG
try {
  const icon = read('icon.png');
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  check(icon.subarray(0, 8).equals(PNG_SIGNATURE), 'icon.png is not a PNG');
  check(icon.readUInt32BE(16) === 256 && icon.readUInt32BE(20) === 256, 'icon.png should be 256x256');
} catch (error) {
  problems.push('cannot read icon.png: ' + error.message);
}

// 5) pose and clip assets
const assetsDir = path.join(pkgDir, 'assets');
const poses = fs.readdirSync(assetsDir).filter((name) => /^pose-.*\.webp$/.test(name));
check(poses.length === 8, 'expected 8 pose WebP assets, found ' + poses.length);
for (const name of poses) {
  const buf = fs.readFileSync(path.join(assetsDir, name));
  check(buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP', name + ' is not a WebP file');
}
const clips = fs.readdirSync(assetsDir).filter((name) => /^pika-cry.*\.(ogg|mp3|wav|m4a|webm)$/i.test(name));
for (const name of clips) {
  const buf = fs.readFileSync(path.join(assetsDir, name));
  const head = buf.subarray(0, 4).toString('latin1');
  if (/\.ogg$/i.test(name)) check(head === 'OggS', name + ' is not an Ogg file');
  if (/\.wav$/i.test(name)) check(head === 'RIFF', name + ' is not a WAV file');
  if (/\.mp3$/i.test(name)) check(buf.subarray(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0), name + ' is not an MP3 file');
}

// 6) module/apply smoke test with stubbed browser globals and React
if (built) {
  try {
    let definition = null;
    const windowStub = {
      __ModuleLoader__: { load: (value) => { definition = value; } },
      localStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const reactStub = {
      createElement: () => null,
      useState: () => [null, () => {}],
      useEffect: () => {},
      useRef: () => ({ current: null }),
    };
    const requireStub = (name) => {
      if (name === 'react') return reactStub;
      throw new Error('unexpected require: ' + name);
    };
    new Function('window', 'require', built.source)(windowStub, requireStub);
    check(Boolean(definition && definition.factory), 'module factory was not registered');
    const plugin = definition.factory(requireStub);
    check(Boolean(plugin && typeof plugin.apply === 'function'), 'factory did not return apply()');

    const registrations = [];
    const slotsStub = {
      inject: (_key, callback) => { callback(); return () => {}; },
      register: (options) => { registrations.push(options.id); return () => {}; },
    };
    plugin.apply({
      get: () => undefined,
      effect: (callback) => callback(),
      slots: slotsStub,
    });
    check(registrations.indexOf('pikachu-pet') >= 0, 'shell.overlay registration missing');
    check(registrations.indexOf('pikachu-pet.sound') >= 0, 'settings.general.item registration missing');

    let localeRegistered = null;
    plugin.apply({
      get: (name) => (name === 'locale'
        ? {
          register: (namespace, dicts) => { localeRegistered = { namespace, dicts }; return () => {}; },
          bind: () => (key) => key,
        }
        : undefined),
      effect: (callback) => callback(),
      slots: slotsStub,
    });
    check(Boolean(localeRegistered && localeRegistered.dicts && localeRegistered.dicts.en && localeRegistered.dicts.zh), 'locale dictionaries were not registered');
  } catch (error) {
    problems.push('module smoke test failed: ' + error.message);
  }
}

if (problems.length > 0) {
  console.error('verify FAILED:');
  for (const problem of problems) console.error(' - ' + problem);
  process.exit(1);
}
console.log('verify OK: client.js in sync (' + Buffer.byteLength(built.source, 'utf8') + ' bytes), ' + poses.length + ' poses, ' + clips.length + ' cries, manifest/locales/icon valid');
