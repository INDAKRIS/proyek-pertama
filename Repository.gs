/**
 * Repository.gs — Repository generik untuk semua menu TRX (digerakkan MENU_CONFIG).
 * Lingkup data, workflow status, validasi, auto-calc, dan kartu stok.
 */

var Repo = (function () {

  function cfg(kode) {
    var all = buildMenuConfig();
    for (var i = 0; i < all.length; i++) if (all[i].kode === kode) return all[i];
    return aksesDitolak_('Menu tidak dikenal.');
  }

  function headers_(cfgM) {
    var bus = [];
    (cfgM.cols || []).forEach(function (c) { if (c.k !== 'ID_Record' && c.k !== 'Status_Data' && bus.indexOf(c.k) < 0) bus.push(c.k); });
    (cfgM.fields || []).forEach(function (f) { if (f.k !== 'ID_Record' && bus.indexOf(f.k) < 0) bus.push(f.k); });
    var sys = ['ID_Kabupaten', 'ID_Faskes', 'ID_Posko', 'Status_Data', 'Catatan_Verifikasi', 'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Version', 'Is_Deleted', 'Legacy_ID', 'Migration_Batch'];
    var uniq = bus.slice();
    sys.forEach(function (k) { if (uniq.indexOf(k) < 0) uniq.push(k); });
    return ['ID_Record'].concat(uniq);
  }

  // ---------- Lingkup data (server-side, A9) ----------
  function poskoPengelolaMap_() {
    var m = cacheGet_(CFG.CACHE_PREFIX.SYS + 'posko::pengelola');
    if (m) return m;
    m = {};
    try {
      readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'REF_Posko')).forEach(function (r) { m[r.ID_Posko] = r.ID_Faskes_Pengelola || ''; });
    } catch (e) {}
    cachePut_(CFG.CACHE_PREFIX.SYS + 'posko::pengelola', m, 300);
    return m;
  }

  function inScope_(user, cfgM, row) {
    if (user.role === ROLE.SUPER || user.role === ROLE.PROV) return true;
    if (user.role === ROLE.KAB) return !row.ID_Kabupaten || row.ID_Kabupaten === user.idKabupaten;
    var own = row.ID_Faskes && row.ID_Faskes === user.idFaskes;
    if (own) return true;
    if ((user.role === ROLE.PUSKESMAS || user.role === ROLE.KAB) && row.ID_Posko) {
      return poskoPengelolaMap_()[row.ID_Posko] === user.idFaskes;
    }
    return false;
  }
  function filterScope_(user, cfgM, rows) { return rows.filter(function (r) { return inScope_(user, cfgM, r); }); }

  function assertInScope_(user, cfgM, rec) {
    if (user.role === ROLE.SUPER || user.role === ROLE.PROV) return;
    if (user.role === ROLE.KAB) { if (rec.ID_Kabupaten && rec.ID_Kabupaten !== user.idKabupaten) aksesDitolak_('Data berada di luar wilayah kabupaten Anda.'); return; }
    if (rec.ID_Faskes !== user.idFaskes) aksesDitolak_('Data berada di luar lingkup faskes Anda.');
  }

  // Stamp pemilik baris dari master, bukan dari klien (A9)
  function stampOwner_(user, cfgM, rec) {
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    if (cfgM.scopeType === 'P') {
      if (!rec.ID_Posko) validasi_('Posko wajib dipilih.');
      var p = readAll_(getSheet_(ss, 'REF_Posko')).filter(function (r) { return r.ID_Posko === rec.ID_Posko && !r.Is_Deleted; })[0];
      if (!p) validasi_('Posko tidak ditemukan.');
      if (!p.ID_Faskes_Pengelola) validasi_('Posko belum memiliki faskes pengelola. Hubungi Admin Kabupaten.');
      rec.ID_Faskes = p.ID_Faskes_Pengelola;
      rec.ID_Kabupaten = p.ID_Kabupaten;
    } else if (cfgM.scopeType === 'F') {
      if (!rec.ID_Faskes) validasi_('Faskes wajib dipilih.');
      var f = readAll_(getSheet_(ss, 'REF_Faskes')).filter(function (r) { return r.ID_Faskes === rec.ID_Faskes && !r.Is_Deleted; })[0];
      if (!f) validasi_('Faskes tidak ditemukan.');
      rec.ID_Kabupaten = f.ID_Kabupaten;
    } else if (cfgM.scopeType === 'R') {
      if (rec.ID_Posko) { var p2 = readAll_(getSheet_(ss, 'REF_Posko')).filter(function (r) { return r.ID_Posko === rec.ID_Posko; })[0]; if (p2) { rec.ID_Faskes = rec.ID_Faskes || p2.ID_Faskes_Pengelola || ''; rec.ID_Kabupaten = rec.ID_Kabupaten || p2.ID_Kabupaten; } }
      else if (user.role === ROLE.KAB) rec.ID_Kabupaten = user.idKabupaten;
    } else { // K
      rec.ID_Faskes = ''; rec.ID_Posko = '';
      if (user.role === ROLE.KAB) rec.ID_Kabupaten = user.idKabupaten;
      else if (!rec.ID_Kabupaten) rec.ID_Kabupaten = '';
    }
    assertInScope_(user, cfgM, rec);
    return rec;
  }

  // ---------- Validasi field per MENU_CONFIG ----------
  function validate_(cfgM, payload) {
    var rec = {};
    cfgM.fields.forEach(function (f) {
      var v = payload[f.k];
      if (f.auto) return; // dihitung server
      if (f.req && (v === undefined || v === null || v === '')) validasi_('Kolom "' + f.l + '" wajib diisi.');
      if (v === undefined || v === null || v === '') { rec[f.k] = ''; return; }
      if (f.t === 'number') { var n = toInt_(v); if (n === null || n < 0) validasi_('Kolom "' + f.l + '" harus berupa angka bulat >= 0.'); rec[f.k] = n; }
      else if (f.t === 'date') { var d = parseDateSafe_(v); if (!d) validasi_('Kolom "' + f.l + '" harus berupa tanggal yang sah.'); rec[f.k] = fmtIso_(d); if (f.hint !== 'boleh-masa-lalu' && d > new Date()) validasi_('Kolom "' + f.l + '" tidak boleh melewati hari ini.'); }
      else if (f.t === 'select') { if (f.opts.indexOf(String(v)) < 0) validasi_('Nilai "' + f.l + '" tidak sah.'); rec[f.k] = String(v); }
      else if (f.t === 'textarea') rec[f.k] = sanitizeText_(v, f.max || 2000);
      else rec[f.k] = sanitizeText_(v, f.max || 300);
    });
    return rec;
  }

  // ---------- Perhitungan otomatis server ----------
  function autoCalc_(user, cfgM, rec, mode) {
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    var now = nowWita_();
    if (cfgM.kode === 'M08') {
      var stok = latestPengungsiPosko_(ss, rec.ID_Posko);
      rec.Jml_Pengungsi = stok;
      var standar = Number(getConfigVal_('standar_air_l_per_org')) || 15;
      var rasioToilet = Number(getConfigVal_('rasio_toilet_per_org')) || 20;
      rec.Kebutuhan_Air_L = Math.round(stok * standar);
      rec.Kebutuhan_Toilet = Math.max(1, Math.ceil(stok / rasioToilet));
    } else if (cfgM.kode === 'M13') {
      rec.Jml_Belum_Teridentifikasi = Math.max(0, (toInt_(rec.Jml_Jenazah_Utuh) || 0) + (toInt_(rec.Jml_Bagian_Tubuh) || 0) - (toInt_(rec.Jml_Teridentifikasi) || 0));
    } else if (cfgM.kode === 'M07') {
      rec.Jml_Kasus_Sistem = kasusSistem_(ss, rec.ID_Penyakit);
    } else if (cfgM.kode === 'M15') {
      rec.Jml_Tersedia = stokBarang_(ss, rec.ID_Faskes || rec.ID_Entitas_Pemohon, rec.ID_Barang);
    } else if (cfgM.kode === 'M17') {
      rec.Selisih = '';
    } else if (cfgM.kode === 'M19') {
      rec.Selisih = '';
    } else if (cfgM.kode === 'M22') {
      var agg = rekapIndikator_(ss, rec.Indikator);
      rec.Jml_Hari_Ini = agg.hariIni; rec.Jml_Kemarin = agg.kemarin; rec.Jml_Kumulatif = agg.kumulatif;
    } else if (cfgM.kode === 'M23') {
      rec.Faskes_Rusak_Berat = hitungFaskesRusakBerat_(ss);
    }
    rec.Updated_At = now; rec.Updated_By = user.username;
    return rec;
  }

  function getConfigVal_(key) {
    var hit = cacheGet_(CFG.CACHE_PREFIX.SYS + 'config::' + key);
    if (hit !== null) return hit;
    var v = '';
    try {
      readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Config')).some(function (r) { if (r.Key === key) { v = r.Value; return true; } return false; });
    } catch (e) {}
    cachePut_(CFG.CACHE_PREFIX.SYS + 'config::' + key, v, 300);
    return v;
  }

  function latestPengungsiPosko_(ss, idPosko) {
    var rows = readAll_(getSheet_(ss, 'TRX_Pengungsi')).filter(function (r) { return !r.Is_Deleted && r.ID_Posko === idPosko; })
      .sort(function (a, b) { return String(b.Tanggal).localeCompare(String(a.Tanggal)); });
    return rows.length ? (toInt_(rows[0].Jml_Jiwa) || 0) : 0;
  }
  function stokBarang_(ss, lokasi, idBarang) {
    if (!idBarang) return 0;
    var rows = readAll_(getSheet_(ss, 'TRX_Kartu_Stok')).filter(function (r) { return !r.Is_Deleted && r.ID_Barang === idBarang && (!lokasi || r.ID_Faskes === lokasi); })
      .sort(function (a, b) { return String(a.Tanggal).localeCompare(String(b.Tanggal)); });
    return rows.length ? (toInt_(rows[rows.length - 1].Sisa) || 0) : 0;
  }
  function kasusSistem_(ss, idPenyakit) {
    var total = 0;
    readAll_(getSheet_(ss, 'TRX_Surveilans')).forEach(function (r) { if (!r.Is_Deleted && r.ID_Penyakit === idPenyakit) total += toInt_(r.Jml_Kasus_Baru) || 0; });
    return total;
  }
  function hitungFaskesRusakBerat_(ss) {
    return readAll_(getSheet_(ss, 'TRX_Penilaian_Kerusakan')).filter(function (r) { return !r.Is_Deleted && r.Tingkat_Kerusakan === 'Rusak Berat'; }).length;
  }
  function rekapIndikator_(ss, indikator) {
    var kolom = { 'Meninggal': 'Meninggal', 'LB/RI': 'LB_RI', 'LR/RJ': 'LR_RJ', 'Hilang': 'Hilang', 'Pengungsi': 'Pengungsi' }[indikator] || null;
    var hariIni = 0, kemarin = 0, kumulatif = 0;
    if (!kolom) return { hariIni: 0, kemarin: 0, kumulatif: 0 };
    var t1 = todayWita_(), t2 = fmtIso_(new Date(Date.now() - 86400000));
    try {
      readAll_(getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKejadian')).forEach(function (r) {
        if (r.Status_Verifikasi !== 'Disetujui') return;
        var v = toInt_(r[kolom]) || 0; kumulatif += v;
        if (fmtIso_(r.Tgl_Kejadian) === t1) hariIni += v;
        if (fmtIso_(r.Tgl_Kejadian) === t2) kemarin += v;
      });
    } catch (e) {}
    return { hariIni: hariIni, kemarin: kemarin, kumulatif: kumulatif };
  }

  // ---------- Daftar (tabel + filter + paginasi di server) ----------
  function list(user, kode, p) {
    p = p || {};
    var cfgM = cfg(kode);
    var access = menuAccess(cfgM);
    if (access.read.indexOf(user.role) < 0) aksesDitolak_('Menu ini tidak tersedia untuk level Anda.');
    var rows = filterScope_(user, cfgM, readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), cfgM.sheet)).filter(function (r) { return !r.Is_Deleted; }));

    if (p.status) rows = rows.filter(function (r) { return r.Status_Data === p.status; });
    if (p.idKabupaten) rows = rows.filter(function (r) { return r.ID_Kabupaten === p.idKabupaten; });
    if (p.dari) rows = rows.filter(function (r) { var d = fmtIso_(r.Tanggal || r.Created_At); return d && d >= p.dari; });
    if (p.sampai) rows = rows.filter(function (r) { var d = fmtIso_(r.Tanggal || r.Created_At); return d && d <= p.sampai; });
    if (p.search) {
      var q = String(p.search).toLowerCase();
      rows = rows.filter(function (r) {
        if (String(r.ID_Record || '').toLowerCase() === q) return true;
        return cfgM.cols.some(function (c) { var v = r[c.k]; return v !== undefined && v !== null && String(v).toLowerCase().indexOf(q) >= 0; });
      });
    }
    rows.sort(function (a, b) { return String(b.Created_At || '').localeCompare(String(a.Created_At || '')); });

    var counts = { total: rows.length };
    Object.keys(STATUS_DATA).forEach(function (s) {
      counts[s] = rows.filter(function (r) { return r.Status_Data === STATUS_DATA[s]; }).length;
    });

    var pageSize = Math.min(Number(p.pageSize) || CFG.PAGESIZE_DEFAULT, CFG.PAGESIZE_MAX);
    var page = Math.max(1, Number(p.page) || 1);
    var total = rows.length;
    var slice = rows.slice((page - 1) * pageSize, page * pageSize);

    var refs = lookupMaps_(cfgM.cols.filter(function (c) { return c.ref; }).map(function (c) { return c.ref; }));
    var out = slice.map(function (r) {
      var o = { ID_Record: r.ID_Record, Status_Data: r.Status_Data, Catatan_Verifikasi: r.Catatan_Verifikasi, Version: r.Version, Created_At: r.Created_At, Created_By: r.Created_By, Updated_At: r.Updated_At, ID_Kabupaten: r.ID_Kabupaten, ID_Faskes: r.ID_Faskes, ID_Posko: r.ID_Posko, _editable: canEditRow_(user, r, cfgM), _aksi: aksiTersedia_(user, cfgM, r), _editPenempatan: cfgM.kode === 'M24' && user.role === ROLE.KAB };
      cfgM.cols.forEach(function (c) {
        var v = r[c.k];
        if (c.ref && refs[c.ref]) { o[c.k + '_ref'] = refs[c.ref][v] || v || ''; }
        o[c.k] = (v === undefined || v === null || v === '') ? '' : v;
      });
      return o;
    });
    return { rows: out, page: page, pageSize: pageSize, total: total, counts: counts, cfg: { kode: cfgM.kode, nama: cfgM.nama, cols: cfgM.cols, fields: cfgM.fields, readOnly: !!cfgM.readOnly, appendOnly: !!cfgM.appendOnly, scopeType: cfgM.scopeType } };
  }

  // Relawan (M24): Admin Kabupaten boleh mengubah penempatan di wilayahnya sendiri walau status sudah Terverifikasi/Tervalidasi
  function canEditRow_(user, r, cfgM) {
    if (user.role === ROLE.SUPER) return true;
    if (cfgM && cfgM.kode === 'M24' && user.role === ROLE.KAB) return true;
    if (r.Status_Data === STATUS_DATA.TERVERIFIKASI || r.Status_Data === STATUS_DATA.TERVALIDASI) return false;
    return true;
  }
  function aksiTersedia_(user, cfgM, r) {
    var a = [];
    var st = r.Status_Data;
    if (cfgM.readOnly) return a;
    if (st === STATUS_DATA.DRAFT || st === STATUS_DATA.DIKEMBALIKAN) a.push('Ajukan');
    if (st === STATUS_DATA.DIAJUKAN && (user.role === ROLE.KAB || user.role === ROLE.SUPER)) a.push('Verifikasi');
    if (st === STATUS_DATA.TERVERIFIKASI && (user.role === ROLE.PROV || user.role === ROLE.SUPER)) a.push('Validasi');
    if ((st === STATUS_DATA.DIAJUKAN || st === STATUS_DATA.TERVERIFIKASI) && (user.role === ROLE.KAB || user.role === ROLE.PROV || user.role === ROLE.SUPER)) a.push('Kembalikan');
    if (st !== STATUS_DATA.TERVALIDASI && (user.role === ROLE.KAB || user.role === ROLE.PROV || user.role === ROLE.SUPER)) a.push('Hapus');
    else if (user.role === ROLE.SUPER) a.push('Hapus');
    return a;
  }

  // ---------- Simpan ----------
  function insert(user, kode, payload, requestId, submitFlag) {
    var cfgM = cfg(kode);
    var access = menuAccess(cfgM);
    if (access.write.indexOf(user.role) < 0) aksesDitolak_('Anda tidak berhak menambah data pada menu ini.');
    if (cfgM.readOnly) aksesDitolak_('Menu ini bersifat baca-saja.');
    if (requestId) {
      var dup = cacheGet_('idem::' + requestId);
      if (dup) return dup;
    }
    var rec = validate_(cfgM, payload);
    if (cfgM.kode === 'M26') validasiPerkembangan_(user, rec);
    stampOwner_(user, cfgM, rec);
    autoCalc_(user, cfgM, rec);
    rec.Status_Data = submitFlag === 'ajukan' ? STATUS_DATA.DIAJUKAN : STATUS_DATA.DRAFT;
    rec.Created_At = nowWita_(); rec.Created_By = user.username;
    rec.Updated_At = nowWita_(); rec.Updated_By = user.username;
    rec.Version = 1; rec.Is_Deleted = ''; rec.Legacy_ID = ''; rec.Migration_Batch = '';
    rec.Catatan_Verifikasi = '';

    var result = withLock_(function () {
      var ss = getSS_(CFG.KEY.SS_UTAMA);
      var sh = getSheet_(ss, cfgM.sheet, headers_(cfgM));
      var h = headersOf_(sh);
      var id = cfgM.idPrefix + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, 'TRX_' + cfgM.sheet));
      rec.ID_Record = id;
      sh.appendRow(objToRow_(h, rec));
      if (cfgM.stockIn) tulisStok_(user, rec, 'Masuk');
      invalidasiCache_(CFG.CACHE_PREFIX.TRX);
      return { ID_Record: id, Status_Data: rec.Status_Data };
    });
    logAudit_(user, 'TAMBAH_DATA', cfgM.nama, 'ID: ' + result.ID_Record, 'OK');
    var resp = ok_(result, 'Data tersimpan sebagai ' + result.Status_Data + '.');
    if (requestId) cachePut_('idem::' + requestId, resp, 86400);
    return resp;
  }

  function update(user, kode, id, patch, version) {
    var cfgM = cfg(kode);
    var access = menuAccess(cfgM);
    var khususPenempatan = cfgM.kode === 'M24' && user.role === ROLE.KAB; // Admin Kabupaten selalu boleh mengisi penempatan Relawan di wilayahnya
    if (access.write.indexOf(user.role) < 0 && !khususPenempatan) aksesDitolak_('Anda tidak berhak mengubah data menu ini.');
    return withLock_(function () {
      var ss = getSS_(CFG.KEY.SS_UTAMA);
      var sh = getSheet_(ss, cfgM.sheet, headers_(cfgM));
      var h = headersOf_(sh);
      var rows = readAll_(sh);
      var row = rows.filter(function (r) { return r.ID_Record === id && !r.Is_Deleted; })[0];
      if (!row) validasi_('Data tidak ditemukan.');
      if (Number(row.Version) !== Number(version)) return err_('Data telah diubah oleh pengguna lain. Muat ulang data.', 'KONFLIK_VERSI');
      if (!canEditRow_(user, row, cfgM) && user.role !== ROLE.SUPER) aksesDitolak_('Data berstatus ' + row.Status_Data + ' dan tidak dapat diubah oleh level Anda.');
      if (!inScope_(user, cfgM, row)) aksesDitolak_('Data di luar lingkup Anda.');

      var rec = {};
      // Relawan (M24) oleh Admin Kabupaten: baris bersumber TDM/TDP atau sudah Terverifikasi/Tervalidasi
      // hanya boleh mengubah Lokasi_Penempatan dan Keterangan; kolom lain dipertahankan dari data asli.
      var terbatasM24 = cfgM.kode === 'M24' && user.role === ROLE.KAB &&
        (access.write.indexOf(user.role) < 0 || row.Sumber_Modul === 'TDM' || row.Sumber_Modul === 'TDP' ||
         row.Status_Data === STATUS_DATA.TERVERIFIKASI || row.Status_Data === STATUS_DATA.TERVALIDASI);
      if (terbatasM24) {
        h.forEach(function (k) { rec[k] = row[k]; });
        if (patch.Lokasi_Penempatan !== undefined) rec.Lokasi_Penempatan = sanitizeText_(patch.Lokasi_Penempatan, 300);
        if (patch.Keterangan !== undefined) rec.Keterangan = sanitizeText_(patch.Keterangan, 300);
      } else {
        cfgM.fields.forEach(function (f) { rec[f.k] = patch[f.k] !== undefined ? patch[f.k] : row[f.k]; });
        rec = validate_(cfgM, rec);
        if (cfgM.kode === 'M24') h.forEach(function (k) { if (rec[k] === undefined) rec[k] = row[k]; }); // jangan hapus kolom sinkron/sumber
      }
      if (cfgM.kode === 'M26') validasiPerkembangan_(user, rec);
      stampOwner_(user, cfgM, rec);
      autoCalc_(user, cfgM, rec);
      rec.Version = Number(row.Version) + 1;
      rec.Created_At = row.Created_At; rec.Created_By = row.Created_By; rec.ID_Record = id;
      rec.Status_Data = row.Status_Data; rec.Catatan_Verifikasi = row.Catatan_Verifikasi; rec.Is_Deleted = row.Is_Deleted;

      var vals = [];
      for (var i = 0; i < h.length; i++) vals.push([sanitizeCell_(rec[h[i]])]);
      sh.getRange(row._row, 1, 1, h.length).setValues([objToRow_(h, rec)]);
      invalidasiCache_(CFG.CACHE_PREFIX.TRX);
      logAudit_(user, 'UBAH_DATA', cfgM.nama, 'ID: ' + id, 'OK');
      return ok_({ ID_Record: id, Version: rec.Version }, 'Data berhasil diubah.');
    });
  }

  function softDelete(user, kode, id) {
    var cfgM = cfg(kode);
    var access = menuAccess(cfgM);
    if (access.del.indexOf(user.role) < 0) aksesDitolak_('Anda tidak berhak menghapus data ini.');
    return withLock_(function () {
      var ss = getSS_(CFG.KEY.SS_UTAMA);
      var sh = getSheet_(ss, cfgM.sheet, headers_(cfgM));
      var h = headersOf_(sh);
      var rows = readAll_(sh);
      var row = rows.filter(function (r) { return r.ID_Record === id && !r.Is_Deleted; })[0];
      if (!row) validasi_('Data tidak ditemukan.');
      if (!inScope_(user, cfgM, row)) aksesDitolak_('Data di luar lingkup Anda.');
      sh.getRange(row._row, h.indexOf('Is_Deleted') + 1).setValue(TRUE_BOOL_);
      sh.getRange(row._row, h.indexOf('Updated_At') + 1).setValue(nowWita_());
      sh.getRange(row._row, h.indexOf('Updated_By') + 1).setValue(user.username);
      invalidasiCache_(CFG.CACHE_PREFIX.TRX);
      logAudit_(user, 'HAPUS_DATA', cfgM.nama, 'ID: ' + id, 'OK');
      return ok_({ ID_Record: id }, 'Data dihapus (soft delete).');
    });
  }
  var TRUE_BOOL_ = true;

  // ---------- Workflow ----------
  function aksi(user, kode, id, aksiNama, catatan) {
    var cfgM = cfg(kode);
    return withLock_(function () {
      var ss = getSS_(CFG.KEY.SS_UTAMA);
      var sh = getSheet_(ss, cfgM.sheet, headers_(cfgM));
      var h = headersOf_(sh);
      var rows = readAll_(sh);
      var row = rows.filter(function (r) { return r.ID_Record === id && !r.Is_Deleted; })[0];
      if (!row) validasi_('Data tidak ditemukan.');
      if (!inScope_(user, cfgM, row)) aksesDitolak_('Data di luar lingkup Anda.');
      var st = row.Status_Data, baru = null;
      if (aksiNama === 'Ajukan') {
        if ([STATUS_DATA.DRAFT, STATUS_DATA.DIKEMBALIKAN].indexOf(st) < 0) validasi_('Hanya data Draft/Dikembalikan yang dapat diajukan.');
        baru = STATUS_DATA.DIAJUKAN;
      } else if (aksiNama === 'Verifikasi') {
        if (menuAccess(cfgM).verify.indexOf(user.role) < 0) aksesDitolak_('Hanya Admin Kabupaten/atasnya yang dapat memverifikasi.');
        if (st !== STATUS_DATA.DIAJUKAN) validasi_('Hanya data Diajukan yang dapat diverifikasi.');
        baru = STATUS_DATA.TERVERIFIKASI;
      } else if (aksiNama === 'Validasi') {
        if (menuAccess(cfgM).validate.indexOf(user.role) < 0) aksesDitolak_('Hanya Admin Provinsi/atasnya yang dapat memvalidasi.');
        if (st !== STATUS_DATA.TERVERIFIKASI) validasi_('Hanya data Terverifikasi yang dapat divalidasi.');
        baru = STATUS_DATA.TERVALIDASI;
      } else if (aksiNama === 'Kembalikan') {
        if (menuAccess(cfgM).verify.indexOf(user.role) < 0 && menuAccess(cfgM).validate.indexOf(user.role) < 0) aksesDitolak_('Anda tidak berhak mengembalikan data.');
        if (!catatan) validasi_('Alasan pengembalian wajib diisi.');
        baru = STATUS_DATA.DIKEMBALIKAN;
      } else validasi_('Aksi tidak dikenal.');
      if (cfgM.kode === 'M17' && aksiNama === 'Verifikasi') { /* stok ditulis saat Terverifikasi distribusi */ }
      sh.getRange(row._row, h.indexOf('Status_Data') + 1).setValue(baru);
      if (catatan) sh.getRange(row._row, h.indexOf('Catatan_Verifikasi') + 1).setValue(sanitizeText_(catatan, 500));
      sh.getRange(row._row, h.indexOf('Updated_At') + 1).setValue(nowWita_());
      sh.getRange(row._row, h.indexOf('Updated_By') + 1).setValue(user.username);
      invalidasiCache_(CFG.CACHE_PREFIX.TRX);
      logAudit_(user, 'AKSI_' + aksiNama.toUpperCase(), cfgM.nama, 'ID: ' + id, 'OK');
      return ok_({ ID_Record: id, Status_Data: baru }, 'Status data menjadi ' + baru + '.');
    });
  }

  // ---------- Kartu Stok (ledger append-only) ----------
  function tulisStok_(user, rec, riwayat) {
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    var sh = getSheet_(ss, 'TRX_Kartu_Stok', headers_(cfgByKodeCache_('M20')));
    var h = headersOf_(sh);
    var sisa = 0;
    var rows = readAll_(sh).filter(function (r) { return !r.Is_Deleted && r.ID_Barang === rec.ID_Barang && r.ID_Faskes === rec.ID_Faskes; });
    if (rows.length) {
      rows.sort(function (a, b) { return String(a.Created_At).localeCompare(String(b.Created_At)); });
      sisa = toInt_(rows[rows.length - 1].Sisa) || 0;
    }
    var jml = toInt_(rec.Jml_Masuk || rec.Jml_Keluar) || 0;
    var sisaBaru = riwayat === 'Masuk' ? sisa + jml : sisa - jml;
    if (sisaBaru < 0) validasi_('Stok tidak mencukupi. Sisa stok: ' + sisa + '.');
    appendObj_(sh, h, {
      ID_Record: 'STK-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, 'TRX_Kartu_Stok')),
      Tanggal: rec.Tanggal, ID_Faskes: rec.ID_Faskes, ID_Barang: rec.ID_Barang, Riwayat: riwayat,
      Jml: jml, Sisa: sisaBaru, Referensi: rec.ID_Distribusi || rec.ID_Penerimaan || '', Keterangan: rec.Keterangan || '',
      Status_Data: STATUS_DATA.TERVALIDASI, Created_At: nowWita_(), Created_By: user.username, Version: 1
    });
  }
  function cfgByKodeCache_(kode) { return cfg(kode); }

  // Koreksi stok manual (Admin Kabupaten ke atas)
  function koreksiStok(user, idBarang, lokasi, jmlSelisih, alasan) {
    if ([ROLE.KAB, ROLE.PROV, ROLE.SUPER].indexOf(user.role) < 0) aksesDitolak_('Koreksi stok hanya oleh Admin Kabupaten ke atas.');
    if (!alasan) validasi_('Alasan koreksi wajib diisi.');
    return withLock_(function () {
      var ss = getSS_(CFG.KEY.SS_UTAMA);
      var sh = getSheet_(ss, 'TRX_Kartu_Stok', headers_(cfg('M20')));
      var h = headersOf_(sh);
      var rows = readAll_(sh).filter(function (r) { return !r.Is_Deleted && r.ID_Barang === idBarang && r.ID_Faskes === lokasi; });
      var sisa = 0;
      if (rows.length) { rows.sort(function (a, b) { return String(a.Created_At).localeCompare(String(b.Created_At)); }); sisa = toInt_(rows[rows.length - 1].Sisa) || 0; }
      var riwayat = jmlSelisih >= 0 ? 'Masuk' : 'Keluar';
      appendObj_(sh, h, {
        ID_Record: 'STK-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, 'TRX_Kartu_Stok')),
        Tanggal: todayWita_(), ID_Faskes: lokasi, ID_Barang: idBarang, Riwayat: 'Koreksi', Jml: Math.abs(jmlSelisih), Sisa: sisa + jmlSelisih,
        Referensi: '', Keterangan: alasan, Status_Data: STATUS_DATA.TERVALIDASI, Created_At: nowWita_(), Created_By: user.username, Version: 1
      });
      invalidasiCache_(CFG.CACHE_PREFIX.TRX);
      logAudit_(user, 'KOREKSI_STOK', 'Kartu Stok', idBarang + ' @ ' + lokasi + ': ' + jmlSelisih, 'OK');
      return ok_({ Sisa: sisa + jmlSelisih }, 'Koreksi stok tercatat.');
    });
  }

  // ---------- Validasi khusus Korban / Perkembangan (A4) ----------
  var TRANSISI = {
    'Luka Berat': ['Rawat Inap', 'Dirujuk', 'Sembuh', 'Meninggal'],
    'Luka Ringan': ['Rawat Jalan', 'Rawat Inap', 'Dirujuk', 'Sembuh', 'Meninggal'],
    'Rawat Inap': ['Dirujuk', 'Sembuh', 'Meninggal'],
    'Rawat Jalan': ['Rawat Inap', 'Dirujuk', 'Sembuh', 'Meninggal'],
    'Dirujuk': ['Rawat Inap', 'Sembuh', 'Meninggal'],
    'Hilang': ['Masih Hilang', 'Ditemukan Hidup', 'Meninggal'],
    'Masih Hilang': ['Ditemukan Hidup', 'Meninggal'],
    'Ditemukan Hidup': ['Rawat Inap', 'Rawat Jalan', 'Dirujuk', 'Sembuh', 'Meninggal']
  };
  function validasiPerkembangan_(user, rec) {
    if (rec.Status_Lanjutan === 'Dirujuk' && !rec.ID_Faskes_Tujuan_Rujuk) validasi_('Status Dirujuk wajib mengisi Faskes Tujuan Rujuk.');
    if ((rec.Status_Lanjutan === 'Rawat Inap' || rec.Status_Lanjutan === 'Rawat Jalan') && !rec.ID_Faskes_Perawatan) validasi_('Wajib mengisi Faskes Perawatan.');
    if (rec.Status_Lanjutan === 'Meninggal' && !rec.Tgl_Meninggal) validasi_('Status Meninggal wajib mengisi Tanggal Meninggal.');
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    var korban = readAll_(getSheet_(ss, 'TRX_Korban')).filter(function (r) { return r.ID_Record === rec.ID_Korban && !r.Is_Deleted; })[0];
    if (!korban) validasi_('Korban tidak ditemukan.');
    var asal = korban.Status_Awal;
    var sebelumnya = readAll_(getSheet_(ss, 'TRX_Korban_Perkembangan')).filter(function (r) { return !r.Is_Deleted && r.ID_Korban === rec.ID_Korban; })
      .sort(function (a, b) { return (String(a.Tanggal) + String(a.Created_At)).localeCompare(String(b.Tanggal) + String(b.Created_At)); });
    var terkini = asal;
    if (sebelumnya.length) terkini = sebelumnya[sebelumnya.length - 1].Status_Lanjutan;
    if (terkini === 'Meninggal' || terkini === 'Sembuh') validasi_('Status terkini korban sudah "' + terkini + '" (final). Perubahan hanya lewat baris koreksi oleh Admin Provinsi/Super Admin.');
    var izin = TRANSISI[terkini] || [];
    if (izin.indexOf(rec.Status_Lanjutan) < 0) validasi_('Transisi "' + terkini + '" menjadi "' + rec.Status_Lanjutan + '" tidak diizinkan.');
    var tglAwal = fmtIso_(korban.Tgl_Kejadian_Awal);
    if (tglAwal && rec.Tanggal < tglAwal) validasi_('Tanggal perkembangan tidak boleh lebih awal dari tanggal kejadian awal.');
    if (rec.Tanggal > todayWita_()) validasi_('Tanggal perkembangan tidak boleh di masa depan.');
    if (sebelumnya.length && rec.Tanggal < fmtIso_(sebelumnya[sebelumnya.length - 1].Tanggal)) validasi_('Tanggal perkembangan tidak boleh mundur dari perkembangan sebelumnya.');
  }

  // ---------- Ekspor CSV ----------
  function exportCsv(user, kode, p) {
    var data = list(user, kode, Object.assign({}, p, { pageSize: CFG.PAGESIZE_MAX, page: 1 }));
    var cfgM = data.cfg;
    var head = ['ID'].concat(cfgM.cols.filter(function (c) { return c.k !== 'ID_Record'; }).map(function (c) { return c.l; }));
    var lines = [head.join(',')];
    data.rows.forEach(function (r) {
      var arr = [r.ID_Record];
      cfgM.cols.forEach(function (c) {
        if (c.k === 'ID_Record') return;
        var v = c.ref ? (r[c.k + '_ref'] || r[c.k]) : r[c.k];
        v = (v === null || v === undefined) ? '' : String(v);
        if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
        arr.push(v);
      });
      lines.push(arr.join(','));
    });
    return { csv: '\uFEFF' + lines.join('\r\n'), nama: 'INDAKRIS_' + cfgM.nama.replace(/[^A-Za-z0-9]+/g, '_') + '_' + todayWita_() + '.csv' };
  }

  return {
    cfg: cfg, list: list, insert: insert, update: update, softDelete: softDelete, aksi: aksi,
    exportCsv: exportCsv, koreksiStok: koreksiStok, headers: headers_
  };
})();

function diagnosaEditRelawan() {
  var cfgM = Repo.cfg('M24');
  var sheetRows = readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'TRX_Relawan'));
  var tdm = sheetRows.filter(function (r) { return !r.Is_Deleted && r.Sumber_Modul === 'TDM'; })[0] || {};
  var u = { role: ROLE.KAB, idKabupaten: tdm.ID_Kabupaten || '', username: 'diagnosa' };
  var out = ['kode=' + cfgM.kode, 'readOnly=' + !!cfgM.readOnly, 'appendOnly=' + !!cfgM.appendOnly, 'ROLE.KAB=' + ROLE.KAB, 'idKab uji=' + u.idKabupaten];
  try { out.push('akses=' + JSON.stringify(menuAccess(cfgM))); } catch (e) { out.push('akses gagal: ' + e.message); }
  try {
    var r = Repo.list(u, 'M24', {});
    out.push('jumlah baris=' + r.rows.length);
    r.rows.slice(0, 3).forEach(function (x) { out.push(x.ID_Record + ' | status=' + x.Status_Data + ' | _editPenempatan=' + x._editPenempatan + ' | _editable=' + x._editable); });
  } catch (e) { out.push('Repo.list gagal: ' + e.message); }
  Logger.log(out.join('\n'));
}