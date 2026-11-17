/**
 * Setup.gs — pembuatan idempoten seluruh berkas & sheet, seed referensi, akun demo, dan data contoh.
 * Jalankan runAllSetup() SEKALI dari editor (otorisasi akan diminta).
 */

function runAllSetup() {
  var hasil = [];
  function catat(nama, fn) { try { hasil.push(nama + ': ' + fn()); } catch (e) { hasil.push(nama + ': GAGAL — ' + e.message); logError_('setup.' + nama, e); } }
  catat('Database INDAKRIS (UTAMA)', setupDatabase);
  catat('Database RHA', setupRHA);
  catat('Database TDM', setupTDM);
  catat('Database TDP', setupTDP);
  catat('Cek Konfigurasi', cekKonfigurasiAll);
  pasangTrigger_();
  Logger.log(hasil.join('\n'));
  return hasil.join('\n');
}

// ---------- Cari/buat berkas (Kontrak Bersama 2e): pakai ulang, tidak pernah membuat kedua ----------
function ensureFolder_(nama) {
  var it = DriveApp.getFoldersByName(nama);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(nama);
}
function ensureSpreadsheet_(folder, nama, kunci) {
  var it = folder.getFilesByName(nama);
  var ketemu = [];
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) ketemu.push(f); }
  if (ketemu.length > 1) throw new Error('Ditemukan lebih dari satu berkas "' + nama + '". Pilih manual dan isi ' + kunci + ' di Script Properties.');
  if (ketemu.length === 1) { props_().setProperty(kunci, ketemu[0].getId()); return 'pakai-ulang'; }
  var baru = SpreadsheetApp.create(nama);
  DriveApp.getFileById(baru.getId()).moveTo(folder);
  props_().setProperty(kunci, baru.getId());
  return 'dibuat';
}

function buatSheetJikaKosong_(ss, nama, headers, dataSeed) {
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    if (dataSeed && dataSeed.length) writeAllObjs_(sh, headers, dataSeed);
  } else {
    var hLama = headersOf_(sh);
    headers.forEach(function (k) { if (hLama.indexOf(k) < 0 && hLama.length) { sh.getRange(1, hLama.length + 1).setValue(k); hLama.push(k); } });
  }
  if (nama.indexOf('SYS_') === 0) sh.protect().setDescription('Proteksi sistem INDAKRIS');
  return sh;
}

// ============================================================
// DATABASE_INDAKRIS_NTT (UTAMA): SYS_/REF_/MST_/TRX_
// ============================================================
function setupDatabase() {
  var folder = ensureFolder_(CFG.NAME.FOLDER_UTAMA);
  var mode = ensureSpreadsheet_(folder, CFG.NAME.SS_UTAMA, CFG.KEY.SS_UTAMA);
  var ss = getSS_(CFG.KEY.SS_UTAMA);
  props_().setProperty(CFG.KEY.SS_WILAYAH, props_().getProperty(CFG.KEY.SS_UTAMA));

  var sheets = sheetsUtama_();
  Object.keys(sheets).forEach(function (nama) { buatSheetJikaKosong_(ss, nama, sheets[nama]); });

  // Daftarkan header TRX menu ke SYS_Registry (pemetaan berdasar nama header)
  var reg = getSheet_(ss, 'SYS_Registry', ['Nama_Sheet', 'Kode_Menu', 'Kolom_Kunci', 'Header']);
  var ada = {};
  readAll_(reg).forEach(function (r) { ada[r.Nama_Sheet] = true; });
  buildMenuConfig().forEach(function (m) {
    if (m.sheet && !ada[m.sheet]) {
      reg.appendRow([m.sheet, m.kode, 'ID_Record', JSON.stringify(Repo.headers(m))]);
      buatSheetJikaKosong_(ss, m.sheet, Repo.headers(m));
    }
  });

  seedReferensi_(ss);
  seedUsersDemo_(ss);
  seedSampleData_(ss);
  return mode;
}

function sheetsUtama_() {
  var S = {};
  S['SYS_Users'] = ['ID_User', 'Kode_Pendaftaran', 'Username', 'Nama_Lengkap', 'NIP', 'Jabatan', 'Email', 'No_HP', 'Role', 'ID_Kabupaten', 'ID_Faskes', 'ID_Posko', 'Password_Hash', 'Salt', 'Status', 'Sumber_Akun', 'Alasan_Pendaftaran', 'Diaktifkan_Oleh', 'Tgl_Aktivasi', 'Alasan_Penolakan', 'Failed_Attempts', 'Locked_Until', 'Must_Change_Password', 'Last_Login', 'Created_At', 'Created_By', 'Updated_At', 'Is_Deleted'];
  S['SYS_Session'] = ['Token_Hash', 'ID_User', 'Role', 'Created_At', 'Last_Seen', 'Expires_At', 'Status'];
  S['SYS_Audit'] = ['Timestamp', 'ID_User', 'Username', 'Role', 'Aksi', 'Menu', 'Detail', 'Hasil'];
  S['SYS_Config'] = ['Key', 'Value'];
  S['SYS_Sequence'] = ['Key', 'Value'];
  S['SYS_Registry'] = ['Nama_Sheet', 'Kode_Menu', 'Kolom_Kunci', 'Header'];
  S['SYS_PasswordHistory'] = ['ID_User', 'Hash', 'Created_At'];
  S['SYS_ErrorLog'] = ['Timestamp', 'Fungsi', 'Pesan', 'Tumpukan'];
  S['SYS_Idempotency'] = ['Request_Id', 'Hasil', 'Created_At'];
  S['REF_Kabupaten'] = ['ID_Kabupaten', 'Kode_BPS', 'Nama_Wilayah', 'Tipe_Wilayah', 'Pulau', 'Ibu_Kota', 'Latitude', 'Longitude', 'Slug', 'URL_Logo_Drive', 'Urutan_Tampil', 'Aktif', 'Is_Deleted'];
  S['REF_Faskes'] = ['ID_Faskes', 'Nama_Faskes', 'Jenis_Faskes', 'Kategori_Entitas', 'ID_Kabupaten', 'Alamat', 'Kecamatan', 'Aktif', 'Is_Deleted'];
  S['REF_Posko'] = ['ID_Posko', 'Nama_Posko', 'Alamat_Posko', 'Kecamatan', 'Jenis_Posko', 'ID_Kabupaten', 'ID_Faskes_Pengelola', 'Status', 'Created_At', 'Is_Deleted'];
  S['REF_JenisBencana'] = ['Nama', 'Kategori', 'Ikon'];
  S['REF_KategoriUsia'] = ['Kode', 'Label', 'Min_Bulan', 'Max_Bulan'];
  S['REF_Dropdown'] = ['Tipe', 'Nilai', 'Label', 'Keterangan'];
  S['REF_PasswordUmum'] = ['Password'];
  S['MST_Penyakit'] = ['ID_Penyakit', 'Nama_Penyakit', 'Kode_ICD10', 'Kelompok', 'Wajib_Lapor', 'Sinonim', 'Status_Verifikasi', 'Is_Deleted'];
  S['MST_Barang'] = ['ID_Barang', 'Nama_Barang', 'Satuan', 'Stok_Minimum', 'Aktif', 'Is_Deleted'];
  S['MST_Pasien'] = ['ID_Pasien', 'Nama', 'JK', 'Usia', 'Satuan_Usia', 'Kategori_Usia', 'ID_Kabupaten', 'Alamat', 'Aktif', 'Is_Deleted'];
  S['MST_Kejadian'] = ['ID_Kejadian', 'Nama_Kejadian', 'Jenis_Bencana', 'Tgl_Kejadian', 'ID_Kabupaten', 'Kabupaten', 'Status', 'Is_Deleted'];
  S['TRX_Relawan_Anggota'] = ['ID', 'ID_Tim', 'Nama_Anggota', 'Jabatan_Anggota', 'Kontak', 'Created_At', 'Is_Deleted'];
  return S;
}

