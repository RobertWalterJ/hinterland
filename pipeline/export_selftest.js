/* Drive app/js/export.js under Node and write real files to disk, so that
   pipeline/validate.py can parse them back and check the bytes.

   The writers in export.js are hand-rolled - a store-only ZIP, an OOXML
   workbook, a dBase III table, an ESRI shapefile - so "it downloaded without
   throwing" is not evidence that anything can open them. This harness plus the
   Python verifier is the evidence.

   Usage: node pipeline/export_selftest.js <output-dir>
*/
'use strict';

const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node export_selftest.js <output-dir>');
  process.exit(2);
}

/* ------------------------------------------------------------- DOM stubs */

const saved = [];
let pending = null;

globalThis.Blob = class Blob {
  constructor(parts, opts) {
    this.parts = parts || [];
    this.type = (opts && opts.type) || '';
  }
  buffer() {
    const bufs = [];
    const walk = (p) => {
      if (p == null) return;
      if (Array.isArray(p)) { p.forEach(walk); return; }
      if (typeof p === 'string') { bufs.push(Buffer.from(p, 'utf8')); return; }
      if (p instanceof Blob) { bufs.push(p.buffer()); return; }
      if (p.buffer instanceof ArrayBuffer || p instanceof Uint8Array) {
        bufs.push(Buffer.from(p.buffer || p, p.byteOffset || 0, p.byteLength));
        return;
      }
      if (p instanceof ArrayBuffer) { bufs.push(Buffer.from(p)); return; }
      throw new Error('unexpected Blob part: ' + Object.prototype.toString.call(p));
    };
    this.parts.forEach(walk);
    return Buffer.concat(bufs);
  }
};

globalThis.URL = {
  createObjectURL(blob) { pending = blob; return 'blob:test'; },
  revokeObjectURL() {}
};

globalThis.document = {
  createElement() {
    return {
      set download(v) { this._name = v; },
      get download() { return this._name; },
      href: '', click() { saved.push({ name: this._name, blob: pending }); },
      closest() { return null; }, setAttribute() {}, addEventListener() {}
    };
  },
  createElementNS() { return { setAttribute() {}, appendChild() {} }; },
  body: { appendChild() {}, removeChild() {} }
};

globalThis.window = globalThis;

/* ------------------------------------------------------------ load it up */

const geval = eval;
geval(fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'export.js'), 'utf8'));
const X = globalThis.GRA.exp;

/* ------------------------------------------------------------- fixtures */

/* Deliberately awkward: accented and non-Latin place names, a name longer
   than the DBF text width would naively allow, nulls in numeric columns, a
   value that needs more width than its neighbours, an embedded comma and
   quote for the CSV, and column labels that collide once truncated to ten
   characters. */
const columns = [
  { key: 'code', label: 'CSDUID', type: 'text', dbf: 'CSDUID' },
  { key: 'name', label: 'Municipality name', type: 'text', dbf: 'CSDNAME' },
  { key: 'jobs', label: 'Jobs located here', type: 'int', dbf: 'JOBS' },
  { key: 'share', label: 'Share of local jobs', type: 'pct', dbf: 'SHARE', dp: 5 },
  { key: 'lq', label: 'Location quotient', type: 'dec', dbf: 'LQ', dp: 4 },
  { key: 'comp', label: 'Competitive effect', type: 'dec', dbf: 'EFF_COMP', dp: 1 },
  { key: 'longa', label: 'Specialisation index A', type: 'dec',
    dbf: 'SPECIALISATION_A', dp: 3 },
  { key: 'longb', label: 'Specialisation index B', type: 'dec',
    dbf: 'SPECIALISATION_B', dp: 3 }
];

