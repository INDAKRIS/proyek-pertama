/**
 * Code.gs — GABUNGAN: INDAKRIS NTT (Code.gs) + Backend Laporan EMT (Code_2.gs)
 *
 * Router Web App:
 *   - URL biasa               -> aplikasi INDAKRIS NTT
 *   - URL dengan ?page=emt    -> aplikasi Laporan EMT (Form 1 Kedatangan, Form 2 Harian, Form 3 Kepulangan)
 *
 * Bagian INDAKRIS: tidak diubah (getMenuData dengan CacheService, diagnosa, backup mingguan).
 * Bagian EMT: seluruh logika dibungkus di objek EMT agar nama helper (sh, me, now, P, audit, folder, dst.)
 * tidak bentrok dengan file .gs lain (Utils.gs, Repo, Setup.gs, dll.). Fungsi yang dipanggil klien
 * (google.script.run) bernama emt_* dan fungsi setup EMT bernama emtSetup().
 * Properti skrip EMT memakai kunci EMT_SS_ID dan EMT_ROOT_ID (tidak bentrok dengan CFG.KEY INDAKRIS).
 * LOGIN EMT = LOGIN INDAKRIS: semua fungsi emt_* menerima token sesi INDAKRIS (validateSession_), akun dari SYS_Users.
 *
 * Langkah awal EMT: jalankan emtSetup() sekali dari editor Apps Script, lalu Deploy ulang Web app.
 */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.page = String((e && e.parameter && e.parameter.page) || '').toLowerCase();
  t.baseUrl = ScriptApp.getService().getUrl(); // dipakai tautan antar-halaman INDAKRIS <-> EMT
  // Halaman/tab mandiri: ?page=form&f=rha|kedatangan|harian|kepulangan|lihat|verifikasi|perkembangan|faskes|penilaian&m=TDM|TDP
  var JUDUL_FORM = { rha: 'Formulir Laporan RHA', kedatangan: 'Form 1 — Kedatangan Tim', harian: 'Form 2 — Laporan Harian Tim', kepulangan: 'Form 3 — Kepulangan Tim', lihat: 'Lihat Laporan Tim', verifikasi: 'Verifikasi Laporan Tim', sdm: 'SDM Kesehatan', korban: 'Tambah Data Korban', perkembangan: 'Tambah Data Perkembangan Korban', faskes: 'Tambah Data Faskes (Kondisi)', penilaian: 'Tambah Data Penilaian Kerusakan Faskes', menu: 'Tambah Data' };
  var f = String((e && e.parameter && e.parameter.f) || '').toLowerCase();
  t.form = (t.page === 'form' && JUDUL_FORM[f]) ? f : '';
  var sid = String((e && e.parameter && e.parameter.id) || '');
  t.sid = (t.form === 'sdm' && /^[A-Za-z0-9_-]{1,60}$/.test(sid)) ? sid : '';
  var kd = String((e && e.parameter && e.parameter.k) || '').toUpperCase();
  t.kode = (t.form === 'menu' && /^M\d{2}$/.test(kd)) ? kd : '';   // kode menu untuk formulir generik di halaman baru
  t.mod = String((e && e.parameter && e.parameter.m) || '').toUpperCase() === 'TDP' ? 'TDP' : 'TDM';
  return t.evaluate()
    .setTitle(t.page === 'emt' ? 'Laporan EMT' : t.form ? JUDUL_FORM[t.form] + ' — INDAKRIS NTT' : 'INDAKRIS NTT — Informasi Data Krisis Kesehatan')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}

// ================== CACHE ==================
// Helper (dataVer_, bumpData_, cacheGetBesar_, cachePutBesar_, readAllCached_) ada di Utils.gs
var CACHE_TTL_ = 300;        // detik; hasil getMenuData dianggap segar selama 5 menit

function kunciUser_(u) {
  // Hasil Repo.list bisa berbeda per user/level akses, jadi kunci cache memuat identitas user.
  return String(u.id || u.username || u.email || u.user || '') + '|' + String(u.level || u.role || '') + '|' + String(u.kabupaten || u.wilayah || '');
}

