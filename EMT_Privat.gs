/**
 * EMT_Privat.gs — TAMBAHKAN sebagai berkas baru.
 * Data Laporan EMT di Dashboard Privat, bersumber dari sheet TDM_* (formulir Dashboard Publik).
 * Lingkup: SUPER/PROVINSI = semua; level lain = tim di kabupaten akun sendiri.
 */

function emtPrivCtx_(user, mod) {
  var sh = modSheets_(mod), ctx = { sh: sh, user: user, namaUser: '', tim: {} };
  if (user.idKabupaten) {
    try {
      var k = readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Kabupaten', 600).filter(function (r) { return r.ID_Kabupaten === user.idKabupaten; })[0];
      ctx.namaUser = k ? String(k.Nama_Wilayah).toLowerCase().trim() : '';
    } catch (e) {}
  }
  // peta Kode_Tim -> identitas tim (dari sheet Tim, ditimpa data kedatangan terbaru)
  readAll_(sh.tim).forEach(function (r) {
    if (r.Is_Deleted) return;
    ctx.tim[r.Kode_Tim] = { namaTim: r.Nama_Tim, idKab: r.ID_Kabupaten, kab: r.Kabupaten, status: r.Status_Tim };
  });
  readAll_(sh.kedatangan).filter(function (r) { return !r.Is_Deleted; })
    .sort(function (a, b) { return String(a.Created_At).localeCompare(String(b.Created_At)); })
    .forEach(function (r) {
      var t = ctx.tim[r.Kode_Tim] || (ctx.tim[r.Kode_Tim] = { status: '' });
      t.namaTim = r.Nama_Tim || t.namaTim;
      if (r.ID_Kabupaten) t.idKab = r.ID_Kabupaten;
      if (r.Kabupaten) t.kab = r.Kabupaten;
    });
  return ctx;
}

function emtPrivBoleh_(ctx, idKab, namaKab) {
  var u = ctx.user;
  if (u.role === ROLE.SUPER || u.role === ROLE.PROV) return true;
  if (!u.idKabupaten) return false;
  if (idKab) return String(idKab) === String(u.idKabupaten);
  return !!namaKab && !!ctx.namaUser && String(namaKab).toLowerCase().trim() === ctx.namaUser;
}
function emtPrivBolehTim_(ctx, kode) {
  var t = ctx.tim[kode];
  if (!t) return ctx.user.role === ROLE.SUPER || ctx.user.role === ROLE.PROV;
  return emtPrivBoleh_(ctx, t.idKab, t.kab);
}

