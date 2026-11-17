/**
 * TimPriv.gs — Backend Dashboard PRIVATE untuk Laporan Tim (TDP & TDM).
 * Dipanggil frontend (pageEmt) lewat google.script.run; token selalu argumen pertama.
 *
 *   timPrivDaftar(token, mod)                 -> {kedatangan:[], harian:[{tglIso,tanggal,laporan:[]}], kepulangan:[]}
 *   timPrivDetail(token, mod, jenis, id)      -> {nama, status, form, ringkas:[[label,nilai]], detail:{...}|null}
 *   timPrivPdf(token, dok)                    -> {nama, base64}
 *
 * Memakai ulang helper yang sudah ada: emtRun_ (Code.gs), validateSession_, modSheets_, Utils.gs.
 * Nama kolom dicocokkan secara toleran (pick_), sehingga tidak rusak bila nama kolom berbeda sedikit.
 * Semua fungsi memakai awalan "timPriv" agar TIDAK bentrok dengan emtPriv* yang mungkin sudah ada.
 */

// ---------- Pembantu ----------
function timMod_(mod) { return String(mod || '').toUpperCase() === 'TDP' ? 'TDP' : 'TDM'; }

// Ambil nilai pertama yang tersedia dari daftar kemungkinan nama kolom
function pick_(r, names, dflt) {
  for (var i = 0; i < names.length; i++) {
    var v = r[names[i]];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return dflt === undefined ? '' : dflt;
}
function hapus_(r) { var d = r.Is_Deleted; return d === true || /^(1|true|ya|y)$/i.test(String(d || '')); }

// Isi formulir lengkap disimpan sebagai JSON di salah satu kolom (Detail_JSON / Detail / Isi_Form / ...)
function detailJson_(r) {
  var kunci = ['Detail_JSON', 'Detail', 'Data_JSON', 'Isi_Form', 'Isi_JSON', 'Payload', 'Form_JSON'];
  var raw = '';
  for (var i = 0; i < kunci.length && !raw; i++) if (r[kunci[i]]) raw = r[kunci[i]];
  if (!raw) {
    for (var k in r) { if (/detail|json|payload/i.test(k) && r[k] && typeof r[k] === 'string') { raw = r[k]; break; } }
  }
  if (!raw) return null;
  try { var o = JSON.parse(String(raw)); return (o && typeof o === 'object') ? o : null; } catch (e) { return null; }
}

// Lingkup wilayah: Super Admin & Admin Provinsi = semua; peran lain = kabupaten sendiri
function timScope_(u) {
  var tinggi = u.role === ROLE.SUPER || u.role === ROLE.PROV;
  return function (idKab) {
    if (tinggi) return true;
    return !!u.idKabupaten && String(idKab) === String(u.idKabupaten);
  };
}

// Muat semua data tim untuk satu modul; sumber sheet dari modSheets_(mod)
function timMuat_(mod) {
  var sh = modSheets_(mod);
  var tim = {};
  readAll_(sh.tim).forEach(function (t) {
    if (hapus_(t)) return;
    tim[t.Kode_Tim] = t;
  });
  return { sh: sh, tim: tim };
}
function timInfo_(tim, r) {
  var t = tim[r.Kode_Tim] || {};
  return {
    kodeTim: r.Kode_Tim || t.Kode_Tim || '',
    namaTim: pick_(r, ['Nama_Tim'], t.Nama_Tim || ''),
    idKab: pick_(r, ['ID_Kabupaten'], t.ID_Kabupaten || ''),
    kab: pick_(r, ['Kabupaten'], t.Kabupaten || '')
  };
}
function selisihHari_(a, b) {
  var d1 = parseDateSafe_(a), d2 = parseDateSafe_(b);
  if (!d1 || !d2) return '';
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000)) + 1;
}

