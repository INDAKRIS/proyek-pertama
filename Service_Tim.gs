/**
 * Service_Tim.gs — Menu publik Tim Darurat Medis (Berkas C) & Tim Dukungan Psikososial (Berkas D).
 * Satu modul generik untuk TDM/TDP: Tim, Kedatangan (Form 1), Harian (Form 2), Kepulangan (Form 3),
 * tautan kejadian RHA (snapshot server), verifikasi focal point (Kode_Tim + PIN), sinkron Menu Relawan.
 */

// Ambil prefiks cache dari CFG.CACHE_PREFIX (didefinisikan di Config.gs: TDM, TDP, REL, PUB, dst.).
// Bila belum ada, pakai nilai bawaan yang sama dengan Config.gs agar tidak terjadi error "undefined".
function cfgCache_(nama) {
  var bawaan = { TDM: 'tdm_', TDP: 'tdp_', REL: 'rel_', PUB: 'pub_', TIM: 'tim_' };
  var v = (typeof CFG !== 'undefined' && CFG && CFG.CACHE_PREFIX) ? CFG.CACHE_PREFIX[nama] : null;
  return v || bawaan[nama] || (String(nama).toLowerCase() + '_');
}

function modCfg_(mod) {
  if (mod === 'TDM') return { ssKey: CFG.KEY.SS_TDM, pre: 'TDM_', cache: cfgCache_('TDM'), jenisRelawan: 'TCK-EMT', lencana: 'Otomatis - Tim Darurat Medis', folder: CFG.KEY.FOLDER_TDM, folderName: CFG.NAME.FOLDER_TDM, ssName: CFG.NAME.SS_TDM };
  if (mod === 'TDP') return { ssKey: CFG.KEY.SS_TDP, pre: 'TDP_', cache: cfgCache_('TDP'), jenisRelawan: 'Tim Dukungan Psikososial', lencana: 'Otomatis - Tim Dukungan Psikososial', folder: CFG.KEY.FOLDER_TDP, folderName: CFG.NAME.FOLDER_TDP, ssName: CFG.NAME.SS_TDP };
  aksesDitolak_('Modul tim tidak dikenal.');
}

var KD_HEADERS = ['ID_Record', 'ID_Tim', 'Kode_Tim', 'Nama_Tim', 'Tipe_Tim', 'Jenis_Penugasan',
  'ID_Kejadian', 'Status_Tautan_Kejadian', 'Nama_Kejadian', 'Jenis_Bencana', 'Tanggal_Kejadian', 'ID_Kabupaten_Kejadian', 'Kabupaten_Kejadian', 'Nama_Bencana_Teks',
  'Tgl_Kedatangan', 'ID_Kabupaten', 'Kabupaten', 'Kecamatan', 'Total_Personel', 'Nama_Focal_Point', 'Kontak_Focal_Point',
  'Status_Data', 'Catatan_Verifikasi', 'Created_At', 'Is_Deleted', 'Status_Sinkron_Relawan', 'Sinkron_Relawan_Pada'];