function seedReferensi_(ss) {
  var sh;
  sh = getSheet_(ss, 'REF_Kabupaten');
  if (sh.getLastRow() < 2) {
    var rows = KABUPATEN_SEED.map(function (k, i) {
      return { ID_Kabupaten: k[0], Kode_BPS: k[1], Nama_Wilayah: k[2], Tipe_Wilayah: k[3], Pulau: k[4], Ibu_Kota: k[5], Latitude: k[6], Longitude: k[7], Slug: k[8], URL_Logo_Drive: '', Urutan_Tampil: i + 1, Aktif: 'TRUE', Is_Deleted: '' };
    });
    writeAllObjs_(sh, headersOf_(sh), rows);
  }
  sh = getSheet_(ss, 'REF_JenisBencana');
  if (sh.getLastRow() < 2) {
    writeAllObjs_(sh, headersOf_(sh), JENIS_BENCANA_SEED.map(function (j) { return { Nama: j[0], Kategori: j[1], Ikon: '' }; }));
  }
  sh = getSheet_(ss, 'REF_KategoriUsia');
  if (sh.getLastRow() < 2) {
    var ku = [['BAYI_0_5', 'Bayi 0-5 bulan', 0, 5], ['BAYI_6_23', 'Bayi 6-23 bulan', 6, 23], ['BALITA_24_59', 'Balita 24-59 bulan', 24, 59], ['ANAK_REMAJA', 'Anak-Remaja 5-17 tahun', 60, 204], ['IBU_HAMIL', 'Ibu Hamil', '', ''], ['IBU_MENYUSUI', 'Ibu Menyusui', '', ''], ['WUS', 'Wanita Usia Subur', '', ''], ['PUS', 'Pasangan Usia Subur', '', ''], ['LANSIA', 'Lansia 60+ tahun', 720, 99999], ['DISABILITAS', 'Penyandang Disabilitas', '', ''], ['ODGJ', 'Orang dengan Gangguan Jiwa', '', ''], ['ODHA', 'Orang dengan HIV/AIDS', '', '']];
    writeAllObjs_(sh, headersOf_(sh), ku.map(function (x) { return { Kode: x[0], Label: x[1], Min_Bulan: x[2], Max_Bulan: x[3] }; }));
  }
  sh = getSheet_(ss, 'REF_Dropdown');
  if (sh.getLastRow() < 2) {
    var dd = [];
    KELOMPOK_SASARAN.forEach(function (k) { dd.push(['Kelompok_Sasaran', k, k.replace(/_/g, ' '), '']); });
    dd.push(['Kategori_Entitas', 'Faskes', 'Faskes', ''], ['Kategori_Entitas', 'Instansi', 'Instansi', ''], ['Kategori_Entitas', 'Gudang', 'Gudang', '']);
    dd.push(['Jenis_Faskes', 'Puskesmas', 'Puskesmas', ''], ['Jenis_Faskes', 'RS', 'Rumah Sakit', ''], ['Jenis_Faskes', 'Pustu', 'Pustu', ''], ['Jenis_Faskes', 'Instansi Pemerintah', 'Instansi Pemerintah', ''], ['Jenis_Faskes', 'Gudang Farmasi', 'Gudang Farmasi', ''], ['Jenis_Faskes', 'Lainnya', 'Lainnya', '']);
    STATUS_AWAL_OPTS.forEach(function (s) { dd.push(['Status_Awal', s, s, '']); });
    STATUS_LANJUTAN_OPTS.forEach(function (s) { dd.push(['Status_Lanjutan', s, s, '']); });
    dd.push(['Status_Verifikasi_Penyakit', 'Usulan', 'Usulan', ''], ['Status_Verifikasi_Penyakit', 'Terverifikasi', 'Terverifikasi', ''], ['Status_Verifikasi_Penyakit', 'Nonaktif', 'Nonaktif', '']);
    writeAllObjs_(sh, headersOf_(sh), dd.map(function (x) { return { Tipe: x[0], Nilai: x[1], Label: x[2], Keterangan: x[3] }; }));
  }
  sh = getSheet_(ss, 'MST_Penyakit');
  if (sh.getLastRow() < 2) {
    writeAllObjs_(sh, headersOf_(sh), PENYAKIT_SEED.map(function (p) {
      return { ID_Penyakit: p[0], Nama_Penyakit: p[1], Kode_ICD10: p[2], Kelompok: p[3], Wajib_Lapor: p[4], Sinonim: p[5], Status_Verifikasi: 'Usulan', Is_Deleted: '' };
    }));
  }
  sh = getSheet_(ss, 'SYS_Config');
  if (sh.getLastRow() < 2) {
    var cfgRows = [['sesi_idle_menit', String(CFG.SESI_IDLE_MIN)], ['sesi_maks_jam', String(CFG.SESI_MAX_JAM)], ['maks_gagal_login', String(CFG.MAKS_GAGAL_LOGIN)], ['kunci_menit', String(CFG.KUNCI_MENIT)],
      ['standar_air_l_per_org', '15'], ['rasio_toilet_per_org', '20'], ['standar_dapur_org', '500'], ['angka_bayi_baru_lahir', '0'], ['migration_mode', 'FALSE'], ['env', 'PROD']];
    writeAllObjs_(sh, headersOf_(sh), cfgRows.map(function (c) { return { Key: c[0], Value: c[1] }; }));
  }
  sh = getSheet_(ss, 'REF_PasswordUmum');
  if (sh.getLastRow() < 2) {
    var umum = ['password', '12345678', 'qwerty123', 'admin123', 'indakris', 'ntt12345', 'kesehatan1', 'bencana123', 'password1', 'iloveyou1', '123456789', '1234567890', 'abc123456', 'letmein123', 'welcome123', 'admin1234', 'google123', 'freepass1', 'sunshine1', 'princess1', 'football1', 'baseball1', 'master123', 'monkey123', 'dragon123', 'p@ssw0rd', 'qazwsx123', 'trustno11', '1q2w3e4r5t', '1a2b3c4d5e'];
    writeAllObjs_(sh, headersOf_(sh), umum.map(function (p) { return { Password: p }; }));
  }
}

// ---------- Akun demo 5 level ----------
function seedUsersDemo_(ss) {
  var sh = getSheet_(ss, 'SYS_Users');
  if (sh.getLastRow() >= 2) return 'sudah-ada';
  var akun = [
    ['USR-DEMO-0001', 'superadmin', 'Administrator Sistem', ROLE.SUPER, '', '', ''],
    ['USR-DEMO-0002', 'provinsi', 'Admin Provinsi NTT', ROLE.PROV, '', '', ''],
    ['USR-DEMO-0003', 'kabkupang', 'Admin Kabupaten Kupang', ROLE.KAB, 'KAB-KUPANG', '', ''],
    ['USR-DEMO-0004', 'puskesmas', 'Admin Puskesmas Oebobo', ROLE.PUSKESMAS, 'KAB-KOTA-KUPANG', 'FKS-KOTA-KUPANG-01', ''],
    ['USR-DEMO-0005', 'posko', 'Admin Posko Oebobo', ROLE.POSKO, 'KAB-KOTA-KUPANG', 'FKS-KOTA-KUPANG-01', 'PSK-KOTA-KUPANG-01']
  ];
  var h = headersOf_(sh);
  var rows = akun.map(function (a, i) {
    var salt = randomHex_(16);
    var o = {};
    o[h[0]] = a[0]; o.Kode_Pendaftaran = ''; o.Username = a[1]; o.Nama_Lengkap = a[2]; o.NIP = ''; o.Jabatan = ROLE_LABEL[a[3]];
    o.Email = a[1] + '@indakris.ntt.go.id'; o.No_HP = ''; o.Role = a[3]; o.ID_Kabupaten = a[4]; o.ID_Faskes = a[5]; o.ID_Posko = a[6];
    o.Password_Hash = hashPassword_('Indakris#2026', salt); o.Salt = salt; o.Status = 'Aktif'; o.Sumber_Akun = 'DIBUAT_SUPER_ADMIN';
    o.Alasan_Pendaftaran = ''; o.Diaktifkan_Oleh = 'setup'; o.Tgl_Aktivasi = nowWita_(); o.Alasan_Penolakan = '';
    o.Failed_Attempts = 0; o.Locked_Until = ''; o.Must_Change_Password = ''; o.Last_Login = ''; o.Created_At = nowWita_(); o.Created_By = 'setup'; o.Updated_At = nowWita_(); o.Is_Deleted = '';
    return o;
  });
  writeAllObjs_(sh, h, rows);
  return '5 akun demo dibuat (password: Indakris#2026)';
}