// Daftar: kedatangan + harian (dikelompokkan per tanggal) + kepulangan
function emtPrivDaftar(token, mod) {
  try {
    var user = requireSession_(token, null, null);
    mod = mod === 'TDP' ? 'TDP' : 'TDM';
    var ctx = emtPrivCtx_(user, mod), sh = ctx.sh;

    var ked = readAll_(sh.kedatangan).filter(function (r) { return !r.Is_Deleted && emtPrivBoleh_(ctx, r.ID_Kabupaten, r.Kabupaten); })
      .sort(function (a, b) { return String(b.Created_At).localeCompare(String(a.Created_At)); })
      .map(function (r) {
        var t = ctx.tim[r.Kode_Tim] || {};
        return {
          id: r.ID_Record, kodeTim: r.Kode_Tim, namaTim: r.Nama_Tim, tipe: r.Tipe_Tim || '',
          kejadian: r.Status_Tautan_Kejadian === 'TERTAUT' ? (r.Nama_Kejadian + ' — ' + fmtDate_(r.Tanggal_Kejadian)) : (r.Nama_Bencana_Teks || ''),
          tautan: r.Status_Tautan_Kejadian, tgl: fmtDate_(r.Tgl_Kedatangan), tglIso: fmtIso_(r.Tgl_Kedatangan),
          kabupaten: r.Kabupaten, kecamatan: r.Kecamatan || '', personel: toInt_(r.Total_Personel) || 0,
          statusTim: t.status || 'Bertugas', status: r.Status_Data
        };
      });

    var grup = {};
    readAll_(sh.harian).filter(function (r) { return !r.Is_Deleted && emtPrivBolehTim_(ctx, r.Kode_Tim); }).forEach(function (r) {
      var iso = fmtIso_(r.Tanggal) || '-', t = ctx.tim[r.Kode_Tim] || {};
      var g = grup[iso] || (grup[iso] = { tglIso: iso, tanggal: fmtDate_(r.Tanggal) || '-', laporan: [], totalPasien: 0 });
      var pas = toInt_(r.Jml_Pasien_Dirawat) || 0;
      g.totalPasien += pas;
      g.laporan.push({ id: r.ID_Record, kodeTim: r.Kode_Tim, namaTim: t.namaTim || r.Kode_Tim, kabupaten: t.kab || '', pasien: pas, rujukan: toInt_(r.Jml_Rujukan) || 0, status: r.Status_Data });
    });
    var harian = Object.keys(grup).sort().reverse().map(function (k) { return grup[k]; });

    var kep = readAll_(sh.kepulangan).filter(function (r) { return !r.Is_Deleted && emtPrivBolehTim_(ctx, r.Kode_Tim); })
      .sort(function (a, b) { return String(fmtIso_(b.Tgl_Kepulangan)).localeCompare(String(fmtIso_(a.Tgl_Kepulangan))); })
      .map(function (r) {
        var t = ctx.tim[r.Kode_Tim] || {};
        return { id: r.ID_Record, kodeTim: r.Kode_Tim, namaTim: t.namaTim || r.Kode_Tim, kabupaten: t.kab || '', tgl: fmtDate_(r.Tgl_Kepulangan), tglIso: fmtIso_(r.Tgl_Kepulangan), lama: toInt_(r.Lama_Tugas), alasan: r.Alasan_Pulang || '', status: r.Status_Data };
      });

    return ok_({ mod: mod, kedatangan: ked, harian: harian, kepulangan: kep });
  } catch (e) { return galatUmum_(e, 'emtPrivDaftar'); }
}

// Isi satu laporan (ringkasan + isian formulir lengkap bila ada)
function emtPrivDetail(token, mod, jenis, idRecord) {
  try {
    var user = requireSession_(token, null, null);
    mod = mod === 'TDP' ? 'TDP' : 'TDM';
    var ctx = emtPrivCtx_(user, mod), sh = ctx.sh, id = sanitizeText_(idRecord, 40);
    var D = {
      kedatangan: { sheet: sh.kedatangan, det: sh.kdDetail, form: 'f1', nama: 'Form 1 Kedatangan', kol: [['Kode Tim', 'Kode_Tim'], ['Nama Tim', 'Nama_Tim'], ['Tipe Tim', 'Tipe_Tim'], ['Jenis Penugasan', 'Jenis_Penugasan'], ['Kejadian', 'Nama_Kejadian'], ['Nama Bencana (teks)', 'Nama_Bencana_Teks'], ['Tgl Kedatangan', 'Tgl_Kedatangan'], ['Kabupaten', 'Kabupaten'], ['Kecamatan', 'Kecamatan'], ['Total Personel', 'Total_Personel'], ['Focal Point', 'Nama_Focal_Point'], ['Kontak Focal Point', 'Kontak_Focal_Point']] },
      harian: { sheet: sh.harian, det: sh.hrDetail, form: 'f2', nama: 'Form 2 Laporan Harian', kol: [['Kode Tim', 'Kode_Tim'], ['Tanggal', 'Tanggal'], ['Pasien Dirawat', 'Jml_Pasien_Dirawat'], ['Rujukan', 'Jml_Rujukan'], ['Persediaan Tersisa (%)', 'Jml_Persediaan_Tersisa'], ['Kendala', 'Kendala'], ['Keterangan', 'Keterangan']] },
      kepulangan: { sheet: sh.kepulangan, det: sh.kpDetail, form: 'f3', nama: 'Form 3 Kepulangan', kol: [['Kode Tim', 'Kode_Tim'], ['Tgl Kepulangan', 'Tgl_Kepulangan'], ['Lama Tugas (hari)', 'Lama_Tugas'], ['Alasan Pulang', 'Alasan_Pulang'], ['Keterangan', 'Keterangan']] }
    }[jenis];
    if (!D) validasi_('Jenis laporan tidak dikenal.');
    var r = readAll_(D.sheet).filter(function (x) { return x.ID_Record === id && !x.Is_Deleted; })[0];
    if (!r) validasi_('Laporan tidak ditemukan.');
    var boleh = jenis === 'kedatangan' ? emtPrivBoleh_(ctx, r.ID_Kabupaten, r.Kabupaten) : emtPrivBolehTim_(ctx, r.Kode_Tim);
    if (!boleh) aksesDitolak_('Laporan ini di luar wilayah Anda.');
    var ringkas = D.kol.map(function (k) {
      var v = r[k[1]];
      return [k[0], /^(Tgl_|Tanggal$)/.test(k[1]) ? fmtDate_(v) : (v === null || v === undefined ? '' : String(v))];
    }).filter(function (x) { return x[1] !== ''; });
    var detail = null;
    var d = readAll_(D.det).filter(function (x) { return x.ID_Record === id; })[0];
    if (d) { try { detail = JSON.parse(d.Data_JSON); } catch (e) { detail = null; } }
    return ok_({ id: id, form: D.form, nama: D.nama, status: r.Status_Data, ringkas: ringkas, detail: detail });
  } catch (e) { return galatUmum_(e, 'emtPrivDetail'); }
}

