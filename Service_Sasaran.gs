/**
 * Service_Sasaran.gs — Menu Sasaran Sub Klaster (M05 = sheet TRX_Sasaran) pada Dashboard Privat. BERKAS BARU.
 *
 * Satu baris = data sasaran satu Puskesmas pada satu Tanggal Kejadian Awal.
 *  - Kolom: Tanggal Kejadian Awal, Kabupaten, Puskesmas, Kecamatan, dan 20 kolom angka (daftar: SSR_ANGKA di Config.gs).
 *  - Alur status: Diajukan --(Verifikasi: Admin Kabupaten / Puskesmas / Posko)--> Terverifikasi --(Validasi: Admin Provinsi / Super Admin)--> Tervalidasi.
 *    Status "Tervalidasi" disembunyikan dari peran selain Admin Provinsi dan Super Admin (tampil sebagai "Terverifikasi").
 *  - Data lama (format lama: satu baris per Kelompok_Sasaran dengan Jml_L / Jml_P) tetap terbaca: dipetakan ke kolom baru saat ditampilkan.
 *
 * INTEGRASI DATA (otomatis setiap data Sasaran disimpan / diubah / dihapus / diverifikasi / divalidasi):
 *   Menu Kesehatan Reproduksi (M09, TRX_Kespro)  : Ibu Hamil Riil  <- Jumlah Ibu Hamil
 *                                                   PUS Riil        <- Jumlah PUS
 *                                                   Lansia Riil     <- Lansia Laki-Laki + Lansia Perempuan
 *                                                   Remaja Riil     <- Anak/Remaja Laki-Laki + Anak/Remaja Perempuan
 *                                                   Balita Riil     <- Balita 24-59 Bulan Laki-Laki + Perempuan
 *   Menu Kesehatan Jiwa (M10, TRX_Keswa)         : Jumlah ODGJ                  <- ODGJ Laki-Laki + ODGJ Perempuan
 *                                                   Jumlah Lansia Terdampak      <- Lansia Laki-Laki + Lansia Perempuan
 *                                                   Jumlah Disabilitas Terdampak <- Disabilitas Laki-Laki + Disabilitas Perempuan
 *   Cara kerja: setiap baris Sasaran dicerminkan menjadi satu baris di M09 dan satu baris di M10 (kolom ID_Sasaran = ID baris Sasaran).
 *   OTOMATIS + MANUAL: kolom integrasi terisi otomatis, tetapi boleh diisi/dikoreksi manual di M09/M10 (baris manual tanpa Sasaran juga bebas diisi).
 *   Nilai manual ditandai (kolom Manual_Kolom) dan TIDAK ditimpa sinkron berikutnya; nilai dari Sasaran tetap tersimpan di kolom *_Otomatis.
 *   Mengosongkan kolom (atau mengisi sama dengan nilai otomatis) mengembalikannya ke otomatis.
 *   Baris cermin tidak dapat dihapus/diajukan/diverifikasi di M09/M10; Status, Tanggal, Kabupaten, dan Puskesmas mengikuti baris Sasaran.
 *   Baris Sasaran yang dihapus -> baris cermin ikut dihapus.
 *   Bila perlu membangun ulang seluruh integrasi, jalankan sinkronIntegrasiSasaran() dari editor Apps Script.
 *
 * Fungsi publik (dipanggil google.script.run lewat api()):
 *   getSasaranSubKlaster, saveSasaranSubKlaster, updateSasaranSubKlaster, hapusSasaranSubKlaster,
 *   verifikasiSasaranSubKlaster, validasiSasaranSubKlaster, exportSasaranSubKlaster, sinkronIntegrasiSasaran
 *
 * Bergantung pada Service_Faskes.gs (faskesMaster_, faskesKabMap_, faskesDalamCakupan_, faskesTinggi_, faskesKabUser_, faskesStr_,
 * faskesStatusTampil_, FASKES_ROLE_VALID) dan helper umum (Repo.siapkanSheetSinkron, Repo.cfg, readAll_, objToRow_, requireSession_, withLock_, ok_,
 * validasi_, aksesDitolak_, galatUmum_, logAudit_, logError_, sanitizeText_, sanitizeCell_, toInt_, parseDateSafe_, nowWita_, fmtIso_, nextSeq_, pad_,
 * bumpData_, invalidasiCache_, rhaBool_, rhaTulisBaris_).
 */

var SSR_KODE = 'M05';
var SSR_MAKS_ANGKA = 10000000;   // batas wajar per kolom angka (mencegah salah ketik)