function modSheets_(mod) {
  var c = modCfg_(mod), ss = getSS_(c.ssKey);
  return {
    ss: ss,
    tim: getSheet_(ss, c.pre + 'Tim', ['Kode_Tim', 'Nama_Tim', 'Tipe_Tim', 'Jenis_Penugasan', 'ID_Kabupaten', 'Kabupaten', 'PIN_Hash', 'PIN_Salt', 'Status_Tim', 'Total_Personel', 'Nama_Focal_Point', 'Kontak_Focal_Point', 'Email', 'Created_At', 'Is_Deleted']),
    kedatangan: getSheet_(ss, c.pre + 'Kedatangan', KD_HEADERS),
    harian: getSheet_(ss, c.pre + 'Harian', ['ID_Record', 'ID_Tim', 'Kode_Tim', 'Tanggal', 'Jml_Pasien_Dirawat', 'Jml_Rujukan', 'Jml_Persediaan_Tersisa', 'Kendala', 'Keterangan', 'Status_Data', 'Created_At', 'Is_Deleted']),
    kepulangan: getSheet_(ss, c.pre + 'Kepulangan', ['ID_Record', 'ID_Tim', 'Kode_Tim', 'Tgl_Kepulangan', 'Lama_Tugas', 'Alasan_Pulang', 'Keterangan', 'Status_Data', 'Created_At', 'Is_Deleted', 'Status_Sinkron_Relawan']),
    kdDetail: getSheet_(ss, c.pre + 'KedatanganDetail', ['ID_Record', 'Kode_Tim', 'Data_JSON', 'Created_At']),
    hrDetail: getSheet_(ss, c.pre + 'HarianDetail', ['ID_Record', 'Kode_Tim', 'Data_JSON', 'Created_At']),
    kpDetail: getSheet_(ss, c.pre + 'KepulanganDetail', ['ID_Record', 'Kode_Tim', 'Data_JSON', 'Created_At'])
  };
}
// Isian lengkap formulir (Lampiran 1) disimpan sebagai JSON di sheet *_KedatanganDetail / *_HarianDetail
function cekDetail_(json) {
  if (!json) return;
  var s = String(json);
  if (s.length > 45000) validasi_('Isian formulir terlalu panjang. Ringkas isian teks bebas.');
  try { JSON.parse(s); } catch (e) { validasi_('Format isian formulir tidak valid.'); }
}
function simpanDetail_(sheet, idRec, kodeTim, json) {
  if (!json) return;
  appendObj_(sheet, headersOf_(sheet), { ID_Record: idRec, Kode_Tim: kodeTim, Data_JSON: String(json), Created_At: nowWita_() });
}
function invalidateTim_(mod) { invalidasiCache_(modCfg_(mod).cache); invalidasiCache_(cfgCache_('PUB')); }

// Baris kedatangan dianggap valid hanya bila punya ID_Record, Kode_Tim, dan Nama_Tim (mengabaikan baris kosong/hantu di sheet)
function barisKedatanganValid_(r) {
  return !r.Is_Deleted &&
    String(r.ID_Record || '').trim() !== '' &&
    String(r.Kode_Tim || '').trim() !== '' &&
    String(r.Nama_Tim || '').trim() !== '';
}

// ---------- Daftar publik ----------
function getTimPublik(mod, filter) {
  try {
    var c = modCfg_(mod);
    filter = filter || {};
    var key = c.cache + 'publik2::' + JSON.stringify(filter);
    var hit = cacheGet_(key);
    if (hit) return ok_(hit);
    var sh = modSheets_(mod);
    var ked = readAll_(sh.kedatangan).filter(barisKedatanganValid_);
    if (filter.idKabupaten) ked = ked.filter(function (r) { return r.ID_Kabupaten === filter.idKabupaten; });
    if (filter.search) { var q = String(filter.search).toLowerCase(); ked = ked.filter(function (r) { return ((r.Nama_Tim || '') + ' ' + (r.Kabupaten || '') + ' ' + (r.Nama_Kejadian || '')).toLowerCase().indexOf(q) >= 0; }); }
    ked.sort(function (a, b) { return String(b.Created_At).localeCompare(String(a.Created_At)); });
    var timMap = {};
    readAll_(sh.tim).forEach(function (r) { timMap[r.Kode_Tim] = r.Status_Tim; });
    var data = ked.map(function (r) {
      return {
        id: r.ID_Record, kodeTim: r.Kode_Tim, namaTim: r.Nama_Tim, tipe: r.Tipe_Tim || '', penugasan: r.Jenis_Penugasan || '',
        kejadian: r.Status_Tautan_Kejadian === 'TERTAUT' ? (r.Nama_Kejadian + ' — ' + fmtDate_(r.Tanggal_Kejadian)) : (r.Nama_Bencana_Teks || ''),
        tautan: r.Status_Tautan_Kejadian, tglKedatangan: fmtDate_(r.Tgl_Kedatangan), kabupaten: r.Kabupaten, kecamatan: r.Kecamatan || '',
        personel: toInt_(r.Total_Personel) || 0, status: timMap[r.Kode_Tim] || 'Bertugas', statusData: r.Status_Data
      };
    });
    cachePut_(key, data, 300);
    return ok_(data);
  } catch (e) { return galatUmum_(e, 'getTimPublik'); }
}

