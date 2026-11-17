/**
 * Config.gs — INDAKRIS NTT
 * Kunci Script Properties, konstanta, seed referensi, dan MENU_CONFIG (26 menu data + 5 administrasi).
 */

var CFG = {
  // Kunci Script Properties
  KEY: {
    SS_UTAMA: 'ID_SS_UTAMA', SS_RHA: 'ID_SS_RHA', SS_TDM: 'ID_SS_TDM', SS_TDP: 'ID_SS_TDP',
    SS_WILAYAH: 'ID_SS_WILAYAH', FOLDER_UTAMA: 'ID_FOLDER_UTAMA', FOLDER_RHA: 'ID_FOLDER_RHA',
    FOLDER_TDM: 'ID_FOLDER_TDM', FOLDER_TDP: 'ID_FOLDER_TDP', PW_PEPPER: 'PW_PEPPER', ENV: 'ENV'
  },
  NAME: {
    SS_UTAMA: 'Database_INDAKRIS_NTT', SS_RHA: 'Database_RHA_INDAKRIS_NTT',
    SS_TDM: 'Database_TDM_INDAKRIS_NTT', SS_TDP: 'Database_TDP_INDAKRIS_NTT',
    FOLDER_UTAMA: 'INDAKRIS_NTT', FOLDER_RHA: 'INDAKRIS_RHA',
    FOLDER_TDM: 'INDAKRIS_TDM', FOLDER_TDP: 'INDAKRIS_TDP'
  },
  TZ: 'Asia/Makassar',
  CACHE_PREFIX: { RHA: 'rha_', TDM: 'tdm_', TDP: 'tdp_', WIL: 'wil_', REL: 'rel_', PUB: 'pub_', SYS: 'sys_', TRX: 'trx_', TIM: 'tim_' },
  SESI_IDLE_MIN: 30, SESI_MAX_JAM: 12,
  MAKS_GAGAL_LOGIN: 5, KUNCI_MENIT: 15,
  PBKDF2_ITERASI: 3000,
  KODE_AKTIVASI_JAM: 48,
  PAGESIZE_DEFAULT: 20, PAGESIZE_MAX: 100,
  BATAS_DAFTAR_JAM: 5,
  PASSWORD_MIN: 8
};

// Alias: berkas Service_* memakai CFG.CACHE.*, sedangkan Utils.gs memakai CFG.CACHE_PREFIX.*
CFG.CACHE = CFG.CACHE_PREFIX;

var ROLE = { POSKO: 'ADMIN_POSKO', PUSKESMAS: 'ADMIN_PUSKESMAS', KAB: 'ADMIN_KABUPATEN', PROV: 'ADMIN_PROVINSI', SUPER: 'SUPER_ADMIN' };
var ROLE_LABEL = {
  ADMIN_POSKO: 'Admin Posko Kesehatan', ADMIN_PUSKESMAS: 'Admin Puskesmas',
  ADMIN_KABUPATEN: 'Admin Kabupaten', ADMIN_PROVINSI: 'Admin Provinsi', SUPER_ADMIN: 'Super Admin'
};
var STATUS_DATA = { DRAFT: 'Draft', DIAJUKAN: 'Diajukan', TERVERIFIKASI: 'Terverifikasi', TERVALIDASI: 'Tervalidasi', DIKEMBALIKAN: 'Dikembalikan' };

// ============================================================
// SEED REFERENSI
// ============================================================

// 22 kabupaten/kota NTT (kode BPS & koordinat disiapkan sebagai seed awal, diverifikasi pemilik)
var KABUPATEN_SEED = [
  ['KAB-KOTA-KUPANG', '5371', 'Kota Kupang', 'Kota', 'Timor', 'Kupang', -10.1772, 123.5970, 'kota-kupang'],
  ['KAB-KUPANG', '5301', 'Kabupaten Kupang', 'Kabupaten', 'Timor', 'Baun', -10.0500, 123.8300, 'kabupaten-kupang'],
  ['KAB-TTS', '5302', 'Kabupaten Timor Tengah Selatan', 'Kabupaten', 'Timor', 'Soe', -9.8600, 124.2800, 'kabupaten-timor-tengah-selatan'],
  ['KAB-TTU', '5303', 'Kabupaten Timor Tengah Utara', 'Kabupaten', 'Timor', 'Kefamenanu', -9.4500, 124.4800, 'kabupaten-timor-tengah-utara'],
  ['KAB-BELU', '5304', 'Kabupaten Belu', 'Kabupaten', 'Timor', 'Atambua', -9.1000, 124.9000, 'kabupaten-belu'],
  ['KAB-MALAKA', '5319', 'Kabupaten Malaka', 'Kabupaten', 'Timor', 'Betun', -9.3800, 124.8300, 'kabupaten-malaka'],
  ['KAB-ALOR', '5305', 'Kabupaten Alor', 'Kabupaten', 'Alor-Pantar', 'Kalabahi', -8.2200, 124.5000, 'kabupaten-alor'],
  ['KAB-LEMBATA', '5306', 'Kabupaten Lembata', 'Kabupaten', 'Lembata-Solor', 'Lewoleba', -8.3700, 123.4300, 'kabupaten-lembata'],
  ['KAB-FLOTIM', '5320', 'Kabupaten Flores Timur', 'Kabupaten', 'Lembata-Solor', 'Larantuka', -8.3700, 123.3400, 'kabupaten-flores-timur'],
  ['KAB-SIKKA', '5307', 'Kabupaten Sikka', 'Kabupaten', 'Flores', 'Maumere', -8.6200, 122.2100, 'kabupaten-sikka'],
  ['KAB-ENDE', '5308', 'Kabupaten Ende', 'Kabupaten', 'Flores', 'Ende', -8.8400, 121.6600, 'kabupaten-ende'],
  ['KAB-NAGEKEO', '5316', 'Kabupaten Nagekeo', 'Kabupaten', 'Flores', 'Mbay', -8.5500, 121.3500, 'kabupaten-nagekeo'],
  ['KAB-NGADA', '5309', 'Kabupaten Ngada', 'Kabupaten', 'Flores', 'Bajawa', -8.8600, 121.0300, 'kabupaten-ngada'],
  ['KAB-MANGTIM', '5314', 'Kabupaten Manggarai Timur', 'Kabupaten', 'Flores', 'Borong', -8.6200, 120.9400, 'kabupaten-manggarai-timur'],
  ['KAB-MANGGARAI', '5310', 'Kabupaten Manggarai', 'Kabupaten', 'Flores', 'Ruteng', -8.5800, 120.4600, 'kabupaten-manggarai'],
  ['KAB-MANGBARAT', '5313', 'Kabupaten Manggarai Barat', 'Kabupaten', 'Flores', 'Labuan Bajo', -8.5000, 120.0400, 'kabupaten-manggarai-barat'],
  ['KAB-SBD', '5315', 'Kabupaten Sumba Barat Daya', 'Kabupaten', 'Sumba', 'Tambolaka', -9.4200, 119.3600, 'kabupaten-sumba-barat-daya'],
  ['KAB-SB', '5312', 'Kabupaten Sumba Barat', 'Kabupaten', 'Sumba', 'Waikabubak', -9.6400, 119.4000, 'kabupaten-sumba-barat'],
  ['KAB-ST', '5318', 'Kabupaten Sumba Tengah', 'Kabupaten', 'Sumba', 'Waibakul', -9.6400, 119.8800, 'kabupaten-sumba-tengah'],
  ['KAB-SE', '5311', 'Kabupaten Sumba Timur', 'Kabupaten', 'Sumba', 'Waingapu', -9.6500, 120.2600, 'kabupaten-sumba-timur'],
  ['KAB-SABU-RAIJUA', '5317', 'Kabupaten Sabu Raijua', 'Kabupaten', 'Sabu-Raijua', 'Seba', -10.5000, 121.8500, 'kabupaten-sabu-raijua'],
  ['KAB-ROTE-NDAO', '5321', 'Kabupaten Rote Ndao', 'Kabupaten', 'Rote', "Ba'a", -10.7400, 123.1200, 'kabupaten-rote-ndao']
];

var JENIS_BENCANA_SEED = [
  ['Banjir', 'Alam'], ['Tanah Longsor', 'Alam'], ['Gempa Bumi', 'Alam'], ['Kekeringan', 'Alam'],
  ['Angin Kencang/Putri Badai', 'Alam'], ['Banjir Rob', 'Alam'], ['Gelombang Pasang/Abrasi', 'Alam'],
  ['Erupsi Gunung Berapi', 'Alam'], ['Kebakaran Hutan dan Lahan', 'Alam'], ['Tsunami', 'Alam'],
  ['Kebakaran', 'Non-Alam'], ['Kecelakaan Transportasi', 'Non-Alam'], ['Wabah Penyakit/KLB', 'Non-Alam'],
  ['Konflik Sosial', 'Sosial']
];

var KELOMPOK_SASARAN = ['BAYI_0_5', 'BAYI_6_23', 'BALITA_24_59', 'ANAK_REMAJA', 'IBU_HAMIL', 'IBU_MENYUSUI', 'WUS', 'PUS', 'LANSIA', 'DISABILITAS', 'ODGJ', 'ODHA'];
var STATUS_AWAL_OPTS = ['Meninggal', 'Luka Berat', 'Luka Ringan', 'Hilang'];
var STATUS_LANJUTAN_OPTS = ['Rawat Inap', 'Rawat Jalan', 'Dirujuk', 'Sembuh', 'Meninggal', 'Ditemukan Hidup', 'Masih Hilang'];
var KONDISI_FASKES_OPTS = ['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat', 'Nonoperasional'];

// ============================================================
// [PERUBAHAN RHA] Aturan sinkron RHA -> Menu Privat, kategori usia, jenis/tingkat faskes
// ============================================================
// Kejadian dianggap "besar dan masif" bila SALAH SATU ambang terpenuhi (per baris kabupaten),
// atau peristiwa mencakup lebih dari 1 kabupaten, atau ditandai pelapor. Ubah angka di sini bila perlu.
// [REVISI 2] Meninggal dan Hilang kini minimal 3 jiwa. lintasKabupaten: 999 = kriteria "lebih dari 1 kabupaten" DINONAKTIFKAN (isi 2 untuk mengaktifkan kembali).
var RHA_AMBANG = { meninggal: 3, hilang: 3, lbRi: 5, pengungsi: 100, terdampakJiwa: 500, faskesRusakBerat: 1, lintasKabupaten: 999 };
// Pemetaan kolom jumlah RHA -> Status_Awal pada Menu Korban (STATUS_AWAL_OPTS)
var RHA_STATUS_KORBAN = [['Meninggal', 'Meninggal'], ['LB_RI', 'Luka Berat'], ['LR_RJ', 'Luka Ringan'], ['Hilang', 'Hilang']];
var RHA_JENIS_FASKES = ['RS', 'Puskesmas', 'Pustu'];
var RHA_TINGKAT_FASKES = ['Rusak Berat', 'Rusak Sedang', 'Rusak Ringan'];
// Kategori usia RHA = kategori usia Menu Korban: memakai kategoriUsia_() dan korbanCfg_() pada Service_Korban.gs (satu sumber, tidak disalin).

// Seed MST_Penyakit (Lampiran J) diisi dari berkas J_Seed_MST_Penyakit_ICD10.csv pada Setup.gs.

// ============================================================
// MENU_CONFIG — 26 menu data (M01-M26) + 5 administrasi (A01-A05)
// scopeType: F=faskes, P=posko (stamp dari pengelola), R=penempatan, K=kabupaten/provinsi
// ============================================================

// ============================================================
// SDM Kesehatan (M04): Kategori > Jenis > Spesifikasi (salinan sisi-klien ada di JavaScript.html: SDM_MAP)
// ============================================================
var SDM_MAP = [
  ['Nakes', 'Tenaga Medis', ['Dokter', 'Dokter Gigi', 'Dokter Spesialis', 'Dokter Gigi Spesialis', 'Dokter Sub Spesialis', 'Dokter Gigi Sub Spesialis']],
  ['Nakes', 'Tenaga Keperawatan', ['Perawat Vokasi', 'Ners', 'Ners Spesialis']],
  ['Nakes', 'Tenaga Kebidanan', ['Bidan Vokasi', 'Bidan Profesi']],
  ['Nakes', 'Tenaga Kefarmasian', ['Tenaga Vokasi Farmasi', 'Apoteker', 'Apoteker Spesialis']],
  ['Nakes', 'Tenaga Kesehatan Masyarakat', ['Tenaga Kesehatan Masyarakat', 'Epidemiolog Kesehatan', 'Tenaga Promosi Kesehatan dan Ilmu Perilaku', 'Pembimbing Kesehatan Kerja', 'Tenaga Administrasi dan Kebijakan Kesehatan']],
  ['Nakes', 'Tenaga Psikologi Klinis', ['Psikologi Klinis']],
  ['Nakes', 'Tenaga Kesehatan Lingkungan', ['Tenaga Sanitasi Lingkungan', 'Entomolog Kesehatan']],
  ['Nakes', 'Tenaga Gizi', ['Nutrisionis', 'Dietisien']],
  ['Nakes', 'Tenaga Keterapian Fisik', ['Fisioterapis', 'Terapis Okupasional', 'Terapis Wicara', 'Akupunktur']],
  ['Nakes', 'Tenaga Keteknisian Medis', ['Perekam Medis dan Informasi Kesehatan', 'Teknik Kardiovaskuler', 'Teknisi Pelayanan Darah', 'Optometris', 'Teknisi Gigi', 'Penata Anestesi', 'Terapis Gigi dan Mulut', 'Audiologis']],
  ['Nakes', 'Tenaga Teknik Biomedika', ['Radiografer', 'Elektromedis', 'Tenaga Teknologi Laboratorium Medik', 'Fisikawan Medik', 'Ortotik Prostetik']],
  ['Nakes', 'Tenaga Kesehatan Tradisional', ['Tenaga Kesehatan Tradisional Ramuan atau Jamu', 'Tenaga Kesehatan Tradisional Pengobat Tradisional', 'Tenaga Kesehatan Tradisional Interkontinental']],
  ['Nakes', 'Tenaga Kesehatan Lainnya', ['Tenaga Kesehatan Lainnya (Tenaga Pendukung atau Penunjang Kesehatan)']],
  ['Non Nakes', 'Non Nakes', ['Driver', 'Administrasi', 'Tenaga Logistik']]
];
var SDM_KATEGORI_OPTS = ['Nakes', 'Non Nakes'];
var SDM_JENIS_OPTS = SDM_MAP.map(function (m) { return m[1]; });
var SDM_SPESIFIKASI_OPTS = SDM_MAP.reduce(function (a, m) { return a.concat(m[2]); }, []);

function C(k, l, o) { o = o || {}; return { k: k, l: l, ref: o.ref || null, num: !!o.num, date: !!o.date, badge: !!o.badge, rp: !!o.rp, w: o.w || null }; }
function F(k, l, o) {
  o = o || {};
  return { k: k, l: l, t: o.t || 'text', req: !!o.req, opts: o.opts || null, ref: o.ref || null, max: o.max || null, auto: !!o.auto, hint: o.hint || null, lockAuto: !!o.lockAuto };
}
function _sysMenuCols(cols) { return cols.concat([C('Status_Data', 'Status', { badge: 1 })]); }

function buildMenuConfig() {
  var M = [];
  function add(o) { M.push(o); }

  add({ kode: 'M01', nama: 'Pengungsi', sheet: 'TRX_Pengungsi', kluster: 'A', scopeType: 'P', idPrefix: 'PGS',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Posko', 'Posko', { ref: 'posko' }), C('ID_Kejadian', 'Kejadian', { ref: 'kejadian' }), C('Jml_KK', 'KK', { num: 1 }), C('Jml_Jiwa', 'Jiwa', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Kejadian', 'Kejadian', { t: 'ref', ref: 'kejadian' }), F('ID_Posko', 'Posko', { t: 'ref', ref: 'posko', req: 1 }), F('Jml_KK', 'Jumlah KK', { t: 'number', req: 1 }), F('Jml_Jiwa', 'Jumlah Jiwa', { t: 'number', req: 1 }), F('Jml_L', 'Laki-laki', { t: 'number' }), F('Jml_P', 'Perempuan', { t: 'number' }), F('Jml_Bayi', 'Bayi (0-23 bln)', { t: 'number' }), F('Jml_Balita', 'Balita (24-59 bln)', { t: 'number' }), F('Jml_Anak', 'Anak-Remaja (5-17 th)', { t: 'number' }), F('Jml_Lansia', 'Lansia (60+)', { t: 'number' }), F('Jml_Ibu_Hamil', 'Ibu Hamil', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M02', nama: 'Faskes (Kondisi)', sheet: 'TRX_Faskes_Kondisi', kluster: 'A', scopeType: 'F', idPrefix: 'FKD',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal Kejadian Awal', { date: 1 }), C('ID_Faskes', 'Nama Faskes', { ref: 'faskes' }), C('Kondisi_Faskes', 'Kondisi Faskes', { badge: 1 }), C('Alamat', 'Alamat'), C('Kecamatan', 'Kecamatan')]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Kejadian', 'Kejadian', { t: 'ref', ref: 'kejadian' }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes', req: 1 }), F('Kondisi_Faskes', 'Kondisi Faskes', { t: 'select', opts: KONDISI_FASKES_OPTS, req: 1 }), F('Kapasitas_Layanan', 'Kapasitas Layanan (%)', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  // [PERUBAHAN PENILAIAN] M03 memakai Service_Penilaian.gs (tabel + formulir halaman baru). Kolom hasil integrasi dari Faskes (Kondisi) hanya baca.
  add({ kode: 'M03', nama: 'Penilaian Kerusakan Faskes', sheet: 'TRX_Penilaian_Kerusakan', kluster: 'A', scopeType: 'F', idPrefix: 'PNF',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal Kejadian Awal', { date: 1 }), C('ID_Kabupaten', 'Kabupaten', { ref: 'kabupaten' }), C('Nama_Faskes', 'Nama Faskes'), C('Kondisi_Faskes', 'Kondisi Faskes', { badge: 1 }), C('Alamat', 'Alamat'), C('Kecamatan', 'Kecamatan'), C('Pelayanan', 'Pelayanan'), C('Validasi_Kerusakan_Kerugian', 'Validasi Kerusakan & Kerugian'), C('Lembaga_Validasi', 'Lembaga/Instansi yang Validasi'), C('Tanggal_Validasi', 'Tanggal Validasi Kerusakan & Kerugian', { date: 1 })]),
    fields: [F('Tanggal', 'Tanggal Kejadian Awal', { t: 'date', req: 1 }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes' }), F('Tingkat_Kerusakan', 'Tingkat Kerusakan', { t: 'select', opts: KONDISI_FASKES_OPTS }), F('Pelayanan', 'Pelayanan', { t: 'select', opts: ['Full dalam Gedung', 'Sebagian dalam Gedung', 'Dalam & Luar Gedung', 'Full Luar Gedung'] }), F('Lembaga_Validasi', 'Lembaga/Instansi yang Validasi', { t: 'textarea', max: 1000 }), F('Tanggal_Validasi', 'Tanggal Validasi Kerusakan & Kerugian', { t: 'date' }), F('Estimasi_Kerugian_Rp', 'Estimasi Kerugian (Rp)', { t: 'number' }), F('Kebutuhan_Pemulihan_Rp', 'Kebutuhan Pemulihan (Rp)', { t: 'number' }), F('URL_Dokumen', 'Tautan Dokumen', { t: 'text' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M04', nama: 'SDM Kesehatan', sheet: 'TRX_SDM_Kesehatan', kluster: 'A', scopeType: 'F', idPrefix: 'SDM',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('Nama_Faskes', 'Nama Faskes'), C('ID_Kabupaten', 'Kabupaten/Kota', { ref: 'kabupaten' }), C('Kategori', 'Kategori'), C('Jenis', 'Jenis'), C('Spesifikasi', 'Spesifikasi'), C('Jumlah', 'Jumlah', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('Nama_Faskes', 'Nama Faskes', { t: 'text', req: 1, max: 150 }), F('ID_Kabupaten', 'Kabupaten/Kota', { t: 'ref', ref: 'kabupaten', hint: 'Hanya diisi oleh Super Admin / Admin Provinsi' }), F('Kategori', 'Kategori', { t: 'select', opts: SDM_KATEGORI_OPTS, req: 1 }), F('Jenis', 'Jenis', { t: 'select', opts: SDM_JENIS_OPTS, req: 1 }), F('Spesifikasi', 'Spesifikasi', { t: 'select', opts: SDM_SPESIFIKASI_OPTS, req: 1 }), F('Jumlah', 'Jumlah', { t: 'number', req: 1 }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M05', nama: 'Sasaran Sub Klaster', sheet: 'TRX_Sasaran', kluster: 'B', scopeType: 'F', idPrefix: 'SSR',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Faskes', 'Faskes', { ref: 'faskes' }), C('Kelompok_Sasaran', 'Kelompok Sasaran'), C('Jml_L', 'Laki-laki', { num: 1 }), C('Jml_P', 'Perempuan', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes', req: 1 }), F('Kelompok_Sasaran', 'Kelompok Sasaran', { t: 'select', opts: KELOMPOK_SASARAN, req: 1 }), F('Jml_L', 'Jumlah Laki-laki', { t: 'number' }), F('Jml_P', 'Jumlah Perempuan', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M06', nama: 'Pelayanan Medis', sheet: 'TRX_Pelayanan_Medis', kluster: 'B', scopeType: 'F', idPrefix: 'PYM',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Pasien', 'Pasien', { ref: 'pasien' }), C('ID_Penyakit', 'Diagnosa', { ref: 'penyakit' }), C('Jml_Kunjungan', 'Kunjungan', { num: 1 }), C('Status_Pasien', 'Status Pasien', { badge: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes', req: 1 }), F('ID_Pasien', 'Pasien', { t: 'ref', ref: 'pasien', req: 1 }), F('ID_Penyakit', 'Diagnosa (ICD-10)', { t: 'ref', ref: 'penyakit' }), F('Tindakan', 'Tindakan', { t: 'textarea', max: 1000 }), F('Jml_Kunjungan', 'Jumlah Kunjungan', { t: 'number' }), F('Status_Pasien', 'Status Pasien', { t: 'select', opts: ['Rawat Jalan', 'Rawat Inap', 'Dirujuk', 'Selesai'] })] });

  add({ kode: 'M07', nama: 'Penanggulangan Penyakit', sheet: 'TRX_Penanggulangan_Penyakit', kluster: 'B', scopeType: 'F', idPrefix: 'PNP',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Faskes', 'Faskes', { ref: 'faskes' }), C('ID_Penyakit', 'Penyakit', { ref: 'penyakit' }), C('Jml_Kasus_Sistem', 'Kasus Sistem', { num: 1 }), C('Jml_Kasus_Final', 'Kasus Final', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes', req: 1 }), F('ID_Penyakit', 'Penyakit (ICD-10)', { t: 'ref', ref: 'penyakit', req: 1 }), F('Jml_Kasus_Sistem', 'Jumlah Kasus (Sistem)', { t: 'number', auto: 1, hint: 'Diambil otomatis dari Surveilans & Pelayanan Medis' }), F('Jml_Kasus_Final', 'Jumlah Kasus (Final)', { t: 'number' }), F('Tindakan_Pengendalian', 'Tindakan Pengendalian', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M08', nama: 'Kesehatan Lingkungan', sheet: 'TRX_Kesling', kluster: 'C', scopeType: 'P', idPrefix: 'KSL',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Posko', 'Posko', { ref: 'posko' }), C('Jml_Pengungsi', 'Pengungsi', { num: 1 }), C('Kebutuhan_Air_L', 'Kebutuhan Air (L/hari)', { num: 1 }), C('Kebutuhan_Toilet', 'Kebutuhan Toilet', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Kejadian', 'Kejadian', { t: 'ref', ref: 'kejadian' }), F('ID_Posko', 'Posko', { t: 'ref', ref: 'posko', req: 1 }), F('Jml_Pengungsi', 'Jumlah Pengungsi', { t: 'number', auto: 1, hint: 'Otomatis dari data Pengungsi posko (terbaru)' }), F('Jml_Toilet_Ada', 'Jumlah Toilet Ada', { t: 'number' }), F('Kebutuhan_Air_L', 'Kebutuhan Air (L/hari)', { t: 'number', auto: 1, hint: 'Pengungsi x standar air per orang (Konfigurasi)' }), F('Kebutuhan_Toilet', 'Kebutuhan Toilet', { t: 'number', auto: 1, hint: 'Pengungsi / 20 orang (Konfigurasi)' }), F('Sumber_Air', 'Sumber Air', { t: 'select', opts: ['Air PDAM', 'Sumur', 'AirKita/Truk Tangki', 'Mata Air', 'Air Hujan', 'Lainnya'] }), F('Jml_Kontainer_Sampah', 'Jumlah Kontainer Sampah', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M09', nama: 'Kesehatan Reproduksi', sheet: 'TRX_Kespro', kluster: 'C', scopeType: 'F', idPrefix: 'KSP',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Faskes', 'Faskes', { ref: 'faskes' }), C('Kelompok_Sasaran', 'Kelompok Sasaran'), C('Jml_KB', 'Layanan KB', { num: 1 }), C('Jml_Komplikasi', 'Komplikasi', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes', req: 1 }), F('Kelompok_Sasaran', 'Kelompok Sasaran', { t: 'select', opts: KELOMPOK_SASARAN, req: 1 }), F('Jml_KB', 'Layanan KB', { t: 'number' }), F('Jml_K1', 'K1', { t: 'number' }), F('Jml_K4', 'K4', { t: 'number' }), F('Jml_Komplikasi', 'Komplikasi Kehamilan/Persalinan', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M10', nama: 'Kesehatan Jiwa', sheet: 'TRX_Keswa', kluster: 'C', scopeType: 'F', idPrefix: 'KSW',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Faskes', 'Faskes', { ref: 'faskes' }), C('Jml_ODGJ', 'ODGJ', { num: 1 }), C('Jml_Konseling', 'Konseling', { num: 1 }), C('Jml_Rujukan', 'Rujukan', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes', req: 1 }), F('Jml_ODGJ', 'Jumlah ODGJ', { t: 'number' }), F('Jml_Konseling', 'Jumlah Konseling', { t: 'number' }), F('Jml_Rujukan', 'Jumlah Rujukan', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M11', nama: 'Pelayanan Gizi', sheet: 'TRX_Gizi', kluster: 'B', scopeType: 'F', idPrefix: 'GZI',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Faskes', 'Faskes', { ref: 'faskes' }), C('ID_Pasien', 'Pasien', { ref: 'pasien' }), C('Jml_Skrining', 'Skrining', { num: 1 }), C('Jml_Gizi_Buruk', 'Gizi Buruk', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes', req: 1 }), F('ID_Pasien', 'Pasien', { t: 'ref', ref: 'pasien' }), F('Jml_Skrining', 'Jumlah Skrining', { t: 'number' }), F('Jml_Gizi_Buruk', 'Jumlah Gizi Buruk', { t: 'number' }), F('Jml_PMT', 'PMT Diberikan', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M12', nama: 'Promosi Kesehatan', sheet: 'TRX_Promkes', kluster: 'C', scopeType: 'P', idPrefix: 'PRM',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Posko', 'Posko', { ref: 'posko' }), C('Tema', 'Tema'), C('Jml_KIE', 'KIE', { num: 1 }), C('Jml_Peserta', 'Peserta', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Posko', 'Posko', { t: 'ref', ref: 'posko' }), F('Tema', 'Tema KIE', { t: 'text', req: 1, max: 200 }), F('Jml_KIE', 'Jumlah KIE', { t: 'number' }), F('Jml_Peserta', 'Jumlah Peserta', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M13', nama: 'DVI', sheet: 'TRX_DVI', kluster: 'C', scopeType: 'K', idPrefix: 'DVI',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Kejadian', 'Kejadian', { ref: 'kejadian' }), C('Jml_Jenazah_Utuh', 'Jenazah Utuh', { num: 1 }), C('Jml_Teridentifikasi', 'Teridentifikasi', { num: 1 }), C('Jml_Belum_Teridentifikasi', 'Belum Teridentifikasi', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Kejadian', 'Kejadian', { t: 'ref', ref: 'kejadian', req: 1 }), F('Jml_Jenazah_Utuh', 'Jenazah Utuh', { t: 'number' }), F('Jml_Bagian_Tubuh', 'Bagian Tubuh', { t: 'number' }), F('Jml_Teridentifikasi', 'Teridentifikasi', { t: 'number' }), F('Jml_Belum_Teridentifikasi', 'Belum Teridentifikasi', { t: 'number', auto: 1, hint: '(Jenazah Utuh + Bagian Tubuh) - Teridentifikasi' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M14', nama: 'Dasar Permintaan', sheet: 'TRX_Permintaan', kluster: 'D', scopeType: 'F', idPrefix: 'PMT',
    cols: _sysMenuCols([C('No_Permintaan', 'No. Permintaan'), C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Entitas_Pemohon', 'Pemohon', { ref: 'entitas' }), C('Prioritas', 'Prioritas', { badge: 1 }), C('Status_Data', 'Status', { badge: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('No_Permintaan', 'No. Permintaan', { t: 'text', auto: 1 }), F('ID_Entitas_Pemohon', 'Pemohon (Faskes/Instansi/Gudang)', { t: 'ref', ref: 'entitas', req: 1 }), F('Prioritas', 'Prioritas', { t: 'select', opts: ['Tinggi', 'Sedang', 'Normal'], req: 1 }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M15', nama: 'Rincian Permintaan', sheet: 'TRX_Permintaan_Rinci', kluster: 'D', scopeType: 'F', idPrefix: 'PMR',
    cols: _sysMenuCols([C('ID_Permintaan', 'Permintaan', { ref: 'permintaan' }), C('ID_Barang', 'Barang', { ref: 'barang' }), C('Jml_Permintaan', 'Jumlah', { num: 1 }), C('Jml_Tersedia', 'Stok Tersedia', { num: 1 })]),
    fields: [F('ID_Permintaan', 'Dasar Permintaan', { t: 'ref', ref: 'permintaan', req: 1 }), F('ID_Barang', 'Barang', { t: 'ref', ref: 'barang', req: 1 }), F('Jml_Permintaan', 'Jumlah Permintaan', { t: 'number', req: 1 }), F('Jml_Tersedia', 'Stok Saat Ini', { t: 'number', auto: 1, hint: 'Dari Kartu Stok' }), F('Alasan', 'Alasan Koreksi Angka', { t: 'textarea', max: 500 })] });

  add({ kode: 'M16', nama: 'Distribusi', sheet: 'TRX_Distribusi', kluster: 'D', scopeType: 'F', idPrefix: 'DST',
    cols: _sysMenuCols([C('No_Distribusi', 'No. Distribusi'), C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Faskes', 'Pengirim', { ref: 'entitas' }), C('ID_Faskes_Tujuan', 'Tujuan', { ref: 'entitas' }), C('ID_Permintaan', 'Permintaan', { ref: 'permintaan' })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('No_Distribusi', 'No. Distribusi', { t: 'text', auto: 1 }), F('ID_Permintaan', 'Dasar Permintaan (Disetujui)', { t: 'ref', ref: 'permintaan' }), F('ID_Faskes', 'Pengirim (Sumber Stok)', { t: 'ref', ref: 'entitas', req: 1 }), F('ID_Faskes_Tujuan', 'Tujuan', { t: 'ref', ref: 'entitas', req: 1 }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M17', nama: 'Rincian Distribusi', sheet: 'TRX_Distribusi_Rinci', kluster: 'D', scopeType: 'F', idPrefix: 'DSR',
    cols: _sysMenuCols([C('ID_Distribusi', 'Distribusi', { ref: 'distribusi' }), C('ID_Barang', 'Barang', { ref: 'barang' }), C('Jml_Keluar', 'Jumlah Keluar', { num: 1 })]),
    fields: [F('ID_Distribusi', 'Distribusi', { t: 'ref', ref: 'distribusi', req: 1 }), F('ID_Barang', 'Barang', { t: 'ref', ref: 'barang', req: 1 }), F('Jml_Keluar', 'Jumlah Keluar', { t: 'number', req: 1 }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 500 })], stockOut: 1 });

  add({ kode: 'M18', nama: 'Penerimaan', sheet: 'TRX_Penerimaan', kluster: 'D', scopeType: 'F', idPrefix: 'PNR',
    cols: _sysMenuCols([C('No_Penerimaan', 'No. Penerimaan'), C('Tanggal', 'Tanggal', { date: 1 }), C('Sumber', 'Sumber', { badge: 1 }), C('ID_Entitas_Penerima', 'Penerima', { ref: 'entitas' }), C('ID_Distribusi', 'Distribusi', { ref: 'distribusi' })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('No_Penerimaan', 'No. Penerimaan', { t: 'text', auto: 1 }), F('Sumber', 'Sumber', { t: 'select', opts: ['Distribusi', 'Donasi'], req: 1 }), F('ID_Distribusi', 'No. Distribusi', { t: 'ref', ref: 'distribusi' }), F('ID_Entitas_Penerima', 'Penerima', { t: 'ref', ref: 'entitas', req: 1 }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M19', nama: 'Rincian Penerimaan', sheet: 'TRX_Penerimaan_Rinci', kluster: 'D', scopeType: 'F', idPrefix: 'PRR',
    cols: _sysMenuCols([C('ID_Penerimaan', 'Penerimaan', { ref: 'penerimaan' }), C('ID_Barang', 'Barang', { ref: 'barang' }), C('Jml_Masuk', 'Jumlah Masuk', { num: 1 }), C('Selisih', 'Selisih', { num: 1 })]),
    fields: [F('ID_Penerimaan', 'Penerimaan', { t: 'ref', ref: 'penerimaan', req: 1 }), F('ID_Barang', 'Barang', { t: 'ref', ref: 'barang', req: 1 }), F('Jml_Masuk', 'Jumlah Masuk', { t: 'number', req: 1 }), F('Selisih', 'Selisih vs Distribusi', { t: 'number', auto: 1 }), F('Penanganan', 'Penanganan Selisih', { t: 'textarea', req: 0, max: 500 })], stockIn: 1 });

  add({ kode: 'M20', nama: 'Kartu Stok', sheet: 'TRX_Kartu_Stok', kluster: 'D', scopeType: 'F', idPrefix: 'STK', readOnly: 1,
    cols: [C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Faskes', 'Lokasi', { ref: 'entitas' }), C('ID_Barang', 'Barang', { ref: 'barang' }), C('Riwayat', 'Riwayat', { badge: 1 }), C('Jml', 'Jumlah', { num: 1 }), C('Sisa', 'Sisa', { num: 1 }), C('Referensi', 'Referensi'), C('Status_Data', 'Status', { badge: 1 })],
    fields: [] });

  add({ kode: 'M21', nama: 'Surveilans', sheet: 'TRX_Surveilans', kluster: 'B', scopeType: 'F', idPrefix: 'SVL',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Faskes', 'Faskes', { ref: 'faskes' }), C('ID_Penyakit', 'Penyakit', { ref: 'penyakit' }), C('Jml_Kasus_Baru', 'Kasus Baru', { num: 1 }), C('Jml_Meninggal', 'Meninggal', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Faskes', 'Faskes', { t: 'ref', ref: 'faskes', req: 1 }), F('ID_Penyakit', 'Penyakit (ICD-10)', { t: 'ref', ref: 'penyakit', req: 1 }), F('Jml_Kasus_Baru', 'Jumlah Kasus Baru', { t: 'number', req: 1 }), F('Jml_Meninggal', 'Jumlah Meninggal', { t: 'number' }), F('Keterangan', 'Keterangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M22', nama: 'F1 Rekap Harian', sheet: 'TRX_Rekap_Harian', kluster: 'E', scopeType: 'K', idPrefix: 'F1H',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('Indikator', 'Indikator'), C('Jml_Hari_Ini', 'Hari Ini', { num: 1 }), C('Jml_Kemarin', 'Kemarin', { num: 1 }), C('Jml_Kumulatif', 'Kumulatif', { num: 1 }), C('Angka_Resmi', 'Angka Resmi', { num: 1 })]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('Indikator', 'Indikator', { t: 'select', opts: ['Meninggal', 'LB/RI', 'LR/RJ', 'Hilang', 'Pengungsi', 'Kasus Penyakit'], req: 1 }), F('Jml_Hari_Ini', 'Hari Ini', { t: 'number', auto: 1 }), F('Jml_Kemarin', 'Kemarin', { t: 'number', auto: 1 }), F('Jml_Kumulatif', 'Kumulatif', { t: 'number', auto: 1 }), F('Angka_Resmi', 'Angka Resmi', { t: 'number', hint: 'Wajib alasan bila berbeda dari angka sistem' }), F('Catatan_Penyimpangan', 'Catatan Penyimpangan', { t: 'textarea', max: 1000 })] });

  add({ kode: 'M23', nama: 'F2 Laporan Situasi Ringkas', sheet: 'TRX_Laporan_Situasi', kluster: 'E', scopeType: 'K', idPrefix: 'F2S',
    cols: _sysMenuCols([C('Tanggal', 'Tanggal', { date: 1 }), C('ID_Kejadian', 'Kejadian', { ref: 'kejadian' }), C('Ringkasan', 'Ringkasan'), C('URL_Dokumen', 'Dokumen')]),
    fields: [F('Tanggal', 'Tanggal', { t: 'date', req: 1 }), F('ID_Kejadian', 'Kejadian', { t: 'ref', ref: 'kejadian', req: 1 }), F('Ringkasan', 'Ringkasan Situasi', { t: 'textarea', req: 1, max: 4000 }), F('Faskes_Rusak_Berat', 'Faskes Rusak Berat', { t: 'number', auto: 1, hint: 'Otomatis dari Penilaian Kerusakan' }), F('URL_Dokumen', 'Tautan Dokumen Laporan', { t: 'text' })] });

  add({ kode: 'M24', nama: 'Relawan', sheet: 'TRX_Relawan', kluster: 'C', scopeType: 'R', idPrefix: 'RLW',
    cols: [C('ID_Tim', 'ID Tim'), C('Nama_Tim', 'Nama Tim'), C('Jenis_Relawan', 'Jenis Relawan', { badge: 1 }), C('Tgl_Kedatangan', 'Tgl Kedatangan', { date: 1 }), C('ID_Kabupaten', 'Kabupaten', { ref: 'kabupaten' }), C('Lokasi_Penempatan', 'Lokasi Penempatan'), C('Keterangan', 'Keterangan'), C('Sumber_Modul', 'Sumber', { badge: 1 })],
    fields: [F('Nama_Tim', 'Nama Tim', { t: 'text', req: 1, max: 150 }), F('Jenis_Relawan', 'Jenis Relawan', { t: 'select', opts: ['TCK-EMT', 'Tim Dukungan Psikososial', 'Lainnya'], req: 1 }), F('Tgl_Kedatangan', 'Tanggal Kedatangan', { t: 'date', req: 1 }), F('ID_Kabupaten', 'Kabupaten/Kota', { t: 'ref', ref: 'kabupaten', req: 1 }), F('Lokasi_Penempatan', 'Lokasi Penempatan (detail)', { t: 'text', max: 300 }), F('Keterangan', 'Keterangan', { t: 'select', opts: ['Kedatangan', 'Bertugas'], hint: 'Terisi otomatis "Kedatangan" dari form kedatangan. Admin Kabupaten dapat mengubahnya menjadi "Bertugas" bila data kedatangan sudah benar.' })] });

  add({ kode: 'M25', nama: 'Korban', sheet: 'TRX_Korban', kluster: 'E', scopeType: 'F', idPrefix: 'KRB', khusus: 1, // khusus = memakai formulir/fungsi sendiri (Service_Korban.gs)
    cols: _sysMenuCols([C('Tgl_Kejadian_Awal', 'Tanggal Kejadian Awal', { date: 1 }), C('Nama', 'Nama'), C('Jenis_Kelamin', 'Jenis Kelamin'), C('Usia', 'Usia (tahun)', { num: 1 }), C('Usia_Bulan', 'Usia (bulan)', { num: 1 }), C('Kategori_Usia', 'Kategori Usia'), C('Status_Awal', 'Status Awal', { badge: 1 }), C('Alamat_Korban', 'Alamat Korban'), C('Kecamatan', 'Kecamatan'), C('ID_Kabupaten', 'Kabupaten', { ref: 'kabupaten' }), C('Lokasi_Kejadian', 'Lokasi Kejadian'), C('Diagnosa', 'Diagnosa/Keterangan'), C('Kewarganegaraan', 'Kewarganegaraan'), C('Lokasi_Perawatan', 'Lokasi Perawatan'), C('Rujukan', 'Rujukan'), C('Tujuan_Rujukan', 'Tujuan Rujukan')]),
    fields: [F('Tgl_Kejadian_Awal', 'Tanggal Kejadian Awal', { t: 'date', req: 1 }), F('Nama', 'Nama', { t: 'text', req: 1, max: 150 }), F('Jenis_Kelamin', 'Jenis Kelamin', { t: 'select', opts: ['Laki-laki', 'Perempuan'], req: 1 }), F('Usia', 'Usia (tahun)', { t: 'number', req: 1 }), F('Usia_Bulan', 'Usia (bulan)', { t: 'number', hint: 'Wajib untuk usia 0 atau 1 tahun (0 sampai 11)' }), F('Kategori_Usia', 'Kategori Usia', { t: 'text', auto: 1 }), F('Status_Awal', 'Status Awal', { t: 'select', opts: STATUS_AWAL_OPTS, req: 1 }), F('Alamat_Korban', 'Alamat Korban', { t: 'textarea', max: 300 }), F('Kecamatan', 'Kecamatan', { t: 'text', max: 100 }), F('Lokasi_Kejadian', 'Lokasi Kejadian', { t: 'text', max: 300 }), F('Diagnosa', 'Diagnosa/Keterangan', { t: 'textarea', max: 500 }), F('Kewarganegaraan', 'Kewarganegaraan', { t: 'select', opts: ['WNI', 'WNA'], req: 1 }), F('Lokasi_Perawatan', 'Lokasi Perawatan', { t: 'text', max: 200 }), F('Rujukan', 'Rujukan', { t: 'select', opts: ['Dirujuk', 'Tidak Dirujuk'], req: 1 }), F('Tujuan_Rujukan', 'Tujuan Rujukan', { t: 'text', max: 200 })] });

  add({ kode: 'M26', nama: 'Perkembangan Korban', sheet: 'TRX_Korban_Perkembangan', kluster: 'E', scopeType: 'F', idPrefix: 'KRP', khusus: 1, // khusus = memakai halaman/fungsi sendiri (Service_Perkembangan.gs)
    appendOnly: 1,
    cols: _sysMenuCols([C('ID_Korban', 'Korban', { ref: 'korban' }), C('Tanggal', 'Tanggal', { date: 1 }), C('Status_Lanjutan', 'Status Lanjutan', { badge: 1 }), C('Tgl_Status_Lanjutan', 'Tanggal Sembuh/Rujuk/Meninggal', { date: 1 }), C('ID_Faskes_Perawatan', 'Faskes Perawatan', { ref: 'faskes' })]),
    fields: [F('ID_Korban', 'Korban', { t: 'ref', ref: 'korban', req: 1 }), F('Tanggal', 'Tanggal Perkembangan', { t: 'date', req: 1 }), F('Status_Lanjutan', 'Status Lanjutan', { t: 'select', opts: STATUS_LANJUTAN_OPTS, req: 1 }), F('Tgl_Status_Lanjutan', 'Tanggal Sembuh/Rujuk/Meninggal', { t: 'date' }), F('ID_Faskes_Perawatan', 'Faskes Perawatan', { t: 'ref', ref: 'faskes' }), F('ID_Faskes_Tujuan_Rujuk', 'Faskes Tujuan Rujuk', { t: 'ref', ref: 'faskes' }), F('Tgl_Meninggal', 'Tgl Meninggal', { t: 'date' }), F('Catatan', 'Catatan', { t: 'textarea', max: 1000 })] });

  // Menu administrasi (custom page di frontend)
  add({ kode: 'A01', nama: 'Manajemen User', custom: 'users', admin: 1 });
  add({ kode: 'A02', nama: 'Master Data', custom: 'master', admin: 1 });
  add({ kode: 'A03', nama: 'Konfigurasi', custom: 'config', admin: 1 });
  add({ kode: 'A04', nama: 'Log Audit', custom: 'audit', admin: 1 });
  add({ kode: 'A05', nama: 'Arsip dan Backup', custom: 'arsip', admin: 1 });

  return M;
}

// Matriks hak akses: MENU x ROLE x AKSI
function menuAccess(menu) {
  if (menu.custom) {
    var m = { read: [ROLE.SUPER], write: [ROLE.SUPER], verify: [ROLE.SUPER], validate: [ROLE.SUPER], del: [ROLE.SUPER] };
    if (menu.kode === 'A02') { m.read = [ROLE.SUPER, ROLE.PROV, ROLE.KAB]; m.write = [ROLE.SUPER, ROLE.KAB]; }
    if (menu.kode === 'A04') { m.read = [ROLE.SUPER, ROLE.PROV]; }
    if (menu.kode === 'A01') {
      m.read = [ROLE.SUPER, ROLE.PROV, ROLE.KAB, ROLE.PUSKESMAS];
      m.activate = [ROLE.SUPER, ROLE.PROV, ROLE.KAB, ROLE.PUSKESMAS];
    }
    return m;
  }
  return {
    read: [ROLE.SUPER, ROLE.PROV, ROLE.KAB, ROLE.PUSKESMAS, ROLE.POSKO],
    write: menu.readOnly ? [] : [ROLE.SUPER, ROLE.PROV, ROLE.KAB, ROLE.PUSKESMAS, ROLE.POSKO],
    verify: [ROLE.KAB, ROLE.PUSKESMAS, ROLE.POSKO],   // [PERUBAHAN] Verifikasi oleh Admin Kabupaten, Admin Puskesmas, Admin Posko
    validate: [ROLE.SUPER, ROLE.PROV],                // Validasi oleh Admin Provinsi dan Super Admin (hanya mereka yang melihatnya)
    del: [ROLE.SUPER, ROLE.PROV, ROLE.KAB]
  };
}

var MASTER_TYPES = ['kabupaten', 'faskes', 'posko', 'barang', 'penyakit', 'pasien', 'kejadian'];
var MASTER_SHEET = { kabupaten: 'REF_Kabupaten', faskes: 'REF_Faskes', posko: 'REF_Posko', barang: 'MST_Barang', penyakit: 'MST_Penyakit', pasien: 'MST_Pasien', kejadian: 'MST_Kejadian' };