// ============================================================
// DATABASE_RHA_INDAKRIS_NTT
// ============================================================
function setupRHA() {
  var folder = ensureFolder_(CFG.NAME.FOLDER_RHA);
  var mode = ensureSpreadsheet_(folder, CFG.NAME.SS_RHA, CFG.KEY.SS_RHA);
  var ss = getSS_(CFG.KEY.SS_RHA);
  buatSheetJikaKosong_(ss, 'sheetKejadian', RHA_HEADERS);
  buatSheetJikaKosong_(ss, 'sheetLog', ['Timestamp', 'Aksi', 'ID_Kejadian', 'User', 'Keterangan']);
  var shKab = buatSheetJikaKosong_(ss, 'sheetKabupaten', ['ID_Kabupaten', 'Kode_BPS', 'Nama_Wilayah', 'Tipe_Wilayah', 'Pulau', 'Ibu_Kota', 'Latitude', 'Longitude', 'Slug', 'URL_Logo_Drive', 'Urutan_Tampil', 'Warna_Aksen', 'Aktif']);
  if (shKab.getLastRow() < 2) {
    writeAllObjs_(shKab, headersOf_(shKab), KABUPATEN_SEED.map(function (k, i) {
      return { ID_Kabupaten: k[0], Kode_BPS: k[1], Nama_Wilayah: k[2], Tipe_Wilayah: k[3], Pulau: k[4], Ibu_Kota: k[5], Latitude: k[6], Longitude: k[7], Slug: k[8], URL_Logo_Drive: '', Urutan_Tampil: i + 1, Warna_Aksen: '', Aktif: 'TRUE' };
    }));
  } else {
    var rows = readAll_(shKab);
    if (rows.length !== 22) Logger.log('PERINGATAN: sheetKabupaten berisi ' + rows.length + ' baris (harus 22). Periksa identitas wilayah.');
  }
  var shRef = buatSheetJikaKosong_(ss, 'sheetRef', ['Tipe', 'Nama', 'Kategori', 'Ikon']);
  if (shRef.getLastRow() < 2) {
    writeAllObjs_(shRef, headersOf_(shRef), JENIS_BENCANA_SEED.map(function (j) { return { Tipe: 'JENIS_BENCANA', Nama: j[0], Kategori: j[1], Ikon: '' }; }).concat([['STATUS_VERIFIKASI', 'Menunggu', '', ''], ['STATUS_VERIFIKASI', 'Disetujui', '', ''], ['STATUS_VERIFIKASI', 'Ditolak', '', '']]));
  }
  return mode;
}

// ============================================================
// DATABASE TDM & TDP
// ============================================================
function setupTDM() {
  var folder = ensureFolder_(CFG.NAME.FOLDER_TDM);
  var mode = ensureSpreadsheet_(folder, CFG.NAME.SS_TDM, CFG.KEY.SS_TDM);
  modSheets_('TDM');
  return mode;
}
function setupTDP() {
  var folder = ensureFolder_(CFG.NAME.FOLDER_TDP);
  var mode = ensureSpreadsheet_(folder, CFG.NAME.SS_TDP, CFG.KEY.SS_TDP);
  var sh = modSheets_('TDP');
  var shM = getSheet_(sh.ss, 'TDP_Master', ['Kode', 'Kelompok', 'Label']);
  if (shM.getLastRow() < 2) {
    var rows = [];
    for (var i = 1; i <= 13; i++) rows.push({ Kode: 'L' + pad_(i, 2), Kelompok: 'Layanan Individu', Label: 'Layanan Psikososial Individu L' + pad_(i, 2) });
    for (var j = 1; j <= 13; j++) rows.push({ Kode: 'M' + pad_(j, 2), Kelompok: 'Layanan Kelompok', Label: 'Layanan Psikososial Kelompok M' + pad_(j, 2) });
    writeAllObjs_(shM, headersOf_(shM), rows);
  }
  return mode;
}

// ---------- Cek konfigurasi (Kontrak Bersama 2f) ----------
function cekKonfigurasiAll() {
  var out = [];
  [CFG.KEY.SS_UTAMA, CFG.KEY.SS_RHA, CFG.KEY.SS_TDM, CFG.KEY.SS_TDP, CFG.KEY.SS_WILAYAH].forEach(function (k) {
    try { getSS_(k); out.push(k + ': OK'); } catch (e) { out.push(k + ': GAGAL'); }
  });
  try {
    var kab = readAll_(getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKabupaten'));
    var kupangKota = kab.filter(function (r) { return r.ID_Kabupaten === 'KAB-KOTA-KUPANG'; }).length;
    var kupangKab = kab.filter(function (r) { return r.ID_Kabupaten === 'KAB-KUPANG'; }).length;
    out.push('Wilayah: ' + kab.length + ' baris; Kota Kupang vs Kabupaten Kupang ' + (kupangKota === 1 && kupangKab === 1 ? 'OK (berbeda)' : 'PERIKSA'));
  } catch (e) { out.push('Wilayah: GAGAL'); }
  return out.join(' | ');
}

// ---------- Trigger ----------
function pasangTrigger_() {
  var ada = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'backupMingguan'; });
  if (!ada) ScriptApp.newTrigger('backupMingguan').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
}

// ============================================================
// DATA CONTOH REALISTIS (hanya bila sheet masih kosong)
// ============================================================
function seedSampleData_(ss) {
  seedFaskesPosko_(ss);
  seedPasienBarang_(ss);
  seedKejadian_();
  seedTrxCoba_(ss);
  seedTim_();
}

