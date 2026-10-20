// node render.js <props.json> <out.mp4> [allowedRoot ...]
// props.composition picks the composition (default 'Typo'); custom ones live in src/custom and are listed in src/custom/index.js.
// Renders the "Typo" composition. Local files named in the props (video, audio, scenes[].src, fontUrl) are given as absolute paths;
// they are served to the renderer over a small local http server that only exposes the allowed roots.
const fs = require('fs'), path = require('path'), http = require('http');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition, ensureBrowser } = require('@remotion/renderer');

const [, , propsFile, outFile, ...roots] = process.argv;
const ROOT = path.resolve(__dirname, '..');
const allowed = [path.join(ROOT, 'assets'), path.join(ROOT, 'fonts'), ...roots].map(r => path.resolve(r).toLowerCase());
const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.json': 'application/json' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      try {
        const p = path.resolve(decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('p') || ''));
        if (!allowed.some(a => p.toLowerCase().startsWith(a + path.sep.toLowerCase()) || p.toLowerCase() === a) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { rsp.writeHead(404); return rsp.end(); }
        const size = fs.statSync(p).size, type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', rg = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
        const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
        if (rg) { const a = rg[1] ? +rg[1] : 0, b = rg[2] ? Math.min(+rg[2], size - 1) : size - 1; rsp.writeHead(206, { ...h, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 }); fs.createReadStream(p, { start: a, end: b }).pipe(rsp); }
        else { rsp.writeHead(200, { ...h, 'Content-Length': size }); fs.createReadStream(p).pipe(rsp); }
      } catch { rsp.writeHead(500); rsp.end(); }
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const props = JSON.parse(fs.readFileSync(propsFile, 'utf8'));
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/f?p=`;
  const url = v => (v && !/^https?:/i.test(v) ? base + encodeURIComponent(v) : v);
  if (props.overlayFile) props.overlay = true;
  props.video = url(props.video); props.audio = url(props.audio); props.fontUrl = url(props.fontUrl);
  (props.scenes || []).forEach(s => { if (s.src) s.src = url(s.src); });
  // the bundled headless shell does not start on some Windows setups; the Chrome that is already installed does
  const CH = require('../lib/platform').chrome();
  const bo = CH ? { browserExecutable: CH, chromeMode: 'chrome-for-testing' } : {};
  if (!CH) await ensureBrowser();
  // Skia needs its own webpack settings; without the package nothing changes
  let skia = {}; try { const { enableSkia } = require('@remotion/skia/enable'); skia = { webpackOverride: c => { const r = enableSkia(c); r.resolve.alias = { ...r.resolve.alias, 'react-native$': 'react-native-web' }; return r; } }; } catch {}
  const serveUrl = await bundle({ entryPoint: path.join(__dirname, 'src', 'index.jsx'), onProgress: () => {}, ...skia });
  const comp = await selectComposition({ serveUrl, id: props.composition || 'Typo', inputProps: props, ...bo });
  let last = -1;
  const alpha = props.overlay ? { imageFormat: 'png' } : {};
  await renderMedia({ ...bo, ...alpha, composition: comp, serveUrl, codec: props.overlay ? 'vp9' : 'h264', outputLocation: outFile, inputProps: props, ...(props.overlay ? {} : { crf: 18 }), pixelFormat: props.overlay ? 'yuva420p' : 'yuv420p', concurrency: Math.max(2, Math.min(6, require('os').cpus().length >> 1)),
    onProgress: ({ progress }) => { const v = Math.round(progress * 100); if (v !== last) { last = v; console.log('PROGRESS ' + (v / 100)); } } });
  srv.close();
  console.log('DONE ' + outFile);
  process.exit(0);
})().catch(e => { console.error('ERROR ' + (e && e.stack || e)); process.exit(1); });
