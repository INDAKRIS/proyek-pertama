/**
 * Auth.gs — Form Login 5 Akses (Berkas E) dengan keamanan A6:
 * PBKDF2-HMAC-SHA256 + pepper, sesi bertoken (hash tersimpan), anti brute-force,
 * pendaftaran mandiri + aktivasi berjenjang, reset password oleh approver.
 */

// ============================================================
// PASSWORD (PBKDF2-HMAC-SHA256 + pepper di Script Properties)
// ============================================================

function hmacBytes_(keyStr, msgStr) {
  return Utilities.computeHmacSha256Signature(msgStr, keyStr, Utilities.Charset.UTF_8);
}
function b64Bytes_(b) { return Utilities.base64Encode(b); }

function hashPassword_(password, saltHex) {
  var iter = CFG.PBKDF2_ITERASI;
  var pepper = getPropOpt_(CFG.KEY.PW_PEPPER);
  if (!pepper) { pepper = randomHex_(32); props_().setProperty(CFG.KEY.PW_PEPPER, pepper); }
  var prepped = b64Bytes_(hmacBytes_(pepper, password));
  var saltKey = saltHex + ':1';
  var u = hmacBytes_(saltKey, prepped);
  var t = u.slice();
  for (var i = 1; i < iter; i++) {
    u = hmacBytes_(saltKey, b64Bytes_(u));
    for (var j = 0; j < t.length; j++) t[j] ^= u[j];
  }
  return 'pbkdf2$sha256$' + iter + '$' + saltHex + '$' + bytesToHex_(t);
}
function verifyPassword_(password, stored) {
  if (!stored) return false;
  var p = String(stored).split('$');
  if (p.length !== 5 || p[0] !== 'pbkdf2') return false;
  var salt = p[3], computed = hashPassword_(password, salt);
  return constantTimeEq_(computed.split('$')[4], p[4]);
}
function passwordPolicy_(pw, username, nama) {
  if (!pw || pw.length < CFG.PASSWORD_MIN) return 'Password minimal ' + CFG.PASSWORD_MIN + ' karakter.';
  if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/\d/.test(pw)) return 'Password harus mengandung huruf besar, huruf kecil, dan angka.';
  if (username && pw.toLowerCase() === username.toLowerCase()) return 'Password tidak boleh sama dengan username.';
  if (nama && pw.toLowerCase() === String(nama).toLowerCase()) return 'Password tidak boleh sama dengan nama.';
  return null;
}

// ============================================================
// SESSION
// ============================================================

