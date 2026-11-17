/**
 * Service_Perkembangan.gs — Menu Perkembangan Korban (M26), Dashboard Privat.
 *
 * Model data:
 *  - Tabel menu = SETIAP korban pada TRX_Korban (hasil integrasi Menu RHA dan Menu Korban) digabung dengan
 *    catatan perkembangannya di TRX_Korban_Perkembangan (satu catatan per korban, diperbarui di tempat).
 *  - Kolom identitas dan klinis (Nama, Jenis Kelamin, Usia, Kategori Usia, Status Awal, Diagnosa, Alamat, Kecamatan,
 *    Lokasi Kejadian, Lokasi Perawatan, Rujukan, Kewarganegaraan) DIBACA dari TRX_Korban, tidak disalin.
 *    Data RHA sudah masuk ke TRX_Korban lewat sinkron (Sumber_RHA), sehingga satu sumber melayani kedua jalur integrasi.
 *  - Yang disimpan di sini hanya: ID_Korban, Status_Lanjutan, Tgl_Status_Lanjutan.
 *  - Kolom Korban yang masih KOSONG boleh dilengkapi dari tabel Perkembangan (hanya mengisi yang kosong, tidak menimpa).
 *
 * Bergantung pada Service_Korban.gs (korbanCfg_, korbanSheet_, korbanBaca_, korbanInScope_, korbanIzin_, korbanHapus_,
 * korbanSet_, korbanNamaKab_, korbanSelesai_, tanggalSah_) dan helper Utils.gs.
 * Catatan: pesan validasi_() tidak boleh memuat tanda titik dua, karena galatUmum_() memotong pesan di tanda itu.
 */

function perkCfg_() {
  return {
    SHEET: 'TRX_Korban_Perkembangan', PREFIX: 'KRP', SEQ: 'REPO_M26',
    // Kolom lama (Repo) tetap dipakai; Tgl_Status_Lanjutan ditambahkan otomatis saat simpan pertama
    KOLOM: ['ID_Record', 'ID_Korban', 'Tanggal', 'Status_Lanjutan', 'Tgl_Status_Lanjutan'],
    SYS: ['ID_Kabupaten', 'ID_Faskes', 'ID_Posko', 'Status_Data', 'Catatan_Verifikasi', 'Version', 'Request_ID',
      'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Verified_By', 'Verified_At', 'Validated_By', 'Validated_At', 'Is_Deleted'],
    WAJIB_TGL: ['Sembuh', 'Dirujuk', 'Meninggal'],
    // Kolom Korban yang boleh dilengkapi dari tabel Perkembangan (nama kolom sheet : panjang maksimum)
    ISI_TEKS: { Diagnosa: 500, Kecamatan: 100, Lokasi_Kejadian: 300, Lokasi_Perawatan: 200 },
    // Halaman Korban di browser memakai tiga nilai ini untuk kolom Rujukan; server Korban memakai Dirujuk/Tidak Dirujuk. Keduanya diterima.
    RUJUKAN: ['Dirujuk', 'Tidak Dirujuk', 'Tidak Darurat', 'Darurat Stabil', 'Darurat Kritis']
  };
}

