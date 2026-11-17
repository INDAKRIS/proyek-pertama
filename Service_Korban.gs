/**
 * Service_Korban.gs — Menu Korban (M25): daftar, tambah, ubah, VALIDASI, hapus.
 * Memakai sheet TRX_Korban (kolom lama tetap, kolom baru ditambahkan otomatis saat simpan pertama).
 * Semua fungsi publik diawali requireSession_ dan dibatasi lingkup wilayah pengguna.
 * Catatan: pesan validasi_() tidak boleh memuat tanda titik dua, karena galatUmum_() memotong pesan di tanda itu.
 */

function korbanCfg_() {
  return {
    SHEET: 'TRX_Korban', PREFIX: 'KRB',
    JK: ['Laki-laki', 'Perempuan'],
    WN: ['WNI', 'WNA'],
    // [PERUBAHAN KORBAN] Pilihan Rujukan baru. Isian boleh kosong ("-- Pilih --"). RUJUKAN_LAMA hanya diterima agar data lama tidak rusak.
    RUJUKAN: ['Tidak Darurat', 'Darurat Stabil', 'Darurat Kritis'],
    RUJUKAN_LAMA: ['Dirujuk', 'Tidak Dirujuk'],
    // Usia 0-1 tahun ditentukan dari total bulan (tahun x 12 + bulan): 0-5 bulan = BAYI[0], 6-23 bulan = BAYI[1]
    BAYI: ['Bayi (0-5 bln)', 'Bayi (6-23 bln)'],
    // Usia 2 tahun ke atas: [batas usia atas (tahun, inklusif), label]
    KATEGORI: [[4, 'Balita (24-59 bln)'], [11, 'Anak (5-11 th)'], [17, 'Remaja (12-17 th)'], [59, 'Dewasa (18-59 th)'], [999, 'Lansia (60+ th)']],
    // Peran yang boleh memvalidasi (Admin Kabupaten hanya untuk wilayahnya, dibatasi korbanInScope_)
    VALIDATOR: [ROLE.SUPER, ROLE.PROV],   // [PERUBAHAN] Validasi hanya Admin Provinsi dan Super Admin
    VERIFIKATOR: [ROLE.KAB, ROLE.PUSKESMAS, ROLE.POSKO],   // [PERUBAHAN] Verifikasi oleh Admin Kabupaten, Puskesmas, Posko
    KOLOM: ['ID_Record', 'Nama', 'Jenis_Kelamin', 'Usia', 'Usia_Bulan', 'Kategori_Usia', 'Status_Awal', 'Alamat_Korban', 'Kecamatan', 'Tgl_Kejadian_Awal',
      'Lokasi_Kejadian', 'Diagnosa', 'Kewarganegaraan', 'Lokasi_Perawatan', 'Rujukan', 'Tujuan_Rujukan', 'ID_Pasien', 'ID_Kejadian'],
    SYS: ['ID_Kabupaten', 'ID_Faskes', 'ID_Posko', 'Keterangan', 'Status_Data', 'Catatan_Verifikasi', 'Version', 'Request_ID',
      'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Verified_By', 'Verified_At', 'Validated_By', 'Validated_At', 'Is_Deleted']
  };
}