function usersSheet_() { return getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Users'); }

function findUser_(byUser) {
  var rows = readAll_(usersSheet_());
  var q = String(byUser).toLowerCase();
  return rows.filter(function (r) { return !r.Is_Deleted && (String(r.Username).toLowerCase() === q || String(r.Email).toLowerCase() === q); })[0] || null;
}
function userById_(id) {
  return readAll_(usersSheet_()).filter(function (r) { return r.ID_User === id && !r.Is_Deleted; })[0] || null;
}
function publicProfile_(r) {
  return {
    idUser: r.ID_User, username: r.Username, nama: r.Nama_Lengkap, jabatan: r.Jabatan,
    role: r.Role, roleLabel: ROLE_LABEL[r.Role] || r.Role,
    idKabupaten: r.ID_Kabupaten || '', idFaskes: r.ID_Faskes || '', idPosko: r.ID_Posko || '',
    mustChangePassword: r.Must_Change_Password === true || r.Must_Change_Password === 'TRUE'
  };
}

function buatSesi_(user) {
  var token = randomHex_(32);
  var hash = sha256Hex_(token);
  var now = new Date();
  var exp = new Date(now.getTime() + CFG.SESI_MAX_JAM * 3600 * 1000);
  getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Session', ['Token_Hash', 'ID_User', 'Role', 'Created_At', 'Last_Seen', 'Expires_At', 'Status'])
    .appendRow([hash, user.idUser, user.role, nowWita_(), nowWita_(), Utilities.formatDate(exp, CFG.TZ, 'yyyy-MM-dd HH:mm:ss'), 'AKTIF']);
  var prof = publicProfile_(user);
  cachePut_(CFG.CACHE_PREFIX.SYS + 'sesi::' + hash, { user: prof, at: nowWita_() }, CFG.SESI_IDLE_MIN * 60);
  return token;
}

function validateSession_(token) {
  if (!token) sesiHabis_();
  var hash = sha256Hex_(token);
  var hit = cacheGet_(CFG.CACHE_PREFIX.SYS + 'sesi::' + hash);
  if (hit) return hit.user;
  var ses = readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Session')).filter(function (r) { return r.Token_Hash === hash && r.Status === 'AKTIF'; })[0];
  if (!ses) sesiHabis_();
  var lastSeen = parseDateSafe_(ses.Last_Seen) || new Date();
  var menit = (Date.now() - lastSeen.getTime()) / 60000;
  if (menit > CFG.SESI_IDLE_MIN) { revokeSession_(token); sesiHabis_(); }
  var u = userById_(ses.ID_User);
  if (!u || u.Status !== 'Aktif') sesiHabis_();
  var prof = publicProfile_(u);
  cachePut_(CFG.CACHE_PREFIX.SYS + 'sesi::' + hash, { user: prof, at: nowWita_() }, CFG.SESI_IDLE_MIN * 60);
  return prof;
}

function revokeSession_(token) {
  try {
    var hash = sha256Hex_(token);
    cache_().remove(CFG.CACHE_PREFIX.SYS + 'sesi::' + hash);
    var sh = getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Session');
    readAll_(sh).forEach(function (r) { if (r.Token_Hash === hash) sh.getRange(r._row, 7).setValue('CABUT'); });
  } catch (e) {}
}
function revokeAllSessions_(idUser) {
  try {
    var sh = getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Session');
    readAll_(sh).forEach(function (r) { if (r.ID_User === idUser && r.Status === 'AKTIF') sh.getRange(r._row, 7).setValue('CABUT'); });
  } catch (e) {}
}

// Otorisasi pusat: setiap fungsi privat diawali requireSession_(token, menu, aksi)
function requireSession_(token, menuKode, aksi) {
  var user = validateSession_(token);
  if (menuKode) {
    var cfgM = (String(menuKode).indexOf('M') === 0) ? Repo.cfg(menuKode) : { kode: menuKode, custom: true };
    var access = menuAccess(cfgM);
    var aksiOk = !aksi || access[aksi] === undefined || access[aksi].indexOf(user.role) >= 0;
    if (access.read.indexOf(user.role) < 0 || !aksiOk) aksesDitolak_();
  }
  return user;
}

// ============================================================
// LOGIN
// ============================================================

function loginUser(username, password) {
  try {
    if (!username || !password) return err_('Username dan password wajib diisi.', 'VALIDASI');
    var u = findUser_(username);
    if (!u) { hashPassword_(password, randomHex_(16)); return err_('Username atau password salah.', 'AKSES'); }

    if (u.Status === 'Terkunci') return err_('Akun terkunci. Hubungi Manajemen User untuk membuka kunci.', 'AKSES');
    var now = new Date();
    if (u.Locked_Until) {
      var lk = parseDateSafe_(String(u.Locked_Until).replace(' ', 'T'));
      if (lk && lk > now) return err_('Akun terkunci sementara karena percobaan login gagal. Coba lagi nanti.', 'AKSES');
    }
    if (u.Status === 'Menunggu Aktivasi') return err_('Akun Anda belum diaktifkan. Menunggu persetujuan admin. Gunakan Cek Status Pendaftaran dengan kode pendaftaran Anda.', 'STATUS');
    if (u.Status === 'Ditolak') return err_('Pendaftaran Anda ditolak.' + (u.Alasan_Penolakan ? ' Alasan: ' + u.Alasan_Penolakan : ''), 'STATUS');
    if (u.Status !== 'Aktif') return err_('Akun Anda berstatus ' + u.Status + '. Hubungi admin.', 'STATUS');

    if (!verifyPassword_(password, u.Password_Hash)) {
      var gagal = (toInt_(u.Failed_Attempts) || 0) + 1;
      var sh = usersSheet_();
      if (gagal >= CFG.MAKS_GAGAL_LOGIN) {
        sh.getRange(u._row, hIdx_(u, 'Failed_Attempts')).setValue(gagal);
        sh.getRange(u._row, hIdx_(u, 'Locked_Until')).setValue(Utilities.formatDate(new Date(now.getTime() + CFG.KUNCI_MENIT * 60000), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'));
        logAudit_(publicProfile_(u), 'LOGIN_GAGAL', 'Login', 'Terkunci ' + CFG.KUNCI_MENIT + ' menit', 'GAGAL');
      } else {
        sh.getRange(u._row, hIdx_(u, 'Failed_Attempts')).setValue(gagal);
      }
      return err_('Username atau password salah.', 'AKSES');
    }

    var shU = usersSheet_();
    shU.getRange(u._row, hIdx_(u, 'Failed_Attempts')).setValue(0);
    shU.getRange(u._row, hIdx_(u, 'Locked_Until')).setValue('');
    shU.getRange(u._row, hIdx_(u, 'Last_Login')).setValue(nowWita_());

    var prof = publicProfile_(u);
    revokeAllSessions_(u.ID_User);
    var token = buatSesi_(u);
    logAudit_(prof, 'LOGIN_SUKSES', 'Login', '', 'OK');
    var pending = hitungPending_(prof);
    return ok_({ token: token, user: prof, menu: getMenuByRole(prof.role), jumlahPendingAktivasi: pending.total }, 'Selamat datang, ' + prof.nama + '.');
  } catch (e) { return galatUmum_(e, 'loginUser'); }
}

function hIdx_(u, kolom) {
  var h = headersOf_(usersSheet_());
  return h.indexOf(kolom) + 1;
}

function logoutUser(token) {
  try { var user = validateSession_(token); revokeSession_(token); logAudit_(user, 'LOGOUT', 'Login', '', 'OK'); return ok_(null, 'Anda telah keluar.'); }
  catch (e) { return ok_(null, 'Sesi telah berakhir.'); }
}

function getCurrentUser(token) {
  try { return ok_(validateSession_(token)); } catch (e) { return err_('Sesi berakhir.', 'SESI'); }
}
function changePassword(token, passwordLama, passwordBaru) {
  try {
    var user = validateSession_(token);
    var u = userById_(user.idUser);
    if (!verifyPassword_(passwordLama, u.Password_Hash)) return err_('Password lama salah.', 'VALIDASI');
    var p = passwordPolicy_(passwordBaru, u.Username, u.Nama_Lengkap);
    if (p) return err_(p, 'VALIDASI');
    var sh = usersSheet_();
    var salt = randomHex_(16);
    sh.getRange(u._row, hIdx_(u, 'Password_Hash')).setValue(hashPassword_(passwordBaru, salt));
    sh.getRange(u._row, hIdx_(u, 'Salt')).setValue(salt);
    sh.getRange(u._row, hIdx_(u, 'Must_Change_Password')).setValue(false);
    getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_PasswordHistory', ['ID_User', 'Hash', 'Created_At']).appendRow([u.ID_User, sh.getRange(u._row, hIdx_(u, 'Password_Hash')).getValue(), nowWita_()]);
    logAudit_(user, 'GANTI_PASSWORD', 'Profil', '', 'OK');
    return ok_(null, 'Password berhasil diganti.');
  } catch (e) { return galatUmum_(e, 'changePassword'); }
}

// ============================================================
// PENDAFTARAN MANDIRI (Berkas E)
// ============================================================

function getReferensiPendaftaran() {
  try {
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    var kab = readAll_(getSheet_(ss, 'REF_Kabupaten')).filter(function (r) { return !r.Is_Deleted; }).map(function (r) { return { id: r.ID_Kabupaten, nama: r.Nama_Wilayah }; });
    var faskes = readAll_(getSheet_(ss, 'REF_Faskes')).filter(function (r) { return !r.Is_Deleted; }).map(function (r) { return { id: r.ID_Faskes, nama: r.Nama_Faskes, kab: r.ID_Kabupaten, jenis: r.Jenis_Faskes }; });
    var posko = readAll_(getSheet_(ss, 'REF_Posko')).filter(function (r) { return !r.Is_Deleted && r.Status === 'Aktif'; }).map(function (r) { return { id: r.ID_Posko, nama: r.Nama_Posko, kab: r.ID_Kabupaten, pengelola: r.ID_Faskes_Pengelola || '' }; });
    var cid = 'cap-' + randomHex_(8);
    var a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 8);
    cachePut_(CFG.CACHE_PREFIX.SYS + 'captcha::' + cid, String(a + b), 600);
    return ok_({ kabupaten: kab, faskes: faskes, posko: posko, captcha: { id: cid, pertanyaan: a + ' + ' + b } });
  } catch (e) { return galatUmum_(e, 'getReferensiPendaftaran'); }
}

function registerUser(payload) {
  try {
    payload = payload || {};
    if (payload.honeypot) return err_('Pendaftaran ditolak.', 'AKSES');
    var capOk = cacheGet_(CFG.CACHE_PREFIX.SYS + 'captcha::' + String(payload.captchaId || ''));
    if (!capOk || String(payload.captchaAnswer || '').trim() !== String(capOk)) return err_('Jawaban captcha salah.', 'VALIDASI');
    var key = CFG.CACHE_PREFIX.SYS + 'daftar::' + String(payload.deviceToken || 'umum');
    var n = cacheGet_(key) || 0;
    if (n >= CFG.BATAS_DAFTAR_JAM) return err_('Batas pendaftaran per jam tercapai. Coba lagi nanti.', 'AKSES');

    var role = String(payload.role || '');
    if (role === ROLE.SUPER || ['ADMIN_POSKO', 'ADMIN_PUSKESMAS', 'ADMIN_KABUPATEN', 'ADMIN_PROVINSI'].indexOf(role) < 0) return err_('Role pendaftaran tidak sah.', 'VALIDASI');
    var nama = sanitizeText_(payload.nama, 100), username = String(payload.username || '').toLowerCase().trim();
    if (!nama) return err_('Nama lengkap wajib diisi.', 'VALIDASI');
    if (!/^[a-z0-9._]{4,20}$/.test(username)) return err_('Username 4-20 karakter: huruf kecil, angka, titik, underscore.', 'VALIDASI');
    var email = sanitizeText_(payload.email, 100);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err_('Format email tidak sah.', 'VALIDASI');
    if (!sanitizeText_(payload.noHp, 20).match(/^[\d+\-]{8,}$/)) return err_('Nomor HP tidak sah.', 'VALIDASI');
    var pwErr = passwordPolicy_(payload.password, username, nama);
    if (pwErr) return err_(pwErr, 'VALIDASI');
    if (payload.password !== payload.konfirmasi) return err_('Konfirmasi password tidak cocok.', 'VALIDASI');

    var idKab = sanitizeText_(payload.idKabupaten, 40);
    var idFaskes = sanitizeText_(payload.idFaskes, 40);
    var idPosko = '';
    var poskoBaru = null;
    var ss = getSS_(CFG.KEY.SS_UTAMA);

    if (role === ROLE.POSKO) {
      if (payload.poskoBaru) {
        if (!payload.poskoBaru.nama || !payload.poskoBaru.kabupaten) return err_('Nama dan kabupaten posko baru wajib diisi.', 'VALIDASI');
        poskoBaru = { nama: sanitizeText_(payload.poskoBaru.nama, 150), alamat: sanitizeText_(payload.poskoBaru.alamat, 300), kecamatan: sanitizeText_(payload.poskoBaru.kecamatan, 100), jenis: String(payload.poskoBaru.jenis || 'Lainnya'), kabupaten: sanitizeText_(payload.poskoBaru.kabupaten, 40) };
        if (['Posko Pengungsi', 'Posko Pelayanan Kesehatan', 'Lainnya'].indexOf(poskoBaru.jenis) < 0) return err_('Jenis posko tidak sah.', 'VALIDASI');
      } else {
        idPosko = sanitizeText_(payload.idPosko, 40);
        if (!idPosko) return err_('Pilih posko terdaftar atau daftarkan posko baru.', 'VALIDASI');
      }
    } else if (role === ROLE.PUSKESMAS) {
      if (!idFaskes) return err_('Puskesmas wajib dipilih.', 'VALIDASI');
    } else if (role === ROLE.KAB || role === ROLE.PROV) {
      if (!idKab && role === ROLE.KAB) return err_('Kabupaten wajib dipilih.', 'VALIDASI');
    }
    if (role !== ROLE.PROV && !idKab && (role === ROLE.POSKO)) {
      // kabupaten wajib untuk posko (dari posko terpilih atau posko baru)
    }

    return withLock_(function () {
      var shU = usersSheet_();
      var rows = readAll_(shU);
      var dup = rows.some(function (r) { return !r.Is_Deleted && (String(r.Username).toLowerCase() === username || String(r.Email).toLowerCase() === email); });
      if (dup) return err_('Username atau email sudah terdaftar.', 'VALIDASI');

      var shP = getSheet_(ss, 'REF_Posko', ['ID_Posko', 'Nama_Posko', 'Alamat_Posko', 'Kecamatan', 'Jenis_Posko', 'ID_Kabupaten', 'ID_Faskes_Pengelola', 'Status', 'Created_At']);
      if (poskoBaru) {
        var idP = 'PSK-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, 'REF_Posko'));
        appendObj_(shP, headersOf_(shP), { ID_Posko: idP, Nama_Posko: poskoBaru.nama, Alamat_Posko: poskoBaru.alamat, Kecamatan: poskoBaru.kecamatan, Jenis_Posko: poskoBaru.jenis, ID_Kabupaten: poskoBaru.kabupaten, ID_Faskes_Pengelola: idFaskes || '', Status: 'Menunggu Aktivasi', Created_At: nowWita_() });
        idPosko = idP; idKab = poskoBaru.kabupaten;
      } else if (role === ROLE.POSKO && idPosko) {
        var p = readAll_(shP).filter(function (r) { return r.ID_Posko === idPosko; })[0];
        if (!p) return err_('Posko tidak ditemukan.', 'VALIDASI');
        idKab = p.ID_Kabupaten; idFaskes = idFaskes || p.ID_Faskes_Pengelola || '';
      } else if (role === ROLE.PUSKESMAS && idFaskes) {
        var f = readAll_(getSheet_(ss, 'REF_Faskes')).filter(function (r) { return r.ID_Faskes === idFaskes; })[0];
        if (!f) return err_('Puskesmas tidak ditemukan.', 'VALIDASI');
        idKab = f.ID_Kabupaten;
      }

      var kode = 'REG-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd') + '-' + pad_(nextSeq_(ss, 'KODE_DAFTAR_HARIAN_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd')), 4);
      var salt = randomHex_(16);
      shU.appendRow(objToRow_(headersOf_(shU), {
        ID_User: 'USR-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, 'SYS_Users')), Kode_Pendaftaran: kode,
        Username: username, Nama_Lengkap: nama, NIP: sanitizeText_(payload.nip, 30), Jabatan: sanitizeText_(payload.jabatan, 100),
        Email: email, No_HP: sanitizeText_(payload.noHp, 20), Role: role, ID_Kabupaten: idKab, ID_Faskes: idFaskes, ID_Posko: idPosko,
        Password_Hash: hashPassword_(payload.password, salt), Salt: salt, Status: 'Menunggu Aktivasi', Sumber_Akun: 'PENDAFTARAN_MANDIRI',
        Alasan_Pendaftaran: sanitizeText_(payload.catatan, 500), Diaktifkan_Oleh: '', Tgl_Aktivasi: '', Alasan_Penolakan: '',
        Failed_Attempts: 0, Locked_Until: '', Must_Change_Password: false, Last_Login: '', Created_At: nowWita_(), Created_By: username, Updated_At: nowWita_(), Is_Deleted: ''
      }));
      logAudit_(null, 'DAFTAR_AKUN', 'Login', kode + ' (' + role + ')', 'OK');
      cachePut_(key, n + 1, 3600);
      return ok_({ kodePendaftaran: kode }, 'Pendaftaran berhasil. Akun Anda menunggu persetujuan admin. Simpan kode ini untuk mengecek status pendaftaran.');
    });
  } catch (e) { return galatUmum_(e, 'registerUser'); }
}