// Pemetaan data format lama (Kelompok_Sasaran + Jml_L/Jml_P) -> kolom format baru
var SSR_LEGACY_LP = {
  BAYI_0_5: ['Bayi_L_0_5', 'Bayi_P_0_5'], BAYI_6_23: ['Bayi_L_6_23', 'Bayi_P_6_23'], BALITA_24_59: ['Balita_L_24_59', 'Balita_P_24_59'],
  ANAK_REMAJA: ['Anak_Remaja_L', 'Anak_Remaja_P'], LANSIA: ['Lansia_L', 'Lansia_P'], DISABILITAS: ['Disabilitas_L', 'Disabilitas_P'],
  ODGJ: ['ODGJ_L', 'ODGJ_P'], ODHA: ['ODHA_L', 'ODHA_P']
};
var SSR_LEGACY_TOTAL = { IBU_HAMIL: 'Ibu_Hamil', IBU_MENYUSUI: 'Ibu_Menyusui', WUS: 'WUS', PUS: 'PUS' };

// Definisi integrasi: menu tujuan -> kolom hasil integrasi dan cara menghitungnya dari angka Sasaran (a)
var SSR_CERMIN = {
  M09: {
    nama: 'Kesehatan Reproduksi',
    kolom: ['Ibu_Hamil_Riil', 'PUS_Riil', 'Lansia_Riil', 'Remaja_Riil', 'Balita_Riil'],
    hitung: function (a) {
      return {
        Ibu_Hamil_Riil: a.Ibu_Hamil, PUS_Riil: a.PUS,
        Lansia_Riil: ssrJml_(a, ['Lansia_L', 'Lansia_P']),
        Remaja_Riil: ssrJml_(a, ['Anak_Remaja_L', 'Anak_Remaja_P']),
        Balita_Riil: ssrJml_(a, ['Balita_L_24_59', 'Balita_P_24_59'])
      };
    }
  },
  M10: {
    nama: 'Kesehatan Jiwa',
    kolom: ['Jml_ODGJ', 'Lansia_Terdampak', 'Disabilitas_Terdampak'],
    hitung: function (a) {
      return {
        Jml_ODGJ: ssrJml_(a, ['ODGJ_L', 'ODGJ_P']),
        Lansia_Terdampak: ssrJml_(a, ['Lansia_L', 'Lansia_P']),
        Disabilitas_Terdampak: ssrJml_(a, ['Disabilitas_L', 'Disabilitas_P'])
      };
    }
  }
};

// ---------- Util ----------
function ssrEkstra_() {
  return ['Nama_Puskesmas', 'Kecamatan'].concat(SSR_ANGKA.map(function (a) { return a[0]; }), ['Verified_By', 'Verified_At', 'Validated_By', 'Validated_At']);
}
function ssrSiap_() { return Repo.siapkanSheetSinkron(SSR_KODE, ssrEkstra_()); }
function ssrSelesai_() { bumpData_(); invalidasiCache_(CFG.CACHE_PREFIX.SYS); invalidasiCache_(CFG.CACHE_PREFIX.PUB); }

function ssrKosong_(v) { return v === undefined || v === null || String(v).trim() === ''; }

// Angka satu baris Sasaran -> { kunci: bilangan | '' }. Data format lama dipetakan ke kolom baru bila kolom baru belum terisi sama sekali.
function ssrAngkaDari_(x) {
  var out = {}, adaBaru = false;
  SSR_ANGKA.forEach(function (k) {
    var v = x[k[0]];
    if (!ssrKosong_(v)) { out[k[0]] = toInt_(v) || 0; adaBaru = true; } else out[k[0]] = '';
  });
  if (!adaBaru && x.Kelompok_Sasaran) {
    var kel = String(x.Kelompok_Sasaran), l = toInt_(x.Jml_L), p = toInt_(x.Jml_P);
    if (SSR_LEGACY_LP[kel]) {
      out[SSR_LEGACY_LP[kel][0]] = l === null ? '' : l;
      out[SSR_LEGACY_LP[kel][1]] = p === null ? '' : p;
    } else if (SSR_LEGACY_TOTAL[kel] && (l !== null || p !== null)) {
      out[SSR_LEGACY_TOTAL[kel]] = (l || 0) + (p || 0);
    }
  }
  return out;
}
// Jumlahkan beberapa kolom; kosong bila seluruh kolomnya kosong
function ssrJml_(a, keys) {
  var ada = false, t = 0;
  keys.forEach(function (k) { if (a[k] !== '' && a[k] !== undefined && a[k] !== null) { ada = true; t += Number(a[k]) || 0; } });
  return ada ? t : '';
}
function ssrNamaPuskesmas_(x, M) {
  var m = x.ID_Faskes ? M[x.ID_Faskes] : null;
  return faskesStr_(x.Nama_Puskesmas) || (m ? m.Nama_Faskes : '') || faskesStr_(x.ID_Faskes);
}