// ---------- Form 1: Kedatangan (publik, tanpa login) ----------
function submitTimKedatangan(mod, payload) {
  try {
    payload = payload || {};
    if (payload.honeypot) return err_('Pengiriman ditolak.', 'AKSES');
    cekDetail_(payload.detail);
    var c = modCfg_(mod);
    var namaTim = sanitizeText_(payload.namaTim, 150);
    if (!namaTim) return err_('Nama tim wajib diisi.', 'VALIDASI');
    var tgl = parseDateSafe_(payload.tglKedatangan);
    if (!tgl) return err_('Tanggal kedatangan wajib diisi.', 'VALIDASI');
    if (tgl > new Date()) return err_('Tanggal kedatangan tidak boleh melewati hari ini.', 'VALIDASI');
    var personel = toInt_(payload.totalPersonel);
    if (personel === null || personel < 1) return err_('Total personel harus angka >= 1.', 'VALIDASI');

    var hasil = withLock_(function () {
      var sh = modSheets_(mod);
      var kodeTim = sanitizeText_(payload.kodeTim, 20);
      var pin = String(payload.pin || '');
      var timRow;

      if (kodeTim) {
        // Tim sudah terdaftar: wajib Kode_Tim + PIN
        timRow = readAll_(sh.tim).filter(function (r) { return r.Kode_Tim === kodeTim && !r.Is_Deleted; })[0];
        if (!timRow) validasi_('Kode tim tidak ditemukan.');
        if (!verifyTimPin_(timRow, pin)) return err_('Kode tim atau PIN salah.', 'AKSES');
      } else {
        // Tim baru: buat Kode_Tim + PIN (PIN ditampilkan sekali)
        kodeTim = mod + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyy') + '-' + pad_(nextSeq_(sh.ss, 'KODE_TIM_' + mod));
        var pinBaru = String(Math.floor(100000 + Math.random() * 900000));
        var salt = randomHex_(16);
        appendObj_(sh.tim, headersOf_(sh.tim), {
          Kode_Tim: kodeTim, Nama_Tim: namaTim, Tipe_Tim: sanitizeText_(payload.tipeTim, 60), Jenis_Penugasan: sanitizeText_(payload.jenisPenugasan, 100),
          ID_Kabupaten: payload.idKabupaten || '', Kabupaten: sanitizeText_(payload.kabupaten, 100), PIN_Hash: hashPassword_(pinBaru, salt), PIN_Salt: salt,
          Status_Tim: 'Bertugas', Total_Personel: personel, Nama_Focal_Point: sanitizeText_(payload.namaFocalPoint, 100), Kontak_Focal_Point: sanitizeText_(payload.kontakFocalPoint, 60),
          Email: '', Created_At: nowWita_(), Is_Deleted: ''
        });
        timRow = { Kode_Tim: kodeTim, Nama_Tim: namaTim, ID_Kabupaten: payload.idKabupaten || '' };
        payload.__pinBaru = pinBaru;
      }

      // Tautan kejadian (Kontrak Bersama 5.4)
      var snap = null, modeTautan = 'BELUM_TERTAUT';
      var idKejadian = sanitizeText_(payload.idKejadian, 40);
      if (idKejadian && idKejadian !== 'BELUM_TERTAUT') {
        snap = getKejadianSnapshot_(idKejadian);
        if (!snap) validasi_('Kejadian tidak ditemukan atau belum tampil publik.');
        modeTautan = 'TERTAUT';
      }
      var idKabTim = payload.idKabupaten || (snap ? snap.ID_Kabupaten : '');
      var kabTim = sanitizeText_(payload.kabupaten || '', 100) || (snap ? snap.Kabupaten : '');
      var idRec = mod + 'KD-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(sh.ss, 'KD_' + mod));
      var rec = {
        ID_Record: idRec, ID_Tim: kodeTim, Kode_Tim: kodeTim, Nama_Tim: namaTim, Tipe_Tim: sanitizeText_(payload.tipeTim, 60), Jenis_Penugasan: sanitizeText_(payload.jenisPenugasan, 100),
        ID_Kejadian: snap ? snap.ID_Kejadian : '', Status_Tautan_Kejadian: modeTautan,
        Nama_Kejadian: snap ? snap.Nama_Kejadian : '', Jenis_Bencana: snap ? snap.Jenis_Bencana : '',
        Tanggal_Kejadian: snap ? snap.Tanggal_Kejadian : (payload.tglKejadianManual ? fmtIso_(payload.tglKejadianManual) : ''),
        ID_Kabupaten_Kejadian: snap ? snap.ID_Kabupaten : '', Kabupaten_Kejadian: snap ? snap.Kabupaten : '',
        Nama_Bencana_Teks: snap ? '' : sanitizeText_(payload.namaBencanaTeks, 150),
        Tgl_Kedatangan: fmtIso_(tgl), ID_Kabupaten: idKabTim, Kabupaten: kabTim, Kecamatan: sanitizeText_(payload.kecamatan, 200),
        Total_Personel: personel, Nama_Focal_Point: sanitizeText_(payload.namaFocalPoint, 100), Kontak_Focal_Point: sanitizeText_(payload.kontakFocalPoint, 60),
        Status_Data: 'DRAFT', Catatan_Verifikasi: '', Created_At: nowWita_(), Is_Deleted: '', Status_Sinkron_Relawan: '', Sinkron_Relawan_Pada: ''
      };
      appendObj_(sh.kedatangan, KD_HEADERS, rec);
      simpanDetail_(sh.kdDetail, idRec, kodeTim, payload.detail);

      // Sinkron ke Menu Relawan (Kontrak Bersama bagian 7)
      var sink = 'OK';
      try { upsertRelawan_(mod, rec); } catch (e) { sink = 'GAGAL'; logError_('upsertRelawan_' + mod, e); }
      if (sink !== 'OK') {
        try {
          var h = headersOf_(sh.kedatangan);
          sh.kedatangan.getRange(readAll_(sh.kedatangan).filter(function (r) { return r.ID_Record === idRec; })[0]._row, h.indexOf('Status_Sinkron_Relawan') + 1).setValue(sink);
        } catch (e) {}
      }

      invalidateTim_(mod);
      return { idRecord: idRec, kodeTim: kodeTim, pin: payload.__pinBaru || '', statusSinkron: sink };
    });

    var msg = 'Kedatangan tim tercatat. Status data: DRAFT.';
    if (hasil.pin) msg += ' KODE TIM Anda: ' + hasil.kodeTim + ' — PIN: ' + hasil.pin + ' (hanya ditampilkan sekali, simpan dengan aman untuk memverifikasi laporan tim).';
    return ok_(hasil, msg);
  } catch (e) { return galatUmum_(e, 'submitTimKedatangan'); }
}