function cekStatusPendaftaran(kode, username) {
  try {
    var key = CFG.CACHE_PREFIX.SYS + 'cekstatus::' + sha256Hex_(String(kode) + '|' + String(username));
    var n = cacheGet_(key) || 0;
    if (n >= 10) return err_('Terlalu banyak percobaan. Coba lagi nanti.', 'AKSES');
    cachePut_(key, n + 1, 600);
    var rows = readAll_(usersSheet_()).filter(function (r) { return r.Kode_Pendaftaran === sanitizeText_(kode, 30) && String(r.Username).toLowerCase() === String(username).toLowerCase(); });
    if (!rows.length) return err_('Data tidak ditemukan.', 'AKSES');
    var u = rows[0];
    return ok_({ status: u.Status, alasanPenolakan: u.Alasan_Penolakan || '' });
  } catch (e) { return galatUmum_(e, 'cekStatusPendaftaran'); }
}

// ============================================================
// MANAJEMEN USER (A01)
// ============================================================

function canActivate_(approver, target) {
  if (approver.role === ROLE.SUPER) return true;
  if (approver.role === ROLE.PROV) return target.Role === ROLE.KAB;
  if (approver.role === ROLE.KAB) {
    if (target.Role !== ROLE.PUSKESMAS && target.Role !== ROLE.POSKO) return false;
    return String(target.ID_Kabupaten) === String(approver.idKabupaten);
  }
  if (approver.role === ROLE.PUSKESMAS) {
    if (target.Role !== ROLE.POSKO) return false;
    var p = poskoPengelolaMap_();
    return p && p[target.ID_Posko] === approver.idFaskes;
  }
  return false;
}