// ---------- Util ----------
function perkSheet_(buat) {
  var P = perkCfg_(), ss = getSS_(CFG.KEY.SS_UTAMA), want = P.KOLOM.concat(P.SYS);
  var sh = ss.getSheetByName(P.SHEET);
  if (!sh) return buat ? getSheet_(ss, P.SHEET, want) : null;
  if (buat) {
    var h = headersOf_(sh), miss = want.filter(function (k) { return h.indexOf(k) < 0; });
    if (miss.length) {
      var perlu = h.length + miss.length;
      if (perlu > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), perlu - sh.getMaxColumns());
      sh.getRange(1, h.length + 1, 1, miss.length).setValues([miss]);
    }
  }
  return sh;
}
function perkBaca_() {
  try { return readAllCached_(CFG.KEY.SS_UTAMA, perkCfg_().SHEET, 120); }
  catch (e) { if (/^SHEET_TIDAK_ADA/.test(String(e && e.message))) return []; throw e; }
}
function perkTglOf_(p) { return p ? (fmtIso_(p.Tgl_Status_Lanjutan) || fmtIso_(p.Tanggal) || '') : ''; }
// Satu catatan terbaru per korban (data lama berbentuk riwayat tetap terbaca; yang dipakai catatan terakhir)
function perkPetaTerbaru_(rows) {
  var m = {};
  rows.forEach(function (p) {
    if (korbanHapus_(p) || !p.ID_Korban) return;
    var lama = m[p.ID_Korban];
    var kunci = function (x) { return String(x.Updated_At || x.Created_At || '') + '|' + String(x.ID_Record || ''); };
    if (!lama || kunci(p) > kunci(lama)) m[p.ID_Korban] = p;
  });
  return m;
}
function perkUsiaTeks_(r) {
  var u = toInt_(r.Usia), b = toInt_(r.Usia_Bulan);
  if (u === null || u === undefined) return '';
  if (u === 0) return (b === null || b === undefined) ? '0 th' : b + ' bln';
  if (u === 1 && b) return '1 th ' + b + ' bln';
  return u + ' th';
}

// Izin per baris: mengubah perkembangan boleh walau korban sudah divalidasi; melengkapi kolom Korban mengikuti izin Menu Korban
function perkIzin_(user, k, p) {
  var acc = menuAccess(Repo.cfg('M26')), role = user.role;
  return {
    edit: acc.write.indexOf(role) >= 0,
    isiKorban: korbanIzin_(user, k).edit,
    hapus: !!p && acc.del.indexOf(role) >= 0,
    // [PERUBAHAN] Verifikasi: Admin Kabupaten/Puskesmas/Posko. Validasi: Admin Provinsi/Super Admin (menuAccess)
    verifikasi: !!p && acc.verify.indexOf(role) >= 0 && [STATUS_DATA.DRAFT, STATUS_DATA.DIAJUKAN, STATUS_DATA.DIKEMBALIKAN, ''].indexOf(String(p.Status_Data || '')) >= 0,
    validasi: !!p && acc.validate.indexOf(role) >= 0 && p.Status_Data === STATUS_DATA.TERVERIFIKASI
  };
}

function perkRow_(user, k, p, namaKab) {
  var iz = perkIzin_(user, k, p);
  return {
    id: k.ID_Record, idPerk: p ? p.ID_Record : '', dariRha: !!k.Sumber_RHA,
    tgl: fmtIso_(k.Tgl_Kejadian_Awal) || '', idKab: k.ID_Kabupaten || '', kabupaten: namaKab[k.ID_Kabupaten] || k.ID_Kabupaten || '',
    nama: k.Nama || k.ID_Pasien || '', jk: k.Jenis_Kelamin || '', usia: toInt_(k.Usia), usiaBulan: toInt_(k.Usia_Bulan), kategori: k.Kategori_Usia || '',
    statusAwal: k.Status_Awal || '', diagnosa: k.Diagnosa || '', alamat: k.Alamat_Korban || '', kecamatan: k.Kecamatan || '',
    lokasiKejadian: k.Lokasi_Kejadian || '', lokasiPerawatan: k.Lokasi_Perawatan || '', rujukan: k.Rujukan || '', wn: k.Kewarganegaraan || '',
    statusLanjutan: p ? (p.Status_Lanjutan || '') : '', tglLanjutan: perkTglOf_(p),
    version: p ? (toInt_(p.Version) || 1) : 0, status: p ? (p.Status_Data || STATUS_DATA.DRAFT) : '',
    dibuatOleh: p ? (p.Created_By || '') : '', diubahPada: p ? (p.Updated_At || '') : '',
    aksi: iz
  };
}

