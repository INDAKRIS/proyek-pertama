/**
 * Service_Public.gs — Dashboard publik (Berkas A): ringkasan NTT, grafik, daftar 22 kabupaten/kota,
 * halaman wilayah (tabel datar 27 kolom), detail kejadian, cek status laporan.
 * HANYA data berstatus Disetujui + Tampil_Publik yang tampil. Tanpa kolom internal.
 */

function rowsKejadianLayak_() {
  return readAllCached_(CFG.KEY.SS_RHA, 'sheetKejadian').filter(function (r) {
    return r.Status_Verifikasi === 'Disetujui' && (r.Tampil_Publik === true || r.Tampil_Publik === 'TRUE' || r.Tampil_Publik === 'Ya');
  });
}

// [PERUBAHAN RHA] Jumlah peristiwa unik (laporan lintas kabupaten = 1 peristiwa; kejadian lama tanpa ID_Peristiwa = 1 peristiwa sendiri)
function jmlPeristiwa_(rows) {
  var u = {};
  rows.forEach(function (r) { u[peristiwaOf_(r)] = 1; });
  return Object.keys(u).length;
}

function getPublicDashboard(filter) {
  try {
    filter = filter || {};
    var key = CFG.CACHE.PUB + 'dash3::' + JSON.stringify(filter);
    var hit = cacheGet_(key);
    if (hit) return ok_(hit);

    var rows = rowsKejadianLayak_();
    if (filter.tahun) rows = rows.filter(function (r) { return tahunOf_(r.Tgl_Kejadian) === String(filter.tahun); });
    if (filter.jenis) rows = rows.filter(function (r) { return r.Jenis_Bencana === filter.jenis; });

    function sum(k) { return rows.reduce(function (a, r) { return a + (toInt_(r[k]) || 0); }, 0); }
    var totals = {
      kejadian: jmlPeristiwa_(rows), meninggal: sum('Meninggal'), lbRi: sum('LB_RI'), lrRj: sum('LR_RJ'),
      hilang: sum('Hilang'), pengungsi: sum('Pengungsi'),
      terdampakJiwa: sum('Penduduk_Terdampak_Jiwa'), terdampakKK: sum('Penduduk_Terdampak_KK'),
      rsRusak: sum('RS_Rusak_Berat') + sum('RS_Rusak_Sedang') + sum('RS_Rusak_Ringan'),
      puskesmasRusak: sum('Puskesmas_Rusak_Berat') + sum('Puskesmas_Rusak_Sedang') + sum('Puskesmas_Rusak_Ringan'),
      pustuRusak: sum('Pustu_Rusak_Berat') + sum('Pustu_Rusak_Sedang') + sum('Pustu_Rusak_Ringan')
    };

    var byJenis = {};
    var sudahJ = {};
    rows.forEach(function (r) { var p = peristiwaOf_(r); if (sudahJ[p]) return; sudahJ[p] = 1; byJenis[r.Jenis_Bencana] = (byJenis[r.Jenis_Bencana] || 0) + 1; });
    var byJenisArr = Object.keys(byJenis).map(function (k) { return { label: k, nilai: byJenis[k] }; }).sort(function (a, b) { return b.nilai - a.nilai; });

    var byTahun = {};
    var sudahT = {};
    rows.forEach(function (r) { var p = peristiwaOf_(r); if (sudahT[p]) return; sudahT[p] = 1; var t = tahunOf_(r.Tgl_Kejadian); if (t) byTahun[t] = (byTahun[t] || 0) + 1; });
    var byTahunArr = Object.keys(byTahun).sort().slice(-5).map(function (k) { return { label: k, nilai: byTahun[k] }; });

    var byKab = {};
    rows.forEach(function (r) { byKab[r.ID_Kabupaten] = (byKab[r.ID_Kabupaten] || 0) + 1; });
    var kabList = getKabupatenPublik_().kabupaten;
    var namaKab = {};
    kabList.forEach(function (k) { namaKab[k.id] = k.nama; });
    var topKab = Object.keys(byKab).map(function (k) { return { label: namaKab[k] || k, nilai: byKab[k] }; })
      .sort(function (a, b) { return b.nilai - a.nilai; }).slice(0, 10);

    var tim = timBertugasGabungan_();
    var data = {
      totals: totals, byJenis: byJenisArr, byTahun: byTahunArr, topKabupaten: topKab,
      timBertugas: tim, jenisBencana: JENIS_BENCANA_SEED.map(function (j) { return j[0]; }),
      kabupaten: kabList, diperbaruiPada: nowWita_()
    };
    cachePut_(key, data, 300);
    return ok_(data);
  } catch (e) { return galatUmum_(e, 'getPublicDashboard'); }
}

