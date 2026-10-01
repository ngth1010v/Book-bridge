// Run: node i18n.test.js
// Every Vietnamese string the app can show must have an English entry in i18n.js.
const fs = require('fs');
const root = __dirname;
global.window = {};
require(root + '/i18n.js');
const EN = window.I18N_EN;
const src = fs.readFileSync(root + '/app.js', 'utf8');
const html = fs.readFileSync(root + '/app.html', 'utf8');
const seed = require(root + '/seed.json');
const keys = new Set();
for (const m of src.matchAll(/T`((?:[^`\\]|\\.)*)`/g)) keys.add(m[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '{}'));
for (const m of src.matchAll(/table\(\[([^\]]*)\]/g)) for (const h of m[1].matchAll(/'([^']*)'/g)) if (h[1]) keys.add(h[1].replace('#', ''));
for (const m of src.matchAll(/num\('\w+', '([^']+)'\)/g)) keys.add(m[1]);
for (const m of html.matchAll(/data-t>([^<]+)</g)) keys.add(m[1].trim());
keys.add(html.match(/<title>([^<]+)/)[1]);
for (const c of ['schools', 'suppliers', 'titles']) for (const r of seed[c]) keys.add(r.name);
for (const r of seed.schools) keys.add(r.area);
const missing = [...keys].filter((k) => !(k in EN));
const unused = Object.keys(EN).filter((k) => !keys.has(k));
const slots = (s) => (s.match(/\{\}/g) || []).length;
const badSlots = [...keys].filter((k) => k in EN && slots(k) !== slots(EN[k]));
if (missing.length || unused.length || badSlots.length) {
  console.error({ missing, unused, badSlots });
  process.exit(1);
}
console.log('i18n ok');
