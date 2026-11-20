/* Locum Tally: a tiny PDF writer (text, lines, boxes) for the free invoice generator.
   Runs entirely in your browser. Uses the built-in PDF fonts Helvetica and Helvetica-Bold. */
(function (root) {
  'use strict';
  var W = {
    r: [278,278,355,556,556,889,667,222,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,222,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
    b: [278,333,474,556,556,889,722,278,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,278,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]
  };
  var WIN = { 0x20AC: 0x80, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2122: 0x99 };
  var WIN_W = { 0x80: 556, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000, 0xA0: 278, 0xA9: 737, 0xB7: 278 };
  // string -> array of WinAnsi codes
  function codes(s) {
    var out = [];
    s = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 32 && c <= 126) out.push(c);
      else if (c >= 0xA0 && c <= 0xFF) out.push(c);
      else if (WIN[c]) out.push(WIN[c]);
      else if (c === 0x2212 || c === 0x2010 || c === 0x2011) out.push(45); // minus/hyphens -> '-'
      else if (c === 0x2032) out.push(39);
      else if (c >= 0xD800 && c <= 0xDBFF) { i++; } // emoji and other astral characters: dropped (no glyph in the built-in fonts)
      else if (c === 0x200B || c === 0x200D || c === 0xFE0F) { } // zero-width joiners/variation selectors
      else out.push(63); // anything else without a glyph -> '?'
    }
    return out;
  }
  function width(s, size, bold) {
    var t = bold ? W.b : W.r, cs = codes(s), w = 0;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      w += (c >= 32 && c <= 126) ? t[c - 32] : (WIN_W[c] || 556);
    }
    return w * size / 1000;
  }
  function esc(s) {
    var cs = codes(s), o = '';
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c === 40 || c === 41 || c === 92) o += '\\' + String.fromCharCode(c);
      else if (c > 126) o += '\\' + ('00' + c.toString(8)).slice(-3);
      else o += String.fromCharCode(c);
    }
    return o;
  }
  function n(x) { return (Math.round(x * 100) / 100).toString(); }
  function col(c) { return n(c[0] / 255) + ' ' + n(c[1] / 255) + ' ' + n(c[2] / 255); }

  function create(opt) {
    opt = opt || {};
    var PW = opt.width || 612, PH = opt.height || 792; // US Letter
    var pages = [], cur = null;
    var doc = {
      pageWidth: PW, pageHeight: PH,
      addPage: function () { cur = []; pages.push(cur); return doc; },
      width: width,
      wrap: function (s, size, bold, maxW) {
        var words = String(s == null ? '' : s).split(/\s+/).filter(Boolean), lines = [], line = '';
        for (var i = 0; i < words.length; i++) {
          var w = words[i];
          while (width(w, size, bold) > maxW && w.length > 1) { // break very long words
            var k = w.length; while (k > 1 && width(w.slice(0, k), size, bold) > maxW) k--;
            if (line) { lines.push(line); line = ''; }
            lines.push(w.slice(0, k)); w = w.slice(k);
          }
          var t = line ? line + ' ' + w : w;
          if (width(t, size, bold) > maxW && line) { lines.push(line); line = w; } else line = t;
        }
        if (line) lines.push(line);
        return lines;
      },
      text: function (x, y, s, o) {
        o = o || {}; var size = o.size || 10, bold = !!o.bold;
        if (o.align === 'right') x -= width(s, size, bold);
        else if (o.align === 'center') x -= width(s, size, bold) / 2;
        cur.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + n(size) + ' Tf ' + col(o.color || [20, 20, 20]) + ' rg ' +
          n(x) + ' ' + n(PH - y) + ' Td (' + esc(s) + ') Tj ET');
        return doc;
      },
      rect: function (x, y, w, h, o) {
        o = o || {};
        if (o.fill) cur.push(col(o.fill) + ' rg ' + n(x) + ' ' + n(PH - y - h) + ' ' + n(w) + ' ' + n(h) + ' re f');
        if (o.stroke) cur.push(col(o.stroke) + ' RG ' + n(o.lineWidth || 0.5) + ' w ' + n(x) + ' ' + n(PH - y - h) + ' ' + n(w) + ' ' + n(h) + ' re S');
        return doc;
      },
      line: function (x1, y1, x2, y2, o) {
        o = o || {};
        cur.push(col(o.color || [200, 200, 200]) + ' RG ' + n(o.width || 0.5) + ' w ' + n(x1) + ' ' + n(PH - y1) + ' m ' + n(x2) + ' ' + n(PH - y2) + ' l S');
        return doc;
      },
      pageCount: function () { return pages.length; },
      setPage: function (i) { cur = pages[i]; return doc; },
      output: function () {
        var objs = [];
        objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        objs[5] = '<< /Title (' + esc(String(opt.title || 'Invoice').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E]/g, '')) + ') /Producer (Locum Tally free invoice generator, locumtally.app) >>';
        var kids = [], next = 6;
        pages.forEach(function (ops) {
          var content = ops.join('\n');
          var pId = next++, cId = next++;
          objs[pId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cId + ' 0 R >>';
          objs[cId] = '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream';
          kids.push(pId + ' 0 R');
        });
        objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
        var out = '%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n', offs = [];
        // header bytes: the 4 high chars are written as single bytes below
        for (var i = 1; i < objs.length; i++) { offs[i] = out.length; out += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
        var xref = out.length;
        out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
        for (i = 1; i < objs.length; i++) out += ('0000000000' + offs[i]).slice(-10) + ' 00000 n \n';
        out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
        var bytes = new Uint8Array(out.length);
        for (i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
        return bytes;
      }
    };
    return doc;
  }
  var api = { create: create, width: width, codes: codes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LTPdf = api;
})(this);