// ---------- Util ----------
// usia = tahun (bulat); bulan hanya dipakai untuk usia 0 atau 1 tahun (wajib 0 sampai 11). Mengembalikan '' bila belum bisa ditentukan.
function kategoriUsia_(usia, bulan) {
  var K = korbanCfg_(), u = Number(usia);
  if (usia === null || usia === undefined || usia === '' || isNaN(u) || u < 0) return '';
  if (u <= 1) {
    if (bulan === null || bulan === undefined || String(bulan).trim() === '') return '';
    var b = Number(bulan);
    if (isNaN(b) || b < 0 || b > 11) return '';
    return (u * 12 + b) <= 5 ? K.BAYI[0] : K.BAYI[1];
  }
  for (var i = 0; i < K.KATEGORI.length; i++) if (u <= K.KATEGORI[i][0]) return K.KATEGORI[i][1];
  return '';
}
function tanggalSah_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
function korbanHapus_(r) { return r.Is_Deleted === true || String(r.Is_Deleted).toUpperCase() === 'TRUE'; }
function korbanSet_(vals, h, k, v) { var i = h.indexOf(k); if (i >= 0) vals[i] = sanitizeCell_(v); }
function korbanSelesai_() {
  bumpData_();
  invalidasiCache_(CFG.CACHE_PREFIX.SYS);
  invalidasiCache_(CFG.CACHE_PREFIX.PUB);
}
function korbanNamaKab_() {
  var m = {};
  try { readAllCached_(CFG.KEY.SS_RHA, 'sheetKabupaten', 600).forEach(function (r) { m[r.ID_Kabupaten] = r.Nama_Wilayah; }); } catch (e) {}
  return m;
}

// Buat sheet bila belum ada; tambahkan kolom yang kurang (hanya jalur tulis)
function korbanSheet_(buat) {
  var K = korbanCfg_(), ss = getSS_(CFG.KEY.SS_UTAMA), want = K.KOLOM.concat(K.SYS);
  var sh = ss.getSheetByName(K.SHEET);
  if (!sh) return buat ? getSheet_(ss, K.SHEET, want) : null;
  if (buat) {
    var h = headersOf_(sh);
    var miss = want.filter(function (k) { return h.indexOf(k) < 0; });
    if (miss.length) {
      var perlu = h.length + miss.length;
      if (perlu > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), perlu - sh.getMaxColumns());
      sh.getRange(1, h.length + 1, 1, miss.length).setValues([miss]);
    }
  }
  return sh;
}
function korbanBaca_() {
  try { return readAllCached_(CFG.KEY.SS_UTAMA, korbanCfg_().SHEET, 120); }
  catch (e) { if (/^SHEET_TIDAK_ADA/.test(String(e && e.message))) return []; throw e; }
}

// ---------- Lingkup & izin ----------
function korbanInScope_(user, r) {
  var role = user.role;
  if (role === ROLE.SUPER || role === ROLE.PROV) return true;
  if (role === ROLE.KAB) return !!user.idKabupaten && String(r.ID_Kabupaten) === String(user.idKabupaten);
  return (!!user.idFaskes && String(r.ID_Faskes) === String(user.idFaskes)) || (!!user.idPosko && String(r.ID_Posko) === String(user.idPosko));
}
function korbanIzin_(user, r) {
  var K = korbanCfg_(), acc = menuAccess(Repo.cfg('M25')), role = user.role;
  var s = r.Status_Data || STATUS_DATA.DRAFT, valid = s === STATUS_DATA.TERVALIDASI;
  return {
    edit: acc.write.indexOf(role) >= 0 && (!valid || role === ROLE.SUPER),
    verifikasi: K.VERIFIKATOR.indexOf(role) >= 0 && s !== STATUS_DATA.TERVERIFIKASI && !valid,
    validasi: K.VALIDATOR.indexOf(role) >= 0 && s === STATUS_DATA.TERVERIFIKASI,
    hapus: (acc.del.indexOf(role) >= 0 && (!valid || role === ROLE.SUPER)) || (s === STATUS_DATA.DRAFT && String(r.Created_By) === String(user.username))
  };
}