function ssrAksi_(u, x) {
  var acc = menuAccess(Repo.cfg(SSR_KODE)), st = x.Status_Data || STATUS_DATA.DRAFT, sama = faskesDalamCakupan_(u, x);
  var terkunci = st === STATUS_DATA.TERVALIDASI, super_ = u.role === ROLE.SUPER;
  return {
    edit: sama && acc.write.indexOf(u.role) >= 0 && (!terkunci || super_),
    hapus: sama && acc.del.indexOf(u.role) >= 0 && (!terkunci || super_),
    verifikasi: sama && acc.verify.indexOf(u.role) >= 0 && (st === STATUS_DATA.DRAFT || st === STATUS_DATA.DIAJUKAN || st === STATUS_DATA.DIKEMBALIKAN),
    validasi: acc.validate.indexOf(u.role) >= 0 && st === STATUS_DATA.TERVERIFIKASI
  };
}

function ssrBentuk_(u, x, M, K) {
  var tinggi = FASKES_ROLE_VALID.indexOf(u.role) >= 0;
  return {
    id: x.ID_Record, tgl: fmtIso_(x.Tanggal), idKab: x.ID_Kabupaten, kabupaten: K[x.ID_Kabupaten] || x.ID_Kabupaten || '',
    puskesmas: ssrNamaPuskesmas_(x, M), kecamatan: x.Kecamatan || '', angka: ssrAngkaDari_(x), keterangan: x.Keterangan || '',
    status: faskesStatusTampil_(u, x.Status_Data), version: toInt_(x.Version) || 1,
    dibuatPada: String(x.Created_At || ''), dibuatOleh: x.Created_By || '',
    diverifikasiOleh: x.Verified_By || '', diverifikasiPada: String(x.Verified_At || ''),
    divalidasiOleh: tinggi ? (x.Validated_By || '') : '', divalidasiPada: tinggi ? String(x.Validated_At || '') : '',
    aksi: ssrAksi_(u, x)
  };
}

function ssrDaftar_(u, p, T) {
  p = p || {};
  var M = faskesMaster_(), K = faskesKabMap_(), q = String(p.search || '').toLowerCase();
  var dari = String(p.dari || ''), sampai = String(p.sampai || '');
  return readAll_(T.sh).filter(function (x) { return !rhaBool_(x.Is_Deleted) && faskesDalamCakupan_(u, x); })
    .map(function (x) { x.ID_Record = x[T.idKey]; return x; })
    .filter(function (x) {
      if (faskesTinggi_(u) && p.idKabupaten && String(x.ID_Kabupaten) !== String(p.idKabupaten)) return false;
      var t = fmtIso_(x.Tanggal);
      if (dari && t < dari) return false;
      if (sampai && t > sampai) return false;
      return true;
    })
    .map(function (x) { return { raw: x, row: ssrBentuk_(u, x, M, K) }; })
    .filter(function (o) {
      if (!q) return true;
      var r = o.row;
      return (r.id + ' ' + r.puskesmas + ' ' + r.kabupaten + ' ' + r.kecamatan).toLowerCase().indexOf(q) >= 0;
    });
}

// ---------- Baca ----------
function getSasaranSubKlaster(token, p) {
  try {
    var user = requireSession_(token, SSR_KODE, 'read');
    p = p || {};
    var T = ssrSiap_();
    ssrSinkron_();   // best-effort: memastikan integrasi ke M09/M10 mutakhir (hanya menulis bila ada selisih)
    var semua = ssrDaftar_(user, p, T);
    var cnt = { total: semua.length, diajukan: 0, terverifikasi: 0, tervalidasi: 0 };
    semua.forEach(function (o) {
      var s = o.row.status;
      if (s === 'Diajukan') cnt.diajukan++; else if (s === 'Terverifikasi') cnt.terverifikasi++; else if (s === 'Tervalidasi') cnt.tervalidasi++;
    });
    var st = ['Diajukan', 'Terverifikasi', 'Tervalidasi'].indexOf(p.status) >= 0 ? p.status : '';
    var rows = semua.filter(function (o) { return !st || o.row.status === st; });
    rows.sort(function (a, b) { return String(b.row.tgl).localeCompare(String(a.row.tgl)) || String(b.row.id).localeCompare(String(a.row.id)); });
    var pageSize = Math.min(Number(p.pageSize) || 20, CFG.PAGESIZE_MAX), page = Math.max(1, Number(p.page) || 1);
    var out = rows.slice((page - 1) * pageSize, page * pageSize).map(function (o) { return o.row; });
    var opsi = { angka: SSR_ANGKA };
    if (p.denganFaskes) {
      var M = faskesMaster_(), daftar = [];
      Object.keys(M).forEach(function (k) { daftar.push([M[k].ID_Faskes, M[k].Nama_Faskes, M[k].ID_Kabupaten]); });
      opsi.faskes = daftar;
    }
    return ok_({ rows: out, page: page, pageSize: pageSize, total: rows.length, counts: cnt, opsi: opsi,
      izin: { tambah: menuAccess(Repo.cfg(SSR_KODE)).write.indexOf(user.role) >= 0 }, validatorSaja: faskesTinggi_(user) });
  } catch (e) { return galatUmum_(e, 'getSasaranSubKlaster'); }
}