// Wrapper menu generik (Repository) + kartu stok
function getMenuData(token, kode, p) {
  try {
    var u = requireSession_(token, kode, 'read');
    var key = 'm:' + dataVer_() + ':' + kode + ':' + Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, kunciUser_(u) + '|' + JSON.stringify(p || {})));
    var hit = cacheGetBesar_(key);
    if (hit) return hit;
    var res = ok_(Repo.list(u, kode, p));
    cachePutBesar_(key, res, CACHE_TTL_);
    return res;
  } catch (e) { return galatUmum_(e, 'getMenuData'); }
}
function saveMenuData(token, kode, payload, requestId, submitFlag) {
  try { var u = requireSession_(token, kode, 'write'); var r = Repo.insert(u, kode, payload, requestId, submitFlag); bumpData_(); return r; } catch (e) { return galatUmum_(e, 'saveMenuData'); }
}
function updateMenuData(token, kode, id, patch, version) {
  try { var u = requireSession_(token, kode, 'write'); var r = Repo.update(u, kode, id, patch, version); bumpData_(); return r; } catch (e) { return galatUmum_(e, 'updateMenuData'); }
}
function deleteMenuData(token, kode, id) {
  try { var u = requireSession_(token, kode, 'del'); var r = Repo.softDelete(u, kode, id); bumpData_(); return r; } catch (e) { return galatUmum_(e, 'deleteMenuData'); }
}
function aksiMenuData(token, kode, id, aksi, catatan) {
  try { var u = requireSession_(token, kode, null); var r = Repo.aksi(u, kode, id, aksi, catatan); bumpData_(); return r; } catch (e) { return galatUmum_(e, 'aksiMenuData'); }
}
function exportMenuData(token, kode, p) {
  try { var u = requireSession_(token, kode, 'read'); return ok_(Repo.exportCsv(u, kode, p)); } catch (e) { return galatUmum_(e, 'exportMenuData'); }
}
function koreksiStok(token, idBarang, lokasi, jml, alasan) {
  try { var u = requireSession_(token, 'M20', 'write'); var r = Repo.koreksiStok(u, idBarang, lokasi, jml, alasan); bumpData_(); return r; } catch (e) { return galatUmum_(e, 'koreksiStok'); }
}

// ================== DIAGNOSA ==================
// Tanpa token. Jalankan dari editor Apps Script: diagnosaLoading() atau diagnosaLoading('M01')
// (ganti M01 dengan kode menu yang lambat, mis. menu Pengungsi). Hasil ada di Eksekusi > Log.
function diagnosaLoading(kode) {
  function t(label, fn) {
    var a = Date.now(), r, g = '';
    try { r = fn(); } catch (e) { g = '  [ERROR: ' + e.message + ']'; }
    Logger.log(label + ': ' + (Date.now() - a) + ' ms' + g);
    return r;
  }
  var ss = t('openById SS_UTAMA', function () { return getSS_(CFG.KEY.SS_UTAMA); });
  ['SYS_Session', 'SYS_Users', 'SYS_Audit', 'SYS_ErrorLog'].forEach(function (n) {
    t('baca ' + n, function () {
      var sh = ss.getSheetByName(n);
      var baris = sh ? sh.getLastRow() : -1;
      Logger.log('   ' + n + ' -> ' + baris + ' baris, ' + (sh ? sh.getMaxRows() : -1) + ' baris termasuk kosong');
      return sh ? readAll_(sh).length : 0;
    });
  });
  t('buildMenuConfig', function () { return buildMenuConfig().length; });
  if (kode) {
    var user = { idUser: 'DIAG', username: 'diag', role: ROLE.SUPER, idKabupaten: '', idFaskes: '', idPosko: '' };
    var data = t('Repo.list(' + kode + ') pertama', function () { return Repo.list(user, kode, {}); });
    t('Repo.list(' + kode + ') kedua', function () { return Repo.list(user, kode, {}); });
    var json = t('serialisasi ok_()', function () { return JSON.stringify(ok_(data)); });
    Logger.log('ukuran payload: ' + (json ? Math.round(json.length / 1024) : 0) + ' KB');
  }
}

// Trigger mingguan backup (Kontrak Bersama 2g) — dipasang lewat Setup.gs
function backupMingguan() {
  if (LockService.getScriptLock().tryLock(0)) {
    try { backupSemuaBerkas_(); } finally { LockService.getScriptLock().releaseLock(); }
  }
}
function backupSemuaBerkas_() {
  var folderUtama = DriveApp.getRootFolder().getFoldersByName('INDAKRIS_NTT_BACKUP');
  var folder = folderUtama.hasNext() ? folderUtama.next() : DriveApp.getRootFolder().createFolder('INDAKRIS_NTT_BACKUP');
  var namaBerkas = [CFG.NAME.SS_UTAMA, CFG.NAME.SS_RHA, CFG.NAME.SS_TDM, CFG.NAME.SS_TDP];
  namaBerkas.forEach(function (nama) {
    var it = DriveApp.getFilesByName(nama);
    if (it.hasNext()) {
      var f = it.next();
      f.makeCopy(nama + '_BACKUP_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'), folder);
      var lama = [];
      var it2 = folder.getFiles();
      while (it2.hasNext()) { var x = it2.next(); if (x.getName().indexOf(nama + '_BACKUP_') === 0) lama.push(x); }
      if (lama.length > 4) {
        lama.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
        lama.slice(4).forEach(function (x) { x.setTrashed(true); });
      }
    }
  });
}