// Korban dalam lingkup pengguna + filter, digabung dengan catatan perkembangan
function perkGabung_(user, p) {
  p = p || {};
  var tinggi = user.role === ROLE.SUPER || user.role === ROLE.PROV;
  var q = p.search ? String(p.search).toLowerCase() : '', namaKab = korbanNamaKab_(), peta = perkPetaTerbaru_(perkBaca_());
  var hasil = [];
  korbanBaca_().forEach(function (k) {
    if (korbanHapus_(k) || !korbanInScope_(user, k)) return;
    if (p.idKabupaten && tinggi && String(k.ID_Kabupaten) !== String(p.idKabupaten)) return;
    var d = fmtIso_(k.Tgl_Kejadian_Awal) || '';
    if (p.tgl && d !== p.tgl) return;
    if (p.dari && (!d || d < p.dari)) return;
    if (p.sampai && (!d || d > p.sampai)) return;
    var pk = peta[k.ID_Record] || null;
    if (q) {
      var hay = [k.ID_Record, k.Nama, k.ID_Pasien, k.Alamat_Korban, k.Kecamatan, k.Lokasi_Kejadian, k.Diagnosa, k.Lokasi_Perawatan,
        k.Status_Awal, namaKab[k.ID_Kabupaten], pk ? pk.Status_Lanjutan : ''].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return;
    }
    hasil.push({ k: k, p: pk });
  });
  hasil.sort(function (a, b) {
    return String(b.k.Created_At || '').localeCompare(String(a.k.Created_At || '')) || String(b.k.ID_Record || '').localeCompare(String(a.k.ID_Record || ''));
  });
  return { rows: hasil, namaKab: namaKab };
}

function perkOpsi_() {
  return { statusLanjutan: STATUS_LANJUTAN_OPTS, wn: korbanCfg_().WN, rujukan: perkCfg_().RUJUKAN, wajibTgl: perkCfg_().WAJIB_TGL };
}

// ---------- DAFTAR (tabel menu) ----------
function getPerkembangan(token, p) {
  try {
    var user = requireSession_(token, 'M26', 'read');
    p = p || {};
    var g = perkGabung_(user, p), dasar = g.rows;
    var counts = { total: dasar.length, sudah: 0, belum: 0 };
    dasar.forEach(function (x) { if (x.p && x.p.Status_Lanjutan) counts.sudah++; else counts.belum++; });
    var rows = dasar;
    if (p.status === 'sudah') rows = rows.filter(function (x) { return x.p && x.p.Status_Lanjutan; });
    else if (p.status === 'belum') rows = rows.filter(function (x) { return !(x.p && x.p.Status_Lanjutan); });
    var pageSize = Math.min(Math.max(1, Number(p.pageSize) || CFG.PAGESIZE_DEFAULT), CFG.PAGESIZE_MAX);
    var page = Math.max(1, Number(p.page) || 1);
    return ok_({
      rows: rows.slice((page - 1) * pageSize, page * pageSize).map(function (x) { return perkRow_(user, x.k, x.p, g.namaKab); }),
      total: rows.length, page: page, pageSize: pageSize, counts: counts, opsi: perkOpsi_(),
      izin: { tambah: menuAccess(Repo.cfg('M26')).write.indexOf(user.role) >= 0 }
    });
  } catch (e) { return galatUmum_(e, 'getPerkembangan'); }
}

// Daftar korban untuk pemilih pada formulir Tambah Data (filter tanggal kejadian awal dan kabupaten bersifat opsional)
function getKorbanUntukPerkembangan(token, p) {
  try {
    var user = requireSession_(token, 'M26', 'write');
    p = p || {};
    var tgl = String(p.tgl || '').trim().substring(0, 10);
    if (tgl && !tanggalSah_(tgl)) validasi_('Tanggal Kejadian Awal bukan tanggal yang sah.');
    var g = perkGabung_(user, { tgl: tgl, idKabupaten: p.idKabupaten }), maks = 300;
    return ok_({
      rows: g.rows.slice(0, maks).map(function (x) { return perkRow_(user, x.k, x.p, g.namaKab); }),
      total: g.rows.length, terpotong: g.rows.length > maks, opsi: perkOpsi_()
    });
  } catch (e) { return galatUmum_(e, 'getKorbanUntukPerkembangan'); }
}

