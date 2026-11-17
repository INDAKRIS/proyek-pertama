/**
 * Service_Faskes.gs — Menu Faskes (Kondisi) (M02 = sheet TRX_Faskes_Kondisi) pada Dashboard Privat. BERKAS BARU.
 *
 * Kolom tabel/formulir: Tanggal Kejadian Awal, Kabupaten, Nama Faskes, Kondisi Faskes, Alamat, Kecamatan.
 *  - Data hasil integrasi Menu RHA (Sumber_RHA terisi): Tanggal, Kabupaten, Nama Faskes, Kondisi = TERKUNCI (hanya baca);
 *    Alamat dan Kecamatan boleh dilengkapi petugas (tidak ditimpa ulang oleh sinkron RHA bila sudah terisi).
 *  - Data manual: Tanggal Kejadian Awal diinput manual; Kabupaten terkunci sesuai akun (Admin Provinsi/Super Admin boleh memilih).
 *  - Alur status: Diajukan --(Verifikasi: Admin Kabupaten / Puskesmas / Posko)--> Terverifikasi --(Validasi: Admin Provinsi / Super Admin)--> Tervalidasi.
 *    Status "Tervalidasi" disembunyikan dari peran selain Admin Provinsi dan Super Admin (tampil sebagai "Terverifikasi").
 *
 * Fungsi publik (dipanggil google.script.run lewat api()):
 *   getFaskesKondisi, saveFaskesKondisi, updateFaskesKondisi, hapusFaskesKondisi,
 *   verifikasiFaskesKondisi, validasiFaskesKondisi, exportFaskesKondisi
 *
 * Peran/aksi mengikuti menuAccess (Config.gs): verify = KAB, PUSKESMAS, POSKO; validate = SUPER, PROV.
 * Bergantung pada helper yang sudah dipakai Service_RHA.gs: Repo.siapkanSheetSinkron, readAll_, readAllCached_, objToRow_, requireSession_,
 * withLock_, ok_, err_, validasi_, aksesDitolak_, galatUmum_, logAudit_, sanitizeText_, sanitizeCell_, toInt_, parseDateSafe_, nowWita_, fmtIso_,
 * nextSeq_, pad_, bumpData_, invalidasiCache_, rhaBool_, rhaTulisBaris_, RHA_KOL_EKSTRA.
 */

var FASKES_KODE = 'M02';
var FASKES_KONDISI_OPSI = KONDISI_FASKES_OPTS;   // dari Config.gs
var FASKES_ROLE_VERIF = ['ADMIN_KABUPATEN', 'ADMIN_PUSKESMAS', 'ADMIN_POSKO'];
var FASKES_ROLE_VALID = ['SUPER_ADMIN', 'ADMIN_PROVINSI'];

// ---------- Util ----------
function faskesEkstra_() {
  return RHA_KOL_EKSTRA.concat(['Nama_Faskes_Lainnya', 'Jenis_Faskes_RHA', 'Alamat', 'Kecamatan',
    'Verified_By', 'Verified_At', 'Validated_By', 'Validated_At']);
}
function faskesSiap_() { return Repo.siapkanSheetSinkron(FASKES_KODE, faskesEkstra_()); }
function faskesSelesai_() { bumpData_(); invalidasiCache_(CFG.CACHE_PREFIX.SYS); invalidasiCache_(CFG.CACHE_PREFIX.PUB); }
function faskesTinggi_(u) { return u.role === ROLE.SUPER || u.role === ROLE.PROV; }
function faskesKabUser_(u) { return String(u.idKabupaten || u.idKab || u.ID_Kabupaten || ''); }
function faskesStr_(v) { return v === undefined || v === null ? '' : String(v); }