function verifyTimPin_(timRow, pin) {
  if (!pin || !timRow.PIN_Hash) return false;
  return verifyPassword_(pin, timRow.PIN_Hash);
}

// ---------- Form 2: Harian & Form 3: Kepulangan (focal point: Kode_Tim + PIN) ----------
function submitTimHarian(mod, payload) {
  try {
    payload = payload || {};
    cekDetail_(payload.detail);
    return withLock_(function () {
      var sh = modSheets_(mod);
      var tim = readAll_(sh.tim).filter(function (r) { return r.Kode_Tim === sanitizeText_(payload.kodeTim, 20) && !r.Is_Deleted; })[0];
      if (!tim || !verifyTimPin_(tim, String(payload.pin || ''))) return err_('Kode tim atau PIN salah.', 'AKSES');
      var tgl = fmtIso_(payload.tanggal);
      if (!tgl) validasi_('Tanggal wajib diisi.');
      var idRec = mod + 'HR-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(sh.ss, 'HR_' + mod));
      var h = headersOf_(sh.harian);
      appendObj_(sh.harian, h, {
        ID_Record: idRec, ID_Tim: tim.Kode_Tim, Kode_Tim: tim.Kode_Tim, Tanggal: tgl,
        Jml_Pasien_Dirawat: toInt_(payload.jmlPasien) || 0, Jml_Rujukan: toInt_(payload.jmlRujukan) || 0,
        Jml_Persediaan_Tersisa: toInt_(payload.jmlPersediaan) || 0,
        Kendala: sanitizeText_(payload.kendala, 1000), Keterangan: sanitizeText_(payload.keterangan, 1000),
        Status_Data: 'DRAFT', Created_At: nowWita_(), Is_Deleted: ''
      });
      simpanDetail_(sh.hrDetail, idRec, tim.Kode_Tim, payload.detail);
      invalidateTim_(mod);
      return ok_({ id: idRec }, 'Laporan harian tersimpan (DRAFT). Focal point dapat menandai VERIFIED melalui menu verifikasi tim.');
    });
  } catch (e) { return galatUmum_(e, 'submitTimHarian'); }
}