function exportSasaranSubKlaster(token, p) {
  try {
    var user = requireSession_(token, SSR_KODE, 'read');
    var T = ssrSiap_(), rows = ssrDaftar_(user, p, T);
    var st = ['Diajukan', 'Terverifikasi', 'Tervalidasi'].indexOf((p || {}).status) >= 0 ? p.status : '';
    if (st) rows = rows.filter(function (o) { return o.row.status === st; });
    function c(v) { v = faskesStr_(v).replace(/"/g, '""'); return /^[=+\-@]/.test(v) ? "'" + v : v; }
    var baris = [['No', 'Tanggal Kejadian Awal', 'Kabupaten', 'Puskesmas', 'Kecamatan'].concat(SSR_ANGKA.map(function (a) { return a[1]; }), ['Status'])];
    rows.forEach(function (o, i) {
      var r = o.row;
      baris.push([i + 1, r.tgl, r.kabupaten, r.puskesmas, r.kecamatan].concat(SSR_ANGKA.map(function (a) { return r.angka[a[0]]; }), [r.status]));
    });
    var csv = '\uFEFF' + baris.map(function (b) { return b.map(function (v) { return '"' + c(v) + '"'; }).join(','); }).join('\r\n');
    return ok_({ nama: 'Sasaran_Sub_Klaster_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd_HHmm') + '.csv', csv: csv });
  } catch (e) { return galatUmum_(e, 'exportSasaranSubKlaster'); }
}

// ---------- Validasi isian ----------
function ssrBersih_(user, d) {
  d = d || {};
  var out = {};
  var tgl = parseDateSafe_(d.Tanggal);
  if (!tgl) validasi_('Tanggal Kejadian Awal wajib diisi dan sah.');
  if (tgl > new Date()) validasi_('Tanggal Kejadian Awal tidak boleh melewati hari ini.');
  out.Tanggal = Utilities.formatDate(tgl, CFG.TZ, 'yyyy-MM-dd');
  var kab = faskesTinggi_(user) ? sanitizeText_(d.ID_Kabupaten, 40) : faskesKabUser_(user);   // peran lain: SELALU wilayah akun
  if (!kab) validasi_('Kabupaten / Kota wajib diisi.');
  if (!faskesKabMap_()[kab]) validasi_('Kabupaten / Kota tidak dikenal.');
  out.ID_Kabupaten = kab;
  var nama = sanitizeText_(d.Nama_Puskesmas, 200);
  if (nama.length < 3) validasi_('Puskesmas wajib diisi.');
  out.Nama_Puskesmas = nama;
  out.Kecamatan = sanitizeText_(d.Kecamatan, 100);
  SSR_ANGKA.forEach(function (a) {
    var v = String(d[a[0]] === undefined || d[a[0]] === null ? '' : d[a[0]]).trim();
    if (v === '') { out[a[0]] = ''; return; }
    if (!/^\d+$/.test(v)) validasi_(a[1] + ' harus bilangan bulat 0 atau lebih.');
    var n = parseInt(v, 10);
    if (n > SSR_MAKS_ANGKA) validasi_(a[1] + ' terlalu besar (maksimal ' + SSR_MAKS_ANGKA + ').');
    out[a[0]] = n;
  });
  if (!SSR_ANGKA.some(function (a) { return out[a[0]] !== ''; })) validasi_('Isi minimal satu kolom jumlah sasaran (isi 0 bila tidak ada).');
  out.Keterangan = sanitizeText_(d.Keterangan, 1000);
  // Faskes (untuk lingkup wilayah): Admin Puskesmas/Posko memakai faskes akunnya; peran lain dicocokkan dengan master (kabupaten yang sama)
  var idF = '';
  if ((user.role === ROLE.PUSKESMAS || user.role === ROLE.POSKO) && user.idFaskes) idF = String(user.idFaskes);
  else {
    var M = faskesMaster_();
    Object.keys(M).forEach(function (k) {
      if (!idF && String(M[k].ID_Kabupaten) === kab && String(M[k].Nama_Faskes).trim().toLowerCase() === nama.toLowerCase()) idF = k;
    });
  }
  out.ID_Faskes = idF;
  return out;
}

// Satu Puskesmas hanya satu baris per Tanggal Kejadian Awal (mencegah data ganda)
function ssrCariGanda_(rows, b, idAbaikan) {
  var n = String(b.Nama_Puskesmas).trim().toLowerCase();
  return rows.filter(function (r) {
    return !rhaBool_(r.Is_Deleted) && String(r.ID_Record || r.ID_Sasaran || '') !== String(idAbaikan || '') &&
      fmtIso_(r.Tanggal) === b.Tanggal && String(r.ID_Kabupaten) === String(b.ID_Kabupaten) && String(r.Nama_Puskesmas || '').trim().toLowerCase() === n;
  })[0];
}

function ssrCariBaris_(T, id, user) {
  var x = readAll_(T.sh).filter(function (r) { return r[T.idKey] === id && !rhaBool_(r.Is_Deleted); })[0];
  if (!x) validasi_('Data tidak ditemukan.');
  if (!faskesDalamCakupan_(user, x)) aksesDitolak_('Data di luar wilayah akun Anda.');
  return x;
}

// ---------- Simpan baru ----------
function saveSasaranSubKlaster(token, payload, reqId) {
  try {
    var user = requireSession_(token, SSR_KODE, 'write');
    reqId = sanitizeText_(reqId, 80);
    var hasil = withLock_(function () {
      var T = ssrSiap_(), sh = T.sh, h = T.h, rows = readAll_(sh);
      if (reqId) {   // ID permintaan sama = tidak digandakan
        var ada = rows.filter(function (x) { return x.Request_ID === reqId; })[0];
        if (ada) return { id: ada[T.idKey], dup: true };
      }
      var b = ssrBersih_(user, payload), now = nowWita_();
      var g = ssrCariGanda_(rows.map(function (r) { r.ID_Record = r[T.idKey]; return r; }), b, '');
      if (g) validasi_('Data Sasaran untuk Puskesmas "' + b.Nama_Puskesmas + '" pada tanggal ' + b.Tanggal + ' sudah ada (' + g.ID_Record + '). Ubah data tersebut melalui tombol Edit.');
      var id = Repo.cfg(SSR_KODE).idPrefix + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(sh.getParent(), 'REPO_' + SSR_KODE), 4);
      var rec = {};
      Object.keys(b).forEach(function (k) { rec[k] = b[k]; });
      rec[T.idKey] = id; rec.ID_Posko = String(user.idPosko || '');
      rec.Status_Data = STATUS_DATA.DIAJUKAN; rec.Catatan_Verifikasi = ''; rec.Version = 1; rec.Request_ID = reqId || ('SSR-' + id);
      rec.Created_At = now; rec.Created_By = user.username; rec.Updated_At = now; rec.Updated_By = user.username; rec.Is_Deleted = '';
      Object.keys(rec).forEach(function (k) { if (typeof rec[k] === 'string') rec[k] = sanitizeCell_(rec[k]); });
      sh.getRange(sh.getLastRow() + 1, 1, 1, h.length).setValues([objToRow_(h, rec)]);
      return { id: id, dup: false };
    });
    if (!hasil.dup) { ssrSelesai_(); ssrSinkron_(); logAudit_(user, 'TAMBAH_SASARAN_SUB_KLASTER', 'Sasaran Sub Klaster', hasil.id, 'OK'); }
    return ok_({ id: hasil.id }, hasil.dup ? 'Data sudah tersimpan sebelumnya.' : 'Data sasaran sub klaster berhasil disimpan dan menunggu verifikasi.');
  } catch (e) { return galatUmum_(e, 'saveSasaranSubKlaster'); }
}