function hitungPending_(user) {
  try {
    var rows = readAll_(usersSheet_()).filter(function (r) { return !r.Is_Deleted && r.Status === 'Menunggu Aktivasi'; });
    var terlihat = rows.filter(function (r) {
      var t = { Role: r.Role, ID_Kabupaten: r.ID_Kabupaten, ID_Posko: r.ID_Posko, ID_Faskes: r.ID_Faskes };
      return canActivate_(user, t);
    });
    return { total: terlihat.length, semua: rows.length };
  } catch (e) { return { total: 0, semua: 0 }; }
}

function listUsers(token, p) {
  try {
    var user = requireSession_(token, 'A01', 'read');
    p = p || {};
    var rows = readAll_(usersSheet_()).filter(function (r) { return !r.Is_Deleted; });
    var semua = rows.map(function (r) {
      return { id: r.ID_User, kode: r.Kode_Pendaftaran, tglDaftar: r.Created_At, nama: r.Nama_Lengkap, username: r.Username, email: r.Email, noHp: r.No_HP, role: r.Role, roleLabel: ROLE_LABEL[r.Role] || r.Role, jabatan: r.Jabatan, idKabupaten: r.ID_Kabupaten, idFaskes: r.ID_Faskes, idPosko: r.ID_Posko, status: r.Status, alasan: r.Alasan_Pendaftaran || '', penolakan: r.Alasan_Penolakan || '', mustChange: r.Must_Change_Password === true };
    });
    var dalamWewenang = semua.filter(function (u) { return u.id === user.idUser || canActivate_(user, { Role: u.role, ID_Kabupaten: u.idKabupaten, ID_Posko: u.idPosko, ID_Faskes: u.idFaskes }) || u.role === user.role && u.idKabupaten === user.idKabupaten; });
    var list = dalamWewenang;
    if (p.status && p.status !== 'Semua') list = list.filter(function (u) { return u.status === p.status; });
    else if (p.tab === 'pending') list = list.filter(function (u) { return u.status === 'Menunggu Aktivasi'; });
    if (p.search) { var q = p.search.toLowerCase(); list = list.filter(function (u) { return (u.nama + u.username + u.kode + u.email).toLowerCase().indexOf(q) >= 0; }); }
    if (p.role) list = list.filter(function (u) { return u.role === p.role; });
    return ok_({ users: list, pending: hitungPending_(user) });
  } catch (e) { return galatUmum_(e, 'listUsers'); }
}