function submitTimKepulangan(mod, payload) {
  try {
    payload = payload || {};
    cekDetail_(payload.detail);
    return withLock_(function () {
      var sh = modSheets_(mod);
      var tim = readAll_(sh.tim).filter(function (r) { return r.Kode_Tim === sanitizeText_(payload.kodeTim, 20) && !r.Is_Deleted; })[0];
      if (!tim || !verifyTimPin_(tim, String(payload.pin || ''))) return err_('Kode tim atau PIN salah.', 'AKSES');
      var tgl = fmtIso_(payload.tglKepulangan);
      if (!tgl) validasi_('Tanggal kepulangan wajib diisi.');
      var ked = readAll_(sh.kedatangan).filter(function (r) { return !r.Is_Deleted && r.Kode_Tim === tim.Kode_Tim; })
        .sort(function (a, b) { return String(b.Tgl_Kedatangan).localeCompare(String(a.Tgl_Kedatangan)); })[0];
      var lama = 0;
      if (ked) lama = Math.max(0, Math.round((parseDateSafe_(tgl) - parseDateSafe_(ked.Tgl_Kedatangan)) / 86400000));
      var idRec = mod + 'KP-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(sh.ss, 'KP_' + mod));
      var h = headersOf_(sh.kepulangan);
      appendObj_(sh.kepulangan, h, {
        ID_Record: idRec, ID_Tim: tim.Kode_Tim, Kode_Tim: tim.Kode_Tim, Tgl_Kepulangan: tgl, Lama_Tugas: lama,
        Alasan_Pulang: sanitizeText_(payload.alasanPulang, 300), Keterangan: sanitizeText_(payload.keterangan, 1000),
        Status_Data: 'DRAFT', Created_At: nowWita_(), Is_Deleted: '', Status_Sinkron_Relawan: ''
      });
      simpanDetail_(sh.kpDetail, idRec, tim.Kode_Tim, payload.detail);
      var hTim = headersOf_(sh.tim);
      sh.tim.getRange(tim._row, hTim.indexOf('Status_Tim') + 1).setValue('Sudah Pulang');
      try { relawanSelesai_(mod, tim.Kode_Tim, tgl, lama); } catch (e) { logError_('relawanSelesai_' + mod, e); }
      invalidateTim_(mod);
      return ok_({ id: idRec }, 'Kepulangan tim tercatat. Status tim: Sudah Pulang.');
    });
  } catch (e) { return galatUmum_(e, 'submitTimKepulangan'); }
}

// Verifikasi focal point: DRAFT -> VERIFIED (hanya lewat Kode_Tim + PIN)
function verifikasiTim(mod, kodeTim, pin, idRecord) {
  try {
    return withLock_(function () {
      var sh = modSheets_(mod);
      var tim = readAll_(sh.tim).filter(function (r) { return r.Kode_Tim === sanitizeText_(kodeTim, 20) && !r.Is_Deleted; })[0];
      if (!tim || !verifyTimPin_(tim, String(pin || ''))) return err_('Kode tim atau PIN salah.', 'AKSES');
      var target = [sh.kedatangan, sh.harian, sh.kepulangan];
      var ketemu = false;
      target.forEach(function (sheet) {
        var h = headersOf_(sheet);
        readAll_(sheet).forEach(function (r) {
          if (r.ID_Record === sanitizeText_(idRecord, 40) && r.Status_Data === 'DRAFT') {
            sheet.getRange(r._row, h.indexOf('Status_Data') + 1).setValue('VERIFIED');
            ketemu = true;
          }
        });
      });
      if (!ketemu) validasi_('Laporan tidak ditemukan atau sudah terverifikasi.');
      invalidateTim_(mod);
      return ok_(null, 'Laporan ditandai VERIFIED oleh focal point tim.');
    });
  } catch (e) { return galatUmum_(e, 'verifikasiTim'); }
}

// ---------- Baca laporan tim (focal point: Kode_Tim + PIN) ----------
function timByPin_(sh, kodeTim, pin) {
  var kode = sanitizeText_(kodeTim, 20);
  return readAll_(sh.tim).filter(function (r) { return r.Kode_Tim === kode && !r.Is_Deleted; })
    .filter(function (r) { return verifyTimPin_(r, String(pin || '')); })[0];
}

