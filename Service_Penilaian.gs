/**
 * Service_Penilaian.gs — Menu Penilaian Kerusakan Faskes (M03 = sheet TRX_Penilaian_Kerusakan) pada Dashboard Privat. BERKAS BARU.
 *
 * Sumber data: Menu Faskes (Kondisi) (M02 = TRX_Faskes_Kondisi). Setiap baris M02 otomatis dicerminkan ke M03 (sinkron saat tabel/formulir dibuka):
 *   - Kolom hasil integrasi (HANYA BACA): Tanggal Kejadian Awal, Kabupaten, Nama Faskes, Kondisi Faskes, Alamat, Kecamatan.
 *   - Kolom yang diisi petugas di Menu Penilaian: Pelayanan, Validasi Kerusakan & Kerugian, Lembaga/Instansi yang Validasi, Tanggal Validasi Kerusakan & Kerugian.
 *   - Alur status: Diajukan --(Verifikasi: Admin Kabupaten / Puskesmas / Posko)--> Terverifikasi --(Validasi: Admin Provinsi / Super Admin)--> Tervalidasi.
 *     Status "Tervalidasi" disembunyikan dari peran selain Admin Provinsi dan Super Admin (tampil sebagai "Terverifikasi").
 *
 * Fungsi publik (dipanggil google.script.run lewat api()):
 *   getPenilaianKerusakan, getPenilaianSumber, savePenilaianKerusakan, updatePenilaianKerusakan,
 *   hapusPenilaianKerusakan, verifikasiPenilaianKerusakan, validasiPenilaianKerusakan, exportPenilaianKerusakan
 *
 * Bergantung pada Service_Faskes.gs (faskesEkstra_, faskesMaster_, faskesKabMap_, faskesDalamCakupan_, faskesTinggi_, faskesStatusTampil_, FASKES_ROLE_VALID)
 * dan helper umum (Repo.siapkanSheetSinkron, readAll_, objToRow_, requireSession_, withLock_, ok_, validasi_, aksesDitolak_, galatUmum_, logAudit_,
 * sanitizeText_, sanitizeCell_, toInt_, parseDateSafe_, nowWita_, fmtIso_, bumpData_, invalidasiCache_, rhaBool_, rhaTulisBaris_).
 */

var PNL_KODE = 'M03';
var PNL_PELAYANAN = ['Full dalam Gedung', 'Sebagian dalam Gedung', 'Dalam & Luar Gedung', 'Full Luar Gedung'];
var PNL_VALIDASI_KK = [
  'Sementara Validasi Kerusakan & Kerugian', 'Sudah Validasi Kerusakan', 'Belum Validasi Kerusakan',
  'Sudah Validasi Kerugian', 'Belum Validasi Kerugian',
  'Sudah Validasi Kerusakan & Sudah Validasi Kerugian', 'Sudah Validasi Kerusakan & Belum Validasi Kerugian',
  'Belum Validasi Kerusakan & Sudah Validasi Kerugian', 'Belum Validasi Kerusakan & Belum Validasi Kerugian'
];

// ---------- Util ----------
function pnlEkstra_() {
  return ['ID_Kondisi', 'Nama_Faskes', 'Kondisi_Faskes', 'Alamat', 'Kecamatan',
    'Pelayanan', 'Validasi_Kerusakan_Kerugian', 'Lembaga_Validasi', 'Tanggal_Validasi',
    'Verified_By', 'Verified_At', 'Validated_By', 'Validated_At'];
}
function pnlSiap_() { return Repo.siapkanSheetSinkron(PNL_KODE, pnlEkstra_()); }
function pnlSelesai_() { bumpData_(); invalidasiCache_(CFG.CACHE_PREFIX.SYS); invalidasiCache_(CFG.CACHE_PREFIX.PUB); }
// ID Penilaian diturunkan dari ID Faskes (Kondisi) agar tetap unik dan stabil: FKD-2026-00012 -> PNF-2026-00012
function pnlIdDari_(idKondisi) { return /^FKD-/.test(idKondisi) ? idKondisi.replace(/^FKD-/, 'PNF-') : 'PNF-' + idKondisi; }

