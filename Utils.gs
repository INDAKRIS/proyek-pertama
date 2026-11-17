/**
 * Utils.gs — helper bersama (SATU salinan untuk semua modul).
 * getSS_(kunci), lock, cache (dengan indeks awalan), sanitasi, tanggal Asia/Makassar, respons seragam.
 */

var _ssCache = {};

function props_() { return PropertiesService.getScriptProperties(); }
function getProp_(k) {
  var v = props_().getProperty(k);
  if (!v) throw new Error('KONFIGURASI_KOSONG:' + k);
  return v;
}
function getPropOpt_(k) { return props_().getProperty(k); }

// Buka spreadsheet lewat kunci Script Properties (Kontrak Bersama bagian 3)
function getSS_(kunci) {
  if (_ssCache[kunci]) return _ssCache[kunci];
  var id = getProp_(kunci);
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) { throw new Error('SS_TIDAK_BISA_DIBUKA:' + kunci); }
  if (!ss) throw new Error('SS_TIDAK_BISA_DIBUKA:' + kunci);
  _ssCache[kunci] = ss;
  return ss;
}

function getSheet_(ss, nama, headersIfNew) {
  var sh = ss.getSheetByName(nama);
  if (!sh && headersIfNew) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, headersIfNew.length).setValues([headersIfNew]);
    sh.setFrozenRows(1);
  }
  if (!sh) throw new Error('SHEET_TIDAK_ADA:' + nama);
  return sh;
}

function headersOf_(sh) {
  var lc = sh.getLastColumn();
  if (lc < 1) return [];
  var v = sh.getRange(1, 1, 1, lc).getValues()[0];
  return v.map(function (x) { return String(x); });
}

// Baca seluruh baris sebagai objek berdasar nama header (bukan indeks)
// CEPAT: satu panggilan getValues() (sebelumnya 4 panggilan ke server Sheets per pembacaan)
function readAll_(sh) {
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2 || !vals[0].length) return [];
  var h = vals[0].map(function (x) { return String(x); });
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var o = { _row: i + 1 };
    for (var j = 0; j < h.length; j++) o[h[j]] = vals[i][j];
    out.push(o);
  }
  return out;
}

function objToRow_(h, obj) {
  return h.map(function (k) { return sanitizeCell_(obj[k] !== undefined && obj[k] !== null ? obj[k] : ''); });
}

function appendObj_(sh, h, obj) { sh.appendRow(objToRow_(h, obj)); }

function writeAllObjs_(sh, h, objs) {
  if (!objs.length) return;
  var rows = objs.map(function (o) { return objToRow_(h, o); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, h.length).setValues(rows);
}

// Sanitasi: cegah formula injection (awalan = + - @) dan rapikan teks
function sanitizeCell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
  if (typeof v !== 'string') return v;
  var s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function sanitizeText_(s, max) {
  if (s === null || s === undefined) return '';
  var t = String(s).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<\/?[a-z][\s\S]*?>/gi, '').trim();
  return max ? t.substring(0, max) : t;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('KUNCI_SIBUK');
  try { return fn(); } finally { try { lock.releaseLock(); } catch (e) {} }
}

// ---------- Tanggal (Asia/Makassar / WITA) ----------
function nowWita_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function todayWita_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
function parseDateSafe_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 8, 0, 0);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 8, 0, 0);
  return null;
}
function fmtDate_(v) { var d = parseDateSafe_(v); return d ? Utilities.formatDate(d, CFG.TZ, 'dd/MM/yyyy') : ''; }
function fmtIso_(v) { var d = parseDateSafe_(v); return d ? Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd') : ''; }
function tahunOf_(v) { var d = parseDateSafe_(v); return d ? Utilities.formatDate(d, CFG.TZ, 'yyyy') : ''; }

// ---------- Angka ----------
function toInt_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = parseInt(String(v).replace(/[^\d\-]/g, ''), 10);
  return isNaN(n) ? null : n;
}
function fmtNum_(n) {
  if (n === null || n === undefined || n === '') return null;
  var neg = n < 0; n = Math.abs(Math.round(n));
  var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + s;
}

