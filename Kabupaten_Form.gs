/**
 * Kabupaten_Form.gs — TAMBAHKAN sebagai berkas baru di proyek Apps Script.
 * Memuat daftar kabupaten untuk formulir RHA dengan 3 lapis pengaman:
 *   1) cache  2) sheetKabupaten di database RHA  3) KABUPATEN_SEED (Config) bila sheet gagal/kosong.
 * Tidak memakai LockService, jadi tidak bisa terkena "Layanan sedang sibuk".
 */

function getKabupatenForm() {
  try {
    var key = CFG.CACHE_PREFIX.PUB + 'kabform';
    var hit = cacheGet_(key);
    if (hit && hit.length) return ok_({ kabupaten: hit });

    var daftar = [];
    try {
      var ss = getSS_(CFG.KEY.SS_RHA);
      daftar = readAll_(getSheet_(ss, 'sheetKabupaten'))
        .filter(function (r) { return r.ID_Kabupaten && String(r.Aktif).toUpperCase() !== 'FALSE'; })
        .sort(function (a, b) { return (Number(a.Urutan_Tampil) || 999) - (Number(b.Urutan_Tampil) || 999); })
        .map(function (r) { return { id: r.ID_Kabupaten, nama: r.Nama_Wilayah, slug: r.Slug }; });
    } catch (e) { logError_('getKabupatenForm.sheet', e); }

    if (!daftar.length) {
      daftar = KABUPATEN_SEED.map(function (k) { return { id: k[0], nama: k[2], slug: k[8] }; });
    }
    try { cachePut_(key, daftar, 600); } catch (e) {}
    return ok_({ kabupaten: daftar });
  } catch (e) { return galatUmum_(e, 'getKabupatenForm'); }
}

/** Dipakai submitLaporanRHA: cari kabupaten di sheet, jatuh ke seed bila tidak ada. */
function cariKabupaten_(ss, idKab) {
  try {
    var r = readAll_(getSheet_(ss, 'sheetKabupaten')).filter(function (x) { return x.ID_Kabupaten === idKab; })[0];
    if (r) return r;
  } catch (e) { logError_('cariKabupaten_', e); }
  var s = KABUPATEN_SEED.filter(function (k) { return k[0] === idKab; })[0];
  return s ? { ID_Kabupaten: s[0], Nama_Wilayah: s[2], Tipe_Wilayah: s[3] } : null;
}

/** Jalankan MANUAL dari editor (menu Run), lalu lihat Execution log. */
function diagnosaKabupaten() {
  var out = [];
  function t(nama, fn) { try { out.push('OK    ' + nama + ' -> ' + fn()); } catch (e) { out.push('GAGAL ' + nama + ' -> ' + e.message); } }
  t('Script Property SS_RHA', function () { return CFG.KEY.SS_RHA + ' = ' + (PropertiesService.getScriptProperties().getProperty(CFG.KEY.SS_RHA) || '(KOSONG)'); });
  t('Buka spreadsheet RHA', function () { return getSS_(CFG.KEY.SS_RHA).getName(); });
  t('Baris sheetKabupaten', function () { return readAll_(getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKabupaten')).length + ' (harus 22)'; });
  t('KABUPATEN_SEED', function () { return KABUPATEN_SEED.length + ' baris'; });
  t('Lock (tryLock 5 detik)', function () { var l = LockService.getScriptLock(); var ok = l.tryLock(5000); if (ok) l.releaseLock(); return ok ? 'bisa diambil' : 'TIDAK BISA — ada proses lain menahan lock'; });
  t('getKabupatenForm', function () { var r = getKabupatenForm(); return r.success ? r.data.kabupaten.length + ' kabupaten' : r.message; });
  t('getKabupatenPublik (asli)', function () { var r = getKabupatenPublik(); return r.success ? r.data.kabupaten.length + ' kabupaten' : r.message; });
  Logger.log(out.join('\n'));
  return out.join('\n');
}