const rows = [
  { _id: '3520005', code: '3520005', name: 'Toronto', jobs: 1264060,
    share: 0.21456, lq: 1.1725, comp: -35709.4, longa: 0.126, longb: 0.885 },
  { _id: '3506008', code: '3506008', name: 'Ottawa', jobs: 486215,
    share: 0.08254, lq: 0.9931, comp: 12044.6, longa: 0.171, longb: 0.902 },
  { _id: '3524009', code: '3524009', name: 'Kitchener–Waterloo, "twin" city',
    jobs: null, share: null, lq: null, comp: 0, longa: null, longb: 0.5 },
  { _id: '3537036', code: '3537036', name: 'Hamilton', jobs: 244930,
    share: 0.04157, lq: 1.0422, comp: -1873.25, longa: 0.144, longb: 0.913 },
  { _id: '3546096', code: '3546096', name: "L'Orignal / Hawkesbury-Est",
    jobs: 45, share: 0.00001, lq: 3.9999, comp: -2.5, longa: 0.512, longb: 0.401 }
];

const sheets = [
  { name: 'About this export', title: 'Hinterland — self test',
    blocks: [
      { heading: 'What this is', lines: [
        ['Subject', 'Toronto (City, 3520005)'],
        ['Benchmark', 'Ontario'],
        ['Produced', new Date().toISOString()]
      ] },
      { heading: 'Caveats', lines: [
        ['May 2021 reference week', 'Accommodation and food is understated.'],
        'A bare line with a <tag> & an ampersand, plus a quote: "like this".'
      ] }
    ] },
  { name: 'Structure 2021', columns: columns, rows: rows,
    title: 'Toronto — industry structure',
    notes: ['Compared with Ontario.', 'Blank means no published figure, not zero.'],
    totals: { name: 'Total', jobs: 1995250, share: 1, comp: -25540.55 } }
];

/* ------------------------------------------------------------- geometry */

/* A square, a square with a hole, and a two-part polygon - so the shapefile
   writer is exercised on single rings, interior rings and multipart shapes. */
const features = [
  { type: 'Feature', properties: { id: '3520005' },
    geometry: { type: 'Polygon', coordinates: [
      [[-79.6, 43.6], [-79.2, 43.6], [-79.2, 43.8], [-79.6, 43.8], [-79.6, 43.6]]
    ] } },
  { type: 'Feature', properties: { id: '3506008' },
    geometry: { type: 'Polygon', coordinates: [
      [[-76.0, 45.2], [-75.5, 45.2], [-75.5, 45.5], [-76.0, 45.5], [-76.0, 45.2]],
      [[-75.9, 45.3], [-75.8, 45.3], [-75.8, 45.4], [-75.9, 45.4], [-75.9, 45.3]]
    ] } },
  { type: 'Feature', properties: { id: '3524009' },
    geometry: { type: 'MultiPolygon', coordinates: [
      [[[-80.6, 43.4], [-80.4, 43.4], [-80.4, 43.6], [-80.6, 43.6], [-80.6, 43.4]]],
      [[[-80.3, 43.45], [-80.2, 43.45], [-80.2, 43.55], [-80.3, 43.55], [-80.3, 43.45]]]
    ] } },
  { type: 'Feature', properties: { id: '3537036' },
    geometry: { type: 'Polygon', coordinates: [
      [[-80.0, 43.1], [-79.7, 43.1], [-79.7, 43.4], [-80.0, 43.4], [-80.0, 43.1]]
    ] } },
  { type: 'Feature', properties: { id: '3546096' },
    geometry: { type: 'Polygon', coordinates: [
      [[-74.8, 45.5], [-74.6, 45.5], [-74.6, 45.7], [-74.8, 45.7], [-74.8, 45.5]]
    ] } }
];

/* ---------------------------------------------------------------- write */

fs.mkdirSync(OUT, { recursive: true });

X.downloadXLSX(sheets, 'selftest.xlsx');
X.downloadCSV(columns, rows, 'selftest.csv');
X.downloadDBF(columns, rows, 'selftest-dbf', ['A self test.', 'Second line.']);
X.downloadShapefile(features, columns, rows, 'selftest', ['A self test.']);
X.downloadGeoJSON(features, rows, 'selftest', { note: 'self test' });
X.downloadText('A brief.\nWith two lines.\n', 'selftest-brief.txt');

const manifest = [];
for (const s of saved) {
  const buf = s.blob.buffer();
  fs.writeFileSync(path.join(OUT, s.name), buf);
  manifest.push({ name: s.name, bytes: buf.length });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'),
                 JSON.stringify({ files: manifest, rows: rows.length,
                                  features: features.length }, null, 1));
console.log(JSON.stringify(manifest));