// Ubah isi kolom URL_Logo_Drive (link Drive / ID file / URL https) menjadi URL gambar yang bisa dipakai di <img>
function logoDriveUrl_(u) {
  u = String(u || '').trim();
  if (!u) return '';
  var m = u.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || u.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w200';
  if (/^[a-zA-Z0-9_-]{20,}$/.test(u)) return 'https://drive.google.com/thumbnail?id=' + u + '&sz=w200';
  return /^https:\/\//i.test(u) ? u : '';
}

function getKabupatenPublik_() {
  var hit = cacheGet_(CFG.CACHE.WIL + 'kab::publik2');
  if (hit) return { kabupaten: hit };
  var rows = rowsKejadianLayak_();
  var perKab = {};
  rows.forEach(function (r) {
    var k = r.ID_Kabupaten;
    if (!perKab[k]) perKab[k] = { kejadian: 0, kesehatan: 0, terakhir: '' };
    perKab[k].kejadian++;
    if ((toInt_(r.Meninggal) || 0) + (toInt_(r.LB_RI) || 0) + (toInt_(r.LR_RJ) || 0) + (toInt_(r.Hilang) || 0) + (toInt_(r.Pengungsi) || 0) > 0) perKab[k].kesehatan++;
    var t = String(r.Tgl_Kejadian || '');
    if (t > perKab[k].terakhir) perKab[k].terakhir = t;
  });
  var kab = readAllCached_(CFG.KEY.SS_RHA, 'sheetKabupaten', 600).filter(function (r) { return r.Aktif !== false && r.Aktif !== 'FALSE'; })
    .sort(function (a, b) { return (toInt_(a.Urutan_Tampil) || 99) - (toInt_(b.Urutan_Tampil) || 99); })
    .map(function (r) {
      var k = perKab[r.ID_Kabupaten] || { kejadian: 0, kesehatan: 0, terakhir: '' };
      var siaga = k.terakhir && (Date.now() - parseDateSafe_(k.terakhir).getTime()) < 30 * 86400000;
      return { id: r.ID_Kabupaten, nama: r.Nama_Wilayah, tipe: r.Tipe_Wilayah, pulau: r.Pulau, ibuKota: r.Ibu_Kota, slug: r.Slug, logo: logoDriveUrl_(r.URL_Logo_Drive), kejadian: k.kejadian, kesehatan: k.kesehatan, status: siaga ? 'Siaga' : 'Normal' };
    });
  cachePut_(CFG.CACHE.WIL + 'kab::publik2', kab, 600);
  return { kabupaten: kab };
}

function getKabupatenPublik() {
  try { return ok_(getKabupatenPublik_()); } catch (e) { return galatUmum_(e, 'getKabupatenPublik'); }
}

