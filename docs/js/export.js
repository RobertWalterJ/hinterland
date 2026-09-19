/* ==========================================================================
   Exporters - Excel, CSV, DBF, shapefile, GeoJSON.

   All written from scratch rather than pulled from a CDN, for three reasons:
   the tool has to work with no network, a local planning tool should not phone
   out to fetch a script, and the file formats involved are old and stable
   enough that writing them is less work than depending on someone else's
   writer.

   What is implemented here:
     - a store-only ZIP writer (valid ZIP; no compression needed at these sizes)
     - a minimal OOXML workbook writer using inline strings
     - a dBase III DBF writer, which is what a GIS join actually wants
     - an ESRI shapefile writer (.shp/.shx/.dbf/.prj/.cpg) for polygons
   ========================================================================== */

(function (root) {
  'use strict';

  var X = {};

  /* When the app is served as a published web page rather than from the local
     launcher, the viewer runs in a sandbox that makes page-initiated downloads
     inert - an <a download> click, a blob URL, a script-driven save, all of
     them silently do nothing. Rather than offer buttons that appear to work
     and do not, the export sheet asks this flag and offers clipboard handoff
     instead, and says where the file formats live. */
  X.hosted = !!root.GRA_HOSTED;
  X.canDownload = !X.hosted;

  X.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('no clipboard access'));
  };

  /* ----------------------------------------------------------- download */

  function save(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
  }
  X.save = save;

  X.slug = function (s) {
    return String(s || 'export').normalize('NFKD')
      .replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-').toLowerCase().slice(0, 60);
  };

  /* --------------------------------------------------------------- CSV */

  function csvCell(v) {
    if (v == null) return '';
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  X.toCSV = function (columns, rows) {
    var out = [columns.map(function (c) { return csvCell(c.label); }).join(',')];
    rows.forEach(function (r) {
      out.push(columns.map(function (c) { return csvCell(r[c.key]); }).join(','));
    });
    return out.join('\r\n') + '\r\n';
  };

  X.downloadCSV = function (columns, rows, filename) {
    /* A byte-order mark, because Excel on Windows will otherwise mangle any
       accented place name in a UTF-8 CSV. */
    var blob = new Blob(['﻿' + X.toCSV(columns, rows)],
                        { type: 'text/csv;charset=utf-8' });
    save(blob, filename);
  };

  /* --------------------------------------------------------- ZIP (store) */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  }());

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) { return new TextEncoder().encode(str); }

  function dosTime(d) {
    var t = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) |
            ((d.getSeconds() / 2) & 31);
    var dt = (((d.getFullYear() - 1980) & 127) << 9) |
             (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { t: t, d: dt };
  }

  /* entries: [{name, bytes:Uint8Array}] */
  X.zip = function (entries) {
    var now = dosTime(new Date());
    var parts = [], central = [], offset = 0;

    entries.forEach(function (e) {
      var nameB = utf8(e.name);
      var crc = crc32(e.bytes);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);          /* version needed */
      lh.setUint16(6, 0x0800, true);      /* UTF-8 names */
      lh.setUint16(8, 0, true);           /* stored */
      lh.setUint16(10, now.t, true);
      lh.setUint16(12, now.d, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, e.bytes.length, true);
      lh.setUint32(22, e.bytes.length, true);
      lh.setUint16(26, nameB.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, e.bytes);

      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, now.t, true);
      cd.setUint16(14, now.d, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, e.bytes.length, true);
      cd.setUint32(24, e.bytes.length, true);
      cd.setUint16(28, nameB.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nameB);

      offset += 30 + nameB.length + e.bytes.length;
    });

    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [new Uint8Array(eocd.buffer)]),
                    { type: 'application/zip' });
  };

  /* ------------------------------------------------------------- XLSX */

  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      /* strip the control characters OOXML forbids outright */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(i) {
    var s = '';
    i += 1;
    while (i > 0) {
      var r = (i - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      i = (i - 1 - r) / 26;
    }
    return s;
  }
  X.colName = colName;

  /* sheets: [{name, columns:[{label,key,type,width,dp}], rows:[obj],
              title, notes:[string], freeze:true}]
     A sheet may also be given as {name, blocks:[{heading, lines:[...]}]} for
     a text page such as the cover or the method notes. */
  X.downloadXLSX = function (sheets, filename) {
    var files = [];
    var sheetXml = sheets.map(function (sh, si) {
      return sh.blocks ? textSheet(sh) : dataSheet(sh);
    });

    files.push({
      name: '[Content_Types].xml',
      bytes: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '</Types>')
    });

    files.push({
      name: '_rels/.rels',
      bytes: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>')
    });

    files.push({
      name: 'xl/workbook.xml',
      bytes: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' + sheets.map(function (s, i) {
          return '<sheet name="' + xmlEsc(sheetName(s.name)) + '" sheetId="' +
            (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets></workbook>')
    });

    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      bytes: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
            (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>')
    });

    files.push({ name: 'xl/styles.xml', bytes: utf8(STYLES) });

    sheetXml.forEach(function (xml, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', bytes: utf8(xml) });
    });

    save(X.zip(files), filename);
  };

  function sheetName(n) {
    /* Excel: 31 characters, and none of : \ / ? * [ ] */
    return String(n || 'Sheet').replace(/[:\\\/\?\*\[\]]/g, ' ').slice(0, 31);
  }

  /* Style indices used below:
       0 general   1 bold title   2 header   3 integer   4 two decimals
       5 percent   6 wrapped text 7 bold integer  8 bold two decimals */
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3">' +
    '<numFmt numFmtId="170" formatCode="#,##0"/>' +
    '<numFmt numFmtId="171" formatCode="#,##0.00"/>' +
    '<numFmt numFmtId="172" formatCode="0.0%"/>' +
    '</numFmts>' +
    '<fonts count="4">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF7D6E6E"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F3EF"/>' +
    '<bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border/>' +
    '<border><bottom style="thin"><color rgb="FFBFBBB2"/></bottom></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1">' +
    '<alignment vertical="bottom" wrapText="1"/></xf>' +
    '<xf numFmtId="170" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="171" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="172" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
    '<alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="170" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="171" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
    '<alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  var S = { plain: 0, title: 1, header: 2, int: 3, dec: 4, pct: 5,
            wrap: 6, boldInt: 7, boldDec: 8, note: 9 };

  function cell(ref, value, style, forceText) {
    if (value == null || value === '') {
      return style ? '<c r="' + ref + '" s="' + style + '"/>' : '';
    }
    if (!forceText && typeof value === 'number' && isFinite(value)) {
      return '<c r="' + ref + '"' + (style ? ' s="' + style + '"' : '') + '><v>' +
        value + '</v></c>';
    }
    return '<c r="' + ref + '"' + (style ? ' s="' + style + '"' : '') +
      ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(value) +
      '</t></is></c>';
  }

  function dataSheet(sh) {
    var cols = sh.columns;
    var rowsXml = [];
    var r = 1;

    if (sh.title) {
      rowsXml.push('<row r="' + r + '" ht="20" customHeight="1">' +
        cell('A' + r, sh.title, S.title, true) + '</row>');
      r++;
    }
    (sh.notes || []).forEach(function (n) {
      rowsXml.push('<row r="' + r + '">' + cell('A' + r, n, S.note, true) + '</row>');
      r++;
    });
    if (sh.title || (sh.notes || []).length) r++;

    var headRow = r;
    rowsXml.push('<row r="' + r + '" ht="30" customHeight="1">' +
      cols.map(function (c, i) {
        return cell(colName(i) + r, c.label, S.header, true);
      }).join('') + '</row>');
    r++;

    sh.rows.forEach(function (row) {
      rowsXml.push('<row r="' + r + '">' + cols.map(function (c, i) {
        var v = row[c.key];
        var st = c.type === 'pct' ? S.pct
               : c.type === 'dec' ? S.dec
               : c.type === 'int' ? S.int
               : c.type === 'text' ? S.plain : S.plain;
        return cell(colName(i) + r, v, st, c.type === 'text');
      }).join('') + '</row>');
      r++;
    });

    if (sh.totals) {
      rowsXml.push('<row r="' + r + '">' + cols.map(function (c, i) {
        var v = sh.totals[c.key];
        var st = c.type === 'dec' ? S.boldDec
               : c.type === 'int' ? S.boldInt : S.header;
        return cell(colName(i) + r, v, st, typeof v === 'string');
      }).join('') + '</row>');
      r++;
    }

    var widths = '<cols>' + cols.map(function (c, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' +
        (c.width || (c.type && c.type !== 'text' ? 13 : 26)) + '" customWidth="1"/>';
    }).join('') + '</cols>';

    var pane = sh.freeze === false ? '' :
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + headRow +
      '" topLeftCell="A' + (headRow + 1) +
      '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      pane + widths + '<sheetData>' + rowsXml.join('') + '</sheetData>' +
      '<autoFilter ref="A' + headRow + ':' + colName(cols.length - 1) +
      (r - 1) + '"/></worksheet>';
  }

  function textSheet(sh) {
    var rowsXml = [], r = 1;
    if (sh.title) {
      rowsXml.push('<row r="' + r + '" ht="22" customHeight="1">' +
        cell('A' + r, sh.title, S.title, true) + '</row>');
      r += 2;
    }
    sh.blocks.forEach(function (b) {
      if (b.heading) {
        rowsXml.push('<row r="' + r + '">' +
          cell('A' + r, b.heading, S.header, true) + '</row>');
        r++;
      }
      (b.lines || []).forEach(function (ln) {
        if (Array.isArray(ln)) {
          rowsXml.push('<row r="' + r + '">' +
            cell('A' + r, ln[0], S.plain, true) +
            cell('B' + r, ln[1], S.wrap, true) + '</row>');
        } else {
          rowsXml.push('<row r="' + r + '">' +
            cell('A' + r, ln, S.wrap, true) + '</row>');
        }
        r++;
      });
      r++;
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<cols><col min="1" max="1" width="30" customWidth="1"/>' +
      '<col min="2" max="2" width="96" customWidth="1"/></cols>' +
      '<sheetData>' + rowsXml.join('') + '</sheetData></worksheet>';
  }

  /* --------------------------------------------------------------- DBF */

  /* dBase III. Field names are capped at 10 characters and field widths at
     254; numerics are written right-aligned ASCII, which is what the format
     actually stores. Returns {bytes, mapping} where mapping records the
     original label for every truncated field name, because a 10-character
     name is rarely self-explanatory and the join has to be documented. */
  X.toDBF = function (columns, rows) {
    var fields = [], used = {}, mapping = [];

    columns.forEach(function (c) {
      var name = String(c.dbf || c.label).toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_')
        .replace(/^_|_$/g, '').slice(0, 10) || 'FLD';
      var base = name, n = 1;
      while (used[name]) {
        var suffix = String(++n);
        name = base.slice(0, 10 - suffix.length) + suffix;
      }
      used[name] = true;

      var isNum = c.type === 'int' || c.type === 'dec' || c.type === 'pct';
      var dp = c.type === 'int' ? 0 : (c.dp != null ? c.dp : c.type === 'pct' ? 4 : 3);
      var width;
      if (isNum) {
        var maxLen = 4;
        rows.forEach(function (r) {
          var v = r[c.key];
          if (v == null || !isFinite(v)) return;
          maxLen = Math.max(maxLen, fmtNum(v, dp).length);
        });
        width = Math.min(19, Math.max(maxLen, dp ? dp + 3 : 3));
      } else {
        var m = 1;
        rows.forEach(function (r) {
          var v = r[c.key];
          if (v != null) m = Math.max(m, String(v).length);
        });
        width = Math.min(254, m);
      }
      fields.push({ name: name, key: c.key, type: isNum ? 'N' : 'C',
                    width: width, dp: isNum ? dp : 0 });
      mapping.push({ dbf: name, label: c.label,
                     type: isNum ? 'numeric' : 'text',
                     width: width, decimals: isNum ? dp : 0 });
    });

    var recLen = 1 + fields.reduce(function (a, f) { return a + f.width; }, 0);
    var headLen = 32 + fields.length * 32 + 1;
    var buf = new Uint8Array(headLen + rows.length * recLen + 1);
    var dv = new DataView(buf.buffer);
    var d = new Date();

    buf[0] = 0x03;
    buf[1] = d.getFullYear() - 1900;
    buf[2] = d.getMonth() + 1;
    buf[3] = d.getDate();
    dv.setUint32(4, rows.length, true);
    dv.setUint16(8, headLen, true);
    dv.setUint16(10, recLen, true);
    buf[29] = 0x00;                     /* no code page set; .cpg carries it */

    var p = 32;
    fields.forEach(function (f) {
      for (var i = 0; i < 11; i++) {
        buf[p + i] = i < f.name.length ? f.name.charCodeAt(i) : 0;
      }
      buf[p + 11] = f.type.charCodeAt(0);
      buf[p + 16] = f.width;
      buf[p + 17] = f.dp;
      p += 32;
    });
    buf[p++] = 0x0D;

    rows.forEach(function (row) {
      buf[p++] = 0x20;                  /* not deleted */
      fields.forEach(function (f) {
        var v = row[f.key];
        var s;
        if (f.type === 'N') {
          s = (v == null || !isFinite(v)) ? '' : fmtNum(v, f.dp);
          s = s.length > f.width ? '*'.repeat(f.width) : pad(s, f.width, true);
        } else {
          s = v == null ? '' : String(v);
          s = ascii(s).slice(0, f.width);
          s = pad(s, f.width, false);
        }
        for (var i = 0; i < f.width; i++) buf[p + i] = s.charCodeAt(i) & 0xFF;
        p += f.width;
      });
    });
    buf[p] = 0x1A;

    return { bytes: buf, mapping: mapping, fields: fields };
  };

  function fmtNum(v, dp) { return dp ? Number(v).toFixed(dp) : String(Math.round(v)); }
  function pad(s, w, right) {
    while (s.length < w) s = right ? ' ' + s : s + ' ';
    return s;
  }
  /* DBF is a single-byte format, so names have to come down to ASCII.
     Transliterate deliberately rather than just dropping: Ontario place names
     are full of en-dashes and curly apostrophes, and "Kitchener-Waterloo" is a
     usable label where "KitchenerWaterloo" is not. Accents are stripped after
     decomposition, and anything still outside ASCII is dropped. */
  var TRANSLIT = [
    [/[‐-―−]/g, '-'],      /* hyphens, dashes, minus sign */
    [/[‘’‛ʼ]/g, "'"], /* curly and modifier apostrophes */
    [/[“”„]/g, '"'],
    [/…/g, '...'],
    [/×/g, 'x'],
    [/°/g, 'deg'],
    [/[    ]/g, ' '], /* non-breaking and thin spaces */
    [/æ/g, 'ae'], [/Æ/g, 'AE'],
    [/œ/g, 'oe'], [/Œ/g, 'OE'],
    [/ø/g, 'o'], [/Ø/g, 'O'],
    [/ß/g, 'ss'], [/þ/g, 'th'], [/đ/g, 'd'], [/ł/g, 'l']
  ];

  function ascii(s) {
    var out = String(s);
    for (var i = 0; i < TRANSLIT.length; i++) {
      out = out.replace(TRANSLIT[i][0], TRANSLIT[i][1]);
    }
    return out.normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7E]/g, '');
  }
  X.ascii = ascii;

  X.downloadDBF = function (columns, rows, filename, readmeLines) {
    var r = X.toDBF(columns, rows);
    var entries = [
      { name: filename.replace(/\.zip$/, '') + '.dbf', bytes: r.bytes },
      { name: filename.replace(/\.zip$/, '') + '.cpg', bytes: utf8('UTF-8') },
      { name: 'FIELD-NAMES.txt', bytes: utf8(fieldDoc(r.mapping, readmeLines)) }
    ];
    save(X.zip(entries), filename.replace(/\.zip$/, '') + '.zip');
  };

  function fieldDoc(mapping, extra) {
    var L = ['DBF field name mapping', '======================', ''];
    (extra || []).forEach(function (l) { L.push(l); });
    if (extra && extra.length) L.push('');
    L.push('DBF caps field names at 10 characters, so they are abbreviated.');
    L.push('');
    mapping.forEach(function (m) {
      L.push(pad(m.dbf, 12, false) + pad(m.type, 9, false) +
        'w' + m.width + (m.decimals ? '.' + m.decimals : '') + '   ' + m.label);
    });
    return L.join('\r\n') + '\r\n';
  }
  X.fieldDoc = fieldDoc;

  /* --------------------------------------------------------- shapefile */

  /* ESRI shapefile, polygon type only. Coordinates are written in WGS 84
     decimal degrees to match the GeoJSON the map uses, and the .prj says so,
     so QGIS and ArcGIS both open it with the right CRS and no prompting. */
  var WGS84_WKT = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
    'SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
    'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

  function ringsOf(feature) {
    var g = feature.geometry;
    if (!g) return [];
    if (g.type === 'Polygon') return g.coordinates;
    var out = [];
    g.coordinates.forEach(function (poly) {
      poly.forEach(function (ring) { out.push(ring); });
    });
    return out;
  }

  X.toShapefile = function (features, columns, rowsByFeature) {
    var recs = features.map(function (f) {
      var rings = ringsOf(f).filter(function (r) { return r.length >= 4; });
      var nParts = rings.length;
      var nPoints = rings.reduce(function (a, r) { return a + r.length; }, 0);
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rings.forEach(function (r) {
        r.forEach(function (p) {
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        });
      });
      return { rings: rings, nParts: nParts, nPoints: nPoints,
               bbox: [minX, minY, maxX, maxY] };
    });

    var contentLens = recs.map(function (r) {
      /* type(4) + bbox(32) + numParts(4) + numPoints(4) + parts + points */
      return 44 + r.nParts * 4 + r.nPoints * 16;
    });
    var shpLen = 100 + contentLens.reduce(function (a, n) { return a + n + 8; }, 0);
    var shxLen = 100 + recs.length * 8;

    var shp = new DataView(new ArrayBuffer(shpLen));
    var shx = new DataView(new ArrayBuffer(shxLen));

    var all = [Infinity, Infinity, -Infinity, -Infinity];
    recs.forEach(function (r) {
      if (!isFinite(r.bbox[0])) return;
      all[0] = Math.min(all[0], r.bbox[0]);
      all[1] = Math.min(all[1], r.bbox[1]);
      all[2] = Math.max(all[2], r.bbox[2]);
      all[3] = Math.max(all[3], r.bbox[3]);
    });

    function header(dv, lenBytes) {
      dv.setInt32(0, 9994);                  /* big-endian file code */
      dv.setInt32(24, lenBytes / 2);         /* length in 16-bit words */
      dv.setInt32(28, 1000, true);
      dv.setInt32(32, 5, true);              /* polygon */
      dv.setFloat64(36, all[0], true);
      dv.setFloat64(44, all[1], true);
      dv.setFloat64(52, all[2], true);
      dv.setFloat64(60, all[3], true);
    }
    header(shp, shpLen);
    header(shx, shxLen);

    var off = 100;
    recs.forEach(function (r, i) {
      var clen = contentLens[i];
      shp.setInt32(off, i + 1);              /* record number, big-endian */
      shp.setInt32(off + 4, clen / 2);
      var p = off + 8;
      shp.setInt32(p, 5, true); p += 4;
      var bb = isFinite(r.bbox[0]) ? r.bbox : [0, 0, 0, 0];
      shp.setFloat64(p, bb[0], true); p += 8;
      shp.setFloat64(p, bb[1], true); p += 8;
      shp.setFloat64(p, bb[2], true); p += 8;
      shp.setFloat64(p, bb[3], true); p += 8;
      shp.setInt32(p, r.nParts, true); p += 4;
      shp.setInt32(p, r.nPoints, true); p += 4;
      var acc = 0;
      r.rings.forEach(function (ring) {
        shp.setInt32(p, acc, true); p += 4;
        acc += ring.length;
      });
      r.rings.forEach(function (ring) {
        ring.forEach(function (pt) {
          shp.setFloat64(p, pt[0], true); p += 8;
          shp.setFloat64(p, pt[1], true); p += 8;
        });
      });

      shx.setInt32(100 + i * 8, off / 2);
      shx.setInt32(100 + i * 8 + 4, clen / 2);
      off += 8 + clen;
    });

    var dbf = X.toDBF(columns, rowsByFeature);
    return {
      shp: new Uint8Array(shp.buffer),
      shx: new Uint8Array(shx.buffer),
      dbf: dbf.bytes,
      mapping: dbf.mapping
    };
  };

  X.downloadShapefile = function (features, columns, rows, base, readmeLines) {
    var s = X.toShapefile(features, columns, rows);
    save(X.zip([
      { name: base + '.shp', bytes: s.shp },
      { name: base + '.shx', bytes: s.shx },
      { name: base + '.dbf', bytes: s.dbf },
      { name: base + '.prj', bytes: utf8(WGS84_WKT) },
      { name: base + '.cpg', bytes: utf8('UTF-8') },
      { name: 'FIELD-NAMES.txt', bytes: utf8(fieldDoc(s.mapping, readmeLines)) }
    ]), base + '-shapefile.zip');
  };

  /* ----------------------------------------------------------- GeoJSON */

  X.downloadGeoJSON = function (features, rows, base, props) {
    var byId = {};
    rows.forEach(function (r) { byId[r._id] = r; });
    var fc = {
      type: 'FeatureCollection',
      properties: props || {},
      features: features.map(function (f) {
        var r = byId[f.properties.id] || {};
        var p = {};
        Object.keys(r).forEach(function (k) { if (k !== '_id') p[k] = r[k]; });
        p.id = f.properties.id;
        return { type: 'Feature', properties: p, geometry: f.geometry };
      })
    };
    save(new Blob([JSON.stringify(fc)], { type: 'application/geo+json' }),
         base + '.geojson');
  };

  /* -------------------------------------------------------------- text */

  X.downloadText = function (text, filename, mime) {
    save(new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' }),
         filename);
  };

  root.GRA = root.GRA || {};
  root.GRA.exp = X;
}(this));