function seedFaskesPosko_(ss) {
  var shF = getSheet_(ss, 'REF_Faskes');
  if (shF.getLastRow() < 2) {
    var faskes = [
      ['FKS-KOTA-KUPANG-01', 'Puskesmas Oebobo', 'Puskesmas', 'Faskes', 'KAB-KOTA-KUPANG', 'Jl. Timor Raya, Kota Kupang', 'Oebobo'],
      ['FKS-KOTA-KUPANG-02', 'RSUD Prof. Dr. W.Z. Yohanes', 'RS', 'Faskes', 'KAB-KOTA-KUPANG', 'Jl. Jend. Soedirman, Kupang', 'Oebobo'],
      ['FKS-KUPANG-01', 'Puskesmas Semau', 'Puskesmas', 'Faskes', 'KAB-KUPANG', 'Pulau Semau', 'Semau'],
      ['FKS-TTS-01', 'Puskesmas Soe', 'Puskesmas', 'Faskes', 'KAB-TTS', 'Jl. Jend. Soedirman, Soe', 'Kota Soe'],
      ['FKS-TTU-01', 'Puskesmas Kefamenanu', 'Puskesmas', 'Faskes', 'KAB-TTU', 'Kefamenanu', 'Kota Kefamenanu'],
      ['FKS-BELU-01', 'RSUD Atambua', 'RS', 'Faskes', 'KAB-BELU', 'Atambua', 'Kota Atambua'],
      ['FKS-ENDE-01', 'Puskesmas Ende Tengah', 'Puskesmas', 'Faskes', 'KAB-ENDE', 'Ende', 'Ende Tengah'],
      ['FKS-DINKES-01', 'Dinas Kesehatan Provinsi NTT', 'Instansi Pemerintah', 'Instansi', 'KAB-KOTA-KUPANG', 'Kupang', 'Kota Kupang'],
      ['FKS-GDK-01', 'Gudang Farmasi Kabupaten Kupang', 'Gudang Farmasi', 'Gudang', 'KAB-KUPANG', 'Kupang', 'Taebenu']
    ];
    writeAllObjs_(shF, headersOf_(shF), faskes.map(function (f) { return { ID_Faskes: f[0], Nama_Faskes: f[1], Jenis_Faskes: f[2], Kategori_Entitas: f[3], ID_Kabupaten: f[4], Alamat: f[5], Kecamatan: f[6], Aktif: 'TRUE', Is_Deleted: '' }; }));
  }
  var shP = getSheet_(ss, 'REF_Posko');
  if (shP.getLastRow() < 2) {
    var posko = [
      ['PSK-KOTA-KUPANG-01', 'Posko Pengungsi Oebobo', 'Jl. Timor Raya', 'Oebobo', 'Posko Pengungsi', 'KAB-KOTA-KUPANG', 'FKS-KOTA-KUPANG-01', 'Aktif'],
      ['PSK-KOTA-KUPANG-02', 'Posko Kesehatan Fontein', 'Fontein', 'Alak', 'Posko Pelayanan Kesehatan', 'KAB-KOTA-KUPANG', 'FKS-KOTA-KUPANG-02', 'Aktif'],
      ['PSK-KUPANG-01', 'Posko Pengungsi Semau', 'Semau', 'Semau', 'Posko Pengungsi', 'KAB-KUPANG', 'FKS-KUPANG-01', 'Aktif'],
      ['PSK-TTS-01', 'Posko Pengungsi Soe', 'Soe', 'Kota Soe', 'Posko Pengungsi', 'KAB-TTS', 'FKS-TTS-01', 'Aktif'],
      ['PSK-TTU-01', 'Posko Pengungsi Kefamenanu', 'Kefamenanu', 'Kota Kefamenanu', 'Posko Pengungsi', 'KAB-TTU', 'FKS-TTU-01', 'Aktif'],
      ['PSK-BELU-01', 'Posko Pengungsi Atambua', 'Atambua', 'Kota Atambua', 'Posko Pengungsi', 'KAB-BELU', 'FKS-BELU-01', 'Aktif'],
      ['PSK-ENDE-01', 'Posko Pengungsi Ende', 'Ende', 'Ende Tengah', 'Posko Pengungsi', 'KAB-ENDE', 'FKS-ENDE-01', 'Aktif'],
      ['PSK-MALAKA-01', 'Posko Pengungsi Betun', 'Betun', 'Kota Betun', 'Posko Pengungsi', 'KAB-MALAKA', 'FKS-BELU-01', 'Aktif']
    ];
    writeAllObjs_(shP, headersOf_(shP), posko.map(function (p) { return { ID_Posko: p[0], Nama_Posko: p[1], Alamat_Posko: p[2], Kecamatan: p[3], Jenis_Posko: p[4], ID_Kabupaten: p[5], ID_Faskes_Pengelola: p[6], Status: p[7], Created_At: nowWita_(), Is_Deleted: '' }; }));
  }
}

function seedPasienBarang_(ss) {
  var sh = getSheet_(ss, 'MST_Pasien');
  if (sh.getLastRow() < 2) {
    var pasien = [
      ['PSN-0001', 'Maria Kaha', 'P', 34, 'Tahun', 'DEWASA', 'KAB-KOTA-KUPANG', 'Kelapa Dua', 'TRUE'],
      ['PSN-0002', 'Yohanis Bala', 'L', 41, 'Tahun', 'DEWASA', 'KAB-TTS', 'Noemuti', 'TRUE'],
      ['PSN-0003', 'Ani Foja', 'P', 6, 'Bulan', 'BAYI_0_5', 'KAB-KOTA-KUPANG', 'Oebobo', 'TRUE'],
      ['PSN-0004', 'Bernardus Nai', 'L', 72, 'Tahun', 'LANSIA', 'KAB-BELU', 'Raimanuk', 'TRUE']
    ];
    writeAllObjs_(sh, headersOf_(sh), pasien.map(function (p) { return { ID_Pasien: p[0], Nama: p[1], JK: p[2], Usia: p[3], Satuan_Usia: p[4], Kategori_Usia: p[5], ID_Kabupaten: p[6], Alamat: p[7], Aktif: p[8], Is_Deleted: '' }; }));
  }
  sh = getSheet_(ss, 'MST_Barang');
  if (sh.getLastRow() < 2) {
    var barang = [['BRG-0001', 'Beras', 'kg', 500], ['BRG-0002', 'Air Bersih (galon)', 'galon', 100], ['BRG-0003', 'Tenda Ukuran Besar', 'unit', 10], ['BRG-0004', 'Selimut', 'lembar', 200], ['BRG-0005', 'ORS', 'paket', 300], ['BRG-0006', 'Obat Penurun Panas', 'kotak', 50], ['BRG-0007', 'Hygiene Kit', 'paket', 150], ['BRG-0008', 'Mie Instan', 'dus', 80]];
    writeAllObjs_(sh, headersOf_(sh), barang.map(function (b) { return { ID_Barang: b[0], Nama_Barang: b[1], Satuan: b[2], Stok_Minimum: b[3], Aktif: 'TRUE', Is_Deleted: '' }; }));
  }
}