function diagnosaLogo() {
  var rows = readAll_(getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKabupaten'));
  Logger.log(rows.map(function (r) {
    var raw = r.URL_Logo_Drive;
    return r.Nama_Wilayah + ' | isi=[' + raw + '] | hasil=' + (logoDriveUrl_(raw) || '(KOSONG)');
  }).join('\n'));
}

function bersihkanCacheKabupaten() {
  CacheService.getScriptCache().removeAll([
    CFG.CACHE.WIL + 'kab::publik2',
    CFG.CACHE.PUB + 'dash3::{}'
  ]);
}

// Tabel datar 27 kolom per wilayah (Berkas A bagian 5)
function getDataKabupaten(p) {
  try {
    p = p || {};
    var kab = readAllCached_(CFG.KEY.SS_RHA, 'sheetKabupaten', 600).filter(function (r) { return r.Slug === p.slug || r.ID_Kabupaten === p.idKabupaten; })[0];
    if (!kab) return err_('Wilayah tidak ditemukan.', 'VALIDASI');

    var rows = rowsKejadianLayak_().filter(function (r) { return r.ID_Kabupaten === kab.ID_Kabupaten; });
    if (p.dari) rows = rows.filter(function (r) { var d = fmtIso_(r.Tgl_Kejadian); return d && d >= p.dari; });
    if (p.sampai) rows = rows.filter(function (r) { var d = fmtIso_(r.Tgl_Kejadian); return d && d <= p.sampai; });
    if (p.jenis) rows = rows.filter(function (r) { return r.Jenis_Bencana === p.jenis; });
    if (p.kecamatan) rows = rows.filter(function (r) { return String(r.Kecamatan || '').split(';').map(function (s) { return s.trim(); }).indexOf(p.kecamatan) >= 0; });
    if (p.search) {
      var q = String(p.search).toLowerCase();
      rows = rows.filter(function (r) {
        return ['ID_Kejadian', 'Tahun', 'Jenis_Bencana', 'Kecamatan', 'Penyebab_Kronologis', 'Kabupaten_Kota'].some(function (k) {
          return r[k] !== undefined && r[k] !== null && String(r[k]).toLowerCase().indexOf(q) >= 0;
        });
      });
    }
    rows.sort(function (a, b) { return String(b.Tgl_Kejadian || '').localeCompare(String(a.Tgl_Kejadian || '')) || String(b.ID_Kejadian).localeCompare(String(a.ID_Kejadian)); });

    function agg(k) { return rows.reduce(function (a, r) { return a + (toInt_(r[k]) || 0); }, 0); }
    var ringkas = { kejadian: rows.length, meninggal: agg('Meninggal'), lbRi: agg('LB_RI'), lrRj: agg('LR_RJ'), hilang: agg('Hilang'), pengungsi: agg('Pengungsi') };

    var pageSize = Math.min(Number(p.pageSize) || 10, CFG.PAGESIZE_MAX);
    var page = Math.max(1, Number(p.page) || 1);
    var total = rows.length;
    var slice = rows.slice((page - 1) * pageSize, page * pageSize);

    var baris = slice.map(function (r) {
      return {
        id: r.ID_Kejadian, tahun: tahunOf_(r.Tgl_Kejadian), tgl: fmtDate_(r.Tgl_Kejadian), waktu: sanitizeCell_(r.Waktu_Kejadian || ''),
        kabupaten: kab.Nama_Wilayah, kecamatan: sanitizeCell_(r.Kecamatan || ''), jenis: r.Jenis_Bencana, krisis: r.Status_Krisis || '',
        kronologi: sanitizeCell_(r.Penyebab_Kronologis || ''),
        meninggal: toInt_(r.Meninggal), lbRi: toInt_(r.LB_RI), lrRj: toInt_(r.LR_RJ), hilang: toInt_(r.Hilang), pengungsi: toInt_(r.Pengungsi),
        terdampakJiwa: toInt_(r.Penduduk_Terdampak_Jiwa), terdampakKK: toInt_(r.Penduduk_Terdampak_KK),
        rsB: toInt_(r.RS_Rusak_Berat), rsS: toInt_(r.RS_Rusak_Sedang), rsR: toInt_(r.RS_Rusak_Ringan),
        pkB: toInt_(r.Puskesmas_Rusak_Berat), pkS: toInt_(r.Puskesmas_Rusak_Sedang), pkR: toInt_(r.Puskesmas_Rusak_Ringan),
        puB: toInt_(r.Pustu_Rusak_Berat), puS: toInt_(r.Pustu_Rusak_Sedang), puR: toInt_(r.Pustu_Rusak_Ringan)
      };
    });

    var kecamatanOpts = [];
    rows.forEach(function (r) { String(r.Kecamatan || '').split(';').forEach(function (s) { s = s.trim(); if (s && kecamatanOpts.indexOf(s) < 0) kecamatanOpts.push(s); }); });

    return ok_({
      wilayah: { id: kab.ID_Kabupaten, nama: kab.Nama_Wilayah, slug: kab.Slug, tipe: kab.Tipe_Wilayah },
      rows: baris, ringkasan: ringkas, kecamatanOpts: kecamatanOpts, page: page, pageSize: pageSize, total: total
    });
  } catch (e) { return galatUmum_(e, 'getDataKabupaten'); }
}

function getDisasterDetail(id) {
  try {
    var r = rowsKejadianLayak_().filter(function (x) { return x.ID_Kejadian === id; })[0];
    if (!r) return err_('Kejadian tidak ditemukan atau belum tampil publik.', 'VALIDASI');
    var tim = timPerKejadianGabungan_(id);
    var kabLain = rowsKejadianLayak_().filter(function (x) { return peristiwaOf_(x) === peristiwaOf_(r) && x.ID_Kejadian !== r.ID_Kejadian; })
      .map(function (x) { return x.Kabupaten_Kota; });
    return ok_({
      idPeristiwa: r.ID_Peristiwa || '', kabLain: kabLain,
      id: r.ID_Kejadian, jenis: r.Jenis_Bencana, kategori: r.Kategori_Bencana || '', tgl: fmtDate_(r.Tgl_Kejadian),
      waktu: sanitizeCell_(r.Waktu_Kejadian || ''), kabupaten: r.Kabupaten_Kota, kecamatan: sanitizeCell_(r.Kecamatan || ''),
      kronologi: sanitizeCell_(r.Penyebab_Kronologis || ''),
      meninggal: toInt_(r.Meninggal), lbRi: toInt_(r.LB_RI), lrRj: toInt_(r.LR_RJ), hilang: toInt_(r.Hilang), pengungsi: toInt_(r.Pengungsi),
      terdampakJiwa: toInt_(r.Penduduk_Terdampak_Jiwa), terdampakKK: toInt_(r.Penduduk_Terdampak_KK),
      rs: [toInt_(r.RS_Rusak_Berat), toInt_(r.RS_Rusak_Sedang), toInt_(r.RS_Rusak_Ringan)],
      puskesmas: [toInt_(r.Puskesmas_Rusak_Berat), toInt_(r.Puskesmas_Rusak_Sedang), toInt_(r.Puskesmas_Rusak_Ringan)],
      pustu: [toInt_(r.Pustu_Rusak_Berat), toInt_(r.Pustu_Rusak_Sedang), toInt_(r.Pustu_Rusak_Ringan)],
      sumberDaya: sanitizeCell_(r.Ketersediaan_Sumber_Daya || ''), upaya: sanitizeCell_(r.Upaya_Penanggulangan || ''),
      bantuan: sanitizeCell_(r.Bantuan_Diperlukan_Segera || ''), rekomendasi: sanitizeCell_(r.Rekomendasi || ''),
      urlFoto: r.URL_Foto || '', urlBerita: r.URL_Berita || '', urlPdf: r.URL_Laporan_PDF || '',
      timBertugas: tim
    });
  } catch (e) { return galatUmum_(e, 'getDisasterDetail'); }
}

function cekStatusLaporanRHA(id) {
  try {
    var key = CFG.CACHE.PUB + 'cekstatus::' + sha256Hex_(String(id));
    var n = cacheGet_(key) || 0;
    if (n >= 15) return err_('Terlalu banyak percobaan. Coba lagi nanti.', 'AKSES');
    cachePut_(key, n + 1, 600);
    var q = sanitizeText_(id, 40);
    var semua = readAllCached_(CFG.KEY.SS_RHA, 'sheetKejadian');
    var r = semua.filter(function (x) { return x.ID_Kejadian === q; })[0];
    var grup = [];
    if (r) grup = [r];
    else if (/^PRS-/.test(q)) grup = semua.filter(function (x) { return x.ID_Peristiwa === q; }); // ID peristiwa (laporan lintas kabupaten)
    if (!grup.length) return err_('Laporan tidak ditemukan. Periksa kembali ID laporan Anda.', 'VALIDASI');
    var utama = grup[0];
    return ok_({
      id: grup.length === 1 ? utama.ID_Kejadian : q, status: utama.Status_Verifikasi, alasan: utama.Catatan_Verifikasi || '', tglVerifikasi: utama.Tanggal_Verifikasi || '',
      laporan: grup.map(function (x) { return { id: x.ID_Kejadian, kabupaten: x.Kabupaten_Kota, status: x.Status_Verifikasi, alasan: x.Catatan_Verifikasi || '' }; })
    });
  } catch (e) { return galatUmum_(e, 'cekStatusLaporanRHA'); }
}

// Agregat tim TDM + TDP untuk kartu dashboard (Kontrak Bersama 6.2)
function timBertugasGabungan_() {
  var gab = {};
  [getTimBertugasPerKabupaten_('TDM'), getTimBertugasPerKabupaten_('TDP')].forEach(function (perMod) {
    Object.keys(perMod).forEach(function (kab) {
      if (!gab[kab]) gab[kab] = { tdm: 0, tdp: 0 };
      gab[kab].tdm += perMod[kab].tdm || 0;
      gab[kab].tdp += perMod[kab].tdp || 0;
    });
  });
  return Object.keys(gab).map(function (k) { return { kabupaten: k, tdm: gab[k].tdm, tdp: gab[k].tdp, total: gab[k].tdm + gab[k].tdp }; });
}
function timPerKejadianGabungan_(idKejadian) {
  var out = [];
  [getTimPerKejadian_('TDM', idKejadian), getTimPerKejadian_('TDP', idKejadian)].forEach(function (l) { l.forEach(function (t) { out.push(t); }); });
  return out;
}