// ---------- Validasi isian (dipakai saat simpan dan ubah) ----------
function korbanBersih_(p) {
  var K = korbanCfg_();
  p = p || {};
  var c = {};
  c.Tgl_Kejadian_Awal = String(p.Tgl_Kejadian_Awal || '').trim().substring(0, 10);
  if (!c.Tgl_Kejadian_Awal) validasi_('Tanggal Kejadian Awal wajib diisi.');
  if (!tanggalSah_(c.Tgl_Kejadian_Awal)) validasi_('Tanggal Kejadian Awal bukan tanggal yang sah.');
  if (c.Tgl_Kejadian_Awal > todayWita_()) validasi_('Tanggal Kejadian Awal tidak boleh melewati hari ini.');

  c.Nama = sanitizeText_(p.Nama, 150);
  if (!c.Nama) validasi_('Nama wajib diisi.');
  if (c.Nama.length < 2) validasi_('Nama terlalu pendek.');

  c.Jenis_Kelamin = String(p.Jenis_Kelamin || '').trim();
  if (!c.Jenis_Kelamin) validasi_('Jenis Kelamin wajib diisi.');
  if (K.JK.indexOf(c.Jenis_Kelamin) < 0) validasi_('Jenis Kelamin tidak sah.');

  var u = String(p.Usia === undefined || p.Usia === null ? '' : p.Usia).trim();
  if (u === '') validasi_('Usia wajib diisi.');
  if (!/^\d{1,3}$/.test(u) || parseInt(u, 10) > 120) validasi_('Usia harus bilangan bulat 0 sampai 120.');
  c.Usia = parseInt(u, 10);
  if (c.Usia <= 1) {
    var bl = String(p.Usia_Bulan === undefined || p.Usia_Bulan === null ? '' : p.Usia_Bulan).trim();
    if (bl === '') validasi_('Usia (bulan) wajib diisi untuk usia 0 atau 1 tahun.');
    if (!/^\d{1,2}$/.test(bl) || parseInt(bl, 10) > 11) validasi_('Usia (bulan) harus bilangan bulat 0 sampai 11.');
    c.Usia_Bulan = parseInt(bl, 10);
  } else {
    c.Usia_Bulan = ''; // usia 2 tahun ke atas tidak memakai bulan
  }
  c.Kategori_Usia = kategoriUsia_(c.Usia, c.Usia_Bulan); // selalu dihitung server, nilai kiriman klien diabaikan

  c.Status_Awal = String(p.Status_Awal || '').trim();
  if (!c.Status_Awal) validasi_('Status Awal wajib diisi.');
  if (STATUS_AWAL_OPTS.indexOf(c.Status_Awal) < 0) validasi_('Status Awal tidak sah.');

  c.Alamat_Korban = sanitizeText_(p.Alamat_Korban, 300);
  c.Kecamatan = sanitizeText_(p.Kecamatan, 100);
  c.Lokasi_Kejadian = sanitizeText_(p.Lokasi_Kejadian, 300);
  c.Diagnosa = sanitizeText_(p.Diagnosa, 500);

  c.Kewarganegaraan = String(p.Kewarganegaraan || '').trim();
  if (!c.Kewarganegaraan) validasi_('Kewarganegaraan wajib diisi.');
  if (K.WN.indexOf(c.Kewarganegaraan) < 0) validasi_('Kewarganegaraan tidak sah.');

  c.Lokasi_Perawatan = sanitizeText_(p.Lokasi_Perawatan, 200);

  c.Rujukan = String(p.Rujukan || '').trim(); // boleh kosong
  if (c.Rujukan && K.RUJUKAN.concat(K.RUJUKAN_LAMA).indexOf(c.Rujukan) < 0) validasi_('Rujukan tidak sah.');
  c.Tujuan_Rujukan = c.Rujukan === 'Dirujuk' ? sanitizeText_(p.Tujuan_Rujukan, 200) : ''; // Tujuan hanya untuk data lama berstatus Dirujuk
  return c;
}