// ---------- Ubah ----------
function updateSasaranSubKlaster(token, id, payload, version) {
  try {
    var user = requireSession_(token, SSR_KODE, 'write');
    id = sanitizeText_(id, 60);
    var res = withLock_(function () {
      var T = ssrSiap_(), x = ssrCariBaris_(T, id, user);
      if (!ssrAksi_(user, x).edit) aksesDitolak_('Data ini tidak dapat diubah (sudah Tervalidasi atau di luar kewenangan Anda).');
      var v = toInt_(x.Version) || 1;
      if (version !== undefined && version !== null && version !== '' && Number(version) !== v) validasi_('Data telah diubah pengguna lain. Muat ulang tabel lalu coba lagi.');
      var b = ssrBersih_(user, payload);
      var semua = readAll_(T.sh).map(function (r) { r.ID_Record = r[T.idKey]; return r; });
      var g = ssrCariGanda_(semua, b, id);
      if (g) validasi_('Data Sasaran untuk Puskesmas "' + b.Nama_Puskesmas + '" pada tanggal ' + b.Tanggal + ' sudah ada (' + g.ID_Record + ').');
      // ID_Faskes hasil pencocokan hanya menimpa bila ada nilainya (jangan menghapus lingkup faskes yang sudah melekat)
      if (!b.ID_Faskes) delete b.ID_Faskes;
      b.Kelompok_Sasaran = ''; b.Jml_L = ''; b.Jml_P = '';   // data format lama dikonversi ke format baru saat disimpan ulang
      b.Version = v + 1; b.Updated_At = nowWita_(); b.Updated_By = user.username;
      rhaTulisBaris_(T.sh, T.h, x._row, b);
      return { version: v + 1 };
    });
    ssrSelesai_(); ssrSinkron_();
    logAudit_(user, 'UBAH_SASARAN_SUB_KLASTER', 'Sasaran Sub Klaster', id, 'OK');
    return ok_({ id: id, version: res.version }, 'Data sasaran sub klaster berhasil diperbarui.');
  } catch (e) { return galatUmum_(e, 'updateSasaranSubKlaster'); }
}