// ---------- Sinkron dari Menu Faskes (Kondisi) ----------
// Mengembalikan { baru: [rec], ubah: [{row, obj}] } tanpa menulis apa pun.
function pnlHitungKerja_(T) {
  var F = Repo.siapkanSheetSinkron(FASKES_KODE, faskesEkstra_());
  var M = faskesMaster_(), now = nowWita_();
  var src = readAll_(F.sh).filter(function (x) { return !rhaBool_(x.Is_Deleted); });
  var cur = readAll_(T.sh), byKond = {};
  cur.forEach(function (r) { if (r.ID_Kondisi) byKond[String(r.ID_Kondisi)] = r; });   // termasuk baris yang sudah dihapus (tidak dibuat ulang)
  var baru = [], ubah = [];
  src.forEach(function (x) {
    var idk = String(x[F.idKey]);
    var m = x.ID_Faskes ? M[x.ID_Faskes] : null;
    var snap = {
      Tanggal: fmtIso_(x.Tanggal), ID_Kabupaten: faskesStr_(x.ID_Kabupaten), ID_Faskes: faskesStr_(x.ID_Faskes),
      Nama_Faskes: m ? m.Nama_Faskes : faskesStr_(x.Nama_Faskes_Lainnya), Kondisi_Faskes: faskesStr_(x.Kondisi_Faskes),
      Tingkat_Kerusakan: faskesStr_(x.Kondisi_Faskes),   // salinan untuk ringkasan dashboard (hitung Rusak Berat)
      Alamat: faskesStr_(x.Alamat), Kecamatan: faskesStr_(x.Kecamatan)
    };
    var ada = byKond[idk];
    if (!ada) {
      var rec = {
        ID_Kondisi: idk, ID_Posko: faskesStr_(x.ID_Posko), Pelayanan: '', Validasi_Kerusakan_Kerugian: '', Lembaga_Validasi: '', Tanggal_Validasi: '',
        Estimasi_Kerugian_Rp: '', Kebutuhan_Pemulihan_Rp: '', URL_Dokumen: '', Keterangan: '', Catatan_Verifikasi: '',
        Status_Data: STATUS_DATA.DIAJUKAN, Version: 1, Created_At: now, Created_By: faskesStr_(x.Created_By) || 'sistem', Updated_At: now, Updated_By: 'sistem', Is_Deleted: ''
      };
      rec[T.idKey] = pnlIdDari_(idk); rec.Request_ID = 'PNF-SYNC-' + idk;
      Object.keys(snap).forEach(function (k) { rec[k] = snap[k]; });
      baru.push(rec);
    } else if (ada.Status_Data !== STATUS_DATA.TERVALIDASI) {   // data Tervalidasi dibekukan; lainnya mengikuti perubahan di Faskes (Kondisi)
      var beda = {}, ada_ = false;
      Object.keys(snap).forEach(function (k) {
        var lama = k === 'Tanggal' ? fmtIso_(ada[k]) : faskesStr_(ada[k]);
        if (lama !== snap[k]) { beda[k] = snap[k]; ada_ = true; }
      });
      if (ada_) ubah.push({ row: ada._row, obj: beda });
    }
  });
  return { baru: baru, ubah: ubah };
}

function pnlSinkron_(T) {
  try {
    var kerja = pnlHitungKerja_(T);
    if (!kerja.baru.length && !kerja.ubah.length) return;
    withLock_(function () {
      var k2 = pnlHitungKerja_(T);   // hitung ulang di dalam kunci agar tidak ada baris ganda
      if (k2.baru.length) {
        var rows = k2.baru.map(function (rec) {
          Object.keys(rec).forEach(function (k) { if (typeof rec[k] === 'string') rec[k] = sanitizeCell_(rec[k]); });
          return objToRow_(T.h, rec);
        });
        T.sh.getRange(T.sh.getLastRow() + 1, 1, rows.length, T.h.length).setValues(rows);
      }
      k2.ubah.forEach(function (u) { rhaTulisBaris_(T.sh, T.h, u.row, u.obj); });
      pnlSelesai_();
    });
  } catch (e) { /* sinkron bersifat best-effort; tabel tetap dapat dibuka */ console.log('pnlSinkron_ gagal: ' + (e && e.message)); }
}