// Daftar semua laporan (Form 1, 2, 3) milik satu tim
function getLaporanTim(mod, kodeTim, pin) {
  try {
    var sh = modSheets_(mod), tim = timByPin_(sh, kodeTim, pin);
    if (!tim) return err_('Kode tim atau PIN salah.', 'AKSES');
    var milik = function (sheet, jenis, kolTgl) {
      return readAll_(sheet).filter(function (r) { return !r.Is_Deleted && r.Kode_Tim === tim.Kode_Tim; }).map(function (r) {
        return { id: r.ID_Record, jenis: jenis, t: fmtIso_(r[kolTgl]), tanggal: fmtDate_(r[kolTgl]), status: r.Status_Data };
      });
    };
    var data = milik(sh.kedatangan, 'Form 1 Kedatangan', 'Tgl_Kedatangan')
      .concat(milik(sh.harian, 'Form 2 Harian', 'Tanggal'), milik(sh.kepulangan, 'Form 3 Kepulangan', 'Tgl_Kepulangan'))
      .sort(function (a, b) { return String(b.t).localeCompare(String(a.t)) || String(b.id).localeCompare(String(a.id)); });
    return ok_(data);
  } catch (e) { return galatUmum_(e, 'getLaporanTim'); }
}

// Isi satu laporan: ringkasan kolom tetap + isian lengkap (JSON) bila ada
function getDetailLaporanTim(mod, kodeTim, pin, idRecord) {
  try {
    var sh = modSheets_(mod), tim = timByPin_(sh, kodeTim, pin), id = sanitizeText_(idRecord, 40);
    if (!tim) return err_('Kode tim atau PIN salah.', 'AKSES');
    var jenis = [
      { sheet: sh.kedatangan, det: sh.kdDetail, form: 'f1', nama: 'Form 1 Kedatangan', kol: [['Nama Tim', 'Nama_Tim'], ['Tipe Tim', 'Tipe_Tim'], ['Jenis Penugasan', 'Jenis_Penugasan'], ['Kejadian', 'Nama_Kejadian'], ['Nama Bencana (teks)', 'Nama_Bencana_Teks'], ['Tgl Kedatangan', 'Tgl_Kedatangan'], ['Kabupaten', 'Kabupaten'], ['Kecamatan', 'Kecamatan'], ['Total Personel', 'Total_Personel'], ['Focal Point', 'Nama_Focal_Point'], ['Kontak Focal Point', 'Kontak_Focal_Point']] },
      { sheet: sh.harian, det: sh.hrDetail, form: 'f2', nama: 'Form 2 Laporan Harian', kol: (mod === 'TDP' ? [['Tanggal', 'Tanggal'], ['Penerima Layanan (orang)', 'Jml_Pasien_Dirawat'], ['Kasus Dirujuk', 'Jml_Rujukan'], ['Kendala', 'Kendala'], ['Keterangan', 'Keterangan']] : [['Tanggal', 'Tanggal'], ['Pasien Dirawat', 'Jml_Pasien_Dirawat'], ['Rujukan', 'Jml_Rujukan'], ['Persediaan Tersisa (%)', 'Jml_Persediaan_Tersisa'], ['Kendala', 'Kendala'], ['Keterangan', 'Keterangan']]) },
      { sheet: sh.kepulangan, det: sh.kpDetail, form: 'f3', nama: 'Form 3 Kepulangan', kol: [['Tgl Kepulangan', 'Tgl_Kepulangan'], ['Lama Tugas (hari)', 'Lama_Tugas'], ['Alasan Pulang', 'Alasan_Pulang'], ['Keterangan', 'Keterangan']] }
    ];
    for (var i = 0; i < jenis.length; i++) {
      var j = jenis[i];
      var r = readAll_(j.sheet).filter(function (x) { return x.ID_Record === id && !x.Is_Deleted; })[0];
      if (!r) continue;
      if (r.Kode_Tim !== tim.Kode_Tim) validasi_('Laporan ini bukan milik tim Anda.');
      var ringkas = j.kol.map(function (k) {
        var v = r[k[1]];
        return [k[0], /^(Tgl_|Tanggal$)/.test(k[1]) ? fmtDate_(v) : (v === null || v === undefined ? '' : String(v))];
      }).filter(function (x) { return x[1] !== ''; });
      var detail = null;
      if (j.det) {
        var d = readAll_(j.det).filter(function (x) { return x.ID_Record === id; })[0];
        if (d) { try { detail = JSON.parse(d.Data_JSON); } catch (e) { detail = null; } }
      }
      return ok_({ id: id, form: j.form, nama: j.nama, status: r.Status_Data, ringkas: ringkas, detail: detail });
    }
    validasi_('Laporan tidak ditemukan.');
  } catch (e) { return galatUmum_(e, 'getDetailLaporanTim'); }
}

