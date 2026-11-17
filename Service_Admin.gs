/**
 * Service_Admin.gs — Dashboard private (image N), master data (A02), log audit (A04),
 * konfigurasi (A03), arsip/backup (A05).
 */

function getPrivateDashboard(token) {
  try {
    var user = requireSession_(token, null, null);
    var key = CFG.CACHE.PUB + 'privdash::' + user.role + '::' + (user.idKabupaten || '') + (user.idFaskes || '');
    var hit = cacheGet_(key);
    if (hit) return ok_(hit);

    var korban = [];
    var pengungsiRows = [];
    var faskesRusak = 0;
    try {
      var kor = readAllCached_(CFG.KEY.SS_UTAMA, 'TRX_Korban').filter(function (r) { return !r.Is_Deleted; });
      korban = kor.filter(function (r) { return inScopeAdmin_(user, r); });
      pengungsiRows = readAllCached_(CFG.KEY.SS_UTAMA, 'TRX_Pengungsi').filter(function (r) { return !r.Is_Deleted && inScopeAdmin_(user, r); });
      faskesRusak = readAllCached_(CFG.KEY.SS_UTAMA, 'TRX_Penilaian_Kerusakan').filter(function (r) { return !r.Is_Deleted && inScopeAdmin_(user, r) && r.Tingkat_Kerusakan === 'Rusak Berat'; }).length;
    } catch (e) {}
    var kejadian = rowsKejadianLayak_().filter(function (r) { return inScopeAdmin_(user, { ID_Kabupaten: r.ID_Kabupaten }); });
    var menunggu = readAllCached_(CFG.KEY.SS_RHA, 'sheetKejadian').filter(function (r) { return r.Status_Verifikasi === 'Menunggu'; }).length;

    var korbanStatus = {};
    korban.forEach(function (r) { var s = r.Status_Awal || '-'; korbanStatus[s] = (korbanStatus[s] || 0) + 1; });

    var pengPerKab = {};
    pengungsiRows.forEach(function (r) {
      var k = r.ID_Kabupaten || 'Lainnya';
      pengPerKab[k] = (pengPerKab[k] || 0) + (toInt_(r.Jml_Jiwa) || 0);
    });
    var namaKab = {};
    try { readAllCached_(CFG.KEY.SS_RHA, 'sheetKabupaten', 600).forEach(function (r) { namaKab[r.ID_Kabupaten] = r.Nama_Wilayah; }); } catch (e) {}
    var pengArr = Object.keys(pengPerKab).map(function (k) { return { label: namaKab[k] || k, nilai: pengPerKab[k] }; }).sort(function (a, b) { return b.nilai - a.nilai; }).slice(0, 8);

    var data = {
      kpi: {
        kejadian: kejadian.length, korban: korban.length,
        pengungsi: pengungsiRows.reduce(function (a, r) { return a + (toInt_(r.Jml_Jiwa) || 0); }, 0),
        faskesTerdampak: faskesRusak, laporanMenunggu: menunggu
      },
      korbanStatus: Object.keys(korbanStatus).map(function (k) { return { label: k, nilai: korbanStatus[k] }; }),
      pengungsiPerWilayah: pengArr,
      pending: user.role === ROLE.SUPER || user.role === ROLE.PROV || user.role === ROLE.KAB || user.role === ROLE.PUSKESMAS ? null : null,
      diperbaruiPada: nowWita_()
    };
    cachePut_(key, data, 120);
    return ok_(data);
  } catch (e) { return galatUmum_(e, 'getPrivateDashboard'); }
}

function inScopeAdmin_(user, row) {
  if (user.role === ROLE.SUPER || user.role === ROLE.PROV) return true;
  if (user.role === ROLE.KAB) return row.ID_Kabupaten === user.idKabupaten;
  return row.ID_Faskes === user.idFaskes;
}

// ---------- Master Data (A02) ----------
function listMaster(token, jenis, p) {
  try {
    var user = requireSession_(token, 'A02', 'read');
    if (MASTER_TYPES.indexOf(jenis) < 0) aksesDitolak_('Jenis master tidak dikenal.');
    p = p || {};
    var rows = readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), MASTER_SHEET[jenis])).filter(function (r) { return !r.Is_Deleted; });
    if (p.search) { var q = String(p.search).toLowerCase(); rows = rows.filter(function (r) { return Object.keys(r).some(function (k) { return k !== '_row' && r[k] && String(r[k]).toLowerCase().indexOf(q) >= 0; }); }); }
    if (user.role === ROLE.KAB && rows.length && rows[0].ID_Kabupaten !== undefined) rows = rows.filter(function (r) { return !r.ID_Kabupaten || r.ID_Kabupaten === user.idKabupaten; });
    var pageSize = 20, page = Math.max(1, Number(p.page) || 1);
    var total = rows.length;
    var slice = rows.slice((page - 1) * pageSize, page * pageSize);
    return ok_({ jenis: jenis, rows: slice, page: page, total: total });
  } catch (e) { return galatUmum_(e, 'listMaster'); }
}