// Cap wilayah: Super/Provinsi memilih kabupaten; peran lain dikunci ke wilayah akunnya
function korbanStamp_(user, kabInput) {
  var role = user.role, tinggi = role === ROLE.SUPER || role === ROLE.PROV;
  var s = { ID_Kabupaten: '', ID_Faskes: tinggi ? '' : (user.idFaskes || ''), ID_Posko: tinggi ? '' : (user.idPosko || '') };
  if (tinggi) {
    s.ID_Kabupaten = String(kabInput || '').trim();
    if (!s.ID_Kabupaten) validasi_('Kabupaten wajib dipilih.');
  } else {
    s.ID_Kabupaten = user.idKabupaten || '';
    if (s.ID_Posko) {
      var p = readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Posko', 300).filter(function (r) { return r.ID_Posko === s.ID_Posko; })[0];
      if (p) { s.ID_Kabupaten = p.ID_Kabupaten || s.ID_Kabupaten; if (p.ID_Faskes_Pengelola) s.ID_Faskes = p.ID_Faskes_Pengelola; }
    }
    if (!s.ID_Kabupaten && s.ID_Faskes) {
      var f = readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Faskes', 300).filter(function (r) { return r.ID_Faskes === s.ID_Faskes; })[0];
      if (f) s.ID_Kabupaten = f.ID_Kabupaten || '';
    }
    if (!s.ID_Kabupaten) validasi_('Akun Anda belum terhubung ke kabupaten. Hubungi administrator.');
  }
  if (!korbanNamaKab_()[s.ID_Kabupaten]) validasi_('Kabupaten tidak dikenal.');
  return s;
}

// Cari data ganda (nama, jenis kelamin, usia, tanggal, kabupaten sama). Nama anonim dikecualikan.
function korbanDuplikat_(rows, c, idKab, idAbaikan) {
  if (/tidak\s+(dikenal|diketahui)|tanpa\s+nama|mr\.?\s*x|unknown/i.test(c.Nama)) return null;
  var norm = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  var n = norm(c.Nama), tgl = fmtIso_(c.Tgl_Kejadian_Awal);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (korbanHapus_(r) || r.ID_Record === idAbaikan) continue;
    if (norm(r.Nama) === n && r.Jenis_Kelamin === c.Jenis_Kelamin && toInt_(r.Usia) === c.Usia &&
      fmtIso_(r.Tgl_Kejadian_Awal) === tgl && String(r.ID_Kabupaten) === String(idKab)) return r.ID_Record;
  }
  return null;
}

// Pemeriksaan kelengkapan dan konsistensi sebelum data boleh berstatus Tervalidasi
function korbanPeriksa_(r, rows) {
  var K = korbanCfg_(), m = [], ada = function (v) { return String(v === null || v === undefined ? '' : v).trim() !== ''; };
  if (!ada(r.Nama) || String(r.Nama).trim().length < 2) m.push('Nama belum diisi.');
  if (K.JK.indexOf(r.Jenis_Kelamin) < 0) m.push('Jenis Kelamin belum diisi atau tidak sah.');
  var usia = toInt_(r.Usia), bulan = toInt_(r.Usia_Bulan);
  if (usia === null || usia < 0 || usia > 120) m.push('Usia belum diisi atau di luar rentang 0 sampai 120.');
  else if (usia <= 1 && (bulan === null || bulan < 0 || bulan > 11)) m.push('Usia (bulan) belum diisi atau di luar rentang 0 sampai 11 (wajib untuk usia 0 atau 1 tahun).');
  else if (String(r.Kategori_Usia) !== kategoriUsia_(usia, bulan)) m.push('Kategori Usia tidak sesuai dengan Usia (seharusnya ' + kategoriUsia_(usia, bulan) + '). Buka Edit lalu Simpan untuk memperbaruinya.');
  var tgl = fmtIso_(r.Tgl_Kejadian_Awal);
  if (!tgl) m.push('Tanggal Kejadian Awal belum diisi.');
  else if (tgl > todayWita_()) m.push('Tanggal Kejadian Awal melewati hari ini.');
  if (STATUS_AWAL_OPTS.indexOf(r.Status_Awal) < 0) m.push('Status Awal belum diisi atau tidak sah.');
  if (!ada(r.Alamat_Korban)) m.push('Alamat Korban belum diisi.');
  if (!ada(r.Kecamatan)) m.push('Kecamatan belum diisi.');
  if (!korbanNamaKab_()[r.ID_Kabupaten]) m.push('Kabupaten belum diisi atau tidak dikenal.');
  if (!ada(r.Lokasi_Kejadian)) m.push('Lokasi Kejadian belum diisi.');
  if (!ada(r.Diagnosa)) m.push('Diagnosa/Keterangan belum diisi.');
  if (K.WN.indexOf(r.Kewarganegaraan) < 0) m.push('Kewarganegaraan belum diisi atau tidak sah.');
  if ((r.Status_Awal === 'Luka Berat' || r.Status_Awal === 'Luka Ringan') && !ada(r.Lokasi_Perawatan)) m.push('Lokasi Perawatan belum diisi untuk korban luka.');
  if (K.RUJUKAN.concat(K.RUJUKAN_LAMA).indexOf(r.Rujukan) < 0) m.push('Rujukan belum diisi atau tidak sah.');
  else if (r.Rujukan === 'Dirujuk' && !ada(r.Tujuan_Rujukan)) m.push('Tujuan Rujukan belum diisi padahal korban dirujuk.');
  if (m.length === 0 && usia !== null) {
    var dup = korbanDuplikat_(rows, { Nama: String(r.Nama), Jenis_Kelamin: r.Jenis_Kelamin, Usia: usia, Tgl_Kejadian_Awal: r.Tgl_Kejadian_Awal }, r.ID_Kabupaten, r.ID_Record);
    if (dup) m.push('Ditemukan data ganda dengan ' + dup + '. Hapus salah satunya.');
  }
  return m;
}

