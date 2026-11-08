const fs = require('node:fs');
const path = require('node:path');

const srcDir = __dirname;
const pkgDir = path.dirname(srcDir);
const POSE_FILES = [
  ['STAND', 'pose-stand.webp'],
  ['RUN', 'pose-run.webp'],
  ['SLEEPCURL', 'pose-sleep-curl.webp'],
  ['CALL', 'pose-call.webp'],
  ['LAUGH', 'pose-laugh.webp'],
  ['JUMP', 'pose-jump.webp'],
  ['SLEEPSIDE', 'pose-sleep-side.webp'],
  ['REST', 'pose-rest.webp'],
];
const CLIP_PATTERN = /^pika-cry.*\.(ogg|mp3|wav|m4a|webm)$/i;
const MIME = {
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
};

function buildClient() {
  let tpl = fs.readFileSync(path.join(srcDir, 'client.template.js'), 'utf8');

  for (const entry of POSE_FILES) {
    const markerKey = entry[0];
    const file = path.join(pkgDir, 'assets', entry[1]);
    const base64 = fs.readFileSync(file).toString('base64');
    const marker = '__POSE_' + markerKey + '__';
    if (!tpl.includes(marker)) throw new Error('missing marker ' + marker);
    tpl = tpl.split(marker).join('data:image/webp;base64,' + base64);
  }

  const assetsDir = path.join(pkgDir, 'assets');
  const clipFiles = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir)
      .filter((name) => CLIP_PATTERN.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
  const clipUrls = clipFiles.map((name) => {
    const mime = MIME[path.extname(name).toLowerCase()] || 'audio/ogg';
    return 'data:' + mime + ';base64,' + fs.readFileSync(path.join(assetsDir, name)).toString('base64');
  });
  const clipLiteral = clipUrls.map((url) => JSON.stringify(url)).join(', ');
  tpl = tpl.replace('__PIKA_CLIPS__', clipLiteral);

  if (/__POSE_[A-Z]+__|__PIKA_CLIPS__/.test(tpl)) throw new Error('unreplaced marker remains');
  try {
    new Function(tpl);
  } catch (error) {
    throw new Error('generated client.js is not valid JavaScript: ' + error.message);
  }
  return { source: tpl, clipFiles: clipFiles, poseCount: POSE_FILES.length };
}

function main() {
  const built = buildClient();
  console.log('embedded cry clips:', built.clipFiles.length ? built.clipFiles.join(', ') : '(none, using synthesized fallback)');
  const out = path.join(pkgDir, 'client.js');
  fs.writeFileSync(out, built.source);
  console.log('built', out, fs.statSync(out).size, 'bytes');
}

module.exports = { buildClient };

if (require.main === module) main();