// ---------- Cache (dengan indeks per awalan agar bisa diinvalidasi) ----------
function cache_() { return CacheService.getScriptCache(); }
function cacheGet_(key) {
  var raw = cache_().get(key);
  return raw === null ? null : JSON.parse(raw);
}
function cachePut_(key, val, ttlSek) {
  try {
    cache_().put(key, JSON.stringify(val), Math.min(ttlSek || 300, 21600));
    if (/(sesi|captcha|daftar|cekstatus|kirim)::/.test(key)) return; // kunci sementara: tidak perlu diindeks
    var pm = key.match(/^[a-z]+_/);
    var idxKey = 'idx_' + (pm ? pm[0] : key.split('::')[0]); // indeks per awalan (pub_, rha_, sys_, ...) agar invalidasiCache_('pub_') bekerja
    var idx = cacheGet_(idxKey) || [];
    if (idx.indexOf(key) < 0) { idx.push(key); cache_().put(idxKey, JSON.stringify(idx), 21600); }
  } catch (e) {}
}
function invalidasiCache_(awalan) {
  try {
    var idx = cacheGet_('idx_' + awalan) || [];
    if (idx.length) cache_().removeAll(idx);
    cache_().remove('idx_' + awalan);
  } catch (e) {}
}

// ---------- ID & sekuens (dipanggil DI DALAM LockService) ----------
function nextSeq_(ss, kunci) {
  var sh = getSheet_(ss, 'SYS_Sequence', ['Key', 'Value']);
  var rows = readAll_(sh);
  var val = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Key === kunci) { val = Number(rows[i].Value) || 0; sh.getRange(rows[i]._row, 2).setValue(val + 1); return val + 1; }
  }
  sh.appendRow([kunci, 1]);
  return 1;
}
function pad_(n, len) { var s = String(n); while (s.length < (len || 4)) s = '0' + s; return s; }