// ---------- Format baris untuk browser ----------
function korbanRow_(user, r, namaKab) {
  var iz = korbanIzin_(user, r);
  return {
    id: r.ID_Record, tgl: String(r.Tgl_Kejadian_Awal || '').substring(0, 10), nama: r.Nama || r.ID_Pasien || '',
    jk: r.Jenis_Kelamin || '', usia: toInt_(r.Usia), usiaBulan: toInt_(r.Usia_Bulan), kategori: r.Kategori_Usia || '', statusAwal: r.Status_Awal || '',
    alamat: r.Alamat_Korban || '', kecamatan: r.Kecamatan || '', idKab: r.ID_Kabupaten || '', kabupaten: namaKab[r.ID_Kabupaten] || r.ID_Kabupaten || '',
    lokasiKejadian: r.Lokasi_Kejadian || '', diagnosa: r.Diagnosa || '', wn: r.Kewarganegaraan || '',
    lokasiPerawatan: r.Lokasi_Perawatan || '', rujukan: r.Rujukan || '', tujuanRujukan: r.Tujuan_Rujukan || '',
    status: r.Status_Data || STATUS_DATA.DRAFT, version: toInt_(r.Version) || 1,
    sumber: r.Sumber_RHA ? 'RHA' : '', idRha: r.ID_Kejadian_RHA || '', // penanda data hasil integrasi RHA (dipakai klien untuk mengunci kolom dasar)
    dibuatOleh: r.Created_By || '', dibuatPada: r.Created_At || '', divalidasiOleh: r.Validated_By || '', divalidasiPada: r.Validated_At || '',
    aksi: iz
  };
}

