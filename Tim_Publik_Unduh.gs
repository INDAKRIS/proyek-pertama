/**
 * Tim_Publik_Unduh.gs — TAMBAHKAN sebagai berkas baru (tidak mengubah berkas lain).
 * Dashboard Publik, menu Tim Darurat Medis (TDM) & Tim Dukungan Psikososial (TDP):
 * daftar + unduh dokumen PDF untuk Laporan Kedatangan, Laporan Harian, dan Laporan Kepulangan.
 *
 * Keamanan: halaman publik tanpa login, jadi PDF dibuat SERVER dari data sheet (klien tidak
 * mengirim isi dokumen). Hanya kolom yang memang sudah tampil publik yang dipakai: tanpa
 * kontak focal point, tanpa PIN, tanpa isian formulir lengkap (JSON).
 */

function timPubJenis_(mod, jenis) {
  var tdp = mod === 'TDP';
  var peg = tdp ? 'Penerima Layanan' : 'Pasien';
  var rjk = tdp ? 'Kasus Dirujuk' : 'Rujukan';
  var d = {
    kedatangan: { judul: 'Laporan Kedatangan', kolom: ['ID Laporan', 'Kode Tim', 'Nama Tim', 'Kejadian', 'Tgl Kedatangan', 'Kabupaten', 'Kecamatan', 'Personel', 'Status Data'] },
    harian:     { judul: 'Laporan Harian',     kolom: ['ID Laporan', 'Kode Tim', 'Nama Tim', 'Kabupaten', 'Tanggal', peg, rjk, 'Status Data'] },
    kepulangan: { judul: 'Laporan Kepulangan', kolom: ['ID Laporan', 'Kode Tim', 'Nama Tim', 'Kabupaten', 'Tgl Kepulangan', 'Lama Tugas (hari)', 'Alasan Pulang', 'Status Data'] }
  }[jenis];
  if (!d) validasi_('Jenis laporan tidak dikenal.');
  return d;
}

// Baris tabel (array of array) untuk satu jenis laporan, terbaru di atas. idRecord (opsional) = satu laporan saja.
function timPubBaris_(mod, jenis, idRecord) {
  var sh = modSheets_(mod), tim = {}, rows = [], iso = [];
  readAll_(sh.tim).forEach(function (r) { if (!r.Is_Deleted) tim[r.Kode_Tim] = { nama: r.Nama_Tim, kab: r.Kabupaten }; });
  readAll_(sh.kedatangan).filter(function (r) { return !r.Is_Deleted; })
    .sort(function (a, b) { return String(a.Created_At).localeCompare(String(b.Created_At)); })
    .forEach(function (r) {
      var t = tim[r.Kode_Tim] || (tim[r.Kode_Tim] = {});
      t.nama = r.Nama_Tim || t.nama; t.kab = r.Kabupaten || t.kab;
    });
  var T = function (kode) { return tim[kode] || {}; };
  var pilih = function (r) { return !r.Is_Deleted && (!idRecord || r.ID_Record === idRecord); };
  var list = [];
  if (jenis === 'kedatangan') {
    readAll_(sh.kedatangan).filter(pilih).forEach(function (r) {
      list.push({ k: String(r.Created_At), row: [r.ID_Record, r.Kode_Tim, r.Nama_Tim,
        r.Status_Tautan_Kejadian === 'TERTAUT' ? (r.Nama_Kejadian + ' — ' + fmtDate_(r.Tanggal_Kejadian)) : (r.Nama_Bencana_Teks || ''),
        fmtDate_(r.Tgl_Kedatangan), r.Kabupaten, r.Kecamatan || '', toInt_(r.Total_Personel) || 0, r.Status_Data] });
    });
  } else if (jenis === 'harian') {
    readAll_(sh.harian).filter(pilih).forEach(function (r) {
      list.push({ k: String(fmtIso_(r.Tanggal)) + String(r.Created_At), row: [r.ID_Record, r.Kode_Tim, T(r.Kode_Tim).nama || r.Kode_Tim, T(r.Kode_Tim).kab || '',
        fmtDate_(r.Tanggal), toInt_(r.Jml_Pasien_Dirawat) || 0, toInt_(r.Jml_Rujukan) || 0, r.Status_Data] });
    });
  } else {
    readAll_(sh.kepulangan).filter(pilih).forEach(function (r) {
      list.push({ k: String(fmtIso_(r.Tgl_Kepulangan)) + String(r.Created_At), row: [r.ID_Record, r.Kode_Tim, T(r.Kode_Tim).nama || r.Kode_Tim, T(r.Kode_Tim).kab || '',
        fmtDate_(r.Tgl_Kepulangan), toInt_(r.Lama_Tugas), r.Alasan_Pulang || '', r.Status_Data] });
    });
  }
  list.sort(function (a, b) { return b.k.localeCompare(a.k); });
  return list.map(function (x) { return x.row.map(function (c) { return c === null || c === undefined ? '' : c; }); });
}