// ---------- DAFTAR ----------
function timPrivDaftar(token, mod) {
  return emtRun_('timPrivDaftar', token, function (u) {
    mod = timMod_(mod);
    var ok = timScope_(u);
    var M = timMuat_(mod), sh = M.sh;

    // Kedatangan
    var kedRows = readAll_(sh.kedatangan).filter(function (r) { return !hapus_(r); });
    var tglDatang = {}; // Kode_Tim -> tanggal kedatangan terakhir (untuk lama tugas)
    var ked = [];
    kedRows.forEach(function (r) {
      var ti = timInfo_(M.tim, r);
      if (!ok(ti.idKab)) return;
      var t = M.tim[ti.kodeTim] || {};
      var tgl = r.Tgl_Kedatangan;
      if (!tglDatang[ti.kodeTim] || fmtIso_(tgl) > fmtIso_(tglDatang[ti.kodeTim])) tglDatang[ti.kodeTim] = tgl;
      var nmKej = pick_(r, ['Nama_Kejadian', 'Jenis_Bencana', 'Nama_Bencana_Teks'], '');
      ked.push({
        id: r.ID_Record, kodeTim: ti.kodeTim, namaTim: ti.namaTim, kejadian: nmKej,
        tautan: r.Status_Tautan_Kejadian || '', tgl: fmtDate_(tgl), tglIso: fmtIso_(tgl),
        kabupaten: ti.kab, kecamatan: r.Kecamatan || '', personel: toInt_(r.Total_Personel),
        statusTim: t.Status_Tim || '', status: r.Status_Data || ''
      });
    });
    ked.sort(function (a, b) { return a.tglIso < b.tglIso ? 1 : a.tglIso > b.tglIso ? -1 : 0; });

    // Harian (dikelompokkan per tanggal)
    var grup = {};
    readAll_(sh.harian).forEach(function (r) {
      if (hapus_(r)) return;
      var ti = timInfo_(M.tim, r);
      if (!ok(ti.idKab)) return;
      var iso = fmtIso_(r.Tanggal);
      if (!grup[iso]) grup[iso] = { tglIso: iso, tanggal: fmtDate_(r.Tanggal), laporan: [] };
      grup[iso].laporan.push({
        id: r.ID_Record, kodeTim: ti.kodeTim, namaTim: ti.namaTim, kabupaten: ti.kab,
        pasien: toInt_(pick_(r, ['Jml_Pasien_Dirawat', 'Jml_Penerima_Layanan', 'Jml_Dilayani', 'Jml_Pasien'], 0)) || 0,
        rujukan: toInt_(pick_(r, ['Jml_Rujukan', 'Jml_Kasus_Rujukan'], 0)) || 0,
        status: r.Status_Data || ''
      });
    });
    var harian = Object.keys(grup).sort().reverse().map(function (k) {
      var g = grup[k];
      g.totalPasien = g.laporan.reduce(function (a, x) { return a + x.pasien; }, 0);
      return g;
    });

    // Kepulangan
    var kep = [];
    if (sh.kepulangan) {
      readAll_(sh.kepulangan).forEach(function (r) {
        if (hapus_(r)) return;
        var ti = timInfo_(M.tim, r);
        if (!ok(ti.idKab)) return;
        var tglP = pick_(r, ['Tgl_Kepulangan', 'Tanggal_Kepulangan', 'Tanggal'], '');
        var lama = toInt_(pick_(r, ['Lama_Tugas', 'Lama_Penugasan', 'Lama_Tugas_Hari'], ''));
        if (lama === null) lama = selisihHari_(tglDatang[ti.kodeTim], tglP);
        kep.push({
          id: r.ID_Record, kodeTim: ti.kodeTim, namaTim: ti.namaTim, kabupaten: ti.kab,
          tgl: fmtDate_(tglP), tglIso: fmtIso_(tglP), lama: lama,
          alasan: pick_(r, ['Alasan_Pulang', 'Alasan_Kepulangan', 'Alasan'], ''), status: r.Status_Data || ''
        });
      });
      kep.sort(function (a, b) { return a.tglIso < b.tglIso ? 1 : a.tglIso > b.tglIso ? -1 : 0; });
    }

    return { kedatangan: ked, harian: harian, kepulangan: kep };
  });
}