// ---------- Bentuk baris ----------
function pnlAksi_(u, x) {
  var acc = menuAccess(Repo.cfg(PNL_KODE)), st = x.Status_Data || STATUS_DATA.DRAFT, sama = faskesDalamCakupan_(u, x);
  var terkunci = st === STATUS_DATA.TERVALIDASI, super_ = u.role === ROLE.SUPER;
  return {
    edit: sama && acc.write.indexOf(u.role) >= 0 && (!terkunci || super_),
    hapus: sama && acc.del.indexOf(u.role) >= 0 && (!terkunci || super_),
    verifikasi: sama && acc.verify.indexOf(u.role) >= 0 && (st === STATUS_DATA.DRAFT || st === STATUS_DATA.DIAJUKAN || st === STATUS_DATA.DIKEMBALIKAN),
    validasi: acc.validate.indexOf(u.role) >= 0 && st === STATUS_DATA.TERVERIFIKASI
  };
}

function pnlBentuk_(u, x, M, K) {
  var m = x.ID_Faskes ? M[x.ID_Faskes] : null;
  var nama = x.Nama_Faskes || (m ? m.Nama_Faskes : '') || x.ID_Faskes || '';
  var tinggi = FASKES_ROLE_VALID.indexOf(u.role) >= 0;
  return {
    id: x.ID_Record, idKondisi: x.ID_Kondisi || '',
    tgl: fmtIso_(x.Tanggal), idKab: x.ID_Kabupaten, kabupaten: K[x.ID_Kabupaten] || x.ID_Kabupaten || '',
    nama: nama, kondisi: x.Kondisi_Faskes || x.Tingkat_Kerusakan || '', alamat: x.Alamat || '', kecamatan: x.Kecamatan || '',
    pelayanan: x.Pelayanan || '', validasiKK: x.Validasi_Kerusakan_Kerugian || '', lembaga: x.Lembaga_Validasi || '', tglValidasi: fmtIso_(x.Tanggal_Validasi),
    status: faskesStatusTampil_(u, x.Status_Data), version: toInt_(x.Version) || 1,
    dibuatPada: String(x.Created_At || ''), dibuatOleh: x.Created_By || '',
    diverifikasiOleh: x.Verified_By || '', diverifikasiPada: String(x.Verified_At || ''),
    divalidasiOleh: tinggi ? (x.Validated_By || '') : '', divalidasiPada: tinggi ? String(x.Validated_At || '') : '',
    aksi: pnlAksi_(u, x)
  };
}

function pnlDaftar_(u, p, T) {
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
    .map(function (x) { return { raw: x, row: pnlBentuk_(u, x, M, K) }; })
    .filter(function (o) {
      if (!q) return true;
      var r = o.row;
      return (r.id + ' ' + r.nama + ' ' + r.kabupaten + ' ' + r.kondisi + ' ' + r.alamat + ' ' + r.kecamatan + ' ' + r.pelayanan + ' ' + r.validasiKK + ' ' + r.lembaga).toLowerCase().indexOf(q) >= 0;
    });
}

// ---------- Baca ----------
function getPenilaianKerusakan(token, p) {
  try {
    var user = requireSession_(token, PNL_KODE, 'read');
    p = p || {};
    var T = pnlSiap_();
    pnlSinkron_(T);
    var semua = pnlDaftar_(user, p, T);
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
    return ok_({
      rows: out, page: page, pageSize: pageSize, total: rows.length, counts: cnt,
      opsi: { pelayanan: PNL_PELAYANAN, validasi: PNL_VALIDASI_KK },
      izin: { tambah: menuAccess(Repo.cfg(PNL_KODE)).write.indexOf(user.role) >= 0 }, validatorSaja: faskesTinggi_(user)
    });
  } catch (e) { return galatUmum_(e, 'getPenilaianKerusakan'); }
}

// Daftar data Faskes (Kondisi) yang dapat dipilih pada formulir Tambah Data (semua baris dalam cakupan akun, termasuk yang sudah pernah dinilai)
function getPenilaianSumber(token) {
  try {
    var user = requireSession_(token, PNL_KODE, 'write');
    var T = pnlSiap_();
    pnlSinkron_(T);
    var M = faskesMaster_(), K = faskesKabMap_();
    var daftar = readAll_(T.sh).filter(function (x) { return faskesDalamCakupan_(user, x); })
      .map(function (x) { x.ID_Record = x[T.idKey]; return x; })
      .map(function (x) { var r = pnlBentuk_(user, x, M, K); r.dihapus = rhaBool_(x.Is_Deleted); return r; })
      .filter(function (r) { return !!r.idKondisi; });
    daftar.sort(function (a, b) { return String(b.tgl).localeCompare(String(a.tgl)) || String(a.nama).localeCompare(String(b.nama)); });
    return ok_({ sumber: daftar.slice(0, 500), opsi: { pelayanan: PNL_PELAYANAN, validasi: PNL_VALIDASI_KK } });
  } catch (e) { return galatUmum_(e, 'getPenilaianSumber'); }
}