function saveMaster(token, jenis, payload) {
  try {
    var user = requireSession_(token, 'A02', 'write');
    var allowed = [ROLE.SUPER, ROLE.KAB];
    if (allowed.indexOf(user.role) < 0) aksesDitolak_('Hanya Admin Kabupaten/Super Admin.');
    if (MASTER_TYPES.indexOf(jenis) < 0) aksesDitolak_('Jenis master tidak dikenal.');
    payload = payload || {};
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    var sheetName = MASTER_SHEET[jenis];
    return withLock_(function () {
      var sh = getSheet_(ss, sheetName);
      var h = headersOf_(sh);
      var rec = {};
      h.forEach(function (k) { if (k !== 'Is_Deleted') rec[k] = payload[k] !== undefined ? sanitizeCell_(payload[k]) : ''; });
      var idKey = h[0];
      if (payload[idKey]) {
        var old = readAll_(sh).filter(function (r) { return r[idKey] === payload[idKey]; })[0];
        if (!old) return err_('Data tidak ditemukan.', 'VALIDASI');
        rec.Is_Deleted = old.Is_Deleted;
        sh.getRange(old._row, 1, 1, h.length).setValues([objToRow_(h, rec)]);
        logAudit_(user, 'UBAH_MASTER', sheetName, payload[idKey], 'OK');
        invalidasiCache_(CFG.CACHE.SYS); bumpData_();
        return ok_(rec, 'Master diperbarui.');
      }
      if (jenis === 'penyakit') return err_('Penyakit baru diusulkan melalui menu Master Penyakit dengan status Usulan.', 'VALIDASI');
      var seq = nextSeq_(ss, 'MASTER_' + jenis);
      rec[idKey] = String(payload[idKey] || ('MST-' + jenis.toUpperCase().substring(0, 3) + '-' + pad_(seq)));
      rec.Is_Deleted = '';
      appendObj_(sh, h, rec);
      logAudit_(user, 'TAMBAH_MASTER', sheetName, rec[idKey], 'OK');
      invalidasiCache_(CFG.CACHE.SYS); bumpData_();
      return ok_(rec, 'Master tersimpan.');
    });
  } catch (e) { return galatUmum_(e, 'saveMaster'); }
}

// ---------- Log Audit (A04) ----------
function getAuditLog(token, p) {
  try {
    var user = requireSession_(token, 'A04', 'read');
    p = p || {};
    var rows = readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Audit'));
    if (p.search) { var q = String(p.search).toLowerCase(); rows = rows.filter(function (r) { return Object.keys(r).some(function (k) { return k !== '_row' && r[k] && String(r[k]).toLowerCase().indexOf(q) >= 0; }); }); }
    if (p.aksi) rows = rows.filter(function (r) { return r.Aksi === p.aksi; });
    rows.sort(function (a, b) { return String(b.Timestamp).localeCompare(String(a.Timestamp)); });
    var pageSize = Math.min(Number(p.pageSize) || 25, CFG.PAGESIZE_MAX), page = Math.max(1, Number(p.page) || 1);
    return ok_({ rows: rows.slice((page - 1) * pageSize, page * pageSize), page: page, total: rows.length });
  } catch (e) { return galatUmum_(e, 'getAuditLog'); }
}

// ---------- Konfigurasi Sistem (A03) ----------
function getConfigSistem(token) {
  try {
    requireSession_(token, 'A03', 'read');
    var rows = readAll_(getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Config'));
    return ok_({ rows: rows.filter(function (r) { return r.Key; }) });
  } catch (e) { return galatUmum_(e, 'getConfigSistem'); }
}
function updateConfigSistem(token, key, value) {
  try {
    var user = requireSession_(token, 'A03', 'write');
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin.');
    return withLock_(function () {
      var sh = getSheet_(getSS_(CFG.KEY.SS_UTAMA), 'SYS_Config');
      var h = headersOf_(sh);
      var row = readAll_(sh).filter(function (r) { return r.Key === key; })[0];
      if (row) sh.getRange(row._row, h.indexOf('Value') + 1).setValue(sanitizeCell_(value));
      else sh.appendRow([key, sanitizeCell_(value)]);
      invalidasiCache_(CFG.CACHE.SYS);
      logAudit_(user, 'UBAH_KONFIG', 'Konfigurasi', key + ' => ' + value, 'OK');
      return ok_(null, 'Konfigurasi tersimpan.');
    });
  } catch (e) { return galatUmum_(e, 'updateConfigSistem'); }
}

// ---------- Arsip & Backup (A05) ----------
function buatBackupSekarang(token) {
  try {
    var user = requireSession_(token, 'A05', 'write');
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin.');
    var hasil = [];
    [[CFG.KEY.SS_UTAMA, CFG.NAME.SS_UTAMA], [CFG.KEY.SS_RHA, CFG.NAME.SS_RHA]].forEach(function (p) {
      try {
        var ss = getSS_(p[0]);
        var salinan = ss.makeCopy(p[1] + '_BACKUP_' + Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HHmm'), DriveApp.getRootFolder());
        hasil.push(salinan.getName());
      } catch (e) { logError_('backup', e); }
    });
    logAudit_(user, 'BACKUP', 'Arsip dan Backup', hasil.join(', '), 'OK');
    return ok_({ berkas: hasil }, hasil.length ? 'Backup dibuat: ' + hasil.join(', ') : 'Backup gagal dibuat.');
  } catch (e) { return galatUmum_(e, 'buatBackupSekarang'); }
}