// ---------- DETAIL ----------
function timPrivDetail(token, mod, jenis, id) {
  return emtRun_('timPrivDetail', token, function (u) {
    mod = timMod_(mod);
    var ok = timScope_(u);
    var M = timMuat_(mod), sh = M.sh;
    var peta = { kedatangan: [sh.kedatangan, 'f1', 'Form 1 Kedatangan'], harian: [sh.harian, 'f2', 'Laporan Harian'], kepulangan: [sh.kepulangan, 'f3', 'Form 3 Kepulangan'] };
    var p = peta[jenis];
    if (!p || !p[0]) validasi_('Jenis laporan tidak dikenal.');
    var r = null;
    readAll_(p[0]).some(function (x) { if (String(x.ID_Record) === String(id) && !hapus_(x)) { r = x; return true; } return false; });
    if (!r) validasi_('Laporan tidak ditemukan.');
    var ti = timInfo_(M.tim, r);
    if (!ok(ti.idKab)) aksesDitolak_('Laporan di luar wilayah Anda.');

    var ring = [['ID Laporan', r.ID_Record], ['Kode Tim', ti.kodeTim], ['Nama Tim', ti.namaTim], ['Kabupaten', ti.kab || '-']];
    if (jenis === 'kedatangan') {
      ring.push(['Kejadian', pick_(r, ['Nama_Kejadian', 'Jenis_Bencana', 'Nama_Bencana_Teks'], '-')],
        ['Tautan RHA', r.Status_Tautan_Kejadian === 'TERTAUT' ? 'Tertaut' : 'Belum tertaut'],
        ['Tanggal Kedatangan', fmtDate_(r.Tgl_Kedatangan) || '-'], ['Kecamatan', r.Kecamatan || '-'],
        ['Total Personel', r.Total_Personel === '' ? '-' : r.Total_Personel],
        ['Focal Point', r.Nama_Focal_Point || '-'], ['Kontak Focal Point', r.Kontak_Focal_Point || '-']);
    } else if (jenis === 'harian') {
      ring.push(['Tanggal', fmtDate_(r.Tanggal) || '-'],
        [mod === 'TDP' ? 'Penerima Layanan' : 'Pasien Dirawat', pick_(r, ['Jml_Pasien_Dirawat', 'Jml_Penerima_Layanan', 'Jml_Dilayani', 'Jml_Pasien'], '-')],
        ['Rujukan', pick_(r, ['Jml_Rujukan', 'Jml_Kasus_Rujukan'], '-')],
        ['Kendala', r.Kendala || '-'], ['Keterangan', r.Keterangan || '-']);
    } else {
      ring.push(['Tanggal Kepulangan', fmtDate_(pick_(r, ['Tgl_Kepulangan', 'Tanggal_Kepulangan', 'Tanggal'], '')) || '-'],
        ['Alasan Pulang', pick_(r, ['Alasan_Pulang', 'Alasan_Kepulangan', 'Alasan'], '-')], ['Keterangan', r.Keterangan || '-']);
    }
    ring.push(['Status Data', r.Status_Data || '-']);
    var detail = detailJson_(r);
    logAudit_(u, 'LIHAT_' + mod, 'Laporan ' + (mod === 'TDP' ? 'TDP' : 'TDM'), r.ID_Record, 'OK');
    return {
      nama: ti.namaTim + ' \u2014 ' + p[2], status: r.Status_Data || '', form: p[1],
      ringkas: ring.map(function (x) { return [x[0], x[1] === null || x[1] === undefined || x[1] === '' ? '-' : String(x[1])]; }),
      detail: detail
    };
  });
}

// ---------- PDF ----------
// dok = {nama, judul, sub, sections:[{h, blocks:[{header:bool, rows:[[...]]}]}]}  (struktur sama dengan emtKirimPdf di frontend)
function timPrivPdf(token, dok) {
  return emtRun_('timPrivPdf', token, function (u) {
    if (!dok || typeof dok !== 'object' || !dok.sections) validasi_('Dokumen tidak valid.');
    function e(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    var h = '<html><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,sans-serif;font-size:10pt;color:#111}h1{font-size:15pt;margin:0 0 2px}.sub{color:#555;font-size:9pt;margin-bottom:12px}' +
      'h2{font-size:11pt;background:#e8f1f8;padding:4px 6px;margin:14px 0 4px}table{border-collapse:collapse;width:100%;margin-bottom:6px}' +
      'td,th{border:1px solid #999;padding:3px 5px;vertical-align:top;font-size:9pt}th{background:#f1f1f1;text-align:left}' +
      '</style></head><body><h1>' + e(dok.judul) + '</h1><div class="sub">' + e(dok.sub) + ' \u00b7 Dicetak ' + e(nowWita_()) + ' WITA</div>';
    dok.sections.slice(0, 300).forEach(function (s) {
      h += '<h2>' + e(s.h) + '</h2>';
      (s.blocks || []).forEach(function (b) {
        var rows = b.rows || [];
        if (!rows.length) return;
        h += '<table>';
        rows.forEach(function (row, i) {
          var th = b.header && i === 0;
          h += '<tr>' + row.map(function (c) { return '<' + (th ? 'th' : 'td') + '>' + e(c) + '</' + (th ? 'th' : 'td') + '>'; }).join('') + '</tr>';
        });
        h += '</table>';
      });
    });
    h += '</body></html>';
    var nama = String(dok.nama || 'Laporan').replace(/[^A-Za-z0-9_\-]/g, '_') + '.pdf';
    var pdf = Utilities.newBlob(h, 'text/html', 'x.html').getAs('application/pdf');
    logAudit_(u, 'PDF_TIM', 'Laporan Tim', nama, 'OK');
    return { nama: nama, base64: Utilities.base64Encode(pdf.getBytes()) };
  });
}