/* =====================================================================
 * LAPORAN EMT — Google Sheets (DB) + Docs + Slides + Drive
 * Login & hak akses MEMAKAI SISTEM INDAKRIS: token sesi (validateSession_), akun SYS_Users, role ROLE.*.
 * Aturan warna: Draft = font MERAH, Terverifikasi = font HITAM.
 * Hak akses:
 *   - Pembuat laporan (owner) : semua role INDAKRIS; kabupaten otomatis = kabupaten akun (Posko/Puskesmas/Admin Kab).
 *   - Lihat/ubah laporan      : owner, atau verifikator laporan tersebut.
 *   - Verifikasi/batal        : SUPER_ADMIN, ADMIN_PROVINSI (seluruh NTT), ADMIN_KABUPATEN (hanya kabupaten sendiri).
 * ===================================================================== */
var EMT = (function () {
  var WARNA = { draft: '#C00000', verified: '#000000' };
  var JUDUL = { f1: 'Laporan Kedatangan Awal', f2: 'Laporan Harian', f3: 'Laporan Kepulangan' };
  var PROV_NAMA = 'Nusa Tenggara Timur';
  var KOL = ['id', 'form', 'kab', 'prov', 'owner', 'status', 'data', 'verified_by', 'verified_role',
    'verified_at', 'updated_at', 'doc_id', 'slide_id', 'pdf_id', 'id_kab'];
  var K_SS = 'EMT_SS_ID', K_ROOT = 'EMT_ROOT_ID';

  /* ---------- Setup (jalankan sekali) ---------- */
  function setup() {
    var ss = SpreadsheetApp.create('DB Laporan EMT');
    ss.getActiveSheet().setName('Laporan').appendRow(KOL);
    var root = DriveApp.createFolder('Laporan EMT');
    DriveApp.getFileById(ss.getId()).moveTo(root);
    var pr = {}; pr[K_SS] = ss.getId(); pr[K_ROOT] = root.getId();
    props_().setProperties(pr);
    Logger.log('Spreadsheet EMT: ' + ss.getUrl());
  }

  /* ---------- Helper ---------- */
  function sh() {
    var id = getPropOpt_(K_SS);
    if (!id) validasi_('Database EMT belum disiapkan. Jalankan emtSetup() sekali dari editor Apps Script, lalu Deploy ulang Web app.');
    var s = SpreadsheetApp.openById(id).getSheetByName('Laporan');
    if (!s) validasi_('Sheet "Laporan" tidak ditemukan di DB Laporan EMT.');
    return s;
  }
  function now() { return new Date().toISOString(); }
  function audit(u, id, aksi) { logAudit_(u, 'EMT_' + aksi, 'Laporan EMT', id, 'OK'); }

  function bisaVerif(u, o) {
    if (u.role === ROLE.SUPER || u.role === ROLE.PROV) return true;
    if (u.role === ROLE.KAB) return !!u.idKabupaten && String(o.id_kab) === String(u.idKabupaten);
    return false;
  }
  function boleh(u, o) { return o.owner === u.idUser || bisaVerif(u, o); }

  function baris(r) { var o = {}; KOL.forEach(function (k, j) { o[k] = String(r[j] == null ? '' : r[j]); }); return o; }
  function cari(id) {
    var v = sh().getDataRange().getValues();
    var i = v.findIndex(function (r, k) { return k > 0 && String(r[0]) === String(id); });
    if (i < 0) validasi_('Laporan tidak ditemukan.');
    return { row: i + 1, o: baris(v[i]) };
  }
  function tulis(row, o) {
    sh().getRange(row, 1, 1, KOL.length).setValues([KOL.map(function (k) { return o[k] == null ? '' : o[k]; })]);
  }
  function out(o) {
    return Object.assign({}, o, { data: JSON.parse(o.data || '{}'), warna: o.status === 'verified' ? 'hitam' : 'merah' });
  }
  function stempel(o) {
    return o.status === 'verified'
      ? 'TERVERIFIKASI oleh ' + o.verified_by + ' (' + o.verified_role + ') · ' + o.verified_at
      : 'DRAFT · menunggu verifikasi Admin Kabupaten/Provinsi';
  }
  function sub(par, n) { var it = par.getFoldersByName(n); return it.hasNext() ? it.next() : par.createFolder(n); }
  function folder(o) {
    var f = DriveApp.getFolderById(getProp_(K_ROOT));
    [o.prov || '-', o.kab || '-', JUDUL[o.form]].forEach(function (n) { f = sub(f, n); });
    return f;
  }
  function hapus(id) { if (id) try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
  function daftarKab() {
    var cache = CacheService.getScriptCache(), hit = cache.get('EMT_KAB');
    if (hit) { try { return JSON.parse(hit); } catch (e) {} }
    var l = readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'REF_Kabupaten'))
      .filter(function (r) { return !r.Is_Deleted; })
      .map(function (r) { return { id: String(r.ID_Kabupaten), nama: String(r.Nama_Wilayah) }; });
    try { cache.put('EMT_KAB', JSON.stringify(l), 600); } catch (e) {}
    return l;
  }

  /* ---------- API (u = profil pengguna dari sesi; dipanggil lewat pembungkus emt_* di bawah) ---------- */
  function saya(u) { return { user: u, idKabupaten: u.idKabupaten || '', kabupaten: daftarKab() }; }

  function daftar(u) {
    return sh().getDataRange().getValues().slice(1).map(baris)
      .filter(function (o) { return boleh(u, o); })
      .map(function (o) { return { id: o.id, form: o.form, kab: o.kab, status: o.status, updated_at: o.updated_at, doc_id: o.doc_id, slide_id: o.slide_id }; });
  }

  function buat(u, form, idKab) {
    return withLock_(function () {
      if (!JUDUL[form]) validasi_('Form tidak valid.');
      var idk = u.idKabupaten ? String(u.idKabupaten) : String(idKab || '');
      var k = daftarKab().filter(function (x) { return x.id === idk; })[0];
      if (!k) validasi_('Pilih kabupaten atau kota yang valid.');
      var o = { id: Utilities.getUuid().slice(0, 8), form: form, kab: k.nama, prov: PROV_NAMA, owner: u.idUser, status: 'draft', data: '{}', updated_at: now(), id_kab: k.id };
      sh().appendRow(KOL.map(function (c) { return o[c] || ''; })); audit(u, o.id, 'buat');
      return out(o);
    });
  }

  function ambil(u, id) { var c = cari(id); if (!boleh(u, c.o)) aksesDitolak_('Anda tidak berhak atas laporan ini.'); return out(c.o); }

  // Simpan isi. Laporan terverifikasi yang diubah otomatis kembali ke Draft (merah).
  function simpan(u, id, data) {
    return withLock_(function () {
      var c = cari(id), row = c.row, o = c.o; if (!boleh(u, o)) aksesDitolak_('Anda tidak berhak atas laporan ini.');
      var dulu = o.status;
      Object.assign(o, { data: JSON.stringify(data), status: 'draft', verified_by: '', verified_role: '', verified_at: '', updated_at: now() });
      if (dulu === 'verified') { hapus(o.pdf_id); o.pdf_id = ''; }
      tulis(row, o); audit(u, id, dulu === 'verified' ? 'ubah (kembali ke draft)' : 'ubah');
      warnai(o);
      return out(o);
    });
  }

  // Verifikasi: hanya SUPER_ADMIN / ADMIN_PROVINSI / ADMIN_KABUPATEN (kabupaten terkait) -> font hitam
  function verifikasi(u, id) {
    return withLock_(function () {
      var c = cari(id), row = c.row, o = c.o;
      if (!bisaVerif(u, o)) aksesDitolak_('Hanya admin kabupaten (wilayah terkait), admin provinsi, atau super admin yang dapat memverifikasi.');
      Object.assign(o, { status: 'verified', verified_by: u.nama, verified_role: u.roleLabel || u.role, verified_at: now() });
      bangunDoc(o);
      if (o.slide_id) bangunSlide(o);
      warnai(o);
      eksporPdf(o);
      tulis(row, o); audit(u, id, 'verifikasi + ekspor PDF');
      return out(o);
    });
  }

  function batal(u, id) {
    return withLock_(function () {
      var c = cari(id), row = c.row, o = c.o;
      if (!bisaVerif(u, o)) aksesDitolak_('Anda tidak berhak membatalkan verifikasi.');
      Object.assign(o, { status: 'draft', verified_by: '', verified_role: '', verified_at: '' });
      hapus(o.pdf_id); o.pdf_id = '';
      tulis(row, o); audit(u, id, 'batal verifikasi'); warnai(o);
      return out(o);
    });
  }

  function dokumen(u, id) {
    return withLock_(function () {
      var c = cari(id), row = c.row, o = c.o; if (!boleh(u, o)) aksesDitolak_('Anda tidak berhak atas laporan ini.');
      bangunDoc(o); warnai(o); tulis(row, o); audit(u, id, 'buat dokumen');
      return DocumentApp.openById(o.doc_id).getUrl();
    });
  }

  function slide(u, id) {
    return withLock_(function () {
      var c = cari(id), row = c.row, o = c.o; if (!boleh(u, o)) aksesDitolak_('Anda tidak berhak atas laporan ini.');
      bangunSlide(o); warnai(o); tulis(row, o); audit(u, id, 'buat slide');
      return 'https://docs.google.com/presentation/d/' + o.slide_id;
    });
  }

  // Pembangun (tanpa lock; dipanggil dari fungsi yang sudah memegang lock). File lama dibuang ke tempat sampah.
  function bangunDoc(o) {
    var d = JSON.parse(o.data || '{"sections":[]}');
    hapus(o.doc_id);
    var doc = DocumentApp.create(JUDUL[o.form] + ' - ' + o.kab + ' - ' + o.id), b = doc.getBody();
    b.appendParagraph(JUDUL[o.form].toUpperCase()).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    (d.sections || []).forEach(function (s) {
      b.appendParagraph(s.h).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (s.rows && s.rows.length) b.appendTable(s.rows.map(function (r) { return r.map(String); })).getRow(0).editAsText().setBold(true);
    });
    b.appendParagraph(stempel(o)).setBold(true);
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(folder(o));
    o.doc_id = doc.getId();
  }

  function bangunSlide(o) {
    var d = JSON.parse(o.data || '{"sections":[]}');
    hapus(o.slide_id);
    var p = SlidesApp.create('Rekap ' + JUDUL[o.form] + ' - ' + o.kab + ' - ' + o.id);
    var s0 = p.getSlides()[0].getShapes();
    s0[0].getText().setText(JUDUL[o.form] + '\n' + o.kab + ', ' + o.prov);
    s0[1].getText().setText(stempel(o));
    (d.sections || []).forEach(function (s) {
      var hdr = s.rows && s.rows[0], isi = hdr ? s.rows.slice(1) : [];
      if (!hdr || !isi.length) return;
      for (var i = 0; i < isi.length; i += 8) {
        var rows = [hdr].concat(isi.slice(i, i + 8));
        var sl = p.appendSlide(SlidesApp.PredefinedLayout.TITLE_ONLY);
        sl.getShapes()[0].getText().setText(s.h);
        var t = sl.insertTable(rows.length, hdr.length, 30, 90, 660, 24 * rows.length);
        rows.forEach(function (r, ri) {
          r.forEach(function (v, ci) {
            var tr = t.getCell(ri, ci).getText(); tr.setText(String(v).slice(0, 120)); tr.getTextStyle().setFontSize(9);
          });
        });
      }
    });
    p.saveAndClose();
    DriveApp.getFileById(p.getId()).moveTo(folder(o));
    o.slide_id = p.getId();
  }

  function eksporPdf(o) {
    hapus(o.pdf_id);
    var blob = DriveApp.getFileById(o.doc_id).getAs(MimeType.PDF)
      .setName(JUDUL[o.form] + ' - ' + o.kab + ' - ' + o.id + ' (Terverifikasi).pdf');
    o.pdf_id = folder(o).createFile(blob).getId();
  }

  /* ---------- Pewarnaan sesuai status ---------- */
  function warnai(o) {
    var w = WARNA[o.status];
    if (o.doc_id) {
      var doc = DocumentApp.openById(o.doc_id), b = doc.getBody(), ps = b.getParagraphs();
      ps[ps.length - 1].setText(stempel(o));
      b.editAsText().setForegroundColor(w);
      b.getTables().forEach(function (t) { t.setBorderColor(w); });
      doc.saveAndClose();
    }
    if (o.slide_id) {
      var p = SlidesApp.openById(o.slide_id);
      var ganti = function (tr) { if (!tr.isEmpty()) tr.getTextStyle().setForegroundColor(w); };
      p.getSlides().forEach(function (sl, i) {
        sl.getPageElements().forEach(function (pe) {
          var tp = pe.getPageElementType();
          if (tp === SlidesApp.PageElementType.SHAPE) {
            var sp = pe.asShape();
            if (i === 0 && /^(DRAFT|TERVERIFIKASI)/.test(sp.getText().asString())) sp.getText().setText(stempel(o));
            ganti(sp.getText());
          } else if (tp === SlidesApp.PageElementType.TABLE) {
            var t = pe.asTable();
            for (var r = 0; r < t.getNumRows(); r++) for (var c = 0; c < t.getNumColumns(); c++) ganti(t.getCell(r, c).getText());
          }
        });
      });
      p.saveAndClose();
    }
  }

  return { setup: setup, saya: saya, daftar: daftar, buat: buat, ambil: ambil, simpan: simpan,
    verifikasi: verifikasi, batal: batal, dokumen: dokumen, slide: slide };
})();

// Pembungkus seragam: cek sesi token INDAKRIS -> jalankan -> respons {success, message, data} (ok_/galatUmum_)
function emtRun_(tag, token, fn) {
  var t0 = Date.now();
  try { var u = validateSession_(token); var t1 = Date.now(); var r = ok_(fn(u)); console.log(tag + ' OK sesi=' + (t1 - t0) + 'ms total=' + (Date.now() - t0) + 'ms'); return r; }
  catch (e) {
    var m = String(e && e.message || e);
    console.error(tag + ' GAGAL setelah ' + (Date.now() - t0) + 'ms: ' + m);
    var r = galatUmum_(e, tag); // tetap dicatat di SYS_ErrorLog
    // Galat konfigurasi ditampilkan apa adanya supaya mudah dilacak (bukan "Layanan sedang sibuk")
    if (/^(KONFIGURASI_KOSONG|SS_TIDAK_BISA_DIBUKA|SHEET_TIDAK_ADA)/.test(m)) r.message = 'Konfigurasi: ' + m + ' (' + tag + ')';
    return r;
  }
}

// Fungsi publik EMT (dipanggil klien lewat google.script.run; token selalu argumen pertama)
function emtSetup() { return EMT.setup(); } // jalankan sekali dari editor Apps Script
function emt_saya(token)                { return emtRun_('emt_saya', token, function (u) { return EMT.saya(u); }); }
function emt_daftar(token)              { return emtRun_('emt_daftar', token, function (u) { return EMT.daftar(u); }); }
function emt_buat(token, form, idKab)   { return emtRun_('emt_buat', token, function (u) { return EMT.buat(u, form, idKab); }); }
function emt_ambil(token, id)           { return emtRun_('emt_ambil', token, function (u) { return EMT.ambil(u, id); }); }
function emt_simpan(token, id, data)    { return emtRun_('emt_simpan', token, function (u) { return EMT.simpan(u, id, data); }); }
function emt_verifikasi(token, id)      { return emtRun_('emt_verifikasi', token, function (u) { return EMT.verifikasi(u, id); }); }
function emt_batal(token, id)           { return emtRun_('emt_batal', token, function (u) { return EMT.batal(u, id); }); }
function emt_dokumen(token, id)         { return emtRun_('emt_dokumen', token, function (u) { return EMT.dokumen(u, id); }); }
function emt_slide(token, id)           { return emtRun_('emt_slide', token, function (u) { return EMT.slide(u, id); }); }