// ---------- Hapus (soft delete) ----------
function hapusSasaranSubKlaster(token, id) {
  try {
    var user = requireSession_(token, SSR_KODE, 'read');
    id = sanitizeText_(id, 60);
    withLock_(function () {
      var T = ssrSiap_(), x = ssrCariBaris_(T, id, user);
      if (!ssrAksi_(user, x).hapus) aksesDitolak_('Data ini tidak dapat dihapus (sudah Tervalidasi atau di luar kewenangan Anda).');
      rhaTulisBaris_(T.sh, T.h, x._row, { Is_Deleted: 'TRUE', Version: (toInt_(x.Version) || 1) + 1, Updated_At: nowWita_(), Updated_By: user.username });
    });
    ssrSelesai_(); ssrSinkron_();
    logAudit_(user, 'HAPUS_SASARAN_SUB_KLASTER', 'Sasaran Sub Klaster', id, 'OK');
    return ok_({ id: id }, 'Data sasaran sub klaster dihapus.');
  } catch (e) { return galatUmum_(e, 'hapusSasaranSubKlaster'); }
}

// ---------- Verifikasi: Admin Kabupaten, Admin Puskesmas, Admin Posko ----------
function verifikasiSasaranSubKlaster(token, id) {
  try {
    var user = requireSession_(token, SSR_KODE, 'read');
    id = sanitizeText_(id, 60);
    withLock_(function () {
      var T = ssrSiap_(), x = ssrCariBaris_(T, id, user);
      if (!ssrAksi_(user, x).verifikasi) aksesDitolak_('Verifikasi hanya dapat dilakukan Admin Kabupaten, Admin Puskesmas, atau Admin Posko pada data yang belum diverifikasi.');
      var now = nowWita_();
      rhaTulisBaris_(T.sh, T.h, x._row, { Status_Data: 'Terverifikasi', Verified_By: user.username, Verified_At: now, Catatan_Verifikasi: '',
        Version: (toInt_(x.Version) || 1) + 1, Updated_At: now, Updated_By: user.username });
    });
    ssrSelesai_(); ssrSinkron_();
    logAudit_(user, 'VERIFIKASI_SASARAN_SUB_KLASTER', 'Sasaran Sub Klaster', id, 'OK');
    return ok_({ id: id }, 'Data sasaran sub klaster terverifikasi.');
  } catch (e) { return galatUmum_(e, 'verifikasiSasaranSubKlaster'); }
}