// ---------- DAFTAR ----------
function getKorban(token, p) {
  try {
    var user = requireSession_(token, 'M25', 'read');
    p = p || {};
    var K = korbanCfg_(), namaKab = korbanNamaKab_();
    var tinggi = user.role === ROLE.SUPER || user.role === ROLE.PROV;
    var q = p.search ? String(p.search).toLowerCase() : '';
    var dasar = korbanBaca_().filter(function (r) {
      if (korbanHapus_(r) || !korbanInScope_(user, r)) return false;
      if (p.idKabupaten && tinggi && String(r.ID_Kabupaten) !== String(p.idKabupaten)) return false;
      var d = String(r.Tgl_Kejadian_Awal || '').substring(0, 10);
      if (p.dari && (!d || d < p.dari)) return false;
      if (p.sampai && (!d || d > p.sampai)) return false;
      if (q) {
        var hay = [r.ID_Record, r.Nama, r.ID_Pasien, r.Alamat_Korban, r.Kecamatan, r.Lokasi_Kejadian, r.Diagnosa, r.Lokasi_Perawatan,
          r.Tujuan_Rujukan, r.Status_Awal, namaKab[r.ID_Kabupaten]].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var counts = { total: dasar.length, valid: 0, belum: 0 };
    dasar.forEach(function (r) { if (r.Status_Data === STATUS_DATA.TERVALIDASI) counts.valid++; else counts.belum++; });
    var rows = dasar;
    if (p.status === 'valid') rows = rows.filter(function (r) { return r.Status_Data === STATUS_DATA.TERVALIDASI; });
    else if (p.status === 'belum') rows = rows.filter(function (r) { return r.Status_Data !== STATUS_DATA.TERVALIDASI; });
    rows.sort(function (a, b) {
      return String(b.Created_At || '').localeCompare(String(a.Created_At || '')) || String(b.ID_Record || '').localeCompare(String(a.ID_Record || ''));
    });
    var pageSize = Math.min(Math.max(1, Number(p.pageSize) || CFG.PAGESIZE_DEFAULT), CFG.PAGESIZE_MAX);
    var page = Math.max(1, Number(p.page) || 1);
    var slice = rows.slice((page - 1) * pageSize, page * pageSize);
    return ok_({
      rows: slice.map(function (r) { return korbanRow_(user, r, namaKab); }),
      total: rows.length, page: page, pageSize: pageSize, counts: counts,
      opsi: { jk: K.JK, statusAwal: STATUS_AWAL_OPTS, wn: K.WN, rujukan: K.RUJUKAN, kategori: K.KATEGORI, bayi: K.BAYI },
      izin: { tambah: menuAccess(Repo.cfg('M25')).write.indexOf(user.role) >= 0 }
    });
  } catch (e) { return galatUmum_(e, 'getKorban'); }
}

// ---------- TAMBAH ----------
function saveKorban(token, payload, requestId) {
  try {
    var user = requireSession_(token, 'M25', 'write');
    var K = korbanCfg_();
    var c = korbanBersih_(payload);
    var st = korbanStamp_(user, payload && payload.ID_Kabupaten);
    var hasil = withLock_(function () {
      var sh = korbanSheet_(true), h = headersOf_(sh), ss = getSS_(CFG.KEY.SS_UTAMA);
      var rows = readAll_(sh);
      requestId = sanitizeText_(requestId || '', 80);
      if (requestId) {
        var lama = rows.filter(function (r) { return r.Request_ID === requestId; })[0];
        if (lama) return { id: lama.ID_Record, duplikat: true };
      }
      var dup = korbanDuplikat_(rows, c, st.ID_Kabupaten, '');
      if (dup) validasi_('Data korban yang sama sudah ada (' + dup + '). Periksa kembali.');
      var id = K.PREFIX + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, 'REPO_M25'), 4);
      var rec = {};
      Object.keys(c).forEach(function (k) { rec[k] = c[k]; });
      rec.ID_Record = id;
      rec.ID_Kabupaten = st.ID_Kabupaten; rec.ID_Faskes = st.ID_Faskes; rec.ID_Posko = st.ID_Posko;
      rec.Status_Data = STATUS_DATA.DRAFT; rec.Catatan_Verifikasi = '';
      rec.Version = 1; rec.Request_ID = requestId;
      rec.Created_At = nowWita_(); rec.Created_By = user.username; rec.Updated_At = nowWita_(); rec.Updated_By = user.username;
      rec.Is_Deleted = '';
      sh.appendRow(objToRow_(h, rec));
      return { id: id };
    });
    if (!hasil.duplikat) { korbanSelesai_(); logAudit_(user, 'TAMBAH_DATA', 'Korban', hasil.id, 'OK'); }
    return ok_({ id: hasil.id, ID_Record: hasil.id }, hasil.duplikat ? 'Data sudah tersimpan sebelumnya.' : 'Data korban tersimpan dan ditampilkan pada tabel.');
  } catch (e) { return galatUmum_(e, 'saveKorban'); }
}

// ---------- UBAH ----------
function updateKorban(token, id, payload, version) {
  try {
    var user = requireSession_(token, 'M25', 'write');
    var c = korbanBersih_(payload);
    var hasil = withLock_(function () {
      var sh = korbanSheet_(true), h = headersOf_(sh), rows = readAll_(sh);
      var r = rows.filter(function (x) { return String(x.ID_Record) === String(id) && !korbanHapus_(x); })[0];
      if (!r) validasi_('Data tidak ditemukan.');
      if (!korbanInScope_(user, r)) aksesDitolak_('Data di luar lingkup Anda.');
      if (!korbanIzin_(user, r).edit) aksesDitolak_('Data berstatus ' + (r.Status_Data || STATUS_DATA.DRAFT) + ' tidak dapat diubah.');
      var vSaatIni = toInt_(r.Version) || 1;
      if (version !== undefined && version !== null && version !== '' && Number(version) !== vSaatIni) validasi_('Data telah diubah pengguna lain. Muat ulang lalu coba lagi.');
      var tinggi = user.role === ROLE.SUPER || user.role === ROLE.PROV;
      var idKab = r.ID_Kabupaten;
      if (tinggi) { idKab = korbanStamp_(user, payload && payload.ID_Kabupaten).ID_Kabupaten; }
      var dup = korbanDuplikat_(rows, c, idKab, r.ID_Record);
      if (dup) validasi_('Data korban yang sama sudah ada (' + dup + '). Periksa kembali.');
      var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0];
      Object.keys(c).forEach(function (k) { korbanSet_(vals, h, k, c[k]); });
      korbanSet_(vals, h, 'ID_Kabupaten', idKab);
      if (r.Status_Data === STATUS_DATA.TERVALIDASI) { // perubahan oleh Super Admin membatalkan validasi
        korbanSet_(vals, h, 'Status_Data', STATUS_DATA.DRAFT);
        korbanSet_(vals, h, 'Validated_By', ''); korbanSet_(vals, h, 'Validated_At', '');
      }
      korbanSet_(vals, h, 'Version', vSaatIni + 1);
      korbanSet_(vals, h, 'Updated_At', nowWita_()); korbanSet_(vals, h, 'Updated_By', user.username);
      sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
      return { versi: vSaatIni + 1 };
    });
    korbanSelesai_(); logAudit_(user, 'UBAH_DATA', 'Korban', id, 'OK');
    return ok_({ id: id, ID_Record: id, Version: hasil.versi }, 'Data korban diperbarui.');
  } catch (e) { return galatUmum_(e, 'updateKorban'); }
}