function seedKejadian_() {
  try {
    var ss = getSS_(CFG.KEY.SS_RHA);
    var sh = getSheet_(ss, 'sheetKejadian', RHA_HEADERS);
    if (sh.getLastRow() >= 2) return;
    var contoh = [
      ['KJD-2026-01-0001', '2026', '01', 'Banjir', 'Alam', '2026-01-14', '02:00 WITA', 'KAB-KOTA-KUPANG', 'Kota Kupang', 'Oebobo;Kelapa Dua', 'Hujan intensitas tinggi selama tiga hari menyebabkan Sungai Benain meluap dan menggenangi permukiman di sepanjang bantaran.', 0, 3, 27, 0, 26500, 26900, 1520, 0, 1, 1, 0, 0, 1, 0, 0, 0, 2, 1, 'Posko kesehatan beroperasi 2 unit; logistik air bersih tersedia 3 hari.', 'Penanganan kesehatan posko, distribusi ORS dan hygiene kit.', 'Rearmament logistik air bersih dan tenda.', 'Pemantauan penyakit kulit dan diare di posko pengungsi.', 'Disetujui', 'superadmin'],
      ['KJD-2026-02-0001', '2026', '02', 'Tanah Longsor', 'Alam', '2026-02-08', '04:30 WITA', 'KAB-TTS', 'Kabupaten Timor Tengah Selatan', 'Noemuti;Kot\'Olin', 'Hujan deras memicu longsor di lereng perbukitan Noemuti; akses jalan terputus.', 2, 5, 12, 1, 31200, 31400, 8700, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 'Tim sar dan puskesmas bergerak hari yang sama.', 'Evakuasi dan pengungsian 3.120 jiwa.', 'Alat berat untuk membuka akses jalan.', 'Pemetaan zona rawan longsor.', 'Disetujui', 'superadmin'],
      ['KJD-2026-03-0001', '2026', '03', 'Kebakaran', 'Non-Alam', '2026-03-19', '13:20 WITA', 'KAB-KOTA-KUPANG', 'Kota Kupang', 'Oebobo', 'Kebakaran pemukiman padat menghanguskan 120 rumah.', 0, 1, 4, 0, 480, 520, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Puskesmas Oebobo menangani korban luka ringan.', 'Layanan komprehensif lanjutan (LPLC) bagi korban.', 'Peralatan memadamkan api lebih banyak.', 'Sosialisasi mitigasi kebakaran perkotaan.', 'Disetujui', 'superadmin'],
      ['KJD-2025-12-0002', '2025', '12', 'Banjir Rob', 'Alam', '2025-12-05', '05:00 WITA', 'KAB-TTU', 'Kabupaten Timor Tengah Utara', 'Biboki', 'Pasang laut menggenangi pesisir Biboki selama 2 hari.', 0, 0, 0, 0, 48600, 48800, 3200, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 'Air bersih dari truk tangki Dinkes.', 'Distribusi air bersih harian.', 'Tangki air tambahan.', 'Pembangunan tanggul penahan rob.', 'Disetujui', 'superadmin'],
      ['KJD-2025-11-0001', '2025', '11', 'Gempa Bumi', 'Alam', '2025-11-21', '09:45 WITA', 'KAB-BELU', 'Kabupaten Belu', 'Raimanuk', 'Gempa M6,2 merusak fasilitas kesehatan dan hunian di Belu.', 1, 8, 23, 0, 34500, 34700, 5600, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 'RSUD Atambua menangani korban rawat inap.', 'Evakuasi medis, pengungsian tenda.', 'Tenda dan alat bedah lapangan.', 'Audit kelaikan bangunan faskes.', 'Disetujui', 'superadmin'],
      ['KJD-2025-09-0001', '2025', '09', 'Angin Kencang/Putri Badai', 'Alam', '2025-09-12', '15:00 WITA', 'KAB-ENDE', 'Kabupaten Ende', 'Ende Tengah', 'Angin kencang merusak atap puluhan rumah dan satu pustu.', 0, 0, 2, 0, 28700, 28900, 1900, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 'Pustu diperbaiki sementara dengan tenda.', 'Distribusi terpal dan perlengkapan atap.', 'Terpal dan kayu.', 'Penguatan konstruksi atap tahan angin.', 'Disetujui', 'superadmin'],
      ['KJD-2025-08-0001', '2025', '08', 'Kekeringan', 'Alam', '2025-08-02', '00:00 WITA', 'KAB-MALAKA', 'Kabupaten Malaka', 'Wewiku', 'Kekeringan panjang; sumber air warga mengering.', 0, 0, 0, 0, 25080, 25200, 4100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Truk tangki air BPBD berkeliling 8 titik.', 'Rao, distribusi air bersih.', 'Tangki air dan pompa.', 'Sumur bor di 4 desa.', 'Disetujui', 'superadmin'],
      ['KJD-2025-04-0001', '2025', '04', 'Wabah Penyakit/KLB', 'Non-Alam', '2025-04-17', '00:00 WITA', 'KAB-SIKKA', 'Kabupaten Sikka', 'Alok', 'KLB diare akut di kecamatan Alok setelah banjir.', 2, 0, 0, 0, 120, 320, 90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'ORS, antibiotik, dan cairan infus tersedia.', 'Deteksi dini dan penanganan kasus.', 'Stok ORS tambahan.', 'Surveilans harian dan edr sanitasi.', 'Disetujui', 'superadmin'],
      ['KJD-2024-07-0001', '2024', '07', 'Tanah Longsor', 'Alam', '2024-07-23', '03:10 WITA', 'KAB-ALOR', 'Kabupaten Alor', 'Mataru', 'Longsor di jalur lintas Alor menyebabkan akses terputus.', 3, 2, 6, 1, 1650, 1700, 410, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Tim kesehatan keliling ke pengungsian.', 'Evakuasi dan layanan kesehatan pengungsian.', 'Alat berat dan logistik.', 'Reboisasi lereng rawan.', 'Disetujui', 'superadmin'],
      ['KJD-2024-03-0001', '2024', '03', 'Banjir', 'Alam', '2024-03-09', '01:00 WITA', 'KAB-KUPANG', 'Kabupaten Kupang', 'Taebenu', 'Banjir bandang di kabupaten Kupang akibat curah hujan ekstrem.', 1, 4, 18, 0, 4200, 4600, 1240, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 'Posko kesehatan di 3 titik pengungsian.', 'Layanan kesehatan posko dan pemantauan gizi.', 'PMT untuk balita.', 'Normalisasi sungai dan edr sanitasi.', 'Disetujui', 'superadmin'],
      ['KJD-2023-06-0001', '2023', '06', 'Banjir', 'Alam', '2023-06-15', '02:30 WITA', 'KAB-LEMBATA', 'Kabupaten Lembata', 'Ile Ape', 'Banjir dan tanah longsor di Lembata menyusul badai tropis.', 0, 2, 9, 0, 2300, 2500, 620, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Posko kesehatan berjalan 2 minggu.', 'Layanan kesehatan dasar di pengungsian.', 'Obat dan logistik dasar.', 'Sistem peringatan dini bencana.', 'Disetujui', 'superadmin'],
      ['KJD-2026-06-0001', '2026', '06', 'Kebakaran', 'Non-Alam', '2026-06-01', '11:00 WITA', 'KAB-KOTA-KUPANG', 'Kota Kupang', 'Kelapa Dua', 'Kebakaran pasar mempengaruhi pedagang di kawasan Kelapa Dua.', 0, 0, 0, 0, 96, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Layanan kesehatan darurat di lokasi.', 'Skering kesehatan korban.', 'Tenda darurat.', 'Pemantauan penyakit menular.', 'Menunggu', ''],
      ['KJD-2026-06-0002', '2026', '06', 'Banjir Rob', 'Alam', '2026-06-10', '06:00 WITA', 'KAB-ROTE-NDAO', 'Kabupaten Rote Ndao', 'Rote Tengah', 'Rob menggenangi pesisir Rote Tengah pagi ini.', 0, 0, 0, 0, 340, 400, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Pemantauan dilakukan posko kesehatan.', 'Awal penanganan.', 'Menunggu verifikasi lapangan.', 'Menunggu rekomendasi.', 'Menunggu', ''],
      ['KJD-2023-02-0001', '2023', '02', 'Gempa Bumi', 'Alam', '2023-02-27', '07:30 WITA', 'KAB-SUMBA-TIMUR', 'Kabupaten Sumba Timur', 'Kahaungu Eti', 'Gempa merusak fasilitas kesehatan di Sumba Timur.', 0, 0, 3, 0, 890, 1100, 340, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'Layanan kesehatan darurat 1 minggu.', 'Penanganan korban dan pengungsian.', 'Tenda dan obat.', 'Penguatan bangunan faskes.', 'Ditolak', 'superadmin']
    ];
    var rows = contoh.map(function (c, i) {
      var o = {};
      o.ID_Kejadian = c[0]; o.Tahun = c[1]; o.Bulan = c[2]; o.Jenis_Bencana = c[3]; o.Kategori_Bencana = c[4];
      o.Tgl_Kejadian = c[5]; o.Waktu_Kejadian = c[6]; o.Tanggal_Input = c[5] + ' 09:00:00'; o.Diubah_Pada = nowWita_();
      o.ID_Kabupaten = c[7]; o.Kabupaten_Kota = c[8]; o.Tipe_Wilayah = c[8].indexOf('Kota') === 0 ? 'Kota' : 'Kabupaten'; o.ID_Kecamatan = ''; o.Kecamatan = c[9];
      o.Penyebab_Kronologis = c[10];
      o.Meninggal = c[11]; o.LB_RI = c[12]; o.LR_RJ = c[13]; o.Hilang = c[14]; o.Pengungsi = c[15]; o.Penduduk_Terdampak_Jiwa = c[16]; o.Penduduk_Terdampak_KK = c[17];
      o.RS_Rusak_Berat = c[18]; o.RS_Rusak_Sedang = c[19]; o.RS_Rusak_Ringan = c[20];
      o.Puskesmas_Rusak_Berat = c[21]; o.Puskesmas_Rusak_Sedang = c[22]; o.Puskesmas_Rusak_Ringan = c[23];
      o.Pustu_Rusak_Berat = c[24]; o.Pustu_Rusak_Sedang = c[25]; o.Pustu_Rusak_Ringan = c[26];
      o.Ketersediaan_Sumber_Daya = c[27]; o.Upaya_Penanggulangan = c[28]; o.Bantuan_Diperlukan_Segera = c[29]; o.Rekomendasi = c[30];
      o.ID_Folder_Drive = ''; o.URL_Laporan_PDF = ''; o.URL_Foto = ''; o.URL_Berita = '';
      o.Status_Verifikasi = c[31]; o.Diverifikasi_Oleh = c[32]; o.Tanggal_Verifikasi = c[31] === 'Disetujui' || c[31] === 'Ditolak' ? c[5] + ' 10:00:00' : ''; o.Catatan_Verifikasi = c[31] === 'Ditolak' ? 'Angka pengungsi perlu penyesuaian dengan data lapangan; mohon perbaiki.' : ''; o.Tampil_Publik = c[31] === 'Disetujui' ? 'TRUE' : 'FALSE';
      o.Sumber_Input = 'Migrasi'; o.Nama_Pelapor = ''; o.Kontak_Pelapor = ''; o.Input_By = 'SETUP'; o.Level_User = 'SUPER_ADMIN'; o.Versi = 1;
      return o;
    });
    writeAllObjs_(sh, RHA_HEADERS, rows);
    rhaLog_('SEED', 'DATA-CONTOH', 'setup', rows.length + ' laporan contoh dibuat');
  } catch (e) { logError_('seedKejadian_', e); }
}

function seedTrxCoba_(ss) {
  function seedIfEmpty(sheetName, headers, mapper) {
    var sh = getSheet_(ss, sheetName, headers);
    if (sh.getLastRow() >= 2) return;
    var rows = mapper().map(function (o) {
      o.Status_Data = o.Status_Data || STATUS_DATA.TERVALIDASI; o.Created_At = o.Created_At || nowWita_(); o.Created_By = o.Created_By || 'setup';
      o.Updated_At = o.Updated_At || nowWita_(); o.Updated_By = o.Updated_By || 'setup'; o.Version = 1; o.Is_Deleted = ''; o.Legacy_ID = ''; o.Migration_Batch = '';
      return o;
    });
    writeAllObjs_(sh, headers, rows);
  }
  seedIfEmpty('TRX_Pengungsi', Repo.headers(Repo.cfg('M01')), function () {
    return [
      { ID_Record: 'PGS-2601-0001', Tanggal: '2026-01-15', ID_Kejadian: 'KJD-2026-01-0001', ID_Posko: 'PSK-KOTA-KUPANG-01', ID_Kabupaten: 'KAB-KOTA-KUPANG', ID_Faskes: 'FKS-KOTA-KUPANG-01', Jml_KK: 5100, Jml_Jiwa: 26500, Jml_L: 12200, Jml_P: 14300, Jml_Bayi: 1200, Jml_Balita: 2400, Jml_Anak: 9800, Jml_Lansia: 2100, Jml_Ibu_Hamil: 890, Keterangan: 'Snapshot posko Oebobo' },
      { ID_Record: 'PGS-2601-0002', Tanggal: '2026-01-15', ID_Kejadian: 'KJD-2026-01-0001', ID_Posko: 'PSK-KUPANG-01', ID_Kabupaten: 'KAB-KUPANG', ID_Faskes: 'FKS-KUPANG-01', Jml_KK: 6400, Jml_Jiwa: 31200, Jml_L: 14900, Jml_P: 16300, Keterangan: 'Snapshot Semau' },
      { ID_Record: 'PGS-2602-0001', Tanggal: '2026-02-09', ID_Kejadian: 'KJD-2026-02-0001', ID_Posko: 'PSK-TTS-01', ID_Kabupaten: 'KAB-TTS', ID_Faskes: 'FKS-TTS-01', Jml_KK: 9100, Jml_Jiwa: 48600, Jml_L: 23100, Jml_P: 25500, Keterangan: 'Snapshot Soe' },
      { ID_Record: 'PGS-2511-0001', Tanggal: '2025-11-22', ID_Kejadian: 'KJD-2025-11-0001', ID_Posko: 'PSK-BELU-01', ID_Kabupaten: 'KAB-BELU', ID_Faskes: 'FKS-BELU-01', Jml_KK: 7200, Jml_Jiwa: 34500, Jml_L: 16800, Jml_P: 17700, Keterangan: 'Snapshot Atambua' },
      { ID_Record: 'PGS-2512-0001', Tanggal: '2025-12-06', ID_Kejadian: 'KJD-2025-12-0002', ID_Posko: 'PSK-TTU-01', ID_Kabupaten: 'KAB-TTU', ID_Faskes: 'FKS-TTU-01', Jml_KK: 5900, Jml_Jiwa: 28700, Jml_L: 13900, Jml_P: 14800, Keterangan: 'Snapshot Kefamenanu' },
      { ID_Record: 'PGS-2508-0001', Tanggal: '2025-08-03', ID_Kejadian: 'KJD-2025-08-0001', ID_Posko: 'PSK-MALAKA-01', ID_Kabupaten: 'KAB-MALAKA', ID_Faskes: 'FKS-BELU-01', Jml_KK: 5100, Jml_Jiwa: 25080, Jml_L: 12100, Jml_P: 12980, Keterangan: 'Snapshot Betun' }
    ];
  });
  seedIfEmpty('TRX_Korban', Repo.headers(Repo.cfg('M25')), function () {
    return [
      { ID_Record: 'KRB-2601-0001', ID_Pasien: 'PSN-0001', ID_Kejadian: 'KJD-2026-01-0001', Tgl_Kejadian_Awal: '2026-01-14', Status_Awal: 'Luka Ringan', Lokasi_Kejadian: 'Kelapa Dua', Diagnosa: 'Luka lecet', Kewarganegaraan: 'WNI', ID_Kabupaten: 'KAB-KOTA-KUPANG', ID_Faskes: 'FKS-KOTA-KUPANG-01' },
      { ID_Record: 'KRB-2602-0001', ID_Pasien: 'PSN-0002', ID_Kejadian: 'KJD-2026-02-0001', Tgl_Kejadian_Awal: '2026-02-08', Status_Awal: 'Luka Berat', Lokasi_Kejadian: 'Noemuti', Diagnosa: 'Fraktur tertutup', Kewarganegaraan: 'WNI', ID_Kabupaten: 'KAB-TTS', ID_Faskes: 'FKS-TTS-01' }
    ];
  });
  seedIfEmpty('TRX_Korban_Perkembangan', Repo.headers(Repo.cfg('M26')), function () {
    return [{ ID_Record: 'KRP-2602-0001', ID_Korban: 'KRB-2602-0001', Tanggal: '2026-02-10', Status_Lanjutan: 'Rawat Inap', ID_Faskes_Perawatan: 'FKS-TTS-01', ID_Faskes_Tujuan_Rujuk: '', Tgl_Meninggal: '', Catatan: 'Dirawat di RSUD Soe', ID_Kabupaten: 'KAB-TTS', ID_Faskes: 'FKS-TTS-01' }];
  });
  seedIfEmpty('TRX_Faskes_Kondisi', Repo.headers(Repo.cfg('M02')), function () {
    return [
      { ID_Record: 'FKD-2511-0001', Tanggal: '2025-11-21', ID_Kejadian: 'KJD-2025-11-0001', ID_Faskes: 'FKS-BELU-01', ID_Kabupaten: 'KAB-BELU', Kondisi_Faskes: 'Rusak Berat', Kapasitas_Layanan: 40, Keterangan: 'Gempa M6,2' },
      { ID_Record: 'FKD-2512-0001', Tanggal: '2025-12-05', ID_Kejadian: 'KJD-2025-12-0002', ID_Faskes: 'FKS-TTU-01', ID_Kabupaten: 'KAB-TTU', Kondisi_Faskes: 'Rusak Ringan', Kapasitas_Layanan: 85, Keterangan: 'Genangan rob di gudang' },
      { ID_Record: 'FKD-2601-0001', Tanggal: '2026-01-14', ID_Kejadian: 'KJD-2026-01-0001', ID_Faskes: 'FKS-KOTA-KUPANG-01', ID_Kabupaten: 'KAB-KOTA-KUPANG', Kondisi_Faskes: 'Baik', Kapasitas_Layanan: 90, Keterangan: '' },
      { ID_Record: 'FKD-2511-0002', Tanggal: '2025-11-21', ID_Kejadian: 'KJD-2025-11-0001', ID_Faskes: 'FKS-TTS-01', ID_Kabupaten: 'KAB-TTS', Kondisi_Faskes: 'Rusak Sedang', Kapasitas_Layanan: 60, Keterangan: 'Retak dinding' },
      { ID_Record: 'FKD-2602-0001', Tanggal: '2026-02-08', ID_Kejadian: 'KJD-2026-02-0001', ID_Faskes: 'FKS-TTS-01', ID_Kabupaten: 'KAB-TTS', Kondisi_Faskes: 'Direvasi', Kapasitas_Layanan: 75, Keterangan: 'Perbaikan berjalan' }
    ];
  });
  seedIfEmpty('TRX_SDM_Kesehatan', Repo.headers(Repo.cfg('M04')), function () {
    return [
      { ID_Record: 'SDM-2601-0001', Tanggal: '2026-01-15', ID_Faskes: 'FKS-KOTA-KUPANG-01', ID_Kabupaten: 'KAB-KOTA-KUPANG', Jml_Dokter: 4, Jml_Bidan: 9, Jml_Perawat: 18, Jml_Nakes_Lain: 7, Jml_Tenaga_Sukarela: 25, Keterangan: 'Posko Oebobo' },
      { ID_Record: 'SDM-2511-0001', Tanggal: '2025-11-22', ID_Faskes: 'FKS-BELU-01', ID_Kabupaten: 'KAB-BELU', Jml_Dokter: 11, Jml_Bidan: 15, Jml_Perawat: 32, Jml_Nakes_Lain: 10, Jml_Tenaga_Sukarela: 40, Keterangan: 'RSUD Atambua' }
    ];
  });
  seedIfEmpty('TRX_Surveilans', Repo.headers(Repo.cfg('M21')), function () {
    return [
      { ID_Record: 'SVL-2601-0001', Tanggal: '2026-01-18', ID_Faskes: 'FKS-KOTA-KUPANG-01', ID_Kabupaten: 'KAB-KOTA-KUPANG', ID_Penyakit: 'PYK-0001', Jml_Kasus_Baru: 86, Jml_Meninggal: 0, Keterangan: 'Posko pengungsi banjir' },
      { ID_Record: 'SVL-2601-0002', Tanggal: '2026-01-18', ID_Faskes: 'FKS-KOTA-KUPANG-01', ID_Kabupaten: 'KAB-KOTA-KUPANG', ID_Penyakit: 'PYK-0009', Jml_Kasus_Baru: 34, Jml_Meninggal: 0, Keterangan: 'Klaster diare' },
      { ID_Record: 'SVL-2504-0001', Tanggal: '2025-04-18', ID_Faskes: 'FKS-ENDE-01', ID_Kabupaten: 'KAB-ENDE', ID_Penyakit: 'PYK-0009', Jml_Kasus_Baru: 120, Jml_Meninggal: 2, Keterangan: 'KLB Sikka dilayani lintas kabupaten' }
    ];
  });
  seedIfEmpty('TRX_Gizi', Repo.headers(Repo.cfg('M11')), function () {
    return [{ ID_Record: 'GZI-2601-0001', Tanggal: '2026-01-16', ID_Faskes: 'FKS-KOTA-KUPANG-01', ID_Kabupaten: 'KAB-KOTA-KUPANG', ID_Pasien: 'PSN-0003', Jml_Skrining: 340, Jml_Gizi_Buruk: 6, Jml_PMT: 280, Keterangan: 'Skrining balita posko Oebobo' }];
  });
  seedIfEmpty('TRX_Permintaan', Repo.headers(Repo.cfg('M14')), function () {
    return [{ ID_Record: 'PMT-2601-0001', Tanggal: '2026-01-16', No_Permintaan: 'PRQ-2601-0001', ID_Entitas_Pemohon: 'FKS-KOTA-KUPANG-01', ID_Kabupaten: 'KAB-KOTA-KUPANG', ID_Faskes: 'FKS-KOTA-KUPANG-01', Prioritas: 'Tinggi', Keterangan: 'Permintaan darurat banjir Kota Kupang' }];
  });
  seedIfEmpty('TRX_Permintaan_Rinci', Repo.headers(Repo.cfg('M15')), function () {
    return [
      { ID_Record: 'PMR-2601-0001', ID_Permintaan: 'PMT-2601-0001', ID_Barang: 'BRG-0005', ID_Kabupaten: 'KAB-KOTA-KUPANG', ID_Faskes: 'FKS-KOTA-KUPANG-01', Jml_Permintaan: 400, Jml_Tersedia: 300, Alasan: '' },
      { ID_Record: 'PMR-2601-0002', ID_Permintaan: 'PMT-2601-0001', ID_Barang: 'BRG-0007', ID_Kabupaten: 'KAB-KOTA-KUPANG', ID_Faskes: 'FKS-KOTA-KUPANG-01', Jml_Permintaan: 300, Jml_Tersedia: 150, Alasan: '' }
    ];
  });
  seedIfEmpty('TRX_Penerimaan', Repo.headers(Repo.cfg('M18')), function () {
    return [{ ID_Record: 'PNR-2601-0001', Tanggal: '2026-01-17', No_Penerimaan: 'RCV-2601-0001', Sumber: 'Donasi', ID_Entitas_Penerima: 'FKS-GDK-01', ID_Kabupaten: 'KAB-KUPANG', ID_Faskes: 'FKS-GDK-01', Keterangan: 'Donasi PMI NTT' }];
  });
  seedIfEmpty('TRX_Penerimaan_Rinci', Repo.headers(Repo.cfg('M19')), function () {
    return [{ ID_Record: 'PRR-2601-0001', ID_Penerimaan: 'PNR-2601-0001', ID_Barang: 'BRG-0001', ID_Kabupaten: 'KAB-KUPANG', ID_Faskes: 'FKS-GDK-01', Jml_Masuk: 5000, Selisih: 0, Penanganan: '' }];
  });
  seedIfEmpty('TRX_Kartu_Stok', Repo.headers(Repo.cfg('M20')), function () {
    return [
      { ID_Record: 'STK-2601-0001', Tanggal: '2026-01-17', ID_Faskes: 'FKS-GDK-01', ID_Kabupaten: 'KAB-KUPANG', ID_Barang: 'BRG-0001', Riwayat: 'Masuk', Jml: 5000, Sisa: 5000, Referensi: 'PNR-2601-0001', Keterangan: 'Donasi PMI NTT' },
      { ID_Record: 'STK-2601-0002', Tanggal: '2026-01-18', ID_Faskes: 'FKS-GDK-01', ID_Kabupaten: 'KAB-KUPANG', ID_Barang: 'BRG-0001', Riwayat: 'Keluar', Jml: 1500, Sisa: 3500, Referensi: 'Distribusi ke Kota Kupang', Keterangan: '' }
    ];
  });
  seedIfEmpty('TRX_DVI', Repo.headers(Repo.cfg('M13')), function () {
    return [{ ID_Record: 'DVI-2602-0001', Tanggal: '2026-02-09', ID_Kejadian: 'KJD-2026-02-0001', ID_Kabupaten: 'KAB-TTS', Jml_Jenazah_Utuh: 2, Jml_Bagian_Tubuh: 0, Jml_Teridentifikasi: 2, Jml_Belum_Teridentifikasi: 0, Keterangan: 'Identifikasi DVI selesai' }];
  });
  seedIfEmpty('TRX_Relawan', Repo.headers(Repo.cfg('M24')), function () {
    return [
      { ID_Tim: 'RLW-0001', Sumber_Modul: 'MANUAL', Nama_Tim: 'Relawan PMI Kupang', Jenis_Relawan: 'Lainnya', Tgl_Kedatangan: '2026-01-15', ID_Kabupaten: 'KAB-KOTA-KUPANG', Kabupaten: 'Kota Kupang', Lokasi_Penempatan: '', Keterangan: 'Sementara Bertugas', Tgl_Kepulangan: '', Lama_Tugas: '', Dugaan_Duplikat_Dengan: '', Status_Sinkron_Relawan: '', Sinkron_Relawan_Pada: '', Status_Data: STATUS_DATA.TERVALIDASI, Created_At: nowWita_(), Is_Deleted: '' }
    ];
  });
  seedIfEmpty('TRX_Rekap_Harian', Repo.headers(Repo.cfg('M22')), function () {
    return [{ ID_Record: 'F1H-2601-0001', Tanggal: '2026-01-18', Indikator: 'Pengungsi', ID_Kabupaten: 'KAB-KOTA-KUPANG', Jml_Hari_Ini: 26500, Jml_Kemarin: 25800, Jml_Kumulatif: 26500, Angka_Resmi: 26500, Catatan_Penyimpangan: '' }];
  });
  seedIfEmpty('TRX_Laporan_Situasi', Repo.headers(Repo.cfg('M23')), function () {
    return [{ ID_Record: 'F2S-2601-0001', Tanggal: '2026-01-18', ID_Kejadian: 'KJD-2026-01-0001', ID_Kabupaten: 'KAB-KOTA-KUPANG', Ringkasan: 'Situasi banjir Kota Kupang terkendali; 26.500 pengungsi di 4 posko; layanan kesehatan berjalan.', Faskes_Rusak_Berat: 0, URL_Dokumen: '' }];
  });
}

function seedTim_() {
  try {
      var shTdm = modSheets_('TDM');
    if (shTdm.tim.getLastRow() < 2) {
      appendObj_(shTdm.tim, headersOf_(shTdm.tim), { Kode_Tim: 'TDM-2026-0001', Nama_Tim: 'TCK-EMT Kota Kupang', Tipe_Tim: 'TCK-EMT', Jenis_Penugasan: 'Layanan Medis Darurat', ID_Kabupaten: 'KAB-KOTA-KUPANG', Kabupaten: 'Kota Kupang', PIN_Hash: '', PIN_Salt: '', Status_Tim: 'Bertugas', Total_Personel: 14, Nama_Focal_Point: 'dr. Stefanus Bali', Kontak_Focal_Point: '', Email: '', Created_At: nowWita_(), Is_Deleted: '' });
      var rec = { ID_Record: 'TDMKD-2601-0001', ID_Tim: 'TDM-2026-0001', Kode_Tim: 'TDM-2026-0001', Nama_Tim: 'TCK-EMT Kota Kupang', Tipe_Tim: 'TCK-EMT', Jenis_Penugasan: 'Layanan Medis Darurat', ID_Kejadian: 'KJD-2026-01-0001', Status_Tautan_Kejadian: 'TERTAUT', Nama_Kejadian: 'Banjir', Jenis_Bencana: 'Banjir', Tanggal_Kejadian: '2026-01-14', ID_Kabupaten_Kejadian: 'KAB-KOTA-KUPANG', Kabupaten_Kejadian: 'Kota Kupang', Nama_Bencana_Teks: '', Tgl_Kedatangan: '2026-01-15', ID_Kabupaten: 'KAB-KOTA-KUPANG', Kabupaten: 'Kota Kupang', Kecamatan: 'Oebobo', Total_Personel: 14, Nama_Focal_Point: 'dr. Stefanus Bali', Kontak_Focal_Point: '', Status_Data: 'VERIFIED', Catatan_Verifikasi: '', Created_At: nowWita_(), Is_Deleted: '', Status_Sinkron_Relawan: 'OK', Sinkron_Relawan_Pada: nowWita_() };
      appendObj_(shTdm.kedatangan, KD_HEADERS, rec);
      appendObj_(shTdm.harian, headersOf_(shTdm.harian), { ID_Record: 'TDMHR-2601-0001', ID_Tim: 'TDM-2026-0001', Kode_Tim: 'TDM-2026-0001', Tanggal: '2026-01-16', Jml_Pasien_Dirawat: 128, Jml_Rujukan: 3, Jml_Persediaan_Tersisa: 60, Kendala: '', Keterangan: '', Status_Data: 'VERIFIED', Created_At: nowWita_(), Is_Deleted: '' });
    }
    var shTdp = modSheets_('TDP');
    if (shTdp.tim.getLastRow() < 2) {
      appendObj_(shTdp.tim, headersOf_(shTdp.tim), { Kode_Tim: 'TDP-2026-0001', Nama_Tim: 'Tim Psikososial Belu', Tipe_Tim: 'Psikososial', Jenis_Penugasan: 'Dukungan Psikososial', ID_Kabupaten: 'KAB-BELU', Kabupaten: 'Kabupaten Belu', PIN_Hash: '', PIN_Salt: '', Status_Tim: 'Bertugas', Total_Personel: 8, Nama_Focal_Point: 'psikolog Yuliana', Kontak_Focal_Point: '', Email: '', Created_At: nowWita_(), Is_Deleted: '' });
      appendObj_(shTdp.kedatangan, KD_HEADERS, { ID_Record: 'TDPKD-2511-0001', ID_Tim: 'TDP-2026-0001', Kode_Tim: 'TDP-2026-0001', Nama_Tim: 'Tim Psikososial Belu', Tipe_Tim: 'Psikososial', Jenis_Penugasan: 'Dukungan Psikososial', ID_Kejadian: 'KJD-2025-11-0001', Status_Tautan_Kejadian: 'TERTAUT', Nama_Kejadian: 'Gempa Bumi', Jenis_Bencana: 'Gempa Bumi', Tanggal_Kejadian: '2025-11-21', ID_Kabupaten_Kejadian: 'KAB-BELU', Kabupaten_Kejadian: 'Kabupaten Belu', Nama_Bencana_Teks: '', Tgl_Kedatangan: '2025-11-23', ID_Kabupaten: 'KAB-BELU', Kabupaten: 'Kabupaten Belu', Kecamatan: 'Raimanuk', Total_Personel: 8, Nama_Focal_Point: 'psikolog Yuliana', Kontak_Focal_Point: '', Status_Data: 'VERIFIED', Catatan_Verifikasi: '', Created_At: nowWita_(), Is_Deleted: '', Status_Sinkron_Relawan: 'OK', Sinkron_Relawan_Pada: nowWita_() });
    }
    invalidasiCache_(CFG.CACHE_PREFIX.REL);
  } catch (e) { logError_('seedTim_', e); }
}

// Migrasi ICD-10 (Lampiran J) bila perlu mengisi ulang MST_Penyakit secara manual
function seedPenyakitUlang() {
  var sh = getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'MST_Penyakit', ['ID_Penyakit', 'Nama_Penyakit', 'Kode_ICD10', 'Kelompok', 'Wajib_Lapor', 'Sinonim', 'Status_Verifikasi', 'Is_Deleted']);
  if (sh.getLastRow() >= 2) return 'MST_Penyakit sudah berisi data; tidak ditimpa.';
  writeAllObjs_(sh, headersOf_(sh), PENYAKIT_SEED.map(function (p) { return { ID_Penyakit: p[0], Nama_Penyakit: p[1], Kode_ICD10: p[2], Kelompok: p[3], Wajib_Lapor: p[4], Sinonim: p[5], Status_Verifikasi: 'Usulan', Is_Deleted: '' }; }));
  return 'Seed penyakit ICD-10 dimuat.';
}

function ujiDate() {
  var rows = readAll_(rhaSheet_());
  Logger.log(rows.length + ' baris; tipe Tanggal_Input: ' +
    (rows.length ? Object.prototype.toString.call(rows[0].Tanggal_Input) : '-'));
}