// ---------- Validasi isian ----------
function perkBersih_(p) {
  var P = perkCfg_(), K = korbanCfg_();
  p = p || {};
  var c = { isi: {} };
  c.ID_Korban = sanitizeText_(p.ID_Korban, 60);
  if (!c.ID_Korban) validasi_('Korban belum dipilih.');

  // Kolom Korban yang dilengkapi (hanya nilai yang diisi)
  Object.keys(P.ISI_TEKS).forEach(function (k) {
    var v = sanitizeText_(p[k], P.ISI_TEKS[k]);
    if (v) c.isi[k] = v;
  });
  var wn = String(p.Kewarganegaraan || '').trim();
  if (wn) { if (K.WN.indexOf(wn) < 0) validasi_('Kewarganegaraan tidak sah.'); c.isi.Kewarganegaraan = wn; }
  var rj = String(p.Rujukan || '').trim();
  if (rj) { if (P.RUJUKAN.indexOf(rj) < 0) validasi_('Rujukan tidak sah.'); c.isi.Rujukan = rj; }

  c.Status_Lanjutan = String(p.Status_Lanjutan || '').trim();
  c.Tgl_Status_Lanjutan = String(p.Tgl_Status_Lanjutan || '').trim().substring(0, 10);
  c.Version = toInt_(p.Version) || 0;
  if (!c.Status_Lanjutan) {
    if (c.Tgl_Status_Lanjutan) validasi_('Isi Status Lanjutan terlebih dahulu.');
    if (!Object.keys(c.isi).length) validasi_('Status Lanjutan wajib diisi.');
    return c; // hanya melengkapi kolom Korban
  }
  if (STATUS_LANJUTAN_OPTS.indexOf(c.Status_Lanjutan) < 0) validasi_('Status Lanjutan tidak sah.');
  if (c.Tgl_Status_Lanjutan) {
    if (!tanggalSah_(c.Tgl_Status_Lanjutan)) validasi_('Tanggal Sembuh/Rujuk/Meninggal bukan tanggal yang sah.');
    if (c.Tgl_Status_Lanjutan > todayWita_()) validasi_('Tanggal Sembuh/Rujuk/Meninggal tidak boleh melewati hari ini.');
  } else if (P.WAJIB_TGL.indexOf(c.Status_Lanjutan) >= 0) {
    validasi_('Tanggal Sembuh/Rujuk/Meninggal wajib diisi untuk status ' + c.Status_Lanjutan + '.');
  }
  return c;
}

// Kesesuaian dengan Status Awal dan Tanggal Kejadian Awal korban
function perkKonsisten_(k, c) {
  var sa = k.Status_Awal, sl = c.Status_Lanjutan;
  if (!sl) return;
  if (sa === 'Meninggal' && sl !== 'Meninggal') validasi_('Korban berstatus awal Meninggal hanya dapat berstatus lanjutan Meninggal.');
  if (sa === 'Hilang' && ['Ditemukan Hidup', 'Masih Hilang', 'Meninggal'].indexOf(sl) < 0) validasi_('Korban berstatus awal Hilang hanya dapat berstatus lanjutan Ditemukan Hidup, Masih Hilang, atau Meninggal.');
  if ((sa === 'Luka Berat' || sa === 'Luka Ringan') && (sl === 'Ditemukan Hidup' || sl === 'Masih Hilang')) validasi_('Status lanjutan ' + sl + ' tidak sesuai untuk korban luka.');
  var tk = fmtIso_(k.Tgl_Kejadian_Awal);
  if (c.Tgl_Status_Lanjutan && tk && c.Tgl_Status_Lanjutan < tk) validasi_('Tanggal Sembuh/Rujuk/Meninggal tidak boleh sebelum Tanggal Kejadian Awal korban (' + tk + ').');
}