// ---------- VALIDASI ----------
function validasiKorban(token, id) {
  try {
    var user = requireSession_(token, 'M25', 'read');
    var hasil = withLock_(function () {
      var sh = korbanSheet_(true), h = headersOf_(sh), rows = readAll_(sh);
      var r = rows.filter(function (x) { return String(x.ID_Record) === String(id) && !korbanHapus_(x); })[0];
      if (!r) validasi_('Data tidak ditemukan.');
      if (!korbanInScope_(user, r)) aksesDitolak_('Data di luar lingkup Anda.');
      if (!korbanIzin_(user, r).validasi) aksesDitolak_('Validasi hanya dapat dilakukan Admin Provinsi atau Super Admin pada data yang sudah terverifikasi.');
      var masalah = korbanPeriksa_(r, rows);
      if (masalah.length) return { masalah: masalah };
      var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0], now = nowWita_();
      korbanSet_(vals, h, 'Status_Data', STATUS_DATA.TERVALIDASI);
      korbanSet_(vals, h, 'Validated_By', user.username); korbanSet_(vals, h, 'Validated_At', now);
      korbanSet_(vals, h, 'Catatan_Verifikasi', '');
      korbanSet_(vals, h, 'Version', (toInt_(r.Version) || 1) + 1);
      korbanSet_(vals, h, 'Updated_At', now); korbanSet_(vals, h, 'Updated_By', user.username);
      sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
      return { ok: true };
    });
    if (hasil.masalah) {
      return { success: false, code: 'VALIDASI', message: 'Data belum dapat divalidasi. Lengkapi atau perbaiki terlebih dahulu.', masalah: hasil.masalah };
    }
    korbanSelesai_(); logAudit_(user, 'STATUS_VALIDASI', 'Korban', id + ' => ' + STATUS_DATA.TERVALIDASI, 'OK');
    return ok_({ id: id, status: STATUS_DATA.TERVALIDASI }, 'Data korban berhasil divalidasi.');
  } catch (e) { return galatUmum_(e, 'validasiKorban'); }
}