// ---------- Validasi: Admin Provinsi dan Super Admin (data harus sudah Terverifikasi dan lengkap) ----------
function validasiSasaranSubKlaster(token, id) {
  try {
    var user = requireSession_(token, SSR_KODE, 'read');
    if (FASKES_ROLE_VALID.indexOf(user.role) < 0) aksesDitolak_('Validasi hanya dapat dilakukan Admin Provinsi dan Super Admin.');
    id = sanitizeText_(id, 60);
    var res = withLock_(function () {
      var T = ssrSiap_(), x = ssrCariBaris_(T, id, user);
      if (x.Status_Data === 'Tervalidasi') return { sudah: true };
      if (x.Status_Data !== 'Terverifikasi') return { gagal: { success: false, code: 'VALIDASI', message: 'Data belum dapat divalidasi.', masalah: ['Data harus diverifikasi lebih dulu oleh Admin Kabupaten, Admin Puskesmas, atau Admin Posko.'] } };
      var masalah = [], M = faskesMaster_(), a = ssrAngkaDari_(x);
      if (!ssrNamaPuskesmas_(x, M)) masalah.push('Puskesmas belum terisi.');
      if (!fmtIso_(x.Tanggal)) masalah.push('Tanggal Kejadian Awal belum terisi.');
      if (!faskesKabMap_()[x.ID_Kabupaten]) masalah.push('Kabupaten belum terisi atau tidak dikenal.');
      if (!String(x.Kecamatan || '').trim()) masalah.push('Kecamatan belum diisi.');
      if (!SSR_ANGKA.some(function (k) { return a[k[0]] !== ''; })) masalah.push('Belum ada satu pun jumlah sasaran yang diisi.');
      if (masalah.length) return { gagal: { success: false, code: 'VALIDASI', message: 'Data belum dapat divalidasi. Lengkapi kolom berikut lebih dulu.', masalah: masalah } };
      var now = nowWita_();
      rhaTulisBaris_(T.sh, T.h, x._row, { Status_Data: 'Tervalidasi', Validated_By: user.username, Validated_At: now,
        Version: (toInt_(x.Version) || 1) + 1, Updated_At: now, Updated_By: user.username });
      return { ok: true };
    });
    if (res.sudah) return ok_({ id: id }, 'Data sudah Tervalidasi.');
    if (res.gagal) return res.gagal;
    ssrSelesai_(); ssrSinkron_();
    logAudit_(user, 'VALIDASI_SASARAN_SUB_KLASTER', 'Sasaran Sub Klaster', id, 'OK');
    return ok_({ id: id }, 'Data sasaran sub klaster tervalidasi.');
  } catch (e) { return galatUmum_(e, 'validasiSasaranSubKlaster'); }
}

// ============================================================
// INTEGRASI: cermin baris Sasaran ke M09 (Kesehatan Reproduksi) dan M10 (Kesehatan Jiwa)
// ============================================================
function ssrEkstraCermin_(kode) {
  var kol = SSR_CERMIN[kode].kolom;
  return ['ID_Sasaran', 'Nama_Puskesmas', 'Manual_Kolom'].concat(kol, kol.map(function (k) { return k + '_Otomatis'; }), ['Verified_By', 'Verified_At', 'Validated_By', 'Validated_At']);
}

// Hitung pekerjaan: { baru: [rec], ubah: [{row, obj}] } tanpa menulis apa pun
function ssrHitungCermin_(kode, src, T, M) {
  var C = SSR_CERMIN[kode], now = nowWita_(), cfgM = Repo.cfg(kode);
  var cur = readAll_(T.sh), byId = {};
  cur.forEach(function (r) { if (r.ID_Sasaran) byId[String(r.ID_Sasaran)] = r; });
  var baru = [], ubah = [];
  src.forEach(function (x) {
    var idS = String(x.ID_Record), dihapus = rhaBool_(x.Is_Deleted);
    var snap = {
      Tanggal: fmtIso_(x.Tanggal), ID_Kabupaten: faskesStr_(x.ID_Kabupaten), ID_Faskes: faskesStr_(x.ID_Faskes), ID_Posko: faskesStr_(x.ID_Posko),
      Nama_Puskesmas: ssrNamaPuskesmas_(x, M), Status_Data: faskesStr_(x.Status_Data) || STATUS_DATA.DIAJUKAN,
      Verified_By: faskesStr_(x.Verified_By), Verified_At: faskesStr_(x.Verified_At), Validated_By: faskesStr_(x.Validated_By), Validated_At: faskesStr_(x.Validated_At),
      Is_Deleted: dihapus ? 'TRUE' : ''
    };
    var hit = C.hitung(ssrAngkaDari_(x));
    var ada = byId[idS];
    var manual = ada ? ssrDaftarManual_(ada) : [];
    Object.keys(hit).forEach(function (k) {
      snap[k + '_Otomatis'] = hit[k];                      // nilai dari Sasaran selalu disimpan
      if (manual.indexOf(k) < 0) snap[k] = hit[k];          // kolom yang dikoreksi manual tidak ditimpa
    });
    if (!ada) {
      if (dihapus) return;   // baris Sasaran yang sudah terhapus dan belum pernah dicerminkan tidak dibuat
      var rec = {
        ID_Sasaran: idS, Kelompok_Sasaran: '', Keterangan: 'Hasil integrasi Menu Sasaran Sub Klaster (' + idS + ')', Catatan_Verifikasi: '',
        Version: 1, Request_ID: 'SSR-SYNC-' + kode + '-' + idS, Created_At: now, Created_By: faskesStr_(x.Created_By) || 'sistem', Updated_At: now, Updated_By: 'sistem'
      };
      Object.keys(snap).forEach(function (k) { rec[k] = snap[k]; });
      baru.push(rec);
    } else {
      var beda = {}, adaBeda = false;
      Object.keys(snap).forEach(function (k) {
        var lama = k === 'Tanggal' ? fmtIso_(ada[k]) : (k === 'Is_Deleted' ? (rhaBool_(ada[k]) ? 'TRUE' : '') : faskesStr_(ada[k]));
        if (lama !== faskesStr_(snap[k])) { beda[k] = snap[k]; adaBeda = true; }
      });
      if (adaBeda) { beda.Version = (toInt_(ada.Version) || 1) + 1; beda.Updated_At = now; beda.Updated_By = 'sistem'; ubah.push({ row: ada._row, obj: beda }); }
    }
  });
  return { baru: baru, ubah: ubah, idPrefix: cfgM.idPrefix };
}