// Jumlah semua isian angka Laporan Harian (Form 2 lengkap) milik tim; dipakai mengisi bagian C dan D Form 3
function getRekapHarianTim(mod, kodeTim, pin) {
  try {
    var sh = modSheets_(mod), tim = timByPin_(sh, kodeTim, pin);
    if (!tim) return err_('Kode tim atau PIN salah.', 'AKSES');
    var milik = {};
    readAll_(sh.harian).forEach(function (r) { if (!r.Is_Deleted && r.Kode_Tim === tim.Kode_Tim) milik[r.ID_Record] = 1; });
    var S = {}, n = 0;
    readAll_(sh.hrDetail).forEach(function (x) {
      if (!milik[x.ID_Record]) return;
      var d; try { d = JSON.parse(x.Data_JSON); } catch (e) { return; }
      n++;
      Object.keys(d).forEach(function (k) { var v = parseFloat(d[k]); if (!isNaN(v)) S[k] = (S[k] || 0) + v; });
    });
    return ok_({ jumlahLaporan: n, jumlah: S });
  } catch (e) { return galatUmum_(e, 'getRekapHarianTim'); }
}

// ---------- Sinkron Menu Relawan (UTAMA) ----------
function upsertRelawan_(mod, ked) {
  var c = modCfg_(mod);
  var ss = getSS_(CFG.KEY.SS_UTAMA);
  var sh = getSheet_(ss, 'TRX_Relawan', ['ID_Tim', 'Sumber_Modul', 'Nama_Tim', 'Jenis_Relawan', 'Tgl_Kedatangan', 'ID_Kabupaten', 'Kabupaten', 'Lokasi_Penempatan', 'Keterangan', 'Tgl_Kepulangan', 'Lama_Tugas', 'Dugaan_Duplikat_Dengan', 'Status_Sinkron_Relawan', 'Sinkron_Relawan_Pada', 'Status_Data', 'Created_At', 'Is_Deleted']);
  var h = headersOf_(sh);
  var rows = readAll_(sh);
  var kunci = mod + '|' + ked.ID_Tim;
  var row = rows.filter(function (r) { return r.Sumber_Modul === mod && r.ID_Tim === ked.ID_Tim && !r.Is_Deleted; })[0];
  var dugaan = '';
  rows.forEach(function (r) {
    if (!r.Is_Deleted && r.Sumber_Modul === 'MANUAL' && String(r.Nama_Tim).toLowerCase().replace(/\s+/g, ' ') === String(ked.Nama_Tim).toLowerCase().replace(/\s+/g, ' ') && r.ID_Kabupaten === ked.ID_Kabupaten && fmtIso_(r.Tgl_Kedatangan) === ked.Tgl_Kedatangan) dugaan = r.ID_Tim;
  });
  // Tim yang sudah selesai bertugas lalu datang lagi = penugasan baru: lokasi penempatan direset
  var selesaiSebelumnya = !!row && (row.Keterangan === 'Selesai Bertugas' || !!row.Tgl_Kepulangan);
  // Keterangan: otomatis 'Kedatangan'; bila Admin Kabupaten sudah menetapkan 'Bertugas' dan tim belum selesai, tetap dipertahankan
  var ketRelawan = (row && !selesaiSebelumnya && row.Keterangan === 'Bertugas') ? 'Bertugas' : 'Kedatangan';
  var baru = {
    ID_Tim: ked.ID_Tim, Sumber_Modul: mod, Nama_Tim: ked.Nama_Tim, Jenis_Relawan: c.jenisRelawan,
    Tgl_Kedatangan: ked.Tgl_Kedatangan, ID_Kabupaten: ked.ID_Kabupaten, Kabupaten: ked.Kabupaten,
    Lokasi_Penempatan: (row && !selesaiSebelumnya) ? (row.Lokasi_Penempatan || '') : '', Keterangan: ketRelawan, Tgl_Kepulangan: '', Lama_Tugas: '',
    Dugaan_Duplikat_Dengan: dugaan, Status_Sinkron_Relawan: 'OK', Sinkron_Relawan_Pada: nowWita_(),
    Status_Data: 'Terverifikasi', Created_At: row ? row.Created_At : nowWita_(), Is_Deleted: ''
  };
  // Baris yang sudah ada: pertahankan kolom lain (ID_Record, Version, dst.) dan Lokasi_Penempatan yang diisi Admin Kabupaten
  var rec = {};
  if (row) h.forEach(function (k) { rec[k] = row[k]; });
  Object.keys(baru).forEach(function (k) { rec[k] = baru[k]; });
  if (!rec.ID_Record) rec.ID_Record = ked.ID_Tim;
  if (row) sh.getRange(row._row, 1, 1, h.length).setValues([objToRow_(h, rec)]);
  else appendObj_(sh, h, rec);
  invalidasiCache_(cfgCache_('REL'));
}