// ---------- VERIFIKASI (Admin Kabupaten, Admin Puskesmas, Admin Posko) ----------
function verifikasiKorban(token, id) {
  try {
    var user = requireSession_(token, 'M25', 'read');
    withLock_(function () {
      var sh = korbanSheet_(true), h = headersOf_(sh), rows = readAll_(sh);
      var r = rows.filter(function (x) { return String(x.ID_Record) === String(id) && !korbanHapus_(x); })[0];
      if (!r) validasi_('Data tidak ditemukan.');
      if (!korbanInScope_(user, r)) aksesDitolak_('Data di luar lingkup Anda.');
      if (!korbanIzin_(user, r).verifikasi) aksesDitolak_('Verifikasi hanya dapat dilakukan Admin Kabupaten, Admin Puskesmas, atau Admin Posko pada data yang belum diverifikasi.');
      var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0], now = nowWita_();
      korbanSet_(vals, h, 'Status_Data', STATUS_DATA.TERVERIFIKASI);
      korbanSet_(vals, h, 'Verified_By', user.username); korbanSet_(vals, h, 'Verified_At', now);
      korbanSet_(vals, h, 'Catatan_Verifikasi', '');
      korbanSet_(vals, h, 'Version', (toInt_(r.Version) || 1) + 1);
      korbanSet_(vals, h, 'Updated_At', now); korbanSet_(vals, h, 'Updated_By', user.username);
      sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
    });
    korbanSelesai_(); logAudit_(user, 'STATUS_VERIFIKASI', 'Korban', id + ' => ' + STATUS_DATA.TERVERIFIKASI, 'OK');
    return ok_({ id: id, status: STATUS_DATA.TERVERIFIKASI }, 'Data korban berhasil diverifikasi.');
  } catch (e) { return galatUmum_(e, 'verifikasiKorban'); }
}

// ---------- HAPUS (soft delete) ----------
function hapusKorban(token, id) {
  try {
    var user = requireSession_(token, 'M25', 'read');
    withLock_(function () {
      var sh = korbanSheet_(true), h = headersOf_(sh);
      var r = readAll_(sh).filter(function (x) { return String(x.ID_Record) === String(id) && !korbanHapus_(x); })[0];
      if (!r) validasi_('Data tidak ditemukan.');
      if (!korbanInScope_(user, r)) aksesDitolak_('Data di luar lingkup Anda.');
      if (!korbanIzin_(user, r).hapus) aksesDitolak_('Anda tidak berwenang menghapus data ini.');
      var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0];
      korbanSet_(vals, h, 'Is_Deleted', 'TRUE');
      korbanSet_(vals, h, 'Version', (toInt_(r.Version) || 1) + 1);
      korbanSet_(vals, h, 'Updated_At', nowWita_()); korbanSet_(vals, h, 'Updated_By', user.username);
      sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
    });
    korbanSelesai_(); logAudit_(user, 'HAPUS_DATA', 'Korban', id, 'OK');
    return ok_({ id: id }, 'Data korban dihapus.');
  } catch (e) { return galatUmum_(e, 'hapusKorban'); }
}