// ================== DIAGNOSA (jalankan manual dari editor, lalu lihat Execution log) ==================
// Mengukur tiap langkah yang dilewati halaman ?page=emt. Aman dijalankan kapan saja (hanya membaca).
function emtDiagnosa() {
  function t(label, fn) {
    var s = Date.now();
    try { var r = fn(); Logger.log(label + ': OK ' + (Date.now() - s) + ' ms' + (r !== undefined ? ' | ' + r : '')); }
    catch (e) { Logger.log(label + ': GAGAL ' + (Date.now() - s) + ' ms | ' + (e && e.message)); }
  }
  Logger.log('EMT_SS_ID = ' + getPropOpt_('EMT_SS_ID') + ' | EMT_ROOT_ID = ' + getPropOpt_('EMT_ROOT_ID'));
  t('1. Buka spreadsheet utama INDAKRIS', function () { return getSS_(CFG.KEY.SS_UTAMA).getName(); });
  t('2. Baca SYS_Session (dipakai validasi sesi)', function () { return readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Session')).length + ' baris'; });
  t('3. Baca REF_Kabupaten', function () { return readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'REF_Kabupaten')).length + ' baris'; });
  t('4. Baca DB Laporan EMT', function () { return EMT.daftar({ role: ROLE.SUPER, idUser: 'diag' }).length + ' laporan'; });
}