// ---------------------------------------------------------------------------
// Ekspor PDF Laporan EMT.
// Klien mengirim STRUKTUR dokumen (bukan HTML mentah), server meng-escape semuanya lalu
// mengonversi ke PDF dan mengembalikan base64 untuk diunduh klien.
// dok = { nama, judul, sub, sections: [ { h, blocks: [ { header: true|false, rows: [[sel, sel, ...], ...] } ] } ] }
// Server hanya memformat data yang sudah dimiliki klien (tidak membaca sheet), jadi cukup cek sesi.
// ---------------------------------------------------------------------------
function emtPrivPdf(token, dok) {
  try {
    requireSession_(token, null, null);
    dok = dok || {};
    var sections = dok.sections || [];
    if (!sections.length) validasi_('Tidak ada data untuk diekspor.');
    if (sections.length > 400) validasi_('Data terlalu banyak untuk satu PDF. Persempit filter tanggal.');
    var jml = 0;
    sections.forEach(function (s) { (s.blocks || []).forEach(function (b) { jml += (b.rows || []).length; }); });
    if (jml > 6000) validasi_('Data terlalu banyak untuk satu PDF. Persempit filter tanggal.');

    var e = function (s) {
      return String(s === null || s === undefined ? '' : s).slice(0, 600)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var TD = ' style="border:1px solid #444;padding:3px 5px;font-size:9px;vertical-align:top;"';
    var TH = ' style="border:1px solid #444;padding:3px 5px;font-size:9px;vertical-align:top;background-color:#dfe8f2;text-align:left;"';

    var html = '<html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;color:#111;">' +
      '<div style="font-size:15px;font-weight:bold;">' + e(dok.judul || 'Laporan EMT') + '</div>' +
      '<div style="font-size:10px;color:#444;margin:2px 0 8px;">' + e(dok.sub || '') + '</div>' +
      '<div style="font-size:9px;color:#666;margin-bottom:10px;">Dicetak dari INDAKRIS NTT pada ' + e(Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm')) + ' WITA</div>';

    sections.forEach(function (s) {
      html += '<div style="font-size:11px;font-weight:bold;margin:12px 0 4px;">' + e(s.h) + '</div>';
      (s.blocks || []).forEach(function (b) {
        var rows = b.rows || [];
        if (!rows.length) return;
        html += '<table border="1" cellpadding="3" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;margin-bottom:6px;">';
        rows.forEach(function (r, i) {
          html += '<tr>' + (r || []).map(function (c) {
            return (b.header && i === 0 ? '<th' + TH : '<td' + TD) + '>' + (e(c) || '&nbsp;') + (b.header && i === 0 ? '</th>' : '</td>');
          }).join('') + '</tr>';
        });
        html += '</table>';
      });
    });
    html += '</body></html>';

    var blob = Utilities.newBlob(html, 'text/html', 'laporan.html').getAs('application/pdf');
    var nama = String(dok.nama || 'Laporan_EMT').replace(/[^A-Za-z0-9_\-]+/g, '_').slice(0, 80) + '.pdf';
    return ok_({ nama: nama, base64: Utilities.base64Encode(blob.getBytes()) });
  } catch (err) { return galatUmum_(err, 'emtPrivPdf'); }
}