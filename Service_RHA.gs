/**
 * Service_RHA.gs — Menu Laporan RHA pada Dashboard Publik (Berkas B).
 * Form tanpa login, verifikasi Super Admin, penerbit ID_Kejadian (KJD-TAHUN-BULAN-NOMOR).
 *
 * [REVISI] Perubahan pada berkas ini:
 *  1. Satu laporan dapat mencakup LEBIH DARI 1 kabupaten: satu baris sheetKejadian per kabupaten, dikelompokkan
 *     lewat kolom ID_Peristiwa (PRS-TAHUN-BULAN-NOMOR). Kejadian lama tanpa ID_Peristiwa dianggap 1 peristiwa sendiri.
 *  2. Detail korban (Dampak Jiwa) dan detail faskes (Dampak Fasilitas Kesehatan) disimpan pada sheet
 *     sheetKorbanRHA dan sheetFaskesRHA (database RHA).
 *  3. Aturan sinkron: kejadian besar/masif -> diteruskan ke Menu Korban (TRX_Korban) dan Menu Faskes (Kondisi)
 *     (TRX_Faskes_Kondisi) saat DISETUJUI; kejadian kecil berhenti di RHA. Verifikator (Super Admin) dapat mengubah
 *     tujuan secara manual ("Teruskan ke Privat" / "Cukup di RHA"). Data hasil sinkron DIPERBARUI (bukan digandakan)
 *     dengan penanda Sumber_RHA = "RHA:<ID_Kejadian>" dan dinonaktifkan bila laporan ditolak/dikembalikan/dihapus.
 *  4. [REVISI 2] Detail korban (nama, usia, jenis kelamin, kategori usia, alamat) kini DAPAT diisi untuk SEMUA kejadian,
 *     termasuk kejadian berskala kecil. Status "besar dan masif" tetap menentukan tujuan sinkron (Privat/RHA), bukan lagi
 *     menentukan boleh-tidaknya detail korban disimpan. Detail faskes sudah berlaku untuk semua kejadian.
 *  5. [REVISI 3] Ambang Meninggal dan Hilang menjadi 3 (Config.gs). Detail korban bersifat OPSIONAL: pelapor boleh hanya mengisi jumlah
 *     (Meninggal, LB/RI, LR/RJ, Hilang) tanpa nama/usia/jenis kelamin/alamat; server menerima daftar detail kosong.
 */

var RHA_HEADERS = ['ID_Kejadian', 'Tahun', 'Bulan', 'Jenis_Bencana', 'Kategori_Bencana', 'Tgl_Kejadian', 'Waktu_Kejadian', 'Tanggal_Input', 'Diubah_Pada',
  'ID_Kabupaten', 'Kabupaten_Kota', 'Tipe_Wilayah', 'ID_Kecamatan', 'Kecamatan', 'Penyebab_Kronologis',
  'Meninggal', 'LB_RI', 'LR_RJ', 'Hilang', 'Pengungsi', 'Penduduk_Terdampak_Jiwa', 'Penduduk_Terdampak_KK',
  'RS_Rusak_Berat', 'RS_Rusak_Sedang', 'RS_Rusak_Ringan', 'Puskesmas_Rusak_Berat', 'Puskesmas_Rusak_Sedang', 'Puskesmas_Rusak_Ringan',
  'Pustu_Rusak_Berat', 'Pustu_Rusak_Sedang', 'Pustu_Rusak_Ringan',
  'Ketersediaan_Sumber_Daya', 'Upaya_Penanggulangan', 'Bantuan_Diperlukan_Segera', 'Rekomendasi',
  'ID_Folder_Drive', 'URL_Laporan_PDF', 'URL_Foto', 'URL_Berita',
  'Status_Verifikasi', 'Diverifikasi_Oleh', 'Tanggal_Verifikasi', 'Catatan_Verifikasi', 'Tampil_Publik',
  'Sumber_Input', 'Nama_Pelapor', 'Kontak_Pelapor', 'Input_By', 'Level_User', 'Versi',
  // [BARU] lintas kabupaten + aturan sinkron ke Menu Privat
  'ID_Peristiwa', 'Dampak_Besar', 'Alasan_Dampak_Besar', 'Tujuan_Sinkron', 'Mode_Sinkron', 'Status_Sinkron', 'Tgl_Sinkron', 'Catatan_Sinkron'];

// [BARU] Sheet detail (database RHA). Data nama/alamat korban HANYA di sini dan di Menu Privat, tidak pernah dikirim ke dashboard publik.
var RHA_KORBAN_HEADERS = ['ID_Detail', 'ID_Kejadian', 'ID_Peristiwa', 'ID_Kabupaten', 'Status_Awal', 'Nama', 'Usia', 'Usia_Bulan', 'Kategori_Usia', 'Jenis_Kelamin', 'Alamat', 'Dibuat_Pada'];
var RHA_FASKES_HEADERS = ['ID_Detail', 'ID_Kejadian', 'ID_Peristiwa', 'ID_Kabupaten', 'Jenis_Faskes', 'Tingkat_Kerusakan', 'ID_Faskes', 'Nama_Faskes', 'Lainnya', 'Dibuat_Pada'];
var RHA_MAKS_DETAIL_KORBAN = 500;
var RHA_MAKS_DETAIL_FASKES = 200;

function rhaSheet_() {
  var sh = getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKejadian', RHA_HEADERS);
  var h = headersOf_(sh);
  var miss = RHA_HEADERS.filter(function (k) { return h.indexOf(k) < 0; });
  if (miss.length) sh.getRange(1, h.length + 1, 1, miss.length).setValues([miss]); // kolom baru ditambahkan di kanan; sheet lama tetap aman
  return sh;
}
function rhaKorbanSheet_() { return getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetKorbanRHA', RHA_KORBAN_HEADERS); }
function rhaFaskesSheet_() { return getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetFaskesRHA', RHA_FASKES_HEADERS); }
function rhaLog_(aksi, id, user, ket) {
  try { getSheet_(getSS_(CFG.KEY.SS_RHA), 'sheetLog', ['Timestamp', 'Aksi', 'ID_Kejadian', 'User', 'Keterangan']).appendRow([nowWita_(), aksi, id, user, sanitizeCell_(ket)]); } catch (e) {}
}
function invalidateRHA_() { invalidasiCache_(CFG.CACHE.RHA); invalidasiCache_(CFG.CACHE.PUB); invalidasiCache_(CFG.CACHE.WIL); bumpData_(); }

// ---------- Util kecil ----------
function rhaBool_(v) { return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === 'Ya'; }
function peristiwaOf_(r) { return String((r && (r.ID_Peristiwa || r.ID_Kejadian)) || ''); }
function rhaTulisBaris_(sh, h, rowNum, obj) {
  var vals = sh.getRange(rowNum, 1, 1, h.length).getValues()[0];
  Object.keys(obj).forEach(function (k) { var i = h.indexOf(k); if (i >= 0) vals[i] = sanitizeCell_(obj[k]); });
  sh.getRange(rowNum, 1, 1, h.length).setValues([vals]);
}
function rhaBacaDetailCached_(nama) {
  try { return readAllCached_(CFG.KEY.SS_RHA, nama); } catch (e) { if (/^SHEET_TIDAK_ADA/.test(String(e && e.message))) return []; throw e; }
}
function jenisFaskesNorm_(j) {
  var s = String(j || '').toLowerCase();
  if (/pustu|pembantu/.test(s)) return 'Pustu';
  if (/puskesmas|pkm/.test(s)) return 'Puskesmas';
  if (/(^|[^a-z])rs([^a-z]|$)|rumah sakit|rsud|rsu|rsia/.test(s)) return 'RS';
  return '';
}

// ---------- [BARU] Aturan "kejadian besar dan masif" (ambang di Config.gs: RHA_AMBANG) ----------
function hitungDampakBesar_(a, jmlKab, ditandaiPelapor) {
  var A = RHA_AMBANG, al = [];
  function n(k) { return Number(a[k]) || 0; }
  if (n('Meninggal') >= A.meninggal) al.push('Meninggal minimal ' + A.meninggal + ' jiwa');
  if (n('Hilang') >= A.hilang) al.push('Hilang minimal ' + A.hilang + ' jiwa');
  if (n('LB_RI') >= A.lbRi) al.push('Luka berat/rawat inap minimal ' + A.lbRi + ' jiwa');
  if (n('Pengungsi') >= A.pengungsi) al.push('Pengungsi minimal ' + A.pengungsi + ' jiwa');
  if (n('Penduduk_Terdampak_Jiwa') >= A.terdampakJiwa) al.push('Penduduk terdampak minimal ' + A.terdampakJiwa + ' jiwa');
  if (n('RS_Rusak_Berat') + n('Puskesmas_Rusak_Berat') + n('Pustu_Rusak_Berat') >= A.faskesRusakBerat) al.push('Ada fasilitas kesehatan rusak berat');
  if (jmlKab >= A.lintasKabupaten) al.push('Peristiwa mencakup lebih dari 1 kabupaten');
  if (ditandaiPelapor) al.push('Ditandai pelapor sebagai kejadian besar/masif');
  return { besar: al.length > 0, alasan: al };
}

// ---------- Kirim laporan TANPA LOGIN ----------
var RHA_ANGKA = ['Meninggal', 'LB_RI', 'LR_RJ', 'Hilang', 'Pengungsi', 'Penduduk_Terdampak_Jiwa', 'Penduduk_Terdampak_KK',
  'RS_Rusak_Berat', 'RS_Rusak_Sedang', 'RS_Rusak_Ringan', 'Puskesmas_Rusak_Berat', 'Puskesmas_Rusak_Sedang', 'Puskesmas_Rusak_Ringan',
  'Pustu_Rusak_Berat', 'Pustu_Rusak_Sedang', 'Pustu_Rusak_Ringan'];

// Angka satu kabupaten: bulat >= 0, kosong dianggap 0. (Perbaikan: versi lama memakai "return err_" di dalam forEach sehingga tidak pernah menolak.)
function rhaBersihAngka_(src) {
  var angka = {};
  RHA_ANGKA.forEach(function (k) {
    var raw = src[k];
    var v = (raw === '' || raw === undefined || raw === null) ? 0 : toInt_(raw);
    if (v === null || v < 0) validasi_('Kolom angka tidak sah (harus bulat >= 0): ' + k);
    angka[k] = v;
  });
  var totalJiwa = angka.Meninggal + angka.LB_RI + angka.LR_RJ + angka.Hilang;
  if (angka.Penduduk_Terdampak_Jiwa < totalJiwa) validasi_('Penduduk Terdampak (jiwa) tidak boleh lebih kecil dari jumlah Meninggal + LB/RI + LR/RJ + Hilang.');
  return angka;
}

// Detail korban: berlaku untuk SEMUA kejadian (kecil maupun besar/masif). Parameter "besar" dipertahankan agar pemanggil lama tetap sah, tetapi tidak lagi membatasi.
// Jumlah baris per status tidak boleh melebihi angka ringkasan
// (boleh lebih sedikit: korban yang belum teridentifikasi tidak dibuatkan baris).
function rhaBersihKorban_(list, angka, besar) {
  if (!Array.isArray(list) || !list.length) return [];
  if (list.length > RHA_MAKS_DETAIL_KORBAN) validasi_('Detail korban terlalu banyak (maksimal ' + RHA_MAKS_DETAIL_KORBAN + ' baris per kabupaten).');
  var kolomDari = {}, hitung = {};
  RHA_STATUS_KORBAN.forEach(function (p) { kolomDari[p[1]] = p[0]; hitung[p[1]] = 0; });
  var out = list.map(function (d, i) {
    var no = 'Detail korban baris ' + (i + 1) + ': ';
    var status = sanitizeText_(d.status, 30);
    if (!kolomDari[status]) validasi_(no + 'status tidak sah.');
    var nama = sanitizeText_(d.nama, 150);
    if (nama.length < 2) validasi_(no + 'nama wajib diisi (minimal 2 huruf).');
    var usia = toInt_(d.usia);
    if (usia === null || usia < 0 || usia > 120) validasi_(no + 'usia harus 0 sampai 120 tahun.');
    var bulan = '';
    if (usia <= 1) {
      bulan = toInt_(d.usiaBulan);
      if (bulan === null || bulan < 0 || bulan > 11) validasi_(no + 'usia (bulan) wajib diisi 0 sampai 11 untuk usia 0 atau 1 tahun.');
    }
    var jk = sanitizeText_(d.jk, 20);
    if (jk !== 'Laki-laki' && jk !== 'Perempuan') validasi_(no + 'jenis kelamin wajib dipilih.');
    hitung[status]++;
    return { Status_Awal: status, Nama: nama, Usia: usia, Usia_Bulan: bulan, Kategori_Usia: kategoriUsia_(usia, bulan), Jenis_Kelamin: jk, Alamat: sanitizeText_(d.alamat, 300) };
  });
  RHA_STATUS_KORBAN.forEach(function (p) {
    if (hitung[p[1]] > (angka[p[0]] || 0)) validasi_('Detail korban berstatus ' + p[1] + ' (' + hitung[p[1]] + ' baris) melebihi jumlah pada ringkasan (' + (angka[p[0]] || 0) + ').');
  });
  return out;
}

// Detail faskes: jumlah per (jenis x tingkat) tidak boleh melebihi angka ringkasan. ID_Faskes kosong = "Lainnya" (nama diketik).
function rhaBersihFaskes_(list, angka) {
  if (!Array.isArray(list) || !list.length) return [];
  if (list.length > RHA_MAKS_DETAIL_FASKES) validasi_('Detail faskes terlalu banyak (maksimal ' + RHA_MAKS_DETAIL_FASKES + ' baris per kabupaten).');
  var hitung = {}, pakai = {};
  var out = list.map(function (d, i) {
    var no = 'Detail faskes baris ' + (i + 1) + ': ';
    var jenis = sanitizeText_(d.jenis, 20), tingkat = sanitizeText_(d.tingkat, 20);
    if (RHA_JENIS_FASKES.indexOf(jenis) < 0) validasi_(no + 'jenis faskes tidak sah.');
    if (RHA_TINGKAT_FASKES.indexOf(tingkat) < 0) validasi_(no + 'tingkat kerusakan tidak sah.');
    var idFaskes = sanitizeText_(d.idFaskes, 40), nama = sanitizeText_(d.nama, 200);
    if (!idFaskes && !nama) validasi_(no + 'pilih faskes atau isi nama faskes (Lainnya).');
    if (idFaskes) { if (pakai[idFaskes]) validasi_(no + 'faskes yang sama dipilih lebih dari sekali.'); pakai[idFaskes] = 1; }
    var kunci = jenis + '_' + tingkat.replace(' ', '_');
    hitung[kunci] = (hitung[kunci] || 0) + 1;
    return { Jenis_Faskes: jenis, Tingkat_Kerusakan: tingkat, ID_Faskes: idFaskes, Nama_Faskes: nama, Lainnya: idFaskes ? 'FALSE' : 'TRUE' };
  });
  Object.keys(hitung).forEach(function (k) {
    if (hitung[k] > (angka[k] || 0)) validasi_('Detail faskes ' + k.replace(/_/g, ' ') + ' (' + hitung[k] + ' baris) melebihi jumlah pada ringkasan (' + (angka[k] || 0) + ').');
  });
  return out;
}

// Isi nama faskes dari master (REF_Faskes) dan tolak ID yang tidak dikenal
function rhaLengkapiFaskes_(rows) {
  if (!rows.some(function (x) { return x.ID_Faskes; })) return rows;
  var master = {};
  readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Faskes', 300).forEach(function (r) { if (!rhaBool_(r.Is_Deleted)) master[r.ID_Faskes] = r; });
  rows.forEach(function (x) {
    if (!x.ID_Faskes) return;
    var m = master[x.ID_Faskes];
    if (!m) validasi_('Faskes yang dipilih tidak ditemukan pada master. Muat ulang formulir.');
    x.Nama_Faskes = m.Nama_Faskes;
  });
  return rows;
}

// Daftar referensi untuk formulir publik: kabupaten, faskes (RS/Puskesmas/Pustu), opsi kategori usia, ambang kejadian besar
function getReferensiFormRHA() {
  try {
    var kab = readAllCached_(CFG.KEY.SS_RHA, 'sheetKabupaten', 600).filter(function (r) { return r.Aktif !== false && r.Aktif !== 'FALSE'; })
      .sort(function (a, b) { return (toInt_(a.Urutan_Tampil) || 99) - (toInt_(b.Urutan_Tampil) || 99); })
      .map(function (r) { return { id: r.ID_Kabupaten, nama: r.Nama_Wilayah }; });
    var faskes = [];
    try {
      readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Faskes', 300).forEach(function (r) {
        if (rhaBool_(r.Is_Deleted)) return;
        var j = jenisFaskesNorm_(r.Jenis_Faskes) || jenisFaskesNorm_(r.Nama_Faskes);
        if (j) faskes.push([r.ID_Faskes, r.Nama_Faskes, r.ID_Kabupaten, j]);
      });
    } catch (e) { logError_('getReferensiFormRHA.faskes', e); }
    return ok_({ kabupaten: kab, faskes: faskes, opsiUsia: { bayi: korbanCfg_().BAYI, kategori: korbanCfg_().KATEGORI }, ambang: RHA_AMBANG });
  } catch (e) { return galatUmum_(e, 'getReferensiFormRHA'); }
}

// Daftar jenis bencana resmi (urutan sama dengan dropdown formulir). Kategori dipakai bila sheetRef belum memuat jenis tsb.
var RHA_JENIS_BENCANA = {
  'Banjir': 'Alam',
  'Letusan Gunung Berapi': 'Alam',
  'Gempa Bumi': 'Alam',
  'Gempa Bumi & Tsunami': 'Alam',
  'Tanah Longsor': 'Alam',
  'Banjir Bandang': 'Alam',
  'Kekeringan': 'Alam',
  'Angin Puting Beliung': 'Alam',
  'Gelombang Pasang/Badai': 'Alam',
  'Banjir dan Tanah Longsor': 'Alam',
  'Tsunami': 'Alam',
  'Tersambar Petir': 'Alam',
  'Semburan Lumpur/Gas': 'Non Alam',
  'Kebakaran': 'Non Alam',
  'Kebakaran Hutan dan Lahan': 'Alam',
  'Kecelakaan Transportasi Darat': 'Non Alam',
  'Kecelakaan Transportasi Laut-Udara': 'Non Alam',
  'Kecelakaan Industri': 'Non Alam',
  'Kejadian Luar Biasa (KLB) - Penyakit': 'Non Alam',
  'Kejadian Luar Biasa (KLB) - Keracunan': 'Non Alam',
  'Gagal Teknologi': 'Non Alam',
  'Wabah Penyakit (Epidemi - Pandemi)': 'Non Alam',
  'Konflik Sosial atau Kerusuhan Sosial': 'Sosial',
  'Aksi Teror dan Sabotase': 'Sosial'
};

function submitLaporanRHA(payload) {
  try {
    payload = payload || {};
    if (payload.honeypot) return err_('Pengiriman ditolak.', 'AKSES');
    var devKey = CFG.CACHE.RHA + 'kirim::' + sha256Hex_(String(payload.deviceToken || 'umum')).substring(0, 16);
    var n = cacheGet_(devKey) || 0;
    if (n >= 5) return err_('Batas pengiriman per jam tercapai. Coba lagi nanti.', 'AKSES');

    var tgl = parseDateSafe_(payload.tglKejadian);
    if (!tgl) return err_('Tanggal kejadian wajib diisi dan sah.', 'VALIDASI');
    if (tgl > new Date()) return err_('Tanggal kejadian tidak boleh melewati hari ini.', 'VALIDASI');
    var jenis = sanitizeText_(payload.jenisBencana, 100);
    var kronologi = sanitizeText_(payload.kronologi, 2000);
    if (!jenis || !kronologi) return err_('Jenis bencana dan kronologi wajib diisi.', 'VALIDASI');

    // Format baru: payload.kabupaten = [{ idKabupaten, kecamatan, angka:{...}, korban:[...], faskes:[...] }]
    // Format lama (1 kabupaten, angka di tingkat atas) tetap diterima.
    var daftar = payload.kabupaten;
    if (!Array.isArray(daftar) || !daftar.length) daftar = [{ idKabupaten: payload.idKabupaten, kecamatan: payload.kecamatan, angka: payload, korban: [], faskes: payload.faskes }];
    if (daftar.length > 22) return err_('Jumlah kabupaten terlalu banyak.', 'VALIDASI');
    var jmlKab = daftar.length, ditandai = !!payload.besarManual, dipilih = {};

    var blok = daftar.map(function (d) {
      var idKab = sanitizeText_(d.idKabupaten, 40);
      if (!idKab) validasi_('Kabupaten wajib dipilih.');
      if (dipilih[idKab]) validasi_('Kabupaten yang sama dipilih lebih dari sekali.');
      dipilih[idKab] = 1;
      var angka = rhaBersihAngka_(d.angka || d);
      var nilai = hitungDampakBesar_(angka, jmlKab, ditandai);
      return { idKab: idKab, kecamatan: sanitizeText_(d.kecamatan, 500), angka: angka, nilai: nilai,
        korban: rhaBersihKorban_(d.korban, angka, nilai.besar), faskes: rhaBersihFaskes_(d.faskes, angka) };
    });

    var narasi = ['Ketersediaan_Sumber_Daya', 'Upaya_Penanggulangan', 'Bantuan_Diperlukan_Segera', 'Rekomendasi'].map(function (k) { return [k, sanitizeText_(payload[k] || '', 2000)]; });
    var namaPelapor = sanitizeText_(payload.namaPelapor, 100), kontakPelapor = sanitizeText_(payload.kontakPelapor, 60);
    var urlFoto = sanitizeText_(payload.urlFoto, 300), urlBerita = sanitizeText_(payload.urlBerita, 300);

    var hasil = withLock_(function () {
      var ss = getSS_(CFG.KEY.SS_RHA);
      var kabAll = readAll_(getSheet_(ss, 'sheetKabupaten'));
      var refRows = readAll_(getSheet_(ss, 'sheetRef', ['Tipe', 'Nama', 'Kategori', 'Ikon'])).filter(function (r) { return r.Tipe === 'JENIS_BENCANA'; });
      var jenisOk = refRows.filter(function (r) { return r.Nama === jenis; })[0];
      if (!jenisOk && RHA_JENIS_BENCANA.hasOwnProperty(jenis)) jenisOk = { Nama: jenis, Kategori: RHA_JENIS_BENCANA[jenis] };
      if (!jenisOk) validasi_('Jenis bencana tidak dikenal.');
      blok.forEach(function (b) {
        b.kab = kabAll.filter(function (r) { return r.ID_Kabupaten === b.idKab; })[0];
        if (!b.kab) validasi_('Kabupaten tidak dikenal.');
        rhaLengkapiFaskes_(b.faskes);
      });

      var tahun = Utilities.formatDate(tgl, CFG.TZ, 'yyyy'), bulan = Utilities.formatDate(tgl, CFG.TZ, 'MM');
      var idP = 'PRS-' + tahun + '-' + bulan + '-' + pad_(nextSeq_(ss, 'PRS-' + tahun + '-' + bulan));
      var sh = rhaSheet_(), h = headersOf_(sh);
      var korbanRows = [], faskesRows = [], ids = [];

      blok.forEach(function (b) {
        var id = 'KJD-' + tahun + '-' + bulan + '-' + pad_(nextSeq_(ss, 'KJD-' + tahun + '-' + bulan));
        var rec = {};
        rec.ID_Kejadian = id; rec.Tahun = tahun; rec.Bulan = bulan; rec.Jenis_Bencana = jenis; rec.Kategori_Bencana = jenisOk.Kategori;
        rec.Tgl_Kejadian = Utilities.formatDate(tgl, CFG.TZ, 'yyyy-MM-dd'); rec.Waktu_Kejadian = sanitizeText_(payload.waktuKejadian || '', 10);
        rec.Tanggal_Input = nowWita_(); rec.Diubah_Pada = nowWita_();
        rec.ID_Kabupaten = b.kab.ID_Kabupaten; rec.Kabupaten_Kota = b.kab.Nama_Wilayah; rec.Tipe_Wilayah = b.kab.Tipe_Wilayah;
        rec.ID_Kecamatan = ''; rec.Kecamatan = b.kecamatan;
        rec.Penyebab_Kronologis = kronologi;
        RHA_ANGKA.forEach(function (k) { rec[k] = b.angka[k]; });
        narasi.forEach(function (p) { rec[p[0]] = p[1]; });
        rec.ID_Folder_Drive = ''; rec.URL_Laporan_PDF = ''; rec.URL_Foto = urlFoto; rec.URL_Berita = urlBerita;
        rec.Status_Verifikasi = 'Menunggu'; rec.Diverifikasi_Oleh = ''; rec.Tanggal_Verifikasi = ''; rec.Catatan_Verifikasi = ''; rec.Tampil_Publik = 'FALSE';
        rec.Sumber_Input = 'Publik'; rec.Nama_Pelapor = namaPelapor; rec.Kontak_Pelapor = kontakPelapor;
        rec.Input_By = 'PUBLIK'; rec.Level_User = ''; rec.Versi = 1;
        rec.ID_Peristiwa = idP; rec.Dampak_Besar = b.nilai.besar ? 'Ya' : 'Tidak'; rec.Alasan_Dampak_Besar = b.nilai.alasan.join('; ');
        rec.Tujuan_Sinkron = b.nilai.besar ? 'Privat' : 'RHA'; rec.Mode_Sinkron = 'Otomatis'; rec.Status_Sinkron = 'Belum'; rec.Tgl_Sinkron = ''; rec.Catatan_Sinkron = '';
        appendObj_(sh, h, rec);
        ids.push({ id: id, kabupaten: b.kab.Nama_Wilayah });

        b.korban.forEach(function (x, i) {
          korbanRows.push({ ID_Detail: id + '-K' + pad_(i + 1, 3), ID_Kejadian: id, ID_Peristiwa: idP, ID_Kabupaten: b.kab.ID_Kabupaten, Status_Awal: x.Status_Awal, Nama: x.Nama,
            Usia: x.Usia, Usia_Bulan: x.Usia_Bulan, Kategori_Usia: x.Kategori_Usia, Jenis_Kelamin: x.Jenis_Kelamin, Alamat: x.Alamat, Dibuat_Pada: nowWita_() });
        });
        b.faskes.forEach(function (x, i) {
          faskesRows.push({ ID_Detail: id + '-F' + pad_(i + 1, 3), ID_Kejadian: id, ID_Peristiwa: idP, ID_Kabupaten: b.kab.ID_Kabupaten, Jenis_Faskes: x.Jenis_Faskes,
            Tingkat_Kerusakan: x.Tingkat_Kerusakan, ID_Faskes: x.ID_Faskes, Nama_Faskes: x.Nama_Faskes, Lainnya: x.Lainnya, Dibuat_Pada: nowWita_() });
        });
        rhaLog_('KIRIM', id, 'PUBLIK', 'Laporan RHA baru dari formulir publik (peristiwa ' + idP + ', ' + jmlKab + ' kabupaten, dampak besar: ' + rec.Dampak_Besar + ')');
      });
      if (korbanRows.length) writeAllObjs_(rhaKorbanSheet_(), RHA_KORBAN_HEADERS, korbanRows);
      if (faskesRows.length) writeAllObjs_(rhaFaskesSheet_(), RHA_FASKES_HEADERS, faskesRows);
      invalidateRHA_();
      return { idPeristiwa: idP, ids: ids };
    });
    cachePut_(devKey, n + 1, 3600);
    var utama = hasil.ids.length === 1 ? hasil.ids[0].id : hasil.idPeristiwa;
    return ok_({ idKejadian: utama, idPeristiwa: hasil.idPeristiwa, laporan: hasil.ids },
      'Laporan diterima dan menunggu verifikasi Super Admin. Simpan ID laporan Anda: ' + utama);
  } catch (e) { return galatUmum_(e, 'submitLaporanRHA'); }
}

// ---------- Cek status (tanpa isi laporan) ----------
// cekStatusLaporanRHA ada di Service_Public.gs

// ---------- Daftar kejadian untuk dropdown tim TDM/TDP (publik, baca saja) ----------
function getDaftarKejadianTersedia(filter) {
  try {
    filter = filter || {};
    var key = CFG.CACHE.RHA + 'tersedia::' + JSON.stringify(filter);
    var hit = cacheGet_(key);
    if (hit) return ok_(hit);
    var rows = rowsKejadianLayak_();
    if (filter.idKabupaten) rows = rows.filter(function (r) { return r.ID_Kabupaten === filter.idKabupaten; });
    if (filter.search) { var q = String(filter.search).toLowerCase(); rows = rows.filter(function (r) { return (r.Jenis_Bencana + ' ' + r.Kabupaten_Kota + ' ' + r.ID_Kejadian).toLowerCase().indexOf(q) >= 0; }); }
    rows.sort(function (a, b) { return String(b.Tgl_Kejadian).localeCompare(String(a.Tgl_Kejadian)); });
    var data = rows.slice(0, 200).map(function (r) {
      return { id: r.ID_Kejadian, jenis: r.Jenis_Bencana, tgl: fmtDate_(r.Tgl_Kejadian), kabupaten: r.Kabupaten_Kota, idKabupaten: r.ID_Kabupaten, label: r.Jenis_Bencana + ' — ' + fmtDate_(r.Tgl_Kejadian) + ' — ' + r.Kabupaten_Kota };
    });
    cachePut_(key, data, 300);
    return ok_(data);
  } catch (e) { return galatUmum_(e, 'getDaftarKejadianTersedia'); }
}

// Snapshot kejadian untuk modul tim (PRIVAT; kepercayaan server)
function getKejadianSnapshot_(idKejadian) {
  var r = rowsKejadianLayak_().filter(function (x) { return x.ID_Kejadian === idKejadian; })[0];
  if (!r) return null;
  return { ID_Kejadian: r.ID_Kejadian, Nama_Kejadian: r.Jenis_Bencana, Jenis_Bencana: r.Jenis_Bencana, Tanggal_Kejadian: fmtIso_(r.Tgl_Kejadian), ID_Kabupaten: r.ID_Kabupaten, Kabupaten: r.Kabupaten_Kota };
}
function hitungTautanKejadian_(idKejadian) {
  return hitungTimUntukKejadian_('TDM', idKejadian) + hitungTimUntukKejadian_('TDP', idKejadian);
}

// ============================================================
// [BARU] SINKRON KE MENU PRIVAT (Korban = TRX_Korban, Faskes Kondisi = TRX_Faskes_Kondisi)
// Dipanggil DI DALAM LockService. Idempoten: dijalankan berulang = memperbarui baris yang sama.
// ============================================================
var RHA_KOL_EKSTRA = ['Sumber_RHA', 'ID_Peristiwa', 'ID_Kejadian_RHA'];
var RHA_STATUS_TERKUNCI = ['Terverifikasi', 'Tervalidasi']; // data yang sudah diverifikasi di Menu Privat tidak ditimpa oleh sinkron

function rhaDetailDari_(sh, idKejadian) { return readAll_(sh).filter(function (x) { return x.ID_Kejadian === idKejadian; }); }

// Sinkron satu jenis data. bangun(d, id) -> objek baris; hasil = {baru, diperbarui, dilewati, dinonaktifkan}
function rhaSinkronTabel_(kode, kolomEkstra, marker, prefixId, detailRows, bangun) {
  var T = Repo.siapkanSheetSinkron(kode, kolomEkstra), sh = T.sh, h = T.h, now = nowWita_();
  var hasil = { baru: 0, diperbarui: 0, dilewati: 0, dinonaktifkan: 0 }, dipakai = {}, baru = [];
  var ada = {};
  readAll_(sh).forEach(function (x) { if (x.Sumber_RHA === marker) ada[x[T.idKey]] = x; });

  detailRows.forEach(function (d) {
    var id = prefixId + String(d.ID_Detail).replace(/^.*-([KF]\d{3})$/, '$1').replace(/^[KF]/, '');
    dipakai[id] = 1;
    var rec = bangun(d, id);
    var ex = ada[id];
    if (!ex) {
      rec[T.idKey] = id; rec.Status_Data = T.status.DIAJUKAN; rec.Catatan_Verifikasi = ''; rec.Version = 1; rec.Request_ID = 'RHA-' + id;
      rec.Created_At = now; rec.Created_By = 'RHA:SISTEM'; rec.Updated_At = now; rec.Updated_By = 'RHA:SISTEM'; rec.Is_Deleted = '';
      rec.Sumber_RHA = marker;
      baru.push(objToRow_(h, rec)); hasil.baru++;
      return;
    }
    if (RHA_STATUS_TERKUNCI.indexOf(ex.Status_Data) >= 0) { hasil.dilewati++; return; } // sudah diverifikasi di Menu Privat
    // [PERUBAHAN KORBAN] Kolom yang dilengkapi petugas di Menu Korban tidak ditimpa ulang oleh sinkron RHA bila sudah terisi
    if (kode === 'M25') ['Kecamatan', 'Diagnosa', 'Kewarganegaraan', 'Lokasi_Perawatan', 'Rujukan', 'Tujuan_Rujukan', 'Lokasi_Kejadian'].forEach(function (k) {
      if (String(ex[k] === undefined || ex[k] === null ? '' : ex[k]).trim() !== '') delete rec[k];
    });
    // [PERUBAHAN FASKES] Alamat dan Kecamatan yang sudah dilengkapi petugas di Menu Faskes (Kondisi) tidak ditimpa ulang oleh sinkron RHA
    if (kode === 'M02') ['Alamat', 'Kecamatan'].forEach(function (k) {
      if (String(ex[k] === undefined || ex[k] === null ? '' : ex[k]).trim() !== '') delete rec[k];
    });
    rec.Is_Deleted = ''; rec.Version = (toInt_(ex.Version) || 1) + 1; rec.Updated_At = now; rec.Updated_By = 'RHA:SISTEM';
    rhaTulisBaris_(sh, h, ex._row, rec); hasil.diperbarui++;
  });
  if (baru.length) sh.getRange(sh.getLastRow() + 1, 1, baru.length, h.length).setValues(baru);

  // baris sinkron lama yang tidak ada lagi di detail RHA -> nonaktif
  Object.keys(ada).forEach(function (id) {
    if (dipakai[id] || rhaBool_(ada[id].Is_Deleted)) return;
    if (RHA_STATUS_TERKUNCI.indexOf(ada[id].Status_Data) >= 0) { hasil.dilewati++; return; }
    rhaTulisBaris_(sh, h, ada[id]._row, { Is_Deleted: 'TRUE', Version: (toInt_(ada[id].Version) || 1) + 1, Updated_At: now, Updated_By: 'RHA:SISTEM' });
    hasil.dinonaktifkan++;
  });
  return hasil;
}

function rhaNonaktifkanTabel_(kode, marker) {
  var T = Repo.siapkanSheetSinkron(kode, kode === 'M02' ? faskesEkstra_() : RHA_KOL_EKSTRA), sh = T.sh, h = T.h, now = nowWita_(), n = 0, lewat = 0;
  readAll_(sh).forEach(function (x) {
    if (x.Sumber_RHA !== marker || rhaBool_(x.Is_Deleted)) return;
    if (RHA_STATUS_TERKUNCI.indexOf(x.Status_Data) >= 0) { lewat++; return; }
    rhaTulisBaris_(sh, h, x._row, { Is_Deleted: 'TRUE', Version: (toInt_(x.Version) || 1) + 1, Updated_At: now, Updated_By: 'RHA:SISTEM' });
    n++;
  });
  return { dinonaktifkan: n, dilewati: lewat };
}

function rhaSelesaiSinkron_() { bumpData_(); invalidasiCache_(CFG.CACHE_PREFIX.SYS); invalidasiCache_(CFG.CACHE_PREFIX.PUB); }

// Teruskan data satu laporan ke Menu Privat
function rhaSinkronkan_(r) {
  var id = r.ID_Kejadian, marker = 'RHA:' + id, tglIso = fmtIso_(r.Tgl_Kejadian), now = nowWita_();
  var kodeId = String(id).replace(/^KJD-/, '');
  var korban = rhaDetailDari_(rhaKorbanSheet_(), id), faskes = rhaDetailDari_(rhaFaskesSheet_(), id);
  var kec = String(r.Kecamatan || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean).join(', ');
  var lokasi = r.Kabupaten_Kota + (kec ? ' — ' + kec : '');

  var hk = rhaSinkronTabel_('M25', RHA_KOL_EKSTRA, marker, 'KRB-RHA-' + kodeId + '-', korban, function (d) {
    return {
      Tgl_Kejadian_Awal: tglIso, Nama: d.Nama, Jenis_Kelamin: d.Jenis_Kelamin, Usia: toInt_(d.Usia), Usia_Bulan: d.Usia_Bulan === '' ? '' : toInt_(d.Usia_Bulan),
      Kategori_Usia: kategoriUsia_(d.Usia, d.Usia_Bulan), Status_Awal: d.Status_Awal, Alamat_Korban: d.Alamat, Kecamatan: '',
      ID_Kabupaten: r.ID_Kabupaten, Lokasi_Kejadian: lokasi, Diagnosa: '', Kewarganegaraan: 'WNI', Lokasi_Perawatan: '', Rujukan: '', Tujuan_Rujukan: '',
      ID_Faskes: '', ID_Posko: '', Keterangan: 'Data dari Laporan RHA ' + id,
      ID_Kejadian: id, ID_Peristiwa: r.ID_Peristiwa || '', ID_Kejadian_RHA: id
    };
  });
  var masterFk = {};   // [PERUBAHAN FASKES] alamat/kecamatan awal dari master REF_Faskes bila kolomnya ada; selebihnya dilengkapi petugas
  try { readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Faskes', 300).forEach(function (m) { if (!rhaBool_(m.Is_Deleted)) masterFk[m.ID_Faskes] = m; }); } catch (e) {}
  var hf = rhaSinkronTabel_('M02', faskesEkstra_(), marker, 'FKD-RHA-' + kodeId + '-', faskes, function (d) {
    var lain = rhaBool_(d.Lainnya), mf = lain ? null : masterFk[d.ID_Faskes];
    return {
      Tanggal: tglIso, ID_Kejadian: id, ID_Faskes: lain ? '' : d.ID_Faskes, Kondisi_Faskes: d.Tingkat_Kerusakan, Kapasitas_Layanan: '',
      Keterangan: lain ? 'Faskes belum terdaftar di master: ' + d.Nama_Faskes + ' (' + d.Jenis_Faskes + '). Dari Laporan RHA ' + id : d.Jenis_Faskes + '. Dari Laporan RHA ' + id,
      ID_Kabupaten: r.ID_Kabupaten, ID_Posko: '', Nama_Faskes_Lainnya: lain ? d.Nama_Faskes : '', Jenis_Faskes_RHA: d.Jenis_Faskes,
      ID_Peristiwa: r.ID_Peristiwa || '', ID_Kejadian_RHA: id,
      Alamat: mf && mf.Alamat ? String(mf.Alamat) : '', Kecamatan: mf && mf.Kecamatan ? String(mf.Kecamatan) : ''
    };
  });
  rhaSelesaiSinkron_();
  return { korban: hk, faskes: hf };
}

function rhaRingkasSinkron_(h) {
  function t(x) { return x.baru + ' baru, ' + x.diperbarui + ' diperbarui' + (x.dinonaktifkan ? ', ' + x.dinonaktifkan + ' dinonaktifkan' : '') + (x.dilewati ? ', ' + x.dilewati + ' dilewati (sudah diverifikasi)' : ''); }
  return 'Korban: ' + t(h.korban) + '. Faskes (Kondisi): ' + t(h.faskes) + '.';
}

// Terapkan keputusan sinkron sesuai status laporan dan Tujuan_Sinkron. r = baris TERBARU (objek). Mengembalikan teks ringkas.
function rhaTerapkanSinkron_(sh, h, r) {
  var tujuan = r.Tujuan_Sinkron || (rhaBool_(r.Dampak_Besar) ? 'Privat' : 'RHA');
  var marker = 'RHA:' + r.ID_Kejadian, status, catatan;
  try {
    if (r.Status_Verifikasi === 'Disetujui' && tujuan === 'Privat') {
      catatan = rhaRingkasSinkron_(rhaSinkronkan_(r)); status = 'Tersinkron';
    } else {
      var pernah = r.Status_Sinkron === 'Tersinkron' || r.Status_Sinkron === 'Gagal', ada = 0;
      if (pernah) { // Menu Privat hanya disentuh bila data laporan ini pernah diteruskan
        ada = rhaNonaktifkanTabel_('M25', marker).dinonaktifkan + rhaNonaktifkanTabel_('M02', marker).dinonaktifkan;
        rhaSelesaiSinkron_();
      }
      if (r.Status_Verifikasi === 'Disetujui') { status = 'Tidak Diteruskan'; catatan = 'Cukup di RHA' + (ada ? ' (' + ada + ' baris di Menu Privat dinonaktifkan)' : ''); }
      else { status = ada ? 'Dinonaktifkan' : 'Belum'; catatan = ada ? ada + ' baris di Menu Privat dinonaktifkan karena status laporan ' + r.Status_Verifikasi : ''; }
    }
  } catch (e) {
    logError_('rhaTerapkanSinkron_', e);
    status = 'Gagal'; catatan = 'Sinkron gagal: ' + String(e && e.message).substring(0, 200) + '. Gunakan "Teruskan ke Privat" untuk mencoba lagi.';
  }
  rhaTulisBaris_(sh, h, r._row, { Status_Sinkron: status, Tgl_Sinkron: nowWita_(), Catatan_Sinkron: catatan });
  return { status: status, catatan: catatan };
}

// ---------- Antrean verifikasi Super Admin ----------
function getAntreanVerifikasiRHA(token, p) {
  try {
    var user = requireSession_(token, null, null);
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin yang dapat membuka antrean verifikasi RHA.');
    p = p || {};
    var semua = readAllCached_(CFG.KEY.SS_RHA, 'sheetKejadian');
    var jmlPer = {};
    semua.forEach(function (r) { var k = peristiwaOf_(r); jmlPer[k] = (jmlPer[k] || 0) + 1; });
    var nK = {}, nF = {};
    rhaBacaDetailCached_('sheetKorbanRHA').forEach(function (x) { nK[x.ID_Kejadian] = (nK[x.ID_Kejadian] || 0) + 1; });
    rhaBacaDetailCached_('sheetFaskesRHA').forEach(function (x) { nF[x.ID_Kejadian] = (nF[x.ID_Kejadian] || 0) + 1; });

    var stFilter = ['Menunggu', 'Disetujui', 'Ditolak', 'Semua'].indexOf(p.status) >= 0 ? p.status : 'Menunggu';
    var rows = semua.filter(function (r) { return stFilter === 'Semua' || r.Status_Verifikasi === stFilter; });
    if (p.idKabupaten) rows = rows.filter(function (r) { return r.ID_Kabupaten === p.idKabupaten; });
    if (p.jenis) rows = rows.filter(function (r) { return r.Jenis_Bencana === p.jenis; });
    if (p.search) { var q = String(p.search).toLowerCase(); rows = rows.filter(function (r) { return (r.ID_Kejadian + ' ' + r.ID_Peristiwa + ' ' + r.Jenis_Bencana + ' ' + r.Kabupaten_Kota + ' ' + r.Kecamatan).toLowerCase().indexOf(q) >= 0; }); }
    rows.sort(function (a, b) { return String(b.Tanggal_Input).localeCompare(String(a.Tanggal_Input)) || String(a.ID_Kejadian).localeCompare(String(b.ID_Kejadian)); });
    var pageSize = Math.min(Number(p.pageSize) || 20, CFG.PAGESIZE_MAX), page = Math.max(1, Number(p.page) || 1);
    var out = rows.slice((page - 1) * pageSize, page * pageSize).map(function (r) {
      var besar = rhaBool_(r.Dampak_Besar);
      return {
        id: r.ID_Kejadian, idPeristiwa: r.ID_Peristiwa || '', jmlKab: jmlPer[peristiwaOf_(r)] || 1,
        jenis: r.Jenis_Bencana, tgl: fmtDate_(r.Tgl_Kejadian), kabupaten: r.Kabupaten_Kota, kecamatan: r.Kecamatan,
        kronologi: r.Penyebab_Kronologis, meninggal: toInt_(r.Meninggal), lbRi: toInt_(r.LB_RI), lrRj: toInt_(r.LR_RJ), hilang: toInt_(r.Hilang),
        pengungsi: toInt_(r.Pengungsi), terdampakJiwa: toInt_(r.Penduduk_Terdampak_Jiwa), terdampakKK: toInt_(r.Penduduk_Terdampak_KK),
        pelapor: r.Nama_Pelapor || '', kontak: r.Kontak_Pelapor || '', tglInput: r.Tanggal_Input, tampilPublik: r.Tampil_Publik,
        dampakBesar: besar, alasanBesar: r.Alasan_Dampak_Besar || '', tujuan: r.Tujuan_Sinkron || (besar ? 'Privat' : 'RHA'), modeSinkron: r.Mode_Sinkron || 'Otomatis',
        detailKorban: nK[r.ID_Kejadian] || 0, detailFaskes: nF[r.ID_Kejadian] || 0,
        statusVerifikasi: r.Status_Verifikasi, statusSinkron: r.Status_Sinkron || 'Belum'
      };
    });
    return ok_({ rows: out, page: page, total: rows.length, menunggu: stFilter === 'Menunggu' ? rows.length : semua.filter(function (r) { return r.Status_Verifikasi === 'Menunggu'; }).length });
  } catch (e) { return galatUmum_(e, 'getAntreanVerifikasiRHA'); }
}

// Satu langkah verifikasi untuk satu baris (dipanggil di dalam lock)
function rhaProsesVerifikasi_(sh, h, r, user, aksi, catatan, tujuan) {
  var baru = {};
  if (aksi === 'Setujui') {
    baru.Status_Verifikasi = 'Disetujui'; baru.Tampil_Publik = 'TRUE';
    if (tujuan === 'Privat' || tujuan === 'RHA') {
      var otomatis = rhaBool_(r.Dampak_Besar) ? 'Privat' : 'RHA';
      baru.Tujuan_Sinkron = tujuan; baru.Mode_Sinkron = tujuan === otomatis ? 'Otomatis' : 'Manual';
    }
  } else if (aksi === 'Tolak') {
    if (!catatan) validasi_('Alasan penolakan wajib diisi.');
    baru.Status_Verifikasi = 'Ditolak'; baru.Tampil_Publik = 'FALSE';
  } else if (aksi === 'Kembalikan') {
    baru.Status_Verifikasi = 'Menunggu'; baru.Tampil_Publik = 'FALSE';
  } else validasi_('Aksi tidak dikenal.');
  baru.Diverifikasi_Oleh = user.username; baru.Tanggal_Verifikasi = nowWita_(); baru.Catatan_Verifikasi = sanitizeText_(catatan || '', 500);
  rhaTulisBaris_(sh, h, r._row, baru);
  var rBaru = Object.assign({}, r, baru);
  var s = rhaTerapkanSinkron_(sh, h, rBaru);
  rhaLog_(aksi.toUpperCase(), r.ID_Kejadian, user.username, (catatan || '') + (s.catatan ? ' | Sinkron: ' + s.status + ' - ' + s.catatan : ''));
  logAudit_(user, 'VERIFIKASI_RHA_' + aksi.toUpperCase(), 'Laporan RHA', r.ID_Kejadian + ' | Sinkron: ' + s.status, 'OK');
  return s;
}

// tujuan (opsional, hanya untuk Setujui): 'Privat' = Teruskan ke Privat, 'RHA' = Cukup di RHA, kosong/'auto' = ikuti aturan otomatis
// semua (opsional): true = terapkan ke SEMUA baris kabupaten berstatus Menunggu pada peristiwa yang sama
function verifikasiLaporanRHA(token, id, aksi, catatan, tujuan, semua) {
  try {
    var user = requireSession_(token, null, null);
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin yang dapat memverifikasi laporan RHA.');
    id = sanitizeText_(id, 40);
    return withLock_(function () {
      var sh = rhaSheet_(), h = headersOf_(sh), rows = readAll_(sh);
      var r = rows.filter(function (x) { return x.ID_Kejadian === id; })[0];
      if (!r) validasi_('Laporan tidak ditemukan.');
      var targets = [r];
      if (semua && r.ID_Peristiwa) targets = rows.filter(function (x) { return x.ID_Peristiwa === r.ID_Peristiwa && (x.ID_Kejadian === r.ID_Kejadian || x.Status_Verifikasi === 'Menunggu'); });
      var ringkas = [];
      targets.forEach(function (t) { var s = rhaProsesVerifikasi_(sh, h, t, user, aksi, catatan, tujuan); ringkas.push(s); });
      invalidateRHA_();
      var label = aksi === 'Setujui' ? 'Disetujui' : aksi === 'Tolak' ? 'Ditolak' : 'Menunggu';
      var st = ringkas[0];
      var pesan = (targets.length > 1 ? targets.length + ' laporan pada peristiwa ' + r.ID_Peristiwa : 'Laporan ' + id) + ' berstatus ' + label + '.';
      if (aksi === 'Setujui') pesan += ' Sinkron ke Menu Privat: ' + st.status + (st.catatan ? ' (' + st.catatan + ')' : '') + '.';
      else if (st.status === 'Dinonaktifkan') pesan += ' ' + st.catatan;
      return ok_({ id: id, jumlah: targets.length, sinkron: ringkas }, pesan);
    });
  } catch (e) { return galatUmum_(e, 'verifikasiLaporanRHA'); }
}

// [BARU] Ubah tujuan sinkron secara manual (juga untuk laporan yang sudah Disetujui).
// tujuan: 'Privat' (Teruskan ke Privat) | 'RHA' (Cukup di RHA) | 'Otomatis' (kembali ke aturan otomatis)
function aturSinkronRHA(token, id, tujuan, catatan) {
  try {
    var user = requireSession_(token, null, null);
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin yang dapat mengatur sinkron laporan RHA.');
    id = sanitizeText_(id, 40);
    if (['Privat', 'RHA', 'Otomatis'].indexOf(tujuan) < 0) validasi_('Tujuan sinkron tidak sah.');
    return withLock_(function () {
      var sh = rhaSheet_(), h = headersOf_(sh);
      var r = readAll_(sh).filter(function (x) { return x.ID_Kejadian === id; })[0];
      if (!r) validasi_('Laporan tidak ditemukan.');
      var otomatis = rhaBool_(r.Dampak_Besar) ? 'Privat' : 'RHA';
      var baru = tujuan === 'Otomatis' ? { Tujuan_Sinkron: otomatis, Mode_Sinkron: 'Otomatis' } : { Tujuan_Sinkron: tujuan, Mode_Sinkron: tujuan === otomatis ? 'Otomatis' : 'Manual' };
      rhaTulisBaris_(sh, h, r._row, baru);
      var s = rhaTerapkanSinkron_(sh, h, Object.assign({}, r, baru));
      if (r.Status_Verifikasi !== 'Disetujui') { s = { status: 'Belum', catatan: 'Tujuan disimpan; sinkron dijalankan saat laporan disetujui.' }; rhaTulisBaris_(sh, h, r._row, { Status_Sinkron: 'Belum', Tgl_Sinkron: '', Catatan_Sinkron: s.catatan }); }
      rhaLog_('ATUR_SINKRON', id, user.username, baru.Tujuan_Sinkron + ' (' + baru.Mode_Sinkron + ') ' + (catatan || ''));
      logAudit_(user, 'ATUR_SINKRON_RHA', 'Laporan RHA', id + ' => ' + baru.Tujuan_Sinkron, 'OK');
      invalidateRHA_();
      return ok_({ id: id, tujuan: baru.Tujuan_Sinkron, mode: baru.Mode_Sinkron, statusSinkron: s.status, catatan: s.catatan }, 'Tujuan sinkron: ' + (baru.Tujuan_Sinkron === 'Privat' ? 'Teruskan ke Privat' : 'Cukup di RHA') + '. ' + (s.catatan || ''));
    });
  } catch (e) { return galatUmum_(e, 'aturSinkronRHA'); }
}

// Ganti seluruh detail satu kejadian (hapus lama, tulis baru) — dipanggil di dalam lock
function rhaGantiDetail_(sh, headers, idKejadian, rows) {
  var lama = readAll_(sh).filter(function (x) { return x.ID_Kejadian === idKejadian; }).map(function (x) { return x._row; }).sort(function (a, b) { return b - a; });
  lama.forEach(function (n) { sh.deleteRow(n); });
  if (rows.length) writeAllObjs_(sh, headers, rows);
}

// Koreksi Super Admin. payload.korban / payload.faskes (opsional): jika diberikan, MENGGANTI seluruh detail laporan ini.
function updateLaporanRHA(token, id, payload) {
  try {
    var user = requireSession_(token, null, null);
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin yang dapat mengedit laporan RHA.');
    payload = payload || {};
    return withLock_(function () {
      var sh = rhaSheet_(), h = headersOf_(sh), semua = readAll_(sh);
      var r = semua.filter(function (x) { return x.ID_Kejadian === id; })[0];
      if (!r) validasi_('Laporan tidak ditemukan.');
      var baru = {}, akhir = {};
      RHA_ANGKA.forEach(function (k) {
        if (payload[k] !== undefined) { var v = toInt_(payload[k]); if (v === null || v < 0) validasi_('Angka tidak sah: ' + k); baru[k] = v; }
        akhir[k] = baru[k] !== undefined ? baru[k] : (toInt_(r[k]) || 0);
      });
      ['Kecamatan', 'Penyebab_Kronologis', 'Ketersediaan_Sumber_Daya', 'Upaya_Penanggulangan', 'Bantuan_Diperlukan_Segera', 'Rekomendasi'].forEach(function (k) {
        if (payload[k] !== undefined) baru[k] = sanitizeText_(payload[k], 2000);
      });
      if (akhir.Penduduk_Terdampak_Jiwa < akhir.Meninggal + akhir.LB_RI + akhir.LR_RJ + akhir.Hilang) validasi_('Penduduk Terdampak (jiwa) tidak boleh lebih kecil dari jumlah Meninggal + LB/RI + LR/RJ + Hilang.');
      // Hitung ulang aturan dampak besar (Tujuan_Sinkron hanya ikut berubah bila belum diatur manual)
      var jmlKab = semua.filter(function (x) { return peristiwaOf_(x) === peristiwaOf_(r); }).length;
      var ditandai = /Ditandai pelapor/.test(String(r.Alasan_Dampak_Besar || ''));
      var nilai = hitungDampakBesar_(akhir, jmlKab, ditandai);
      baru.Dampak_Besar = nilai.besar ? 'Ya' : 'Tidak'; baru.Alasan_Dampak_Besar = nilai.alasan.join('; ');
      if (r.Mode_Sinkron !== 'Manual') { baru.Tujuan_Sinkron = nilai.besar ? 'Privat' : 'RHA'; baru.Mode_Sinkron = 'Otomatis'; }

      // Detail: bila tidak diganti, pastikan detail lama tetap tidak melebihi angka baru
      var korbanBaru = null, faskesBaru = null;
      if (Array.isArray(payload.korban)) korbanBaru = rhaBersihKorban_(payload.korban, akhir, true);
      else rhaBersihKorban_(rhaDetailDari_(rhaKorbanSheet_(), id).map(function (x) { return { status: x.Status_Awal, nama: x.Nama, usia: x.Usia, usiaBulan: x.Usia_Bulan, jk: x.Jenis_Kelamin, alamat: x.Alamat }; }), akhir, true);
      if (Array.isArray(payload.faskes)) { faskesBaru = rhaLengkapiFaskes_(rhaBersihFaskes_(payload.faskes, akhir)); }
      else rhaBersihFaskes_(rhaDetailDari_(rhaFaskesSheet_(), id).map(function (x) { return { jenis: x.Jenis_Faskes, tingkat: x.Tingkat_Kerusakan, idFaskes: x.ID_Faskes, nama: x.Nama_Faskes }; }), akhir);

      if (korbanBaru) rhaGantiDetail_(rhaKorbanSheet_(), RHA_KORBAN_HEADERS, id, korbanBaru.map(function (x, i) {
        return { ID_Detail: id + '-K' + pad_(i + 1, 3), ID_Kejadian: id, ID_Peristiwa: r.ID_Peristiwa || '', ID_Kabupaten: r.ID_Kabupaten, Status_Awal: x.Status_Awal, Nama: x.Nama, Usia: x.Usia, Usia_Bulan: x.Usia_Bulan,
          Kategori_Usia: x.Kategori_Usia, Jenis_Kelamin: x.Jenis_Kelamin, Alamat: x.Alamat, Dibuat_Pada: nowWita_() };
      }));
      if (faskesBaru) rhaGantiDetail_(rhaFaskesSheet_(), RHA_FASKES_HEADERS, id, faskesBaru.map(function (x, i) {
        return { ID_Detail: id + '-F' + pad_(i + 1, 3), ID_Kejadian: id, ID_Peristiwa: r.ID_Peristiwa || '', ID_Kabupaten: r.ID_Kabupaten, Jenis_Faskes: x.Jenis_Faskes, Tingkat_Kerusakan: x.Tingkat_Kerusakan,
          ID_Faskes: x.ID_Faskes, Nama_Faskes: x.Nama_Faskes, Lainnya: x.Lainnya, Dibuat_Pada: nowWita_() };
      }));

      var v = (toInt_(r.Versi) || 1) + 1;
      baru.Diubah_Pada = nowWita_(); baru.Versi = v;
      rhaTulisBaris_(sh, h, r._row, baru);
      var sinkron = rhaTerapkanSinkron_(sh, h, Object.assign({}, r, baru)); // laporan Disetujui + Privat: baris di Menu Privat DIPERBARUI, bukan digandakan
      rhaLog_('EDIT', id, user.username, 'Koreksi Super Admin | Sinkron: ' + sinkron.status);
      invalidateRHA_();
      logAudit_(user, 'EDIT_RHA', 'Laporan RHA', id, 'OK');
      return ok_({ id: id, versi: v, sinkron: sinkron }, 'Laporan diperbarui.' + (sinkron.catatan ? ' ' + sinkron.catatan : ''));
    });
  } catch (e) { return galatUmum_(e, 'updateLaporanRHA'); }
}

function deleteLaporanRHA(token, id) {
  try {
    var user = requireSession_(token, null, null);
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin yang dapat menghapus laporan RHA.');
    var peringatan = hitungTautanKejadian_(id);
    return withLock_(function () {
      var sh = rhaSheet_();
      var r = readAll_(sh).filter(function (x) { return x.ID_Kejadian === id; })[0];
      if (!r) validasi_('Laporan tidak ditemukan.');
      var marker = 'RHA:' + id, nonaktif = 0;
      if (r.Status_Sinkron === 'Tersinkron' || r.Status_Sinkron === 'Gagal') {
        try { nonaktif = rhaNonaktifkanTabel_('M25', marker).dinonaktifkan + rhaNonaktifkanTabel_('M02', marker).dinonaktifkan; rhaSelesaiSinkron_(); } catch (e) { logError_('deleteLaporanRHA.sinkron', e); }
      }
      rhaGantiDetail_(rhaKorbanSheet_(), RHA_KORBAN_HEADERS, id, []);
      rhaGantiDetail_(rhaFaskesSheet_(), RHA_FASKES_HEADERS, id, []);
      sh.deleteRow(r._row);
      rhaLog_('HAPUS', id, user.username, peringatan + ' tim merujuk laporan ini (data tim tidak dihapus); ' + nonaktif + ' baris Menu Privat dinonaktifkan');
      invalidateRHA_();
      logAudit_(user, 'HAPUS_RHA', 'Laporan RHA', id + ' (' + peringatan + ' tim merujuk)', 'OK');
      return ok_({ id: id }, 'Laporan dihapus. ' + (peringatan > 0 ? peringatan + ' tim yang merujuk tidak terhapus (tetap terbaca lewat snapshot). ' : '') + (nonaktif ? nonaktif + ' baris hasil sinkron di Menu Privat dinonaktifkan.' : ''));
    });
  } catch (e) { return galatUmum_(e, 'deleteLaporanRHA'); }
}

// ---------- Detail laporan RHA untuk Super Admin (semua status, termasuk Menunggu) ----------
function getDetailRHAVerifikasi(token, id) {
  try {
    var user = requireSession_(token, null, null);
    if (user.role !== ROLE.SUPER) aksesDitolak_('Hanya Super Admin yang dapat membuka detail laporan RHA.');
    id = sanitizeText_(id, 40);
    var semua = readAll_(rhaSheet_());
    var r = semua.filter(function (x) { return x.ID_Kejadian === id; })[0];
    if (!r) return err_('Laporan tidak ditemukan.', 'VALIDASI');
    var tim = [];
    try { tim = getTimPerKejadian_('TDM', id).concat(getTimPerKejadian_('TDP', id)); } catch (e) {}
    var n = function (k) { return toInt_(r[k]) || 0; };
    var kabLain = semua.filter(function (x) { return peristiwaOf_(x) === peristiwaOf_(r) && x.ID_Kejadian !== id; })
      .map(function (x) { return { id: x.ID_Kejadian, kabupaten: x.Kabupaten_Kota, status: x.Status_Verifikasi }; });
    var besar = rhaBool_(r.Dampak_Besar);
    var korban = rhaDetailDari_(rhaKorbanSheet_(), id).map(function (x) {
      return { id: x.ID_Detail, status: x.Status_Awal, nama: x.Nama, usia: toInt_(x.Usia), usiaBulan: toInt_(x.Usia_Bulan), kategori: x.Kategori_Usia, jk: x.Jenis_Kelamin, alamat: x.Alamat };
    });
    var faskes = rhaDetailDari_(rhaFaskesSheet_(), id).map(function (x) {
      return { id: x.ID_Detail, jenis: x.Jenis_Faskes, tingkat: x.Tingkat_Kerusakan, idFaskes: x.ID_Faskes || '', nama: x.Nama_Faskes, lainnya: rhaBool_(x.Lainnya) };
    });
    return ok_({
      id: r.ID_Kejadian, idKabupaten: r.ID_Kabupaten, angka: RHA_ANGKA.reduce(function (o, k) { o[k] = n(k); return o; }, {}), idPeristiwa: r.ID_Peristiwa || '', kabLain: kabLain, jenis: r.Jenis_Bencana, kategori: r.Kategori_Bencana,
      tgl: fmtDate_(r.Tgl_Kejadian), waktu: r.Waktu_Kejadian || '',
      kabupaten: r.Kabupaten_Kota, kecamatan: r.Kecamatan || '',
      statusVerifikasi: r.Status_Verifikasi, pelapor: r.Nama_Pelapor || '', kontak: r.Kontak_Pelapor || '',
      sumberInput: r.Sumber_Input || '', tglInput: String(r.Tanggal_Input || ''), catatanVerifikasi: r.Catatan_Verifikasi || '',
      meninggal: n('Meninggal'), lbRi: n('LB_RI'), lrRj: n('LR_RJ'), hilang: n('Hilang'), pengungsi: n('Pengungsi'),
      terdampakJiwa: n('Penduduk_Terdampak_Jiwa'), terdampakKK: n('Penduduk_Terdampak_KK'),
      rs: [n('RS_Rusak_Berat'), n('RS_Rusak_Sedang'), n('RS_Rusak_Ringan')],
      puskesmas: [n('Puskesmas_Rusak_Berat'), n('Puskesmas_Rusak_Sedang'), n('Puskesmas_Rusak_Ringan')],
      pustu: [n('Pustu_Rusak_Berat'), n('Pustu_Rusak_Sedang'), n('Pustu_Rusak_Ringan')],
      kronologi: r.Penyebab_Kronologis || '', sumberDaya: r.Ketersediaan_Sumber_Daya || '',
      upaya: r.Upaya_Penanggulangan || '', bantuan: r.Bantuan_Diperlukan_Segera || '', rekomendasi: r.Rekomendasi || '',
      timBertugas: tim, urlPdf: r.URL_Laporan_PDF || '', urlFoto: r.URL_Foto || '', urlBerita: r.URL_Berita || '',
      sinkron: { dampakBesar: besar, alasan: r.Alasan_Dampak_Besar || '', tujuan: r.Tujuan_Sinkron || (besar ? 'Privat' : 'RHA'), mode: r.Mode_Sinkron || 'Otomatis', status: r.Status_Sinkron || 'Belum', tgl: String(r.Tgl_Sinkron || ''), catatan: r.Catatan_Sinkron || '' },
      korbanDetail: korban, faskesDetail: faskes
    });
  } catch (e) { return galatUmum_(e, 'getDetailRHAVerifikasi'); }
}
