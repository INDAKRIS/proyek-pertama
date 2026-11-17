/**
 * Diagnosa_Dashboard.gs — TAMBAHKAN sebagai berkas baru, lalu jalankan diagnosaDashboard() dari editor (menu Run).
 * Hasilnya muncul di Execution log. Setiap langkah dicoba terpisah supaya terlihat yang mana yang error.
 */
function diagnosaDashboard() {
  var out = [];
  function t(nama, fn) {
    try { out.push('OK    ' + nama + ' -> ' + fn()); }
    catch (e) { out.push('GAGAL ' + nama + ' -> ' + e.message + '  |  ' + String(e.stack || '').split('\n')[1]); }
  }
  t('Properti SS_RHA', function () { return getPropOpt_(CFG.KEY.SS_RHA) ? 'terisi' : 'KOSONG (jalankan runAllSetup)'; });
  t('Properti SS_UTAMA', function () { return getPropOpt_(CFG.KEY.SS_UTAMA) ? 'terisi' : 'KOSONG'; });
  t('Buka spreadsheet RHA', function () { return getSS_(CFG.KEY.SS_RHA).getName(); });
  t('Sheet sheetKejadian', function () { return readAll_(getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKejadian')).length + ' baris'; });
  t('Sheet sheetKabupaten', function () { return readAll_(getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKabupaten')).length + ' baris (harus 22)'; });
  t('rowsKejadianLayak_', function () { return rowsKejadianLayak_().length + ' kejadian disetujui'; });
  t('Tipe Tgl_Kejadian', function () { var r = rowsKejadianLayak_()[0]; return r ? (r.Tgl_Kejadian instanceof Date ? 'Date (normal di Sheets)' : typeof r.Tgl_Kejadian) : 'tidak ada baris'; });
  t('getKabupatenPublik_', function () { return getKabupatenPublik_().kabupaten.length + ' kabupaten'; });
  t('timBertugasGabungan_', function () { return timBertugasGabungan_().length + ' kabupaten dengan tim'; });
  t('getTimBertugasPerKabupaten_ TDM', function () { return Object.keys(getTimBertugasPerKabupaten_('TDM')).length + ' kab'; });
  t('getTimBertugasPerKabupaten_ TDP', function () { return Object.keys(getTimBertugasPerKabupaten_('TDP')).length + ' kab'; });
  t('getPublicDashboard({})', function () { var r = getPublicDashboard({}); return r.success ? 'sukses, kejadian=' + r.data.totals.kejadian : 'GAGAL: ' + r.message; });
  Logger.log(out.join('\n'));
  return out.join('\n');
}

function cekVersiRepo() {
  Logger.log('Repo.list: ' + (Repo.list.toString().indexOf('_editPenempatan') >= 0 ? 'BARU' : 'LAMA'));
  Logger.log('Repo.update: ' + (Repo.update.toString().indexOf('khususPenempatan') >= 0 ? 'BARU' : 'LAMA'));
}