// Lengkapi kolom Korban yang masih kosong. Tidak menimpa isian yang sudah ada. Dipanggil di dalam lock.
function perkIsiKorban_(user, k, shK, hK, isi) {
  var kunci = Object.keys(isi || {}).filter(function (f) { return String(k[f] === undefined || k[f] === null ? '' : k[f]).trim() === ''; });
  if (!kunci.length) return 0;
  if (!korbanIzin_(user, k).edit) return 0; // data korban terkunci (sudah divalidasi) bagi peran ini
  var vals = shK.getRange(k._row, 1, 1, hK.length).getValues()[0], now = nowWita_();
  kunci.forEach(function (f) { korbanSet_(vals, hK, f, isi[f]); });
  if (k.Status_Data === STATUS_DATA.TERVALIDASI) { // perubahan oleh Super Admin membatalkan validasi (sama dengan updateKorban)
    korbanSet_(vals, hK, 'Status_Data', STATUS_DATA.DRAFT); korbanSet_(vals, hK, 'Validated_By', ''); korbanSet_(vals, hK, 'Validated_At', '');
  }
  korbanSet_(vals, hK, 'Version', (toInt_(k.Version) || 1) + 1);
  korbanSet_(vals, hK, 'Updated_At', now); korbanSet_(vals, hK, 'Updated_By', user.username);
  shK.getRange(k._row, 1, 1, hK.length).setValues([vals]);
  return kunci.length;
}

// ---------- SIMPAN (tambah baru atau perbarui catatan korban yang sama) ----------
function savePerkembangan(token, payload, requestId) {
  try {
    var user = requireSession_(token, 'M26', 'write');
    var P = perkCfg_(), c = perkBersih_(payload);
    var hasil = withLock_(function () {
      var shK = korbanSheet_(true), hK = headersOf_(shK);
      var k = readAll_(shK).filter(function (x) { return String(x.ID_Record) === c.ID_Korban && !korbanHapus_(x); })[0];
      if (!k) validasi_('Data korban tidak ditemukan.');
      if (!korbanInScope_(user, k)) aksesDitolak_('Data di luar lingkup Anda.');
      perkKonsisten_(k, c);

      var sh = perkSheet_(true), h = headersOf_(sh), ss = getSS_(CFG.KEY.SS_UTAMA), rows = readAll_(sh), now = nowWita_();
      requestId = sanitizeText_(requestId || '', 80);
      if (requestId) {
        var lama = rows.filter(function (r) { return r.Request_ID === requestId; })[0];
        if (lama) return { id: lama.ID_Record, duplikat: true };
      }
      var ada = perkPetaTerbaru_(rows)[c.ID_Korban] || null, id = ada ? ada.ID_Record : '', terisi = 0, catatan = '';

      if (!c.Status_Lanjutan) { // hanya melengkapi kolom Korban
        if (ada) validasi_('Status Lanjutan tidak dapat dikosongkan. Gunakan Hapus bila perkembangan salah dimasukkan.');
        terisi = perkIsiKorban_(user, k, shK, hK, c.isi);
        if (!terisi) validasi_('Tidak ada kolom kosong yang dapat dilengkapi. Data korban mungkin sudah terisi atau sudah divalidasi.');
        return { id: '', terisi: terisi, saja: true };
      }
      if (ada) {
        var vSaatIni = toInt_(ada.Version) || 1;
        if (c.Version && c.Version !== vSaatIni) validasi_('Data telah diubah pengguna lain. Muat ulang lalu coba lagi.');
        var vals = sh.getRange(ada._row, 1, 1, h.length).getValues()[0];
        korbanSet_(vals, h, 'Status_Lanjutan', c.Status_Lanjutan);
        korbanSet_(vals, h, 'Tgl_Status_Lanjutan', c.Tgl_Status_Lanjutan);
        korbanSet_(vals, h, 'Tanggal', c.Tgl_Status_Lanjutan || fmtIso_(ada.Tanggal) || todayWita_());
        korbanSet_(vals, h, 'Version', vSaatIni + 1);
        korbanSet_(vals, h, 'Updated_At', now); korbanSet_(vals, h, 'Updated_By', user.username);
        sh.getRange(ada._row, 1, 1, h.length).setValues([vals]);
      } else {
        id = P.PREFIX + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, P.SEQ), 4);
        sh.appendRow(objToRow_(h, {
          ID_Record: id, ID_Korban: c.ID_Korban, Tanggal: c.Tgl_Status_Lanjutan || todayWita_(),
          Status_Lanjutan: c.Status_Lanjutan, Tgl_Status_Lanjutan: c.Tgl_Status_Lanjutan,
          ID_Kabupaten: k.ID_Kabupaten || '', ID_Faskes: k.ID_Faskes || '', ID_Posko: k.ID_Posko || '',
          Status_Data: STATUS_DATA.DRAFT, Catatan_Verifikasi: '', Version: 1, Request_ID: requestId,
          Created_At: now, Created_By: user.username, Updated_At: now, Updated_By: user.username, Is_Deleted: ''
        }));
      }
      terisi = perkIsiKorban_(user, k, shK, hK, c.isi);
      if (Object.keys(c.isi).length && !terisi) catatan = ' Kolom Korban tidak diubah (sudah terisi atau terkunci).';
      return { id: id, terisi: terisi, baru: !ada, catatan: catatan };
    });
    if (!hasil.duplikat) {
      korbanSelesai_();
      logAudit_(user, hasil.saja ? 'UBAH_DATA' : (hasil.baru ? 'TAMBAH_DATA' : 'UBAH_DATA'), 'Perkembangan Korban', c.ID_Korban + (hasil.id ? ' / ' + hasil.id : '') + (hasil.terisi ? ' (+' + hasil.terisi + ' kolom Korban)' : ''), 'OK');
    }
    var pesan = hasil.duplikat ? 'Data sudah tersimpan sebelumnya.'
      : hasil.saja ? 'Kolom data korban dilengkapi (' + hasil.terisi + ' kolom).'
      : (hasil.baru ? 'Perkembangan korban tersimpan.' : 'Perkembangan korban diperbarui.') + (hasil.terisi ? ' ' + hasil.terisi + ' kolom data korban dilengkapi.' : '') + (hasil.catatan || '');
    return ok_({ id: hasil.id, ID_Record: hasil.id, ID_Korban: c.ID_Korban }, pesan);
  } catch (e) { return galatUmum_(e, 'savePerkembangan'); }
}