// Daftar untuk tab Laporan Harian / Kepulangan di halaman publik
function getLaporanPublik(mod, jenis) {
  try {
    mod = mod === 'TDP' ? 'TDP' : 'TDM';
    var d = timPubJenis_(mod, jenis);
    var key = modCfg_(mod).cache + 'pubdaftar::' + jenis;
    var hit = cacheGet_(key);
    if (hit) return ok_(hit);
    var out = { judul: d.judul, kolom: d.kolom, baris: timPubBaris_(mod, jenis, null) };
    cachePut_(key, out, 300);
    return ok_(out);
  } catch (e) { return galatUmum_(e, 'getLaporanPublik'); }
}

// PDF: seluruh daftar satu jenis laporan, atau satu laporan bila idRecord diisi
function timPublikPdf(mod, jenis, idRecord) {
  try {
    mod = mod === 'TDP' ? 'TDP' : 'TDM';
    var d = timPubJenis_(mod, jenis);
    var id = idRecord ? sanitizeText_(idRecord, 40) : '';
    var baris = timPubBaris_(mod, jenis, id);
    if (!baris.length) validasi_(id ? 'Laporan tidak ditemukan.' : 'Belum ada data untuk diunduh.');
    if (baris.length > 3000) validasi_('Data terlalu banyak untuk satu PDF.');

    var namaMenu = mod === 'TDM' ? 'Tim Darurat Medis' : 'Tim Dukungan Psikososial';
    var e = function (s) {
      return String(s === null || s === undefined ? '' : s).slice(0, 600)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var TD = ' style="border:1px solid #444;padding:3px 5px;font-size:9px;vertical-align:top;"';
    var TH = ' style="border:1px solid #444;padding:3px 5px;font-size:9px;vertical-align:top;background-color:#dfe8f2;text-align:left;"';
    var html = '<html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;color:#111;">' +
      '<div style="font-size:15px;font-weight:bold;">' + e(d.judul + ' — ' + namaMenu) + '</div>' +
      '<div style="font-size:10px;color:#444;margin:2px 0 8px;">' + (id ? 'ID Laporan: ' + e(id) : 'Jumlah laporan: ' + baris.length) + '</div>' +
      '<div style="font-size:9px;color:#666;margin-bottom:10px;">Dicetak dari INDAKRIS NTT (Dashboard Publik) pada ' + e(Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm')) + ' WITA</div>' +
      '<table border="1" cellpadding="3" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;">' +
      '<tr>' + d.kolom.map(function (k) { return '<th' + TH + '>' + e(k) + '</th>'; }).join('') + '</tr>' +
      baris.map(function (r) { return '<tr>' + r.map(function (c) { return '<td' + TD + '>' + (e(c) || '&nbsp;') + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</table></body></html>';

    var blob = Utilities.newBlob(html, 'text/html', 'laporan.html').getAs('application/pdf');
    var nama = (id ? mod + '_' + id : mod + '_' + d.judul.replace(/\s+/g, '_') + '_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd'))
      .replace(/[^A-Za-z0-9_\-]+/g, '_').slice(0, 80) + '.pdf';
    return ok_({ nama: nama, base64: Utilities.base64Encode(blob.getBytes()) });
  } catch (err) { return galatUmum_(err, 'timPublikPdf'); }
}

// ---------------------------------------------------------------------------
// PDF isi lengkap satu laporan (Form 1/2/3) untuk FOCAL POINT, dipanggil setelah laporan disimpan.
// Wajib Kode Tim + PIN yang benar (sama seperti getDetailLaporanTim). Klien mengirim STRUKTUR dokumen
// (judul, bagian, tabel), server meng-escape semuanya lalu mengonversinya ke PDF (base64).
// dok = { nama, judul, sub, sections: [ { h, blocks: [ { header: true|false, rows: [[sel, ...], ...] } ] } ] }
// ---------------------------------------------------------------------------
function timPdfFocal(mod, kodeTim, pin, dok) {
  try {
    mod = mod === 'TDP' ? 'TDP' : 'TDM';
    var tim = timByPin_(modSheets_(mod), kodeTim, pin);
    if (!tim) return err_('Kode tim atau PIN salah.', 'AKSES');
    dok = dok || {};
    var sections = dok.sections || [];
    if (!sections.length) validasi_('Tidak ada isi laporan untuk diunduh.');
    if (sections.length > 200) validasi_('Dokumen terlalu besar.');
    var jml = 0;
    sections.forEach(function (s) { (s.blocks || []).forEach(function (b) { jml += (b.rows || []).length; }); });
    if (jml > 3000) validasi_('Dokumen terlalu besar.');

    var e = function (s) {
      return String(s === null || s === undefined ? '' : s).slice(0, 1500)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var TD = ' style="border:1px solid #444;padding:3px 5px;font-size:9px;vertical-align:top;"';
    var TH = ' style="border:1px solid #444;padding:3px 5px;font-size:9px;vertical-align:top;background-color:#dfe8f2;text-align:left;"';
    var html = '<html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;color:#111;">' +
      '<div style="font-size:15px;font-weight:bold;">' + e(dok.judul || 'Laporan Tim') + '</div>' +
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
    var nama = String(dok.nama || (mod + '_Laporan')).replace(/[^A-Za-z0-9_\-]+/g, '_').slice(0, 80) + '.pdf';
    return ok_({ nama: nama, base64: Utilities.base64Encode(blob.getBytes()) });
  } catch (err) { return galatUmum_(err, 'timPdfFocal'); }
}