function faskesMaster_() {
  var m = {};
  try { readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Faskes', 300).forEach(function (r) { if (!rhaBool_(r.Is_Deleted)) m[r.ID_Faskes] = r; }); } catch (e) {}
  return m;
}
function faskesKabMap_() {
  var m = {};
  try { readAllCached_(CFG.KEY.SS_RHA, 'sheetKabupaten', 600).forEach(function (r) { m[r.ID_Kabupaten] = r.Nama_Wilayah; }); } catch (e) {}
  return m;
}

// Cakupan wilayah: Admin Provinsi/Super Admin = semua; peran lain = kabupaten akunnya saja
function faskesDalamCakupan_(u, x) {   // sama dengan inScope_ di Repo.gs (scopeType F) + data buatan sendiri
  if (u.role === ROLE.SUPER || u.role === ROLE.PROV) return true;
  if (u.role === ROLE.KAB) return !!u.idKabupaten && String(x.ID_Kabupaten) === String(u.idKabupaten);
  return (!!u.idFaskes && String(x.ID_Faskes) === String(u.idFaskes)) || (!!u.idPosko && String(x.ID_Posko) === String(u.idPosko)) || (!!x.Created_By && String(x.Created_By) === String(u.username));
}

function faskesStatusTampil_(u, st) { st = st || 'Draft'; return (st === 'Tervalidasi' && FASKES_ROLE_VALID.indexOf(u.role) < 0) ? 'Terverifikasi' : st; }

function faskesAksi_(u, x) {
  var acc = menuAccess(Repo.cfg(FASKES_KODE)), st = x.Status_Data || STATUS_DATA.DRAFT, sama = faskesDalamCakupan_(u, x);
  var terkunci = st === STATUS_DATA.TERVALIDASI, super_ = u.role === ROLE.SUPER;
  return {
    edit: sama && acc.write.indexOf(u.role) >= 0 && (!terkunci || super_),
    hapus: sama && acc.del.indexOf(u.role) >= 0 && (!terkunci || super_),
    verifikasi: sama && acc.verify.indexOf(u.role) >= 0 && (st === STATUS_DATA.DRAFT || st === STATUS_DATA.DIAJUKAN || st === STATUS_DATA.DIKEMBALIKAN),
    validasi: acc.validate.indexOf(u.role) >= 0 && st === STATUS_DATA.TERVERIFIKASI
  };
}

function faskesBentuk_(u, x, M, K) {
  var m = x.ID_Faskes ? M[x.ID_Faskes] : null;
  var nama = m ? m.Nama_Faskes : (x.Nama_Faskes_Lainnya || x.ID_Faskes || '');
  return {
    id: x.ID_Record,
    tgl: fmtIso_(x.Tanggal), idKab: x.ID_Kabupaten, kabupaten: K[x.ID_Kabupaten] || x.ID_Kabupaten || '',
    idFaskes: x.ID_Faskes || '', nama: nama, jenis: x.Jenis_Faskes_RHA || (m ? m.Jenis_Faskes : ''),
    kondisi: x.Kondisi_Faskes || '', alamat: x.Alamat || '', kecamatan: x.Kecamatan || '',
    sumberRha: x.Sumber_RHA || '', idKejadian: x.ID_Kejadian || '',
    status: faskesStatusTampil_(u, x.Status_Data), version: toInt_(x.Version) || 1,
    dibuatPada: String(x.Created_At || ''), dibuatOleh: x.Created_By || '',
    diverifikasiOleh: x.Verified_By || '', diverifikasiPada: String(x.Verified_At || ''),
    divalidasiOleh: FASKES_ROLE_VALID.indexOf(u.role) >= 0 ? (x.Validated_By || '') : '', divalidasiPada: FASKES_ROLE_VALID.indexOf(u.role) >= 0 ? String(x.Validated_At || '') : '',
    aksi: faskesAksi_(u, x)
  };
}

// Baris sheet -> daftar terfilter (tanpa filter status; status diterapkan terpisah agar hitungan tab benar)
function faskesDaftar_(u, p, T) {
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
    .map(function (x) { return { raw: x, row: faskesBentuk_(u, x, M, K) }; })
    .filter(function (o) {
      if (!q) return true;
      var r = o.row;
      return (r.id + ' ' + r.nama + ' ' + r.kabupaten + ' ' + r.kondisi + ' ' + r.alamat + ' ' + r.kecamatan).toLowerCase().indexOf(q) >= 0;
    });
}

// ---------- Baca ----------
function getFaskesKondisi(token, p) {
  try {
    var user = requireSession_(token, FASKES_KODE, 'read');
    p = p || {};
    var T = faskesSiap_();
    var semua = faskesDaftar_(user, p, T);
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
    var opsi = { kondisi: FASKES_KONDISI_OPSI };
    if (p.denganFaskes) {
      var M = faskesMaster_(), daftar = [];
      Object.keys(M).forEach(function (k) { daftar.push([M[k].ID_Faskes, M[k].Nama_Faskes, M[k].ID_Kabupaten]); });
      opsi.faskes = daftar;
    }
    return ok_({ rows: out, page: page, pageSize: pageSize, total: rows.length, counts: cnt, opsi: opsi, izin: { tambah: true }, validatorSaja: faskesTinggi_(user) });
  } catch (e) { return galatUmum_(e, 'getFaskesKondisi'); }
}

function exportFaskesKondisi(token, p) {
  try {
    var user = requireSession_(token, FASKES_KODE, 'read');
    var T = faskesSiap_(), rows = faskesDaftar_(user, p, T);
    function c(v) { v = faskesStr_(v).replace(/"/g, '""'); return /^[=+\-@]/.test(v) ? "'" + v : v; }
    var baris = [['No', 'Tanggal Kejadian Awal', 'Kabupaten', 'Nama Faskes', 'Kondisi Faskes', 'Alamat', 'Kecamatan', 'Status']];
    rows.forEach(function (o, i) { var r = o.row; baris.push([i + 1, r.tgl, r.kabupaten, r.nama, r.kondisi, r.alamat, r.kecamatan, r.status]); });
    var csv = '\uFEFF' + baris.map(function (b) { return b.map(function (v) { return '"' + c(v) + '"'; }).join(','); }).join('\r\n');
    return ok_({ nama: 'Faskes_Kondisi_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd_HHmm') + '.csv', csv: csv });
  } catch (e) { return galatUmum_(e, 'exportFaskesKondisi'); }
}

// ---------- Validasi isian ----------
function faskesBersih_(user, d, rha) {
  d = d || {};
  var out = {};
  out.Alamat = sanitizeText_(d.Alamat, 300);
  out.Kecamatan = sanitizeText_(d.Kecamatan, 100);
  if (rha) return out;   // data hasil RHA: hanya Alamat dan Kecamatan yang boleh berubah
  var tgl = parseDateSafe_(d.Tanggal);
  if (!tgl) validasi_('Tanggal Kejadian Awal wajib diisi dan sah.');
  if (tgl > new Date()) validasi_('Tanggal Kejadian Awal tidak boleh melewati hari ini.');
  out.Tanggal = Utilities.formatDate(tgl, CFG.TZ, 'yyyy-MM-dd');
  var kab = faskesTinggi_(user) ? sanitizeText_(d.ID_Kabupaten, 40) : faskesKabUser_(user);   // peran lain: SELALU wilayah akun
  if (!kab) validasi_('Kabupaten / Kota wajib diisi.');
  if (!faskesKabMap_()[kab]) validasi_('Kabupaten / Kota tidak dikenal.');
  out.ID_Kabupaten = kab;
  var nama = sanitizeText_(d.Nama_Faskes, 200);
  if (nama.length < 3) validasi_('Nama Faskes wajib diisi.');
  var kond = sanitizeText_(d.Kondisi_Faskes, 40);
  if (FASKES_KONDISI_OPSI.indexOf(kond) < 0) validasi_('Kondisi Faskes wajib dipilih.');
  out.Kondisi_Faskes = kond;
  // cocokkan nama dengan master (kabupaten yang sama); tidak cocok = tulis sebagai nama bebas
  var M = faskesMaster_(), cocok = '';
  Object.keys(M).forEach(function (k) {
    if (!cocok && String(M[k].ID_Kabupaten) === kab && String(M[k].Nama_Faskes).trim().toLowerCase() === nama.toLowerCase()) cocok = k;
  });
  out.ID_Faskes = cocok;
  out.Nama_Faskes_Lainnya = cocok ? '' : nama;
  return out;
}

function faskesCatatBaris_(T, rowNum, obj) { rhaTulisBaris_(T.sh, T.h, rowNum, obj); }

// ---------- Simpan baru (manual) ----------
function saveFaskesKondisi(token, payload, reqId) {
  try {
    var user = requireSession_(token, FASKES_KODE, 'write');
    reqId = sanitizeText_(reqId, 80);
    return withLock_(function () {
      var T = faskesSiap_(), sh = T.sh, h = T.h;
      if (reqId) {   // ID permintaan sama = tidak digandakan
        var ada = readAll_(sh).filter(function (x) { return x.Request_ID === reqId; })[0];
        if (ada) return ok_({ id: ada[T.idKey] }, 'Data sudah tersimpan.');
      }
      var b = faskesBersih_(user, payload, false), now = nowWita_();
      var tahun = b.Tanggal.substring(0, 4);
      var id = 'FKD-' + tahun + '-' + pad_(nextSeq_(sh.getParent(), 'FKD-' + tahun), 5);
      var rec = {
        Tanggal: b.Tanggal, ID_Kejadian: '', ID_Faskes: b.ID_Faskes, Kondisi_Faskes: b.Kondisi_Faskes, Kapasitas_Layanan: '', Keterangan: '',
        ID_Kabupaten: b.ID_Kabupaten, ID_Posko: String(user.idPosko || ''), Nama_Faskes_Lainnya: b.Nama_Faskes_Lainnya, Jenis_Faskes_RHA: '',
        Alamat: b.Alamat, Kecamatan: b.Kecamatan, Sumber_RHA: '', ID_Peristiwa: '', ID_Kejadian_RHA: ''
      };
      rec[T.idKey] = id; rec.Status_Data = STATUS_DATA.DIAJUKAN; rec.Catatan_Verifikasi = ''; rec.Version = 1; rec.Request_ID = reqId || ('FKD-' + id);
      rec.Created_At = now; rec.Created_By = user.username; rec.Updated_At = now; rec.Updated_By = user.username; rec.Is_Deleted = '';
      Object.keys(rec).forEach(function (k) { if (typeof rec[k] === 'string') rec[k] = sanitizeCell_(rec[k]); });
      sh.getRange(sh.getLastRow() + 1, 1, 1, h.length).setValues([objToRow_(h, rec)]);
      faskesSelesai_();
      logAudit_(user, 'TAMBAH_FASKES_KONDISI', 'Faskes (Kondisi)', id, 'OK');
      return ok_({ id: id }, 'Data faskes (kondisi) berhasil disimpan dan menunggu verifikasi.');
    });
  } catch (e) { return galatUmum_(e, 'saveFaskesKondisi'); }
}

function faskesCariBaris_(T, id, user) {
  var x = readAll_(T.sh).filter(function (r) { return r[T.idKey] === id && !rhaBool_(r.Is_Deleted); })[0];
  if (!x) validasi_('Data tidak ditemukan.');
  if (!faskesDalamCakupan_(user, x)) aksesDitolak_('Data di luar wilayah akun Anda.');
  return x;
}

// ---------- Ubah (data manual: semua kolom; data hasil RHA: hanya Alamat dan Kecamatan) ----------
function updateFaskesKondisi(token, id, payload, version) {
  try {
    var user = requireSession_(token, FASKES_KODE, 'write');
    id = sanitizeText_(id, 60);
    return withLock_(function () {
      var T = faskesSiap_(), x = faskesCariBaris_(T, id, user);
      if (!faskesAksi_(user, x).edit) aksesDitolak_('Data ini tidak dapat diubah (sudah Tervalidasi atau di luar kewenangan Anda).');
      var v = toInt_(x.Version) || 1;
      if (version !== undefined && version !== null && version !== '' && Number(version) !== v) validasi_('Data telah diubah pengguna lain. Muat ulang tabel lalu coba lagi.');
      var rha = !!x.Sumber_RHA;
      var b = faskesBersih_(user, payload, rha);
      b.Version = v + 1; b.Updated_At = nowWita_(); b.Updated_By = user.username;
      faskesCatatBaris_(T, x._row, b);
      faskesSelesai_();
      logAudit_(user, 'UBAH_FASKES_KONDISI', 'Faskes (Kondisi)', id + (rha ? ' (hasil RHA: Alamat/Kecamatan)' : ''), 'OK');
      return ok_({ id: id, version: v + 1 }, 'Data faskes (kondisi) berhasil diperbarui.');
    });
  } catch (e) { return galatUmum_(e, 'updateFaskesKondisi'); }
}

// ---------- Hapus (soft delete) ----------
function hapusFaskesKondisi(token, id) {
  try {
    var user = requireSession_(token, FASKES_KODE, 'read');
    id = sanitizeText_(id, 60);
    return withLock_(function () {
      var T = faskesSiap_(), x = faskesCariBaris_(T, id, user);
      if (!faskesAksi_(user, x).hapus) aksesDitolak_('Data ini tidak dapat dihapus (sudah Tervalidasi atau di luar kewenangan Anda).');
      faskesCatatBaris_(T, x._row, { Is_Deleted: 'TRUE', Version: (toInt_(x.Version) || 1) + 1, Updated_At: nowWita_(), Updated_By: user.username });
      faskesSelesai_();
      logAudit_(user, 'HAPUS_FASKES_KONDISI', 'Faskes (Kondisi)', id, 'OK');
      return ok_({ id: id }, 'Data faskes (kondisi) dihapus.');
    });
  } catch (e) { return galatUmum_(e, 'hapusFaskesKondisi'); }
}

// ---------- Verifikasi: Admin Kabupaten, Admin Puskesmas, Admin Posko ----------
function verifikasiFaskesKondisi(token, id) {
  try {
    var user = requireSession_(token, FASKES_KODE, 'read');
    id = sanitizeText_(id, 60);
    return withLock_(function () {
      var T = faskesSiap_(), x = faskesCariBaris_(T, id, user);
      if (!faskesAksi_(user, x).verifikasi) aksesDitolak_('Verifikasi hanya dapat dilakukan Admin Kabupaten, Admin Puskesmas, atau Admin Posko pada data yang belum diverifikasi.');
      var now = nowWita_();
      faskesCatatBaris_(T, x._row, { Status_Data: 'Terverifikasi', Verified_By: user.username, Verified_At: now, Catatan_Verifikasi: '',
        Version: (toInt_(x.Version) || 1) + 1, Updated_At: now, Updated_By: user.username });
      faskesSelesai_();
      logAudit_(user, 'VERIFIKASI_FASKES_KONDISI', 'Faskes (Kondisi)', id, 'OK');
      return ok_({ id: id }, 'Data faskes (kondisi) terverifikasi.');
    });
  } catch (e) { return galatUmum_(e, 'verifikasiFaskesKondisi'); }
}

// ---------- Validasi: Admin Provinsi dan Super Admin (data harus sudah Terverifikasi dan lengkap) ----------
function validasiFaskesKondisi(token, id) {
  try {
    var user = requireSession_(token, FASKES_KODE, 'read');
    if (FASKES_ROLE_VALID.indexOf(user.role) < 0) aksesDitolak_('Validasi hanya dapat dilakukan Admin Provinsi dan Super Admin.');   // peran dari Config.gs menuAccess.validate
    id = sanitizeText_(id, 60);
    return withLock_(function () {
      var T = faskesSiap_(), x = faskesCariBaris_(T, id, user);
      if (x.Status_Data === 'Tervalidasi') return ok_({ id: id }, 'Data sudah Tervalidasi.');
      if (x.Status_Data !== 'Terverifikasi') return { success: false, code: 'VALIDASI', message: 'Data belum dapat divalidasi.', masalah: ['Data harus diverifikasi lebih dulu oleh Admin Kabupaten, Admin Puskesmas, atau Admin Posko.'] };
      var masalah = [], M = faskesMaster_();
      var nama = x.ID_Faskes && M[x.ID_Faskes] ? M[x.ID_Faskes].Nama_Faskes : x.Nama_Faskes_Lainnya;
      if (!nama) masalah.push('Nama Faskes belum terisi.');
      if (FASKES_KONDISI_OPSI.indexOf(String(x.Kondisi_Faskes)) < 0) masalah.push('Kondisi Faskes belum terisi atau tidak sah.');
      if (!String(x.Alamat || '').trim()) masalah.push('Alamat belum diisi.');
      if (!String(x.Kecamatan || '').trim()) masalah.push('Kecamatan belum diisi.');
      if (masalah.length) return { success: false, code: 'VALIDASI', message: 'Data belum dapat divalidasi. Lengkapi kolom berikut lebih dulu.', masalah: masalah };
      var now = nowWita_();
      faskesCatatBaris_(T, x._row, { Status_Data: 'Tervalidasi', Validated_By: user.username, Validated_At: now,
        Version: (toInt_(x.Version) || 1) + 1, Updated_At: now, Updated_By: user.username });
      faskesSelesai_();
      logAudit_(user, 'VALIDASI_FASKES_KONDISI', 'Faskes (Kondisi)', id, 'OK');
      return ok_({ id: id }, 'Data faskes (kondisi) tervalidasi.');
    });
  } catch (e) { return galatUmum_(e, 'validasiFaskesKondisi'); }
}