// ---------- HAPUS catatan perkembangan (soft delete; data korban tidak disentuh) ----------
function hapusPerkembangan(token, idPerk) {
  try {
    var user = requireSession_(token, 'M26', 'del');
    withLock_(function () {
      var sh = perkSheet_(true), h = headersOf_(sh);
      var r = readAll_(sh).filter(function (x) { return String(x.ID_Record) === String(idPerk) && !korbanHapus_(x); })[0];
      if (!r) validasi_('Data tidak ditemukan.');
      var k = korbanBaca_().filter(function (x) { return String(x.ID_Record) === String(r.ID_Korban) && !korbanHapus_(x); })[0];
      if (!k || !korbanInScope_(user, k)) aksesDitolak_('Data di luar lingkup Anda.');
      var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0];
      korbanSet_(vals, h, 'Is_Deleted', 'TRUE');
      korbanSet_(vals, h, 'Version', (toInt_(r.Version) || 1) + 1);
      korbanSet_(vals, h, 'Updated_At', nowWita_()); korbanSet_(vals, h, 'Updated_By', user.username);
      sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
    });
    korbanSelesai_(); logAudit_(user, 'HAPUS_DATA', 'Perkembangan Korban', idPerk, 'OK');
    return ok_({ id: idPerk }, 'Perkembangan korban dihapus.');
  } catch (e) { return galatUmum_(e, 'hapusPerkembangan'); }
}