// ================== DIAGNOSA BACKEND TIM (jalankan manual dari editor, lalu salin Execution log) ==================
// Mencetak kode fungsi backend Tim Darurat Medis yang dipanggil halaman, di file .gs mana pun letaknya.
// Aman dijalankan kapan saja (hanya membaca dan mencatat ke log; tidak mengubah data).
function diagBackendTim() {
  var nama = ['getTimPublik', 'submitTimKedatangan', 'submitTimHarian', 'submitTimKepulangan', 'verifikasiTim'];
  var g = (typeof globalThis !== 'undefined') ? globalThis : this;
  nama.forEach(function (n) {
    var f = g[n];
    if (typeof f === 'function') Logger.log('===== ' + n + ' =====\n' + f.toString());
    else Logger.log('===== ' + n + ' ===== TIDAK DITEMUKAN (typeof = ' + typeof f + ')');
  });
  var mirip = Object.getOwnPropertyNames(g).filter(function (k) { return /tim|tdm|tdp|verif/i.test(k); }).sort();
  Logger.log('Nama global yang mirip (tim/tdm/tdp/verif): ' + mirip.join(', '));
}


// ================== PERBAIKAN BACKEND TIM DARURAT MEDIS ==================
// (1) verifikasiTimAman : pengganti verifikasiTim. Menambah pengecekan kepemilikan laporan + pesan galat yang jelas.
// (2) perbaikiSekuensKodeTim / cekKodeTimGanda / perbaikiKodeTimGanda : atasi Kode Tim ganda (mis. TDM-2026-0001 dipakai 2 tim).
// (3) resetPinTimDariEditor : buat PIN baru bila PIN tim hilang (jalankan manual dari editor).