// ---------- Kriptografi ----------
function sha256Hex_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytesToHex_(d);
}
function bytesToHex_(b) {
  var out = '';
  for (var i = 0; i < b.length; i++) { var v = (b[i] + 256) % 256; out += ('0' + v.toString(16)).slice(-2); }
  return out;
}
function randomHex_(nBytes) {
  var s = '';
  while (s.length < nBytes * 2) s += Utilities.getUuid().replace(/-/g, '');
  return s.substring(0, nBytes * 2);
}
function constantTimeEq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- Respons API seragam {success, message, data} ----------
// google.script.run GAGAL (browser menerima null) bila hasil memuat objek Date. Sel tanggal di Sheets terbaca
// sebagai Date, jadi seluruh Date diubah ke teks WITA sebelum dikirim ke browser.
function amanKirim_(data) {
  if (data === undefined || data === null) return null;
  return JSON.parse(JSON.stringify(data, function (k, v) {
    var asli = this[k];
    if (asli instanceof Date) return isNaN(asli.getTime()) ? '' : Utilities.formatDate(asli, CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    return v;
  }));
}
function ok_(data, msg) { return { success: true, message: msg || 'OK', data: amanKirim_(data) }; }
function err_(msg, code) { return { success: false, message: msg || 'Terjadi kesalahan. Coba lagi.', code: code || 'GALAT' }; }
function galatUmum_(e, tag) {
  logError_(tag || '-', e);
  if (e && /^AKSES:|^SESI:|^VALIDASI:/.test(String(e && e.message))) { var m_ = String(e.message), i_ = m_.indexOf(':'); return err_(m_.substring(i_ + 1), m_.substring(0, i_)); } // [PERUBAHAN] pesan boleh memuat tanda titik dua
  return err_('Layanan sedang sibuk, coba lagi.', 'GALAT');
}
function aksesDitolak_(msg) { throw new Error('AKSES:' + (msg || 'Anda tidak memiliki hak akses untuk aksi ini.')); }
function sesiHabis_() { throw new Error('SESI:Sesi berakhir. Silakan login kembali.'); }
function validasi_(msg) { throw new Error('VALIDASI:' + msg); }

// ---------- Log ----------
function logAudit_(user, aksi, menu, detail, hasil) {
  try {
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    var sh = getSheet_(ss, 'SYS_Audit', ['Timestamp', 'ID_User', 'Username', 'Role', 'Aksi', 'Menu', 'Detail', 'Hasil']);
    sh.appendRow([nowWita_(), user ? user.idUser : '', user ? user.username : '', user ? user.role : '', aksi, menu || '', sanitizeCell_(detail), hasil || 'OK']);
  } catch (e) { logError_('logAudit_', e); }
}
function logError_(fn, e) {
  try {
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    var sh = getSheet_(ss, 'SYS_ErrorLog', ['Timestamp', 'Fungsi', 'Pesan', 'Tumpukan']);
    sh.appendRow([nowWita_(), fn, String(e && e.message), String(e && e.stack).substring(0, 900)]);
  } catch (e2) {}
}

// ---------- Lookup nama referensi untuk tampilan tabel (cache) ----------
function lookupMaps_(jenisArr) {
  var need = jenisArr.join(',');
  var hit = cacheGet_(CFG.CACHE_PREFIX.SYS + 'lookup::' + need);
  if (hit) return hit;
  var out = {};
  try {
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    function map(sheet, idKol, namaKol) {
      var m = {};
      try { readAll_(getSheet_(ss, sheet)).forEach(function (r) { m[r[idKol]] = r[namaKol]; }); } catch (e) {}
      return m;
    }
    jenisArr.forEach(function (j) {
      if (j === 'posko') out.posko = map('REF_Posko', 'ID_Posko', 'Nama_Posko');
      else if (j === 'faskes' || j === 'entitas') out[j] = map('REF_Faskes', 'ID_Faskes', 'Nama_Faskes');
      else if (j === 'pasien') out.pasien = map('MST_Pasien', 'ID_Pasien', 'Nama');
      else if (j === 'penyakit') out.penyakit = map('MST_Penyakit', 'ID_Penyakit', 'Nama_Penyakit');
      else if (j === 'barang') out.barang = map('MST_Barang', 'ID_Barang', 'Nama_Barang');
      else if (j === 'kabupaten') out.kabupaten = map('REF_Kabupaten', 'ID_Kabupaten', 'Nama_Wilayah');
      else if (j === 'korban') { var mk = {}; try { readAll_(getSheet_(ss, 'TRX_Korban')).forEach(function (r) { mk[r.ID_Record] = r.Nama || r.ID_Pasien || r.ID_Record; }); } catch (e) {} out.korban = mk; }
      else if (j === 'permintaan') out.permintaan = map('TRX_Permintaan', 'ID_Record', 'No_Permintaan');
      else if (j === 'distribusi') out.distribusi = map('TRX_Distribusi', 'ID_Record', 'No_Distribusi');
      else if (j === 'penerimaan') out.penerimaan = map('TRX_Penerimaan', 'ID_Record', 'No_Penerimaan');
      else if (j === 'kejadian') out.kejadian = kejadianMap_();
    });
  } catch (e) { logError_('lookupMaps_', e); }
  cachePut_(CFG.CACHE_PREFIX.SYS + 'lookup::' + need, out, 300);
  return out;
}

// Peta ID_Kejadian -> label tampilan (sumber: sheetKejadian RHA yang Disetujui)
function kejadianMap_() {
  var m = {};
  try {
    readAll_(getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKejadian')).forEach(function (r) {
      m[r.ID_Kejadian] = (r.Jenis_Bencana || '') + ' — ' + fmtDate_(r.Tgl_Kejadian);
    });
  } catch (e) {}
  return m;
}