// ---------- VERIFIKASI dan VALIDASI catatan perkembangan ----------
function perkUbahStatus_(token, idPerk, jenis) {
  var user = requireSession_(token, 'M26', 'read'), statusBaru = jenis === 'verifikasi' ? STATUS_DATA.TERVERIFIKASI : STATUS_DATA.TERVALIDASI;
  withLock_(function () {
    var sh = perkSheet_(true), h = headersOf_(sh);
    var r = readAll_(sh).filter(function (x) { return String(x.ID_Record) === String(idPerk) && !korbanHapus_(x); })[0];
    if (!r) validasi_('Data tidak ditemukan.');
    var k = korbanBaca_().filter(function (x) { return String(x.ID_Record) === String(r.ID_Korban) && !korbanHapus_(x); })[0];
    if (!k || !korbanInScope_(user, k)) aksesDitolak_('Data di luar lingkup Anda.');
    var iz = perkIzin_(user, k, r);
    if (!iz[jenis]) aksesDitolak_(jenis === 'verifikasi' ? 'Verifikasi hanya dapat dilakukan Admin Kabupaten, Admin Puskesmas, atau Admin Posko pada data yang belum diverifikasi.' : 'Validasi hanya dapat dilakukan Admin Provinsi atau Super Admin pada data yang sudah terverifikasi.');
    var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0], now = nowWita_();
    korbanSet_(vals, h, 'Status_Data', statusBaru);
    korbanSet_(vals, h, jenis === 'verifikasi' ? 'Verified_By' : 'Validated_By', user.username);
    korbanSet_(vals, h, jenis === 'verifikasi' ? 'Verified_At' : 'Validated_At', now);
    korbanSet_(vals, h, 'Version', (toInt_(r.Version) || 1) + 1);
    korbanSet_(vals, h, 'Updated_At', now); korbanSet_(vals, h, 'Updated_By', user.username);
    sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
  });
  korbanSelesai_(); logAudit_(user, 'STATUS_' + jenis.toUpperCase(), 'Perkembangan Korban', idPerk + ' => ' + statusBaru, 'OK');
  return ok_({ id: idPerk, status: statusBaru }, jenis === 'verifikasi' ? 'Perkembangan korban berhasil diverifikasi.' : 'Perkembangan korban berhasil divalidasi.');
}
function verifikasiPerkembangan(token, idPerk) { try { return perkUbahStatus_(token, idPerk, 'verifikasi'); } catch (e) { return galatUmum_(e, 'verifikasiPerkembangan'); } }
function validasiPerkembangan(token, idPerk) { try { return perkUbahStatus_(token, idPerk, 'validasi'); } catch (e) { return galatUmum_(e, 'validasiPerkembangan'); } }

// ---------- EXPORT (CSV, urutan kolom = tabel dan formulir) ----------
function exportPerkembangan(token, p) {
  try {
    var user = requireSession_(token, 'M26', 'read');
    var g = perkGabung_(user, p || {});
    var rows = g.rows;
    if (p && p.status === 'sudah') rows = rows.filter(function (x) { return x.p && x.p.Status_Lanjutan; });
    else if (p && p.status === 'belum') rows = rows.filter(function (x) { return !(x.p && x.p.Status_Lanjutan); });
    var judul = ['Tanggal Kejadian Awal', 'Kabupaten', 'Nama', 'Jenis Kelamin', 'Usia', 'Kategori Usia', 'Status Awal', 'Diagnosa/Keterangan', 'Alamat', 'Kecamatan',
      'Lokasi Kejadian', 'Lokasi Perawatan', 'Rujukan', 'Kewarganegaraan', 'Status Lanjutan', 'Tanggal Sembuh/Rujuk/Meninggal'];
    var cel = function (v) {
      v = String(v === null || v === undefined ? '' : v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // cegah injeksi rumus saat dibuka di Excel
      return '"' + v.replace(/"/g, '""') + '"';
    };
    var baris = [judul.map(cel).join(',')];
    rows.forEach(function (x) {
      var r = perkRow_(user, x.k, x.p, g.namaKab);
      baris.push([r.tgl, r.kabupaten, r.nama, r.jk, perkUsiaTeks_(x.k), r.kategori, r.statusAwal, r.diagnosa, r.alamat, r.kecamatan,
        r.lokasiKejadian, r.lokasiPerawatan, r.rujukan, r.wn, r.statusLanjutan, r.tglLanjutan].map(cel).join(','));
    });
    logAudit_(user, 'EXPORT_DATA', 'Perkembangan Korban', rows.length + ' baris', 'OK');
    return ok_({ nama: 'Perkembangan_Korban_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd_HHmm') + '.csv', csv: '\ufeff' + baris.join('\r\n') });
  } catch (e) { return galatUmum_(e, 'exportPerkembangan'); }
}