function verifikasiTimAman(mod, kodeTim, pin, idRecord) {
  try {
    return withLock_(function () {
      var sh = modSheets_(mod);
      var kode = sanitizeText_(kodeTim, 20), id = sanitizeText_(idRecord, 40);
      if (!id) validasi_('ID Laporan wajib diisi.');
      // bila ada kode ganda, PIN menentukan tim yang dimaksud
      var tim = readAll_(sh.tim)
        .filter(function (r) { return r.Kode_Tim === kode && !r.Is_Deleted; })
        .filter(function (r) { return verifyTimPin_(r, String(pin || '')); })[0];
      if (!tim) return err_('Kode tim atau PIN salah.', 'AKSES');
      var ketemu = false, milikLain = false, sudah = false;
      [sh.kedatangan, sh.harian, sh.kepulangan].forEach(function (sheet) {
        var h = headersOf_(sheet), kolStatus = h.indexOf('Status_Data') + 1;
        readAll_(sheet).forEach(function (r) {
          if (r.ID_Record !== id || r.Is_Deleted) return;
          if (r.Kode_Tim !== tim.Kode_Tim) { milikLain = true; return; }
          if (r.Status_Data === 'DRAFT') { sheet.getRange(r._row, kolStatus).setValue('VERIFIED'); ketemu = true; }
          else sudah = true;
        });
      });
      if (!ketemu) {
        if (milikLain) validasi_('Laporan ini bukan milik tim Anda.');
        if (sudah) validasi_('Laporan sudah berstatus VERIFIED.');
        validasi_('ID Laporan tidak ditemukan. Isi ID Laporan (mis. TDMKD-2601-0001), bukan Kode Tim.');
      }
      invalidateTim_(mod);
      return ok_(null, 'Laporan ditandai VERIFIED oleh focal point tim.');
    });
  } catch (e) { return galatUmum_(e, 'verifikasiTimAman'); }
}