// Kolom integrasi yang sedang dikoreksi manual pada baris cermin (disimpan di kolom Manual_Kolom, dipisah koma)
function ssrDaftarManual_(r) { return String(r.Manual_Kolom || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

// Dipanggil Repo.update pada baris cermin: nilai yang berbeda dari otomatis = manual (ditandai); dikosongkan / sama dengan otomatis = kembali otomatis.
function ssrTerapkanManual_(kode, r, c) {
  var C = SSR_CERMIN[kode]; if (!C) return;
  var manual = ssrDaftarManual_(r), ubah = false;
  C.kolom.forEach(function (k) {
    if (c[k] === undefined) return;
    var auto = r[k + '_Otomatis'], pos = manual.indexOf(k);
    if (c[k] === '' || String(c[k]) === String(auto === undefined ? '' : auto)) { c[k] = auto === undefined ? '' : auto; if (pos >= 0) { manual.splice(pos, 1); ubah = true; } }
    else if (pos < 0) { manual.push(k); ubah = true; }
  });
  if (ubah) c.Manual_Kolom = manual.join(',');
}

// Satu putaran sinkron untuk satu menu tujuan. Mengembalikan true bila ada yang ditulis.
function ssrSinkronMenu_(kode, S) {
  var T = Repo.siapkanSheetSinkron(kode, ssrEkstraCermin_(kode)), M = faskesMaster_();
  var src = readAll_(S.sh).filter(function (x) { return x[S.idKey]; }).map(function (x) { x.ID_Record = x[S.idKey]; return x; });
  var kerja = ssrHitungCermin_(kode, src, T, M);
  if (!kerja.baru.length && !kerja.ubah.length) return false;
  return withLock_(function () {
    var T2 = Repo.siapkanSheetSinkron(kode, ssrEkstraCermin_(kode));
    var S2 = ssrSiap_();
    var src2 = readAll_(S2.sh).filter(function (x) { return x[S2.idKey]; }).map(function (x) { x.ID_Record = x[S2.idKey]; return x; });
    var k2 = ssrHitungCermin_(kode, src2, T2, M);   // hitung ulang di dalam kunci agar tidak ada baris ganda
    if (k2.baru.length) {
      var ss = T2.sh.getParent(), yymm = Utilities.formatDate(new Date(), CFG.TZ, 'yyMM');
      var rows = k2.baru.map(function (rec) {
        rec[T2.idKey] = k2.idPrefix + '-' + yymm + '-' + pad_(nextSeq_(ss, 'REPO_' + kode), 4);
        Object.keys(rec).forEach(function (k) { if (typeof rec[k] === 'string') rec[k] = sanitizeCell_(rec[k]); });
        return objToRow_(T2.h, rec);
      });
      T2.sh.getRange(T2.sh.getLastRow() + 1, 1, rows.length, T2.h.length).setValues(rows);
    }
    k2.ubah.forEach(function (u) { rhaTulisBaris_(T2.sh, T2.h, u.row, u.obj); });
    return true;
  });
}

// Sinkron M05 -> M09 dan M10. Bersifat best-effort: kegagalan tidak membatalkan penyimpanan data Sasaran (dicatat di log; ulangi dengan sinkronIntegrasiSasaran()).
function ssrSinkron_() {
  try {
    var S = ssrSiap_(), berubah = false;
    Object.keys(SSR_CERMIN).forEach(function (kode) { if (ssrSinkronMenu_(kode, S)) berubah = true; });
    if (berubah) ssrSelesai_();
  } catch (e) {
    try { logError_('ssrSinkron_', e); } catch (e2) {}
    console.log('ssrSinkron_ gagal: ' + (e && e.message));
  }
}

// Jalankan manual dari editor Apps Script untuk membangun ulang / memulihkan seluruh integrasi (aman dijalankan berulang).
function sinkronIntegrasiSasaran() {
  var S = ssrSiap_(), hasil = {};
  Object.keys(SSR_CERMIN).forEach(function (kode) { hasil[kode] = ssrSinkronMenu_(kode, S) ? 'diperbarui' : 'sudah mutakhir'; });
  ssrSelesai_();
  Logger.log('Integrasi Sasaran Sub Klaster: ' + JSON.stringify(hasil));
  return hasil;
}