function activateUser(token, idUser) {
  try {
    var user = requireSession_(token, 'A01', 'activate');
    return withLock_(function () {
      var sh = usersSheet_(); var u = readAll_(sh).filter(function (r) { return r.ID_User === idUser; })[0];
      if (!u) return err_('User tidak ditemukan.', 'VALIDASI');
      if (u.Status !== 'Menunggu Aktivasi') return err_('User tidak sedang menunggu aktivasi.', 'VALIDASI');
      if (!canActivate_(user, u)) aksesDitolak_('Aktivasi di luar wewenang Anda.');
      sh.getRange(u._row, hIdx_(u, 'Status')).setValue('Aktif');
      sh.getRange(u._row, hIdx_(u, 'Diaktifkan_Oleh')).setValue(user.username);
      sh.getRange(u._row, hIdx_(u, 'Tgl_Aktivasi')).setValue(nowWita_());
      if (u.ID_Posko) {
        var ss = getSS_(CFG.KEY.SS_UTAMA);
        var shP = getSheet_(ss, 'REF_Posko');
        readAll_(shP).forEach(function (r) { if (r.ID_Posko === u.ID_Posko && r.Status === 'Menunggu Aktivasi') shP.getRange(r._row, headersOf_(shP).indexOf('Status') + 1).setValue('Aktif'); });
      }
      logAudit_(user, 'AKTIFKAN_AKUN', 'Manajemen User', u.Username, 'OK');
      return ok_(null, 'Akun ' + u.Username + ' telah diaktifkan.');
    });
  } catch (e) { return galatUmum_(e, 'activateUser'); }
}