function relawanSelesai_(mod, idTim, tglPulang, lama) {
  var ss = getSS_(CFG.KEY.SS_UTAMA);
  var sh = getSheet_(ss, 'TRX_Relawan');
  var h = headersOf_(sh);
  readAll_(sh).forEach(function (r) {
    if (!r.Is_Deleted && r.Sumber_Modul === mod && r.ID_Tim === idTim) {
      sh.getRange(r._row, h.indexOf('Keterangan') + 1).setValue('Selesai Bertugas');
      sh.getRange(r._row, h.indexOf('Tgl_Kepulangan') + 1).setValue(tglPulang);
      sh.getRange(r._row, h.indexOf('Lama_Tugas') + 1).setValue(lama);
    }
  });
  invalidasiCache_(cfgCache_('REL'));
}

// ---------- Fungsi baca privat untuk modul lain (Kontrak Bersama 6.1 & 6.2) ----------
function getTimPerKejadian_(mod, idKejadian) {
  var c = modCfg_(mod);
  var key = c.cache + 'perkejadian::' + idKejadian;
  var hit = cacheGet_(key);
  if (hit) return hit;
  var out = [];
  try {
    readAll_(modSheets_(mod).kedatangan).forEach(function (r) {
      if (r.Is_Deleted || r.ID_Kejadian !== idKejadian) return;
      out.push({ namaTim: r.Nama_Tim, modul: mod, tipe: r.Tipe_Tim || '', kabupaten: r.Kabupaten, status: r.Status_Data, personel: toInt_(r.Total_Personel) || 0, tanggal: fmtDate_(r.Tgl_Kedatangan) });
    });
  } catch (e) {}
  cachePut_(key, out, 300);
  return out;
}
function hitungTimUntukKejadian_(mod, idKejadian) { return getTimPerKejadian_(mod, idKejadian).length; }
function getTimBertugasPerKabupaten_(mod) {
  var c = modCfg_(mod);
  var key = c.cache + 'bertugas::kab2';
  var hit = cacheGet_(key);
  if (hit) return hit;
  var out = {};
  try {
    var sh = modSheets_(mod);
    var kodeValid = {};
    readAll_(sh.kedatangan).filter(barisKedatanganValid_).forEach(function (r) { kodeValid[String(r.Kode_Tim).trim()] = true; });
    readAll_(sh.tim).forEach(function (r) {
      if (r.Is_Deleted || r.Status_Tim !== 'Bertugas') return;
      if (!kodeValid[String(r.Kode_Tim || '').trim()]) return; // abaikan baris kosong / tim tanpa kedatangan aktif
      var kab = r.Kabupaten || 'Lainnya';
      if (!out[kab]) out[kab] = { tdm: 0, tdp: 0 };
      if (mod === 'TDM') out[kab].tdm++; else out[kab].tdp++;
    });
  } catch (e) {}
  cachePut_(key, out, 300);
  return out;
}

// Alamat dasar aplikasi web (/exec) agar tombol formulir dapat membuka tab baru
function getBaseUrlApp() {
  try { return ok_(ScriptApp.getService().getUrl()); } catch (e) { return galatUmum_(e, 'getBaseUrlApp'); }
}