// Naikkan penghitung KODE_TIM_* sampai sama dengan nomor kode tim terbesar yang sudah ada (kode baru tidak lagi bentrok).
function perbaikiSekuensKodeTim() {
  ['TDM', 'TDP'].forEach(function (mod) {
    try {
      withLock_(function () {
        var sh = modSheets_(mod), maks = 0;
        readAll_(sh.tim).forEach(function (r) {
          var m = String(r.Kode_Tim || '').match(/^[A-Z]+-\d{4}-(\d+)$/);
          if (m) maks = Math.max(maks, parseInt(m[1], 10));
        });
        var seq = getSheet_(sh.ss, 'SYS_Sequence', ['Key', 'Value']), key = 'KODE_TIM_' + mod, ada = null;
        readAll_(seq).forEach(function (r) { if (r.Key === key) ada = r; });
        if (ada && Number(ada.Value) >= maks) { Logger.log(mod + ': penghitung ' + ada.Value + ' sudah >= nomor terbesar ' + maks + ' (aman)'); return; }
        if (ada) seq.getRange(ada._row, 2).setValue(maks); else if (maks > 0) seq.appendRow([key, maks]);
        Logger.log(mod + ': penghitung KODE_TIM dinaikkan menjadi ' + maks);
      });
    } catch (e) { Logger.log(mod + ' GAGAL: ' + (e && e.message)); }
  });
}

function cekKodeTimGanda() { return kodeTimGanda_(false); }       // hanya melapor
function perbaikiKodeTimGanda() { return kodeTimGanda_(true); }   // memberi kode baru pada tim yang kodenya ganda

function kodeTimGanda_(terapkan) {
  if (terapkan) perbaikiSekuensKodeTim();
  ['TDM', 'TDP'].forEach(function (mod) {
    try {
      var sh = modSheets_(mod), hT = headersOf_(sh.tim);
      var semua = readAll_(sh.tim).filter(function (r) { return !r.Is_Deleted; });
      var dipakai = {}, ganda = [];
      semua.forEach(function (r) { if (dipakai[r.Kode_Tim]) ganda.push(r); else dipakai[r.Kode_Tim] = r; });
      if (!ganda.length) { Logger.log(mod + ': tidak ada Kode Tim ganda.'); return; }
      ganda.forEach(function (r) {
        Logger.log(mod + ': kode ' + r.Kode_Tim + ' dipakai juga oleh "' + r.Nama_Tim + '" (baris ' + r._row + '); tim pertama: "' + dipakai[r.Kode_Tim].Nama_Tim + '"');
        if (!terapkan) return;
        withLock_(function () {
          var lama = r.Kode_Tim, baru;
          do { baru = mod + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyy') + '-' + pad_(nextSeq_(sh.ss, 'KODE_TIM_' + mod)); } while (dipakai[baru]);
          dipakai[baru] = r;
          sh.tim.getRange(r._row, hT.indexOf('Kode_Tim') + 1).setValue(baru);
          if (hT.indexOf('ID_Tim') >= 0) sh.tim.getRange(r._row, hT.indexOf('ID_Tim') + 1).setValue(baru);
          var hK = headersOf_(sh.kedatangan), n = 0;
          readAll_(sh.kedatangan).forEach(function (k) {
            if (k.Kode_Tim === lama && k.Nama_Tim === r.Nama_Tim) {
              sh.kedatangan.getRange(k._row, hK.indexOf('Kode_Tim') + 1).setValue(baru);
              if (hK.indexOf('ID_Tim') >= 0) sh.kedatangan.getRange(k._row, hK.indexOf('ID_Tim') + 1).setValue(baru);
              n++;
            }
          });
          invalidateTim_(mod);
          Logger.log(mod + ': "' + r.Nama_Tim + '" ' + lama + ' -> ' + baru + ' (' + n + ' baris kedatangan ikut diubah). Cek manual: laporan harian/kepulangan dan sheet relawan yang masih memakai ' + lama + '.');
        });
      });
    } catch (e) { Logger.log(mod + ' GAGAL: ' + (e && e.message)); }
  });
}

// Ubah MOD dan KODE di bawah, lalu Run. PIN baru muncul di Execution log (hanya terlihat oleh Anda).
function resetPinTimDariEditor() {
  var MOD = 'TDM', KODE = 'TDM-2026-0002';
  withLock_(function () {
    var sh = modSheets_(MOD), h = headersOf_(sh.tim);
    var tim = readAll_(sh.tim).filter(function (r) { return r.Kode_Tim === KODE && !r.Is_Deleted; })[0];
    if (!tim) throw new Error('Kode tim tidak ditemukan: ' + KODE);
    var pinBaru = String(Math.floor(100000 + Math.random() * 900000)), salt = randomHex_(16);
    sh.tim.getRange(tim._row, h.indexOf('PIN_Hash') + 1).setValue(hashPassword_(pinBaru, salt));
    sh.tim.getRange(tim._row, h.indexOf('PIN_Salt') + 1).setValue(salt);
    invalidateTim_(MOD);
    Logger.log('PIN baru untuk ' + KODE + ' (' + tim.Nama_Tim + ') = ' + pinBaru);
  });
}