function rejectUser(token, idUser, alasan) {
  try {
    var user = requireSession_(token, 'A01', 'activate');
    if (!alasan) return err_('Alasan penolakan wajib diisi.', 'VALIDASI');
    return withLock_(function () {
      var sh = usersSheet_(); var u = readAll_(sh).filter(function (r) { return r.ID_User === idUser; })[0];
      if (!u) return err_('User tidak ditemukan.', 'VALIDASI');
      if (u.Status !== 'Menunggu Aktivasi') return err_('User tidak sedang menunggu aktivasi.', 'VALIDASI');
      if (!canActivate_(user, u)) aksesDitolak_('Penolakan di luar wewenang Anda.');
      sh.getRange(u._row, hIdx_(u, 'Status')).setValue('Ditolak');
      sh.getRange(u._row, hIdx_(u, 'Alasan_Penolakan')).setValue(sanitizeText_(alasan, 300));
      logAudit_(user, 'TOLAK_AKUN', 'Manajemen User', u.Username + ': ' + alasan, 'OK');
      return ok_(null, 'Pendaftaran ditolak.');
    });
  } catch (e) { return galatUmum_(e, 'rejectUser'); }
}

function passwordSementara_() {
  var abjad = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var s = '';
  for (var i = 0; i < 10; i++) s += abjad.charAt(Math.floor(Math.random() * abjad.length));
  return s;
}

function resetPasswordUser(token, idUser) {
  try {
    var user = requireSession_(token, 'A01', 'activate');
    return withLock_(function () {
      var sh = usersSheet_(); var u = readAll_(sh).filter(function (r) { return r.ID_User === idUser; })[0];
      if (!u) return err_('User tidak ditemukan.', 'VALIDASI');
      if (!canActivate_(user, u)) aksesDitolak_('Reset password di luar wewenang Anda.');
      var pw = passwordSementara_();
      var salt = randomHex_(16);
      sh.getRange(u._row, hIdx_(u, 'Password_Hash')).setValue(hashPassword_(pw, salt));
      sh.getRange(u._row, hIdx_(u, 'Salt')).setValue(salt);
      sh.getRange(u._row, hIdx_(u, 'Must_Change_Password')).setValue(true);
      sh.getRange(u._row, hIdx_(u, 'Status')).setValue('Aktif');
      sh.getRange(u._row, hIdx_(u, 'Failed_Attempts')).setValue(0);
      sh.getRange(u._row, hIdx_(u, 'Locked_Until')).setValue('');
      revokeAllSessions_(u.ID_User);
      logAudit_(user, 'RESET_PASSWORD_USER', 'Manajemen User', u.Username, 'OK');
      return ok_({ passwordSementara: pw }, 'Password sementara dibuat. Berikan melalui jalur yang Anda pilih; password hanya ditampilkan sekali.');
    });
  } catch (e) { return galatUmum_(e, 'resetPasswordUser'); }
}

function setUserStatus(token, idUser, status) {
  try {
    var user = requireSession_(token, 'A01', 'activate');
    if (['Aktif', 'Nonaktif'].indexOf(status) < 0) return err_('Status tidak sah.', 'VALIDASI');
    return withLock_(function () {
      var sh = usersSheet_(); var u = readAll_(sh).filter(function (r) { return r.ID_User === idUser; })[0];
      if (!u) return err_('User tidak ditemukan.', 'VALIDASI');
      if (!canActivate_(user, u)) aksesDitolak_('Di luar wewenang Anda.');
      sh.getRange(u._row, hIdx_(u, 'Status')).setValue(status);
      if (status === 'Nonaktif') revokeAllSessions_(u.ID_User);
      logAudit_(user, 'NONAKTIFKAN_USER', 'Manajemen User', u.Username + ' => ' + status, 'OK');
      return ok_(null, 'Status akun diperbarui.');
    });
  } catch (e) { return galatUmum_(e, 'setUserStatus'); }
}

function createUserBySuperAdmin(token, payload) {
  try {
    var user = requireSession_(token, 'A01', 'write');
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin yang dapat menambah user.');
    payload = payload || {};
    var username = String(payload.username || '').toLowerCase().trim();
    if (!/^[a-z0-9._]{4,20}$/.test(username)) return err_('Username 4-20 karakter (huruf kecil, angka, titik, underscore).', 'VALIDASI');
    var role = payload.role;
    if ([ROLE.POSKO, ROLE.PUSKESMAS, ROLE.KAB, ROLE.PROV, ROLE.SUPER].indexOf(role) < 0) return err_('Role tidak sah.', 'VALIDASI');
    return withLock_(function () {
      var sh = usersSheet_();
      if (readAll_(sh).some(function (r) { return !r.Is_Deleted && String(r.Username).toLowerCase() === username; })) return err_('Username sudah digunakan.', 'VALIDASI');
      var pw = passwordSementara_();
      var salt = randomHex_(16);
      sh.appendRow(objToRow_(headersOf_(sh), {
        ID_User: 'USR-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Users')),
        Kode_Pendaftaran: '', Username: username, Nama_Lengkap: sanitizeText_(payload.nama, 100), NIP: sanitizeText_(payload.nip, 30),
        Jabatan: sanitizeText_(payload.jabatan, 100), Email: sanitizeText_(payload.email, 100), No_HP: sanitizeText_(payload.noHp, 20),
        Role: role, ID_Kabupaten: payload.idKabupaten || '', ID_Faskes: payload.idFaskes || '', ID_Posko: payload.idPosko || '',
        Password_Hash: hashPassword_(pw, salt), Salt: salt, Status: 'Aktif', Sumber_Akun: 'DIBUAT_SUPER_ADMIN',
        Alasan_Pendaftaran: '', Diaktifkan_Oleh: user.username, Tgl_Aktivasi: nowWita_(), Alasan_Penolakan: '',
        Failed_Attempts: 0, Locked_Until: '', Must_Change_Password: true, Last_Login: '', Created_At: nowWita_(), Created_By: user.username, Updated_At: nowWita_(), Is_Deleted: ''
      }));
      logAudit_(user, 'BUAT_USER', 'Manajemen User', username + ' (' + role + ')', 'OK');
      return ok_({ passwordSementara: pw }, 'User dibuat dengan password sementara. Password hanya ditampilkan sekali.');
    });
  } catch (e) { return galatUmum_(e, 'createUserBySuperAdmin'); }
}

function updateUser(token, idUser, data) {
  try {
    var user = requireSession_(token, 'A01', 'write');
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin.');
    return withLock_(function () {
      var sh = usersSheet_(); var u = readAll_(sh).filter(function (r) { return r.ID_User === idUser; })[0];
      if (!u) return err_('User tidak ditemukan.', 'VALIDASI');
      ['Nama_Lengkap', 'Jabatan', 'Email', 'No_HP', 'Role', 'ID_Kabupaten', 'ID_Faskes', 'ID_Posko'].forEach(function (k) {
        if (data[k] !== undefined) sh.getRange(u._row, hIdx_(u, k)).setValue(sanitizeCell_(data[k]));
      });
      logAudit_(user, 'UBAH_USER', 'Manajemen User', u.Username, 'OK');
      return ok_(null, 'User diperbarui.');
    });
  } catch (e) { return galatUmum_(e, 'updateUser'); }
}

function bukaKunciUser(token, idUser) {
  try {
    var user = requireSession_(token, 'A01', 'activate');
    return withLock_(function () {
      var sh = usersSheet_(); var u = readAll_(sh).filter(function (r) { return r.ID_User === idUser; })[0];
      if (!u) return err_('User tidak ditemukan.', 'VALIDASI');
      sh.getRange(u._row, hIdx_(u, 'Status')).setValue('Aktif');
      sh.getRange(u._row, hIdx_(u, 'Failed_Attempts')).setValue(0);
      sh.getRange(u._row, hIdx_(u, 'Locked_Until')).setValue('');
      logAudit_(user, 'BUKA_KUNCI', 'Manajemen User', u.Username, 'OK');
      return ok_(null, 'Akun dibuka kuncinya.');
    });
  } catch (e) { return galatUmum_(e, 'bukaKunciUser'); }
}

// ============================================================
// MENU & BOOTSTRAP PRIVATE
// ============================================================

function getMenuByRole(role) {
  var menus = buildMenuConfig().filter(function (m) {
    var acc = menuAccess(m);
    return acc.read.indexOf(role) >= 0;
  });
  return menus.map(function (m) { return { kode: m.kode, nama: m.nama, kluster: m.kluster || 'ADMIN', custom: m.custom || null }; });
}

function bootstrapPrivate(token) {
  try {
    var user = validateSession_(token);
    return ok_({ user: user, menu: getMenuByRole(user.role), pending: hitungPending_(user), versi: '1.0.0' });
  } catch (e) { return err_('Sesi berakhir. Silakan login kembali.', 'SESI'); }
}