// ---------- Pembersihan sesi (SYS_Session tumbuh terus tiap login; dibaca penuh saat cache sesi kosong) ----------
// Pasang sekali lewat pasangTriggerPruneSesi() dari editor; berjalan tiap hari.
function pruneSesi_() {
  withLock_(function () {
    var sh = getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Session');
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return;
    var h = vals[0].map(String);
    var iStatus = h.indexOf('Status'), iExp = h.indexOf('Expires_At');
    var skrg = Date.now();
    var simpan = [];
    for (var i = 1; i < vals.length; i++) {
      var exp = parseDateSafe_(vals[i][iExp]);
      var kadaluarsa = !exp || exp.getTime() < skrg - 24 * 3600 * 1000;
      if (vals[i][iStatus] === 'AKTIF' && !kadaluarsa) simpan.push(vals[i]);
    }
    if (simpan.length === vals.length - 1) return;
    sh.getRange(2, 1, vals.length - 1, h.length).clearContent();
    if (simpan.length) sh.getRange(2, 1, simpan.length, h.length).setValues(simpan);
  });
}
function pasangTriggerPruneSesi() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pruneSesi_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pruneSesi_').timeBased().everyDays(1).atHour(2).create();
}


// ---------- Cache DATA SHEET lintas-eksekusi (menghindari openById + pembacaan sheet berulang) ----------
// Setiap google.script.run = eksekusi baru: openById ~2,5 dtk dan tiap pembacaan sheet ~1,4 dtk (hasil diagnosa).
// readAllCached_ menyimpan isi sheet di CacheService; versi global dinaikkan (bumpData_) setiap ada tulis data.
// HANYA untuk jalur BACA (dashboard, daftar, antrean). Jalur tulis tetap memakai readAll_ langsung (selalu segar).
var DATA_VER_KEY_ = 'indakris_dataver';
function dataVer_() {
  var c = CacheService.getScriptCache();
  var v = c.get(DATA_VER_KEY_);
  if (!v) { v = String(Date.now()); c.put(DATA_VER_KEY_, v, 21600); }
  return v;
}
function bumpData_() {
  try { CacheService.getScriptCache().put(DATA_VER_KEY_, String(Date.now()), 21600); } catch (e) {}
}
var CACHE_CHUNK_ = 90000;
function cacheGetBesar_(key) {
  var c = CacheService.getScriptCache();
  var n = c.get(key + ':n');
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < Number(n); i++) keys.push(key + ':' + i);
  var got = c.getAll(keys), s = '';
  for (var j = 0; j < keys.length; j++) {
    if (got[keys[j]] == null) return null;
    s += got[keys[j]];
  }
  try { return JSON.parse(s); } catch (e) { return null; }
}
function cachePutBesar_(key, obj, ttl) {
  try {
    var s = JSON.stringify(obj);
    if (s.length > CACHE_CHUNK_ * 20) return;
    var c = CacheService.getScriptCache(), map = {}, n = 0;
    for (var i = 0; i < s.length; i += CACHE_CHUNK_) { map[key + ':' + n] = s.substr(i, CACHE_CHUNK_); n++; }
    map[key + ':n'] = String(n);
    c.putAll(map, Math.min(ttl || 180, 21600));
  } catch (e) {}
}
// Setara readAll_(getSheet_(getSS_(ssKey), namaSheet)), tetapi dari cache bila ada.
// Tanggal diubah ke teks WITA (sama seperti amanKirim_), baik saat cache kena maupun meleset.
function readAllCached_(ssKey, namaSheet, ttl) {
  var key = 'D:' + dataVer_() + ':' + ssKey + ':' + namaSheet;
  var hit = cacheGetBesar_(key);
  if (hit) return hit;
  var rows = amanKirim_(readAll_(getSheet_(getSS_(ssKey), namaSheet))) || [];
  cachePutBesar_(key, rows, ttl || 180);
  return rows;
}