function exportPenilaianKerusakan(token, p) {
  try {
    var user = requireSession_(token, PNL_KODE, 'read');
    var T = pnlSiap_(), rows = pnlDaftar_(user, p, T);
    var st = ['Diajukan', 'Terverifikasi', 'Tervalidasi'].indexOf((p || {}).status) >= 0 ? p.status : '';
    if (st) rows = rows.filter(function (o) { return o.row.status === st; });
    function c(v) { v = faskesStr_(v).replace(/"/g, '""'); return /^[=+\-@]/.test(v) ? "'" + v : v; }
    var baris = [['No', 'Tanggal Kejadian Awal', 'Kabupaten', 'Nama Faskes', 'Kondisi Faskes', 'Alamat', 'Kecamatan', 'Pelayanan',
      'Validasi Kerusakan & Kerugian', 'Lembaga/Instansi yang Validasi', 'Tanggal Validasi Kerusakan & Kerugian', 'Status']];
    rows.forEach(function (o, i) {
      var r = o.row;
      baris.push([i + 1, r.tgl, r.kabupaten, r.nama, r.kondisi, r.alamat, r.kecamatan, r.pelayanan, r.validasiKK, r.lembaga, r.tglValidasi, r.status]);
    });
    var csv = '\uFEFF' + baris.map(function (b) { return b.map(function (v) { return '"' + c(v) + '"'; }).join(','); }).join('\r\n');
    return ok_({ nama: 'Penilaian_Kerusakan_Faskes_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd_HHmm') + '.csv', csv: csv });
  } catch (e) { return galatUmum_(e, 'exportPenilaianKerusakan'); }
}

// ---------- Validasi isian (hanya 4 kolom yang boleh diisi; kolom integrasi tidak pernah diterima dari klien) ----------
function pnlBersih_(d) {
  d = d || {};
  var out = {};
  var pel = sanitizeText_(d.Pelayanan, 60);
  if (pel && PNL_PELAYANAN.indexOf(pel) < 0) validasi_('Pelayanan tidak sah.');
  out.Pelayanan = pel;
  var vk = sanitizeText_(d.Validasi_Kerusakan_Kerugian, 120);
  if (vk && PNL_VALIDASI_KK.indexOf(vk) < 0) validasi_('Validasi Kerusakan & Kerugian tidak sah.');
  out.Validasi_Kerusakan_Kerugian = vk;
  out.Lembaga_Validasi = sanitizeText_(d.Lembaga_Validasi, 1000);
  var t = String(d.Tanggal_Validasi || '').trim();
  if (t) {
    var tg = parseDateSafe_(t);
    if (!tg) validasi_('Tanggal Validasi Kerusakan & Kerugian tidak sah.');
    if (tg > new Date()) validasi_('Tanggal Validasi Kerusakan & Kerugian tidak boleh melewati hari ini.');
    out.Tanggal_Validasi = Utilities.formatDate(tg, CFG.TZ, 'yyyy-MM-dd');
  } else out.Tanggal_Validasi = '';
  return out;
}

function pnlCariBaris_(T, id, user) {
  var x = readAll_(T.sh).filter(function (r) { return r[T.idKey] === id && !rhaBool_(r.Is_Deleted); })[0];
  if (!x) validasi_('Data tidak ditemukan.');
  if (!faskesDalamCakupan_(user, x)) aksesDitolak_('Data di luar wilayah akun Anda.');
  return x;
}

// ---------- Simpan dari formulir Tambah Data (memilih data Faskes (Kondisi); bila sudah ada baris penilaiannya, baris itu dilengkapi) ----------
function savePenilaianKerusakan(token, payload, reqId) {
  try {
    var user = requireSession_(token, PNL_KODE, 'write');
    payload = payload || {};
    var idk = sanitizeText_(payload.ID_Kondisi, 60);
    if (!idk) validasi_('Pilih data Faskes (Kondisi) lebih dulu.');
    var T = pnlSiap_();
    pnlSinkron_(T);
    return withLock_(function () {
      var x = readAll_(T.sh).filter(function (r) { return String(r.ID_Kondisi) === idk; })[0];
      if (!x) validasi_('Data Faskes (Kondisi) tidak ditemukan. Muat ulang halaman lalu coba lagi.');
      if (!faskesDalamCakupan_(user, x)) aksesDitolak_('Data di luar wilayah akun Anda.');
      x.ID_Record = x[T.idKey];
      var dihapus = rhaBool_(x.Is_Deleted);
      if (!dihapus && !pnlAksi_(user, x).edit) aksesDitolak_('Data ini tidak dapat diubah (sudah Tervalidasi atau di luar kewenangan Anda).');
      var b = pnlBersih_(payload), now = nowWita_(), v = toInt_(x.Version) || 1;
      b.Version = v + 1; b.Updated_At = now; b.Updated_By = user.username;
      if (dihapus) { b.Is_Deleted = ''; b.Status_Data = STATUS_DATA.DIAJUKAN; }   // data yang pernah dihapus dihidupkan kembali
      rhaTulisBaris_(T.sh, T.h, x._row, b);
      pnlSelesai_();
      logAudit_(user, 'TAMBAH_PENILAIAN_KERUSAKAN', 'Penilaian Kerusakan Faskes', x.ID_Record, 'OK');
      return ok_({ id: x.ID_Record }, 'Data penilaian kerusakan faskes berhasil disimpan dan menunggu verifikasi.');
    });
  } catch (e) { return galatUmum_(e, 'savePenilaianKerusakan'); }
}

// ---------- Ubah (tabel / formulir): hanya Pelayanan, Validasi Kerusakan & Kerugian, Lembaga, Tanggal Validasi ----------
function updatePenilaianKerusakan(token, id, payload, version) {
  try {
    var user = requireSession_(token, PNL_KODE, 'write');
    id = sanitizeText_(id, 60);
    return withLock_(function () {
      var T = pnlSiap_(), x = pnlCariBaris_(T, id, user);
      if (!pnlAksi_(user, x).edit) aksesDitolak_('Data ini tidak dapat diubah (sudah Tervalidasi atau di luar kewenangan Anda).');
      var v = toInt_(x.Version) || 1;
      if (version !== undefined && version !== null && version !== '' && Number(version) !== v) validasi_('Data telah diubah pengguna lain. Muat ulang tabel lalu coba lagi.');
      var b = pnlBersih_(payload);
      b.Version = v + 1; b.Updated_At = nowWita_(); b.Updated_By = user.username;
      rhaTulisBaris_(T.sh, T.h, x._row, b);
      pnlSelesai_();
      logAudit_(user, 'UBAH_PENILAIAN_KERUSAKAN', 'Penilaian Kerusakan Faskes', id, 'OK');
      return ok_({ id: id, version: v + 1 }, 'Data penilaian kerusakan faskes berhasil diperbarui.');
    });
  } catch (e) { return galatUmum_(e, 'updatePenilaianKerusakan'); }
}

// ---------- Hapus (soft delete) ----------
function hapusPenilaianKerusakan(token, id) {
  try {
    var user = requireSession_(token, PNL_KODE, 'read');
    id = sanitizeText_(id, 60);
    return withLock_(function () {
      var T = pnlSiap_(), x = pnlCariBaris_(T, id, user);
      if (!pnlAksi_(user, x).hapus) aksesDitolak_('Data ini tidak dapat dihapus (sudah Tervalidasi atau di luar kewenangan Anda).');
      rhaTulisBaris_(T.sh, T.h, x._row, { Is_Deleted: 'TRUE', Version: (toInt_(x.Version) || 1) + 1, Updated_At: nowWita_(), Updated_By: user.username });
      pnlSelesai_();
      logAudit_(user, 'HAPUS_PENILAIAN_KERUSAKAN', 'Penilaian Kerusakan Faskes', id, 'OK');
      return ok_({ id: id }, 'Data penilaian kerusakan faskes dihapus.');
    });
  } catch (e) { return galatUmum_(e, 'hapusPenilaianKerusakan'); }
}

// ---------- Verifikasi: Admin Kabupaten, Admin Puskesmas, Admin Posko ----------
function verifikasiPenilaianKerusakan(token, id) {
  try {
    var user = requireSession_(token, PNL_KODE, 'read');
    id = sanitizeText_(id, 60);
    return withLock_(function () {
      var T = pnlSiap_(), x = pnlCariBaris_(T, id, user);
      if (!pnlAksi_(user, x).verifikasi) aksesDitolak_('Verifikasi hanya dapat dilakukan Admin Kabupaten, Admin Puskesmas, atau Admin Posko pada data yang belum diverifikasi.');
      var now = nowWita_();
      rhaTulisBaris_(T.sh, T.h, x._row, { Status_Data: 'Terverifikasi', Verified_By: user.username, Verified_At: now, Catatan_Verifikasi: '',
        Version: (toInt_(x.Version) || 1) + 1, Updated_At: now, Updated_By: user.username });
      pnlSelesai_();
      logAudit_(user, 'VERIFIKASI_PENILAIAN_KERUSAKAN', 'Penilaian Kerusakan Faskes', id, 'OK');
      return ok_({ id: id }, 'Data penilaian kerusakan faskes terverifikasi.');
    });
  } catch (e) { return galatUmum_(e, 'verifikasiPenilaianKerusakan'); }
}

// ---------- Validasi: Admin Provinsi dan Super Admin (data harus sudah Terverifikasi dan lengkap) ----------
function validasiPenilaianKerusakan(token, id) {
  try {
    var user = requireSession_(token, PNL_KODE, 'read');
    if (FASKES_ROLE_VALID.indexOf(user.role) < 0) aksesDitolak_('Validasi hanya dapat dilakukan Admin Provinsi dan Super Admin.');
    id = sanitizeText_(id, 60);
    return withLock_(function () {
      var T = pnlSiap_(), x = pnlCariBaris_(T, id, user);
      if (x.Status_Data === 'Tervalidasi') return ok_({ id: id }, 'Data sudah Tervalidasi.');
      if (x.Status_Data !== 'Terverifikasi') return { success: false, code: 'VALIDASI', message: 'Data belum dapat divalidasi.', masalah: ['Data harus diverifikasi lebih dulu oleh Admin Kabupaten, Admin Puskesmas, atau Admin Posko.'] };
      var masalah = [];
      if (!String(x.Nama_Faskes || x.ID_Faskes || '').trim()) masalah.push('Nama Faskes belum terisi (lengkapi di Menu Faskes (Kondisi)).');
      if (!String(x.Kondisi_Faskes || x.Tingkat_Kerusakan || '').trim()) masalah.push('Kondisi Faskes belum terisi (lengkapi di Menu Faskes (Kondisi)).');
      if (PNL_PELAYANAN.indexOf(String(x.Pelayanan)) < 0) masalah.push('Pelayanan belum dipilih.');
      var vk = String(x.Validasi_Kerusakan_Kerugian || '');
      if (PNL_VALIDASI_KK.indexOf(vk) < 0) masalah.push('Validasi Kerusakan & Kerugian belum dipilih.');
      if (/Sudah/.test(vk)) {
        if (!String(x.Lembaga_Validasi || '').trim()) masalah.push('Lembaga/Instansi yang Validasi belum diisi.');
        if (!fmtIso_(x.Tanggal_Validasi)) masalah.push('Tanggal Validasi Kerusakan & Kerugian belum diisi.');
      }
      if (masalah.length) return { success: false, code: 'VALIDASI', message: 'Data belum dapat divalidasi. Lengkapi kolom berikut lebih dulu.', masalah: masalah };
      var now = nowWita_();
      rhaTulisBaris_(T.sh, T.h, x._row, { Status_Data: 'Tervalidasi', Validated_By: user.username, Validated_At: now,
        Version: (toInt_(x.Version) || 1) + 1, Updated_At: now, Updated_By: user.username });
      pnlSelesai_();
      logAudit_(user, 'VALIDASI_PENILAIAN_KERUSAKAN', 'Penilaian Kerusakan Faskes', id, 'OK');
      return ok_({ id: id }, 'Data penilaian kerusakan faskes tervalidasi.');
    });
  } catch (e) { return galatUmum_(e, 'validasiPenilaianKerusakan'); }
}
