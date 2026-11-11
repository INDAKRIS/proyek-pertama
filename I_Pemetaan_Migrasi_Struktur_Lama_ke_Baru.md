# PEMETAAN MIGRASI — Struktur Lama (`Struktur tabel.txt`) → Skema Baru INDAKRIS NTT

**Revisi 2.** Keputusan final sudah dimasukkan: `Tanggal_Snapshot` = tanggal harian, status migrasi = `Terverifikasi`, lingkup Admin Posko (`ID_Faskes_Pengelola`), entitas Faskes/Instansi/Gudang, seed ICD-10 (`J_Seed_MST_Penyakit_ICD10.csv`), dan pemetaan Korban. Rujukan "A9–A13" mengacu ke **Paket Prompt Bertahap Revisi 3**.

Lampiran ini mengisi **template pemetaan A5** (Paket Prompt Bertahap, Revisi 2) untuk seluruh tabel pada `Struktur tabel.txt`. Tempel bersama Bagian A pada **Tahap 12**, dan juga pada **Tahap 1** (lihat Bagian 5: perubahan skema yang diminta oleh hasil pemetaan ini).

> Pemetaan dibuat dari **nama kolom saja**. Contoh data lama belum ada, sehingga aturan nilai (mis. isi kolom Kondisi, Status, Kategori) harus diverifikasi AI Tahap 12 lewat `dryRun()` terhadap data aktual.

---

## 1. Ringkasan temuan

Struktur lama berisi **24 tabel**, tepat sama dengan 24 menu baru M01–M24. **Korban dan Perkembangan Korban (M25, M26) tidak ada di file ini**, sehingga tidak ada pemetaan untuknya (lihat 3.25).

| # | Temuan | Dampak dan penanganan |
| --- | --- | --- |
| 1 | **Tabel Sasaran lama berisi 20 kolom data** (bukan 26 seperti tertulis di prompt lama) + Keterangan | Satu baris lama menjadi hingga 20 baris long (Bagian 3.5) |
| 2 | **Tidak ada kolom `Tanggal`** di: Pengungsi, Faskes, Penilaian Kerusakan, SDM, Sasaran, F1, F2 | Skema baru mewajibkan tanggal pada sebagian besar. Dipakai parameter batch `Tanggal_Snapshot` (T-TGLDEF) |
| 3 | **Tidak ada `ID_Faskes`** di hampir semua tabel, hanya nama faskes/puskesmas dan alamat | Semua dicocokkan ke `MST_Faskes` lewat nama (T-NAMA→ID) dan sebagian besar masuk antrean tinjauan |
| 4 | Tabel **Faskes lama = master + kondisi dalam satu tabel** | Dipecah menjadi `MST_Faskes` dan `TRX_Faskes_Kondisi` |
| 5 | Tabel **Pengungsi lama membawa data posko** (nama, alamat, kecamatan) | Posko diekstrak menjadi `MST_Posko` |
| 6 | Logistik lama **tidak punya `ID_Distribusi`, `ID_Penerimaan`, atau `ID_Rinci`**. Rincian Penerimaan juga **tidak punya `ID_Barang`** | ID dibuat baru. Penautan header–rincian lewat `ID_Permintaan` + `ID_Faskes` (T-LINK), bagian yang ambigu masuk tinjauan |
| 7 | Pelayanan Medis dan Penanggulangan Penyakit lama **tanpa diagnosa/`ID_Penyakit`** (hanya `Jenis Penyakit` teks di Penanggulangan dan Surveilans) | `ID_Penyakit` Pelayanan Medis = NULL. Usulan otomatis ke Surveilans tidak dapat diisi ulang untuk data lama |
| 8 | Pelayanan Medis dan Gizi lama **tanpa posko dan tanpa ID pasien** | `MST_Pasien` dibentuk dari Nama+JK+Usia+lokasi pelayanan (cek duplikat lebih longgar, lebih banyak tinjauan manual) |
| 9 | Kolom turunan di tabel lama (Kebutuhan/Tambahan Kesling, Proyeksi Kespro, Jumlah ODGJ, Belum Teridentifikasi, Selisih, Lama Tugas, Kategori Usia, Kondisi pada Penilaian) | Tidak ditulis. Dihitung ulang server lalu **dibandingkan** dengan nilai lama (T-COMPARE) sebagai bahan rekonsiliasi |
| 10 | Struktur lama **tidak punya ID baris** (hanya `No`) | `Legacy_ID` dibentuk dari hash isi baris (Bagian 2.3) |
| 11 | Tabel lama memuat `ID_Kejadian` dan `ID_Kabupaten` di setiap baris | Dipakai langsung, divalidasi ke master |
| 12 | Kartu Stok lama berisi riwayat lengkap | Dua mode migrasi (3.20), default: impor riwayat bila saldo cocok |
| 13 | Beberapa menu berbasis posko/kecamatan **tidak punya faskes** (Pengungsi, Kesling, Promkes, DVI, Relawan, F1, F2) | Baris ber-`ID_Faskes` NULL tidak terlihat Admin Posko. **Diputuskan:** `ID_Faskes` di-stamp dari pengelola posko (A9). Posko tanpa pengelola menghasilkan "data tanpa pemilik" yang hanya terlihat Admin Kabupaten ke atas |

---

## 2. Parameter dan aturan umum

### 2.1 Parameter batch (diisi sebelum `runBatch()`)

| Parameter | Fungsi | Contoh |
| --- | --- | --- |
| `Batch_ID` | Identitas batch untuk rollback | `MIG-2026-001` |
| `Tanggal_Snapshot` | **Tanggal harian** (`yyyy-MM-dd`, `Asia/Makassar`) untuk tabel lama tanpa kolom tanggal (T-TGLDEF). Satu nilai per batch, dapat ditimpa per tabel. F1 menjadi catatan harian pada tanggal ini | **Ditetapkan:** tanggal pembekuan sistem lama (hari ekspor), mis. `2026-10-28` |
| `Status_Data_Migrasi` | Status baris hasil migrasi | **`Terverifikasi` (ditetapkan)**. Menjadi `Tervalidasi` hanya lewat validasi massal Admin Provinsi (A12) |
| `Mode_Kartu_Stok` | `RIWAYAT` atau `SALDO_AWAL` (3.20) | `RIWAYAT` dengan cadangan `SALDO_AWAL` (default dipakai karena belum ada keputusan eksplisit; mudah diubah per batch) |
| `MIGRATION_MODE` | Saat TRUE: **matikan** penulisan otomatis Kartu Stok, notifikasi (mis. Gizi Buruk), dan usulan otomatis | TRUE selama migrasi |

### 2.2 Kolom umum (berlaku untuk semua tabel, tidak diulang di 3.x)

| Kolom lama | Kolom baru | Transformasi | Aturan jika gagal |
| --- | --- | --- | --- |
| `ID_Kejadian` | `ID_Kejadian` | T-ID (normalisasi format) | TOLAK bila tidak ada di `MST_Kejadian` |
| `ID_Kabupaten` | `ID_Kabupaten` | T-ID (mis. `5301` → `KAB-5301`) | TOLAK bila tidak ada di `MST_Wilayah` |
| `No` | — | T-DROP | — |
| `Aksi (Edit & Delete)` | — | T-DROP | — |
| `Kecamatan`, `Kabupaten` (teks) | Tidak disimpan di TRX. Dipakai mencocokkan `MST_Wilayah` dan memeriksa konsistensi dengan `ID_Kabupaten`. Menjadi `ID_Kecamatan` hanya di tabel yang memilikinya (Surveilans, Promkes, DVI) | T-NAMA→ID | TINJAU bila teks kabupaten bertentangan dengan `ID_Kabupaten` |
| `Nama Faskes/Puskesmas` + `Alamat` | `ID_Faskes` | T-NAMA→ID | TINJAU (masuk `STG_Master_Baru`, tidak membuat master otomatis) |
| (sistem) | `Status_Data` | = `Status_Data_Migrasi` (`Terverifikasi`) | — |
| (sistem) | `Verified_By` = `MIGRASI`, `Verified_At` = waktu migrasi; `Validated_By/At` kosong | — | — |
| (sistem) | `Created_By` = `MIGRASI`; `Created_At` = tanggal data bila ada, selain itu waktu migrasi; `Version` = 1; `Is_Deleted` = FALSE | — | — |
| (sistem) | `Legacy_ID`, `Migration_Batch`, `Legacy_Data` | T-LEGACY | — |

### 2.3 Legacy_ID, Legacy_Data, dan idempotensi

- `Legacy_ID` = `<NamaTabelLama>#<SHA-256 dari nilai kolom kunci yang sudah dinormalisasi>`. Kolom kunci per tabel disebut di setiap bagian 3.x. Nomor baris `No` **tidak dipakai** sebagai kunci karena berubah saat data diurutkan ulang.
- Dua baris lama identik penuh diberi sufiks `#2`, `#3`, dan seterusnya, dan dicatat sebagai peringatan (kemungkinan data ganda).
- `Legacy_Data` (teks JSON) menyimpan nilai lama yang **tidak punya padanan** di skema baru atau yang gagal dicocokkan (mis. teks nama faskes yang tidak ditemukan), agar tidak ada informasi hilang. Ini menuntut penambahan kolom di Bagian 5.
- `runBatch()` melewati baris yang `Legacy_ID`-nya sudah ada, sehingga aman diulang.

### 2.4 Kode transformasi dan aturan gagal

Kode dari A5 dipakai, ditambah:

| Kode | Arti |
| --- | --- |
| T-REF | Cocokkan label teks ke nilai `REF_Dropdown`/`REF_KategoriUsia` (abaikan huruf besar/kecil, spasi, tanda baca). Nilai tak dikenal → TINJAU, jangan ditebak |
| T-BOOL | Ya/Tidak/Y/N/1/0/✓/kosong → `Ya`/`Tidak` (kosong → `Tidak`, dicatat jumlahnya) |
| T-GENID | Buat ID baru lewat `IdService` (kunci pembeda dicatat di `Legacy_Data`) |
| T-LINK | Hubungkan rincian ke header lewat kunci kombinasi. Bila cocok lebih dari satu → TINJAU |
| T-TGLDEF | Pakai `Tanggal_Snapshot` karena tabel lama tanpa tanggal. Dicatat di `Legacy_Data` sebagai `tanggal_diisi_otomatis: true` |
| T-COMPARE | Nilai turunan lama **tidak ditulis**. Server menghitung ulang dan selisihnya dimasukkan ke laporan rekonsiliasi (tidak memblokir) |
| T-LEGACY | Simpan nilai lama yang tak terpetakan di `Legacy_Data` |

| Aturan gagal | Arti |
| --- | --- |
| **TOLAK** | Baris tidak ditulis, masuk `MIG_Error` (sheet, baris, kolom, alasan) |
| **TINJAU** | Baris ditahan di `STG_*` pada antrean tinjauan manual, bisa dilanjutkan setelah master/keputusan tersedia |
| **DEFAULT(x)** | Nilai diganti x dan dicatat di `Legacy_Data` |
| **NULL** | Dibiarkan kosong (kolom baru yang tidak ada di sumber) |

---

## 3. Pemetaan per tabel

Judul menunjukkan **tabel lama → tabel baru (kode menu)**. Hanya kolom di luar kolom umum (2.2) yang ditulis.

### 3.1 Pengungsi → `MST_Posko` + `TRX_Pengungsi` (M01)
Kunci Legacy_ID: Kabupaten, Nama Posko, Kategori Pengungsi, Kategori Usia, Jenis Kelamin.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Nama Posko Pengungsi, Alamat Posko Pengungsi, Kecamatan, Kabupaten | `MST_Posko` (Nama_Posko, Alamat_Posko, ID_Kecamatan, ID_Kabupaten, ID_Kejadian) lalu `TRX_Pengungsi.ID_Posko` | Ambil nilai unik → T-NAMA→ID. Posko yang belum ada diusulkan di `STG_Master_Baru` | TINJAU |
| Kategori Pengungsi | `Kategori_Pengungsi` | T-REF | TINJAU |
| Kategori Usia | `Kategori_Usia` | T-REF ke kode `REF_KategoriUsia`. **Tidak dihitung ulang** (tidak ada usia numerik) | TINJAU |
| Jenis Kelamin | `Jenis_Kelamin` | T-REF (L/P) | TOLAK |
| Jumlah Pengungsi | `Jumlah` | T-ANGKA | TOLAK jika negatif/bukan angka |
| Keterangan | `Keterangan` | — | — |
| (tidak ada) | `Tanggal` | T-TGLDEF (tanggal harian batch) | wajib parameter |
| (tidak ada) | `MST_Posko.ID_Faskes_Pengelola` | Diusulkan: Puskesmas tunggal di kecamatan posko (bila hanya satu), selain itu kosong. **Wajib dikonfirmasi Admin Kabupaten lewat `MIG_Review`** | TINJAU |
| (turunan) | `TRX_Pengungsi.ID_Faskes` | Di-stamp dari pengelola posko (A9) | NULL bila posko belum punya pengelola → "data tanpa pemilik" |

### 3.2 Faskes → `MST_Faskes` + `TRX_Faskes_Kondisi` (M02)
Kunci: Kabupaten, Nama_Faskes.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Nama_Faskes, Alamat, Kecamatan, Kabupaten | `MST_Faskes` (Nama_Faskes, Alamat, ID_Kecamatan, ID_Kabupaten) | Nilai unik, T-NAMA→ID | TINJAU |
| (turunan nama) | `MST_Faskes.Kategori_Entitas` dan `Jenis_Faskes` | Pola nama (A10): `Faskes` (Puskesmas/RS/Pustu/Klinik/Posko Kes), `Instansi` (dinkes, bpbd, polres, dst.), `Gudang` (gudang/instalasi farmasi). Selain itu `Lainnya` | **TINJAU** (selalu dikonfirmasi) |
| Kondisi_Faskes | `Kondisi_Faskes` | T-REF | TINJAU |
| Kondisi Pelayanan | `Kondisi_Pelayanan` | T-REF | TINJAU |
| (tidak ada) | `Tanggal`, `Kontak` | T-TGLDEF; Kontak NULL | — |

### 3.3 Penilaian Kerusakan Faskes → `TRX_Penilaian_Kerusakan` (M03)
Kunci: Kabupaten, Nama_Faskes.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Nama_Faskes, Alamat | `ID_Faskes` | T-NAMA→ID | TINJAU |
| Kondisi_Faskes | (turunan dari kondisi terbaru) | T-COMPARE terhadap `TRX_Faskes_Kondisi` terbaru | Selisih dilaporkan |
| Validasi Kerusakan & Kerugian | `Validasi_Kerusakan_Kerugian` | T-REF | TINJAU |
| Hasil Validasi | `Hasil_Validasi` | — | — |
| Lembaga/Instansi yang Validasi | `Lembaga_Validasi` | — | — |
| (tidak ada) | `Tanggal_Validasi`, `Estimasi_Kerugian`, `URL_Dokumen_Drive` | NULL (tanggal: T-TGLDEF bila wajib) | — |

### 3.4 SDM Kesehatan → `TRX_SDM_Kesehatan` (M04)
Kunci: Kabupaten, Nama Faskes, Jenis SDM.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Nama Faskes, Alamat | `ID_Faskes` | T-NAMA→ID | TINJAU |
| Jenis SDM Kesehatan | `Jenis_SDM` | T-REF | TINJAU |
| Jumlah SDM Kesehatan | `Jumlah` | T-ANGKA | TOLAK |
| (tidak ada) | `Tanggal` | T-TGLDEF | — |

### 3.5 Sasaran Sub Klaster → `TRX_Sasaran` format long (M05)
Kunci: Kabupaten, Puskesmas. Satu baris lama menghasilkan hingga 20 baris baru (T-WIDE→LONG). Sel kosong dilewati, nilai 0 dipertahankan. `Legacy_ID` = `<hash baris>#<kode>`.

| Kolom lama | `Kelompok_Sasaran` | `Jenis_Kelamin` |
| --- | --- | --- |
| Jumlah Bayi Laki-Laki 0-5 Bulan | `BAYI_0_5` | L |
| Jumlah Bayi Perempuan 0-5 Bulan | `BAYI_0_5` | P |
| Jumlah Bayi Laki-Laki 6-23 Bulan | `BAYI_6_23` | L |
| Jumlah Bayi Perempuan 6-23 Bulan | `BAYI_6_23` | P |
| Jumlah Balita Laki-Laki 24-59 Bulan | `BALITA_24_59` | L |
| Jumlah Balita Perempuan 24-59 Bulan | `BALITA_24_59` | P |
| Jumlah Anak/Remaja Laki-Laki | `ANAK_REMAJA` | L |
| Jumlah Anak/Remaja Perempuan | `ANAK_REMAJA` | P |
| Jumlah Ibu Hamil | `IBU_HAMIL` | - |
| Jumlah Ibu Menyusui | `IBU_MENYUSUI` | - |
| Jumlah WUS | `WUS` | - |
| Jumlah PUS | `PUS` | - |
| Jumlah Lansia Laki-Laki | `LANSIA` | L |
| Jumlah Lansia Perempuan | `LANSIA` | P |
| Jumlah Disabilitas Laki-Laki | `DISABILITAS` | L |
| Jumlah Disabilitas Perempuan | `DISABILITAS` | P |
| Jumlah ODGJ Laki-Laki | `ODGJ` | L |
| Jumlah ODGJ Perempuan | `ODGJ` | P |
| Jumlah ODHA Laki-Laki | `ODHA` | L |
| Jumlah ODHA Perempuan | `ODHA` | P |

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Puskesmas | `ID_Faskes` | T-NAMA→ID | TINJAU |
| Kolom `Jumlah …` di atas | `Jumlah` | T-ANGKA | TOLAK jika bukan angka |
| Keterangan | `Keterangan` | Disimpan pada baris pertama (`BAYI_0_5`/L) | — |
| (tidak ada) | `Tanggal` (bila dipakai skema) | T-TGLDEF | — |

Kode kelompok di atas harus sama dengan nilai di `REF_Dropdown` grup `Kelompok_Sasaran` (dibuat di Tahap 1).

### 3.6 Pelayanan Medis → `MST_Pasien` + `TRX_Pelayanan_Medis` (M06)
Kunci: Tanggal, Nama Pasien, Jenis Kelamin, Usia, Lokasi Pelayanan Kesehatan, Rujukan.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal | `Tanggal` | T-TGL | TOLAK |
| Nama Pasien, Jenis Kelamin, Usia | `MST_Pasien` → `ID_Pasien`; Usia → `Usia` + `Satuan_Usia` | T-PASIEN, T-USIA | Dugaan duplikat → TINJAU |
| Kategori Usia | `Kategori_Usia` (dihitung ulang) | T-DROP + T-COMPARE | Selisih dilaporkan |
| Status | `Status_Pasien` | T-REF | TINJAU |
| Nama Petugas | `Nama_Petugas` | — | — |
| Lokasi Pelayanan Kesehatan | `ID_Faskes` (atau `ID_Posko` bila nama posko) | T-NAMA→ID | TINJAU |
| Rujukan | `Rujukan` (Ya/Tidak) dan `ID_Faskes_Rujukan` bila berisi nama faskes | T-BOOL, T-NAMA→ID; sisa teks → T-LEGACY | DEFAULT(Tidak) bila kosong |
| Masalah, Solusi | `Masalah`, `Solusi` | — | — |
| Upaya pelayanan medis yang telah diberikan | `Upaya` | — | — |
| (tidak ada) | `ID_Penyakit`, `ID_Korban`, `ID_Posko` | NULL | — |

Catatan: karena tidak ada posko asal, pemeriksaan duplikat pasien selama migrasi memakai Nama+JK+Usia+`ID_Faskes`; kecocokan parsial selalu TINJAU.

### 3.7 Penanggulangan Penyakit → `TRX_Penanggulangan_Penyakit` (M07)
Kunci: Tanggal, Puskesmas, Jenis Penyakit.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal | `Tanggal` | T-TGL | TOLAK |
| Puskesmas | `ID_Faskes` | T-NAMA→ID | TINJAU |
| Jenis Penyakit | `ID_Penyakit` | Pencocokan A11 ke `MST_Penyakit` (seed Lampiran J): persis → sinonim → kemiripan ≥ 0,85 hanya sebagai **usulan** | TINJAU. Tak ada padanan: pilih `PYK-9999`, nama asli ke `Legacy_Data` |
| Jumlah Kasus | `Jumlah_Kasus_Final` | T-ANGKA | TOLAK |
| (tidak ada) | `Jumlah_Kasus_Sistem` | NULL saat migrasi, dihitung setelah `RekapService` berjalan; selisih diberi flag | — |
| Masalah, Solusi, Upaya | `Masalah`, `Solusi`, `Upaya` | — | — |

### 3.8 Kesehatan Lingkungan → `TRX_Kesling` (M08)
Kunci: Tanggal, Kabupaten, Nama Posko Pengungsi.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal | `Tanggal` | T-TGL | TOLAK |
| Nama Posko Pengungsi, Alamat Posko Pengungsi, Kecamatan | `ID_Posko`; `ID_Faskes` di-stamp dari pengelola posko (A9) | T-NAMA→ID ke `MST_Posko` | TINJAU; tanpa pengelola → `ID_Faskes` NULL |
| Jumlah Pengungsi | `Jumlah_Pengungsi` | Disimpan sebagai **snapshot historis** | — |
| Kebutuhan Air Bersih per Orang/Hari | `Kebutuhan_Air_per_Orang_Hari` | T-ANGKA | — |
| Jumlah Tandon Air, Volume Tandon Air | `Jml_Tandon`, `Volume_Tandon` | T-ANGKA | — |
| Toilet Tersedia, Dapur Tersedia, Tenda Pengungsi Tersedia | `Toilet_Tersedia`, `Dapur_Tersedia`, `Tenda_Tersedia` | T-ANGKA | — |
| Jumlah Kantung Plastik Sampah di Toilet / Dapur / Tenda Pengungsi | `Kantung_Sampah_Toilet`, `Kantung_Sampah_Dapur`, `Kantung_Sampah_Tenda` | T-ANGKA | — |
| Jumlah Kontainer Sampah 50-100 liter untuk 10-12 orang | `Kontainer_Sampah_Tersedia` | T-ANGKA | — |
| Kebutuhan Toilet, Tambahan Toilet, Kebutuhan Dapur, Tambahan Dapur, Kebutuhan Tenda Pengungsi, Tambahan Tenda Pengungsi, Kebutuhan Tambahan Kontainer Sampah | (dihitung server) | T-DROP + T-COMPARE | Selisih dilaporkan |
| Masalah, Solusi, Keterangan | `Masalah`, `Solusi`, `Keterangan` | — | — |

### 3.9 Kesehatan Reproduksi → `TRX_Kespro` (M09)
Kunci: Tanggal, Puskesmas.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal; Puskesmas | `Tanggal`; `ID_Faskes` | T-TGL; T-NAMA→ID | TOLAK; TINJAU |
| Ibu Hamil Riil, Ibu Nifas Riil, Bayi Baru Lahir Riil, Balita Riil, Remaja Riil, PUS Riil, KB Riil, Lansia Riil | `Ibu_Hamil`, `Ibu_Nifas`, `Bayi_Baru_Lahir`, `Balita`, `Remaja`, `PUS`, `KB`, `Lansia` | T-ANGKA | TOLAK |
| Proyeksi Ibu Hamil / Ibu Nifas / Bayi Baru Lahir / Balita / Remaja / PUS / KB / Lansia | (dihitung dari `TRX_Sasaran`) | T-DROP + T-COMPARE | Selisih dilaporkan |
| Masalah, Solusi, Upaya yang telah dilakukan | `Masalah`, `Solusi`, `Upaya` | — | — |

### 3.10 Kesehatan Jiwa → `TRX_Keswa` (M10)
Kunci: Tanggal, Puskesmas.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal; Puskesmas | `Tanggal`; `ID_Faskes` | T-TGL; T-NAMA→ID | TOLAK; TINJAU |
| Jumlah ODGJ | (otomatis dari `TRX_Sasaran`) | T-DROP + T-COMPARE | Selisih dilaporkan |
| Jumlah ODGJ Terdampak, Jumlah Disabilitas Terdampak, Jumlah Lansia Terdampak | `ODGJ_Terdampak`, `Disabilitas_Terdampak`, `Lansia_Terdampak` | T-ANGKA | TOLAK |
| Masalah, Solusi, Upaya yang telah dilakukan | `Masalah`, `Solusi`, `Upaya` | — | — |

### 3.11 Pelayanan Gizi → `MST_Pasien` + `TRX_Gizi` (M11)
Kunci: Tanggal, Nama, Jenis Kelamin, Usia, Lokasi Pelayanan Kesehatan.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal | `Tanggal` | T-TGL | TOLAK |
| Lokasi Pelayanan Kesehatan | `ID_Faskes` | T-NAMA→ID | TINJAU |
| Nama, Jenis Kelamin, Usia | `ID_Pasien`; `Usia` + `Satuan_Usia` | T-PASIEN, T-USIA (pasien yang sama dengan Pelayanan Medis dipakai ulang) | TINJAU |
| Kategori Usia | dihitung ulang | T-DROP + T-COMPARE | Selisih dilaporkan |
| Status; Petugas | `Status_Pasien`; `Petugas` | T-REF | TINJAU |
| ASI, MP-ASI Lokal, PMT Biskuit, Vitamin A | `ASI`, `MP_ASI_Lokal`, `PMT_Biskuit`, `Vitamin_A` | T-BOOL | DEFAULT(Tidak) |
| Skrining Status Gizi, Status Gizi | `Skrining_Status_Gizi`, `Status_Gizi` | T-BOOL / T-REF | TINJAU |
| Gizi Buruk | `Gizi_Buruk` | T-BOOL (**notifikasi dimatikan** oleh `MIGRATION_MODE`) | — |
| Skrining Pita LILA, Hasil Skrining Pita LILA | `Skrining_LILA`, `Hasil_LILA` | T-BOOL; teks/angka apa adanya | — |
| Tablet Tambah Darah, Konseling Menyusui, Konseling Tablet Tambah Darah | `Tablet_Tambah_Darah`, `Konseling_Menyusui`, `Konseling_TTD` | T-BOOL | DEFAULT(Tidak) |
| Masalah, Solusi, Upaya pelayanan kesehatan yang telah diberikan | `Masalah`, `Solusi`, `Upaya` | — | — |

### 3.12 Promosi Kesehatan → `TRX_Promkes` (M12)
Kunci: Tanggal, Kecamatan, Petugas Promkes, Lokasi Kunjungan.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal | `Tanggal` | T-TGL | TOLAK |
| Kecamatan | `ID_Kecamatan` | T-NAMA→ID | TINJAU |
| Petugas Promkes | `Petugas_Promkes` | — | — |
| Lokasi Kunjungan, Alamat Lokasi Kunjungan | `Lokasi_Kunjungan`, `Alamat_Kunjungan` | Tidak dikaitkan ke posko | — |
| Materi KIE | `Materi_KIE` | — | — |
| Masalah, Solusi, Upaya yang telah dilakukan | `Masalah`, `Solusi`, `Upaya` | — | — |
| (tidak ada) | `ID_Faskes`, `ID_Posko`, `Sasaran_Jumlah` | NULL | — |

### 3.13 DVI → `TRX_DVI` (M13)
Kunci: Tanggal, Kecamatan.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal; Kecamatan | `Tanggal`; `ID_Kecamatan` | T-TGL; T-NAMA→ID | TOLAK; TINJAU |
| Jumlah Jenazah Utuh Ditemukan | `Jenazah_Utuh` | T-ANGKA | TOLAK |
| Jumlah Bagian Tubuh Ditemukan; Spesifikasi Bagian Tubuh Ditemukan | `Bagian_Tubuh`; `Spesifikasi_Bagian_Tubuh` | T-ANGKA; teks | — |
| Data Ante-Mortem Masuk; Post-Mortem Selesai Diperiksa | `AM_Masuk`; `PM_Selesai` | T-ANGKA | — |
| Teridentifikasi; Sudah Diserahkan Ke Keluarga | `Teridentifikasi`; `Diserahkan_ke_Keluarga` | T-ANGKA | — |
| Jumlah Yang Belum Teridentifikasi | (dihitung server) | T-DROP + T-COMPARE | Selisih dilaporkan |
| Lokasi Penyimpanan Sementara; Rencana Transportasi Jenazah | `Lokasi_Penyimpanan`; `Rencana_Transportasi` | — | — |
| Kendala; Upaya lain Yang Dilakukan | `Kendala`; `Upaya_Lain` | — | — |

### 3.14 Dasar Permintaan → `TRX_Permintaan` (M14)
Kunci: `ID_Permintaan` (ID lama dipertahankan di `Legacy_ID` dan `Nomor_Form`; `ID_Permintaan` baru dibuat lewat IdService, T-GENID).

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| ID_Permintaan | `ID_Permintaan` (baru) + `Legacy_ID` | T-GENID, peta ID lama → baru disimpan di `MIG_IdMap` untuk tabel rincian | TOLAK bila ID lama ganda |
| ID_Faskes/Instansi | `ID_Faskes` (pemohon) | T-ID. Entitas non-faskes memakai `MST_Faskes` dengan `Kategori_Entitas = Instansi`/`Gudang` (A10) | TINJAU |
| Nomor_Form, Tanggal, Jam | `Nomor_Form`, `Tanggal`, `Jam` | T-TGL | TOLAK untuk Tanggal |
| Asal Permintaan, Ditujukan kepada, Urgensi | `Asal_Permintaan`, `Ditujukan_Kepada`, `Urgensi` | T-REF untuk Urgensi | TINJAU |
| Nama Pemohon, Jabatan Pemohon, HP Pemohon | `Nama_Pemohon`, `Jabatan_Pemohon`, `HP_Pemohon` | HP dinormalisasi (+62) | DEFAULT(apa adanya) |
| Jumlah LB/RI, Jumlah LR/RJ, Jumlah Pengungsi, Jumlah Bayi, Jumlah Balita, Jumlah Bumil, Jumlah Lansia, Jumlah Disabilitas, Jumlah Posko Pengungsi, Penyakit Dominan | `Jml_LB_RI`, `Jml_LR_RJ`, `Jml_Pengungsi`, `Jml_Bayi`, `Jml_Balita`, `Jml_Bumil`, `Jml_Lansia`, `Jml_Disabilitas`, `Jml_Posko`, `Penyakit_Dominan` | Dipertahankan sebagai **nilai historis yang pernah diisi** (tidak diisi ulang otomatis) | — |
| Alamat Pengiriman, Kondisi Akses, Fasilitas Penyimpanan, Nama Penerima Tujuan | kolom bernama sama | — | — |
| Disetujui oleh, Tanggal Persetujuan | `Disetujui_Oleh`, `Tanggal_Persetujuan` | T-TGL | — |

### 3.15 Rincian Permintaan → `TRX_Permintaan_Rinci` (M15)
Kunci: ID_Permintaan, ID_Barang (atau Nama Barang).

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| ID_Permintaan | `ID_Permintaan` | T-LINK lewat `MIG_IdMap` | TOLAK bila header tidak ada |
| ID_Faskes/Instansi | (sudah ada di header) | T-DROP, diperiksa konsisten dengan header | TINJAU bila berbeda |
| ID_Barang, Nama Barang, Kategori, Satuan | `ID_Barang` | Cocokkan `ID_Barang`, bila kosong cocokkan Nama Barang ke `MST_Barang`. Kategori dan Satuan dipakai mengisi `MST_Barang` baru yang diusulkan | TINJAU |
| Jumlah Stok saat ini | `Stok_Saat_Ini` | Dipertahankan sebagai snapshot historis | — |
| Jumlah Permintaan | `Jumlah_Permintaan` | T-ANGKA | TOLAK |
| Status | `Status` | T-REF | TINJAU |

### 3.16 Distribusi → `TRX_Distribusi` (M16)
Kunci: ID_Permintaan, ID_Faskes/Instansi, Tujuan Nama, Perkiraan Tiba.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| (tidak ada) | `ID_Distribusi` | T-GENID, peta ke `MIG_IdMap` | — |
| ID_Permintaan | `ID_Permintaan` | T-LINK | TOLAK |
| ID_Faskes/Instansi, Tujuan Nama | `ID_Faskes_Tujuan` | T-NAMA→ID; bila gagal, teks disimpan di `Legacy_Data` | TINJAU |
| (tidak ada) | `ID_Faskes` (**pengirim/sumber stok**, A13 #7) | Diturunkan dari `ID_Faskes` baris **Keluar** pada Kartu Stok lama dengan dokumen yang sama. Bila tidak ada, ambil dari pemegang stok barang terkait | TINJAU bila tidak dapat ditentukan |
| Tujuan Alamat | `Tujuan_Alamat` | — | — |
| Perkiraan Tiba | `Perkiraan_Tiba` | T-TGL (tanggal+jam) | — |
| Pengemasan, Alat Angkut, Nama Pengantar, Suhu Awal, Status | kolom bernama sama | T-REF untuk Status | TINJAU |

### 3.17 Rincian Distribusi → `TRX_Distribusi_Rinci` (M17)

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| ID_Permintaan, ID_Faskes/Instansi | `ID_Distribusi` | T-LINK: cari `TRX_Distribusi` dengan `ID_Permintaan` (+ faskes tujuan) | **TINJAU bila ada lebih dari satu distribusi cocok** |
| ID_Barang, Nama Barang, Kategori, Satuan | `ID_Barang` | seperti 3.15 | TINJAU |
| Nomor Batch, Tanggal Kadaluarsa | `Nomor_Batch`, `Tgl_Kadaluarsa` | T-TGL | — |
| Jumlah Permintaan; Jumlah Dikeluarkan | `Jumlah_Permintaan`; `Jumlah_Dikeluarkan` | T-ANGKA | TOLAK |
| Selisih | (dihitung server) | T-DROP + T-COMPARE | Selisih dilaporkan |
| Status | `Status` | T-REF | TINJAU |

> Saat migrasi, `MIGRATION_MODE = TRUE` **mencegah** penyimpanan rincian menulis Barang Keluar ke Kartu Stok. Jika tidak dimatikan, stok akan tercatat ganda.

### 3.18 Penerimaan → `TRX_Penerimaan` (M18)
Kunci: ID_Permintaan, ID_Faskes/Instansi, Tanggal, Ref Surat Jalan.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| (tidak ada) | `ID_Penerimaan` | T-GENID, peta ke `MIG_IdMap` | — |
| ID_Permintaan | `ID_Permintaan`; `ID_Distribusi` bila hanya ada satu distribusi untuk permintaan itu | T-LINK | Lebih dari satu → `ID_Distribusi` NULL, TINJAU |
| ID_Faskes/Instansi | `ID_Faskes` | T-ID | TINJAU |
| Tanggal, Jam | `Tanggal`, `Jam` | T-TGL | TOLAK |
| Lokasi Penerimaan, Ref Surat Jalan, Sumber | kolom bernama sama (`Sumber` T-REF; `Donasi` bila tanpa distribusi) | T-REF | TINJAU |
| Nama Pemberi, Kontak Pemberi, Alat Angkut, Nama Pengantar | kolom bernama sama | — | — |
| Hasil Pemeriksaan, Penyimpanan di, Petugas Penyimpanan, Nama Penerima, Catatan, Status | `Hasil_Pemeriksaan`, `Penyimpanan_di`, `Petugas_Penyimpanan`, `Nama_Penerima`, `Catatan`, `Status` | T-REF untuk Hasil_Pemeriksaan dan Status | TINJAU |

### 3.19 Rincian Penerimaan → `TRX_Penerimaan_Rinci` (M19)
Struktur lama **tidak punya `ID_Barang`**, hanya Nama Barang.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| ID_Permintaan, ID_Faskes/Instansi | `ID_Penerimaan` | T-LINK ke `TRX_Penerimaan` dengan `ID_Permintaan` + `ID_Faskes` | **TINJAU bila lebih dari satu penerimaan cocok** |
| Nama Barang, Kategori, Satuan | `ID_Barang` | Cocokkan Nama Barang ke `MST_Barang` (normalisasi nama) | TINJAU, jangan menebak |
| Jumlah Diterima | `Jumlah_Diterima` | T-ANGKA | TOLAK |
| Nomor Batch, Tanggal Kadaluarsa | `Nomor_Batch`, `Tgl_Kadaluarsa` | T-TGL | — |
| Kondisi, Suhu Tiba, Penanganan | `Kondisi`, `Suhu_Tiba`, `Penanganan` | T-REF untuk Kondisi | TINJAU |

### 3.20 Kartu Stok → `TRX_Kartu_Stok` (M20)
Kunci: ID_Faskes/Instansi, ID_Barang, Nomor Batch, Jenis Transaksi, Nomor Dokumen, Jumlah Masuk, Jumlah Keluar.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| ID_Faskes/Instansi | `ID_Faskes` | T-ID | TINJAU |
| ID_Barang, Nama Barang | `ID_Barang` | seperti 3.15 | TINJAU |
| Nomor Batch, Tanggal Kadaluarsa | `Nomor_Batch`, `Tgl_Kadaluarsa` | T-TGL | — |
| Jenis Transaksi, Ref Tipe | `Jenis_Transaksi` (Masuk/Keluar/Koreksi), `Ref_Tipe` | T-REF | TINJAU |
| Nomor Dokumen, Asal Tujuan | `Nomor_Dokumen`, `Asal_Tujuan` | Nomor dokumen lama dipetakan lewat `MIG_IdMap` bila merujuk ID permintaan/distribusi/penerimaan | DEFAULT(teks lama) |
| Jumlah Barang Masuk, Jumlah Barang Keluar | `Jml_Masuk`, `Jml_Keluar` | T-ANGKA | TOLAK |
| Sisa | `Sisa` (dihitung ulang) | T-COMPARE | Lihat mode di bawah |
| Lokasi Penyimpanan, Paraf Petugas, Catatan | kolom bernama sama | — | — |
| ID_Permintaan | — | T-LEGACY | — |

**Dua mode (`Mode_Kartu_Stok`), memperbarui rekomendasi T-STOK di A5:**
- **`RIWAYAT` (default):** impor seluruh baris lama berurutan per (faskes, barang, batch). Server menghitung ulang `Sisa`. Bila hasil sama dengan `Sisa` lama untuk **seluruh** baris kelompok itu, kelompok diterima. Bila ada selisih, kelompok itu beralih otomatis ke `SALDO_AWAL` dan dilaporkan.
- **`SALDO_AWAL`:** satu baris `Koreksi` bernilai saldo akhir per kelompok, dengan catatan "Saldo awal migrasi".
- Aksi Edit/Delete pada tabel lama **tidak dimigrasikan**. Ledger baru bersifat append-only.

### 3.21 Surveilans → `TRX_Surveilans` (M21)
Kunci: Tanggal, Kecamatan, Desa/Kelurahan, Puskesmas, Jenis Penyakit, Usia, Jenis Kelamin.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal | `Tanggal` | T-TGL | TOLAK |
| Kecamatan | `ID_Kecamatan` | T-NAMA→ID | TINJAU |
| Desa/Kelurahan | `Desa_Kelurahan` | Teks dinormalisasi | — |
| Puskesmas | `ID_Faskes` | T-NAMA→ID | TINJAU |
| Lokasi | `Lokasi` | — | — |
| Jenis Penyakit | `ID_Penyakit` | Pencocokan A11 (sama dengan 3.7) | TINJAU; `PYK-9999` bila tak ada padanan |
| Usia | `Usia` + `Satuan_Usia` | T-USIA | TINJAU bila tidak terbaca |
| Kategori Usia | dihitung ulang | T-DROP + T-COMPARE | Selisih dilaporkan |
| Jenis Kelamin | `Jenis_Kelamin` | T-REF | TOLAK |
| Jumlah Kasus Dilaporkan / Diselidiki / Suspek / Konfirmasi | `Jml_Dilaporkan`, `Jml_Diselidiki`, `Jml_Suspek`, `Jml_Konfirmasi` | T-ANGKA | TOLAK |
| Status Pasien | `Status_Pasien` | T-REF | TINJAU |
| Jumlah Sampel Diambil & Diperiksa | `Jml_Sampel` | T-ANGKA | — |
| Faktor Risiko/Kondisi Khusus, Tindakan Penanggulangan, Tindak Lanjut | `Faktor_Risiko`, `Tindakan_Penanggulangan`, `Tindak_Lanjut` | — | — |

### 3.22 F1 Rekap Harian → `MST_Indikator` + `TRX_Rekap_Harian` (M22)
Kunci: Indikator, Kabupaten (+ `Tanggal_Snapshot`).

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Indikator | `ID_Indikator` | Nilai unik diusulkan ke `MST_Indikator`, lalu T-NAMA→ID. `Sumber_Otomatis` diisi manual di Tahap 10 | TINJAU |
| Jumlah hari ini, Jumlah Kemarin, Kumulatif | `Jumlah_Hari_Ini`, `Jumlah_Kemarin`, `Kumulatif` | Dipertahankan sebagai **nilai historis** | — |
| Jumlah Angka Resmi | `Angka_Resmi` | T-ANGKA | — |
| Terverifikasi | `Terverifikasi` | T-BOOL | DEFAULT(Tidak) |
| (tidak ada) | `Tanggal` | T-TGLDEF | wajib parameter |

### 3.23 F2 Laporan Situasi Ringkas → `TRX_Laporan_Situasi` (M23)
Kunci: Kabupaten (+ `Tanggal_Snapshot`) + hash Gambaran kejadian.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Gambaran kejadian dan wilayah terdampak | `Gambaran_Kejadian` | — | — |
| Situasi Penyakit dan Kesehatan Lingkungan | `Situasi_Penyakit_Kesling` | — | — |
| Respons yang sudah dilakukan | `Respons` | — | — |
| Kesenjangan dan Kendala | `Kesenjangan_Kendala` | — | — |
| Kebutuhan mendesak dan rekomendasi | `Kebutuhan_Mendesak_Rekomendasi` | — | — |
| Rencana 24-72 jam ke depan | `Rencana_24_72_Jam` | — | — |
| (tidak ada) | `Tanggal`, `URL_Docs`, `URL_PDF` | T-TGLDEF; NULL | — |

### 3.24 Relawan → `TRX_Relawan` + `TRX_Relawan_Anggota` (M24)
Kunci: Kabupaten, Nama Tim Relawan, Tanggal Kedatangan, Nomor Surat Tugas.

| Kolom lama | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Tanggal | `Tanggal` | T-TGL | TOLAK |
| Nama Tim Relawan | `Nama_Tim` | — | — |
| Tanggal Kedatangan, Tanggal Kepulangan | `Tgl_Kedatangan`, `Tgl_Kepulangan` | T-TGL | Kepulangan kosong diizinkan |
| Lama Tugas | (dihitung server) | T-DROP + T-COMPARE | Selisih dilaporkan |
| Nomor Surat Tugas, Jenis Relawan, Jenis SDM Kesehatan | `No_Surat_Tugas`, `Jenis_Relawan`, `Jenis_SDM` | T-REF untuk jenis | TINJAU |
| Rincian Nama Relawan | `TRX_Relawan_Anggota` (Nama, Profesi, Kontak) | T-SPLIT: pecah per baris/koma/titik koma. Pola `Nama (Profesi)` atau `Nama - Profesi` dipecah menjadi Nama + Profesi; Kontak NULL | TINJAU bila pecahan ambigu |
| Lokasi Penempatan | `ID_Faskes` atau `ID_Posko` | T-NAMA→ID; bila gagal teks disimpan di `Legacy_Data` | TINJAU |
| Keterangan, Kendala, Solusi | kolom bernama sama | — | — |

### 3.25 Korban dan Perkembangan Korban → `MST_Pasien` + `TRX_Korban` + `TRX_Korban_Perkembangan` (M25, M26)

> **Pemetaan sementara.** Struktur lama Korban tidak ada di `Struktur tabel.txt`. Pemetaan di bawah disusun dari kolom yang diketahui pada rancangan Korban dan aturan A4. **Jalankan `inspectLegacyKorban()` (di bawah) terhadap sheet Korban yang ada**, lalu koreksi baris yang tidak cocok sebelum `dryRun()`.

| Kolom lama (dugaan) | Kolom baru | Transformasi | Aturan gagal |
| --- | --- | --- | --- |
| Nama, Jenis Kelamin, Usia (atau Tanggal Lahir) | `MST_Pasien` → `ID_Pasien` | T-PASIEN, T-USIA. Pasien yang sama dengan Pelayanan Medis/Gizi dipakai ulang | TINJAU bila dugaan duplikat |
| Tanggal Kejadian / Tgl Awal | `Tgl_Kejadian_Awal` | T-TGL | TOLAK |
| Status Awal | `Status_Awal` | T-REF ke {`Meninggal`, `Luka Berat`, `Luka Ringan`, `Hilang`} | TINJAU |
| Lokasi Kejadian, Diagnosa, Kewarganegaraan | `Lokasi_Kejadian`, `Diagnosa`, `Kewarganegaraan` | Diagnosa dicocokkan ke `MST_Penyakit` bila memungkinkan, selain itu teks | — |
| Lokasi Perawatan | `ID_Faskes` (pemilik, A9) dan `ID_Faskes_Perawatan` | T-NAMA→ID | TINJAU |
| Rujukan | `ID_Faskes_Tujuan_Rujuk` bila `Status_Lanjutan = Dirujuk` | T-NAMA→ID | TINJAU |
| Status Lanjutan | 1 baris `TRX_Korban_Perkembangan` (`Status_Lanjutan`) | T-KORBAN (aturan di bawah) | TINJAU |
| Tgl Sembuh/Rujuk/Meninggal | `Tanggal` pada baris perkembangan; `Tgl_Meninggal` bila `Meninggal` | T-TGL | Kosong: pakai `Tgl_Kejadian_Awal`, ditandai di `Legacy_Data` |

**Normalisasi label status (T-REF) yang dipakai awal, diperluas setelah dry-run:**

| Label lama (contoh, tanpa membedakan huruf besar/kecil) | Nilai baru |
| --- | --- |
| berat, LB, luka berat | `Luka Berat` |
| ringan, LR, luka ringan | `Luka Ringan` |
| meninggal, MD, wafat, korban jiwa | `Meninggal` |
| hilang, belum ditemukan, MH | `Hilang` (awal) atau `Masih Hilang` (lanjutan) |
| dirawat, rawat inap, RI | `Rawat Inap` |
| rawat jalan, RJ | `Rawat Jalan` |
| rujuk, dirujuk | `Dirujuk` |
| sembuh, pulang, selesai rawat | `Sembuh` |
| ditemukan selamat, ditemukan hidup | `Ditemukan Hidup` |

**Aturan T-KORBAN:**
1. `Status_Awal` ditulis sekali di `TRX_Korban` dan tidak berubah.
2. Bila `Status_Lanjutan` terisi, buat **satu** baris `TRX_Korban_Perkembangan`. Bila tabel perkembangan lama terpisah, impor **setiap** baris berurutan tanggal lalu `Created_At`.
3. Seluruh rantai divalidasi dengan transisi **A4**. Transisi tidak sah (mis. `Meninggal → Sembuh`, `Hilang → Rawat Jalan` tanpa `Ditemukan Hidup`) **tidak ditebak**: baris masuk TINJAU dengan penjelasan.
4. `Dirujuk` tanpa faskes tujuan, atau `Meninggal` tanpa tanggal, mengikuti aturan gagal di tabel di atas.
5. Satu orang hanya satu `TRX_Korban` aktif per kejadian (A4 #4). Duplikat → TINJAU.
6. Angka hasil migrasi (total meninggal, LB rawat inap, LR rawat jalan, hilang) dibandingkan dengan hitungan lama di laporan rekonsiliasi.

**Alat pemeriksa struktur lama (jalankan sekali, hasilnya ditempel ke sesi AI Tahap 12):**

```javascript
// LegacyInspector.gs — hanya membaca, tidak mengubah apa pun.
function inspectLegacyKorban() {
  var SPREADSHEET_ID = 'ISI_ID_SPREADSHEET_KORBAN_LAMA';
  var SHEETS = ['Korban', 'Perkembangan Korban']; // sesuaikan nama sheet
  var EXPECTED = {
    nama: ['nama', 'nama korban', 'nama pasien'],
    jk: ['jenis kelamin', 'jk'],
    usia: ['usia', 'umur', 'tanggal lahir'],
    tglAwal: ['tanggal kejadian', 'tgl kejadian', 'tgl kejadian awal'],
    statusAwal: ['status awal'],
    lokasiKejadian: ['lokasi kejadian'],
    diagnosa: ['diagnosa', 'diagnosis'],
    kewarganegaraan: ['kewarganegaraan'],
    lokasiPerawatan: ['lokasi perawatan', 'tempat perawatan'],
    rujukan: ['rujukan', 'rujuk'],
    statusLanjutan: ['status lanjutan', 'status terkini'],
    tglLanjutan: ['tgl sembuh/rujuk/meninggal', 'tanggal sembuh', 'tanggal meninggal']
  };
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var out = [];
  SHEETS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { out.push({ sheet: name, error: 'Sheet tidak ditemukan' }); return; }
    var lastCol = sh.getLastColumn();
    var headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    var map = {};
    Object.keys(EXPECTED).forEach(function (k) {
      var idx = headers.findIndex(function (h) {
        return EXPECTED[k].indexOf(h.trim().toLowerCase()) !== -1;
      });
      map[k] = idx === -1 ? null : headers[idx];
    });
    var statusAwalDistinct = [], statusLanjutDistinct = [];
    var iA = headers.findIndex(function (h) { return EXPECTED.statusAwal.indexOf(h.trim().toLowerCase()) !== -1; });
    var iL = headers.findIndex(function (h) { return EXPECTED.statusLanjutan.indexOf(h.trim().toLowerCase()) !== -1; });
    var n = Math.max(sh.getLastRow() - 1, 0);
    if (n > 0 && iA > -1) {
      statusAwalDistinct = uniq_(sh.getRange(2, iA + 1, n, 1).getValues());
    }
    if (n > 0 && iL > -1) {
      statusLanjutDistinct = uniq_(sh.getRange(2, iL + 1, n, 1).getValues());
    }
    out.push({ sheet: name, jumlahBaris: n, headers: headers, cocok: map,
               nilaiStatusAwal: statusAwalDistinct, nilaiStatusLanjutan: statusLanjutDistinct });
  });
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
function uniq_(rows) {
  var seen = {}, res = [];
  rows.forEach(function (r) {
    var v = String(r[0]).trim();
    if (v && !seen[v]) { seen[v] = true; res.push(v); }
  });
  return res;
}
```

Hasil log memuat: header sebenarnya, kolom mana yang cocok dengan dugaan (`null` = tidak ditemukan), dan **nilai unik status** untuk melengkapi tabel normalisasi label di atas.

---

## 4. Urutan migrasi dan rekonsiliasi

### 4.1 Urutan eksekusi (wajib berurutan)

| Langkah | Isi | Catatan |
| --- | --- | --- |
| 1 | `MST_Kejadian`, `MST_Wilayah` | Dari nilai unik `ID_Kejadian`/`ID_Kabupaten` + daftar wilayah resmi. Kecamatan dari kolom teks |
| 2 | `MST_Faskes` | Dari tabel Faskes + nama faskes/instansi di semua tabel lain. Klasifikasi `Kategori_Entitas` (A10). **Tinjau manual** sebelum lanjut |
| 3 | `MST_Posko` | Dari Pengungsi dan Kesling. **Wajib menetapkan `ID_Faskes_Pengelola`** (A9) lewat `MIG_Review` |
| 4 | `MST_Barang` | Dari Rincian Permintaan/Distribusi/Penerimaan/Kartu Stok. Tinjau manual (nama ganda/ejaan) |
| 5 | `MST_Penyakit` | Impor seed Lampiran J (status `Usulan`), lalu cocokkan nama penyakit lama (A11). Penyakit di luar seed ditinjau dan diusulkan ke Admin Provinsi |
| 6 | `MST_Indikator` | Dari F1 |
| 7 | `MST_Pasien` | Dari Pelayanan Medis dan Gizi, dengan antrean duplikat |
| 8 | TRX kluster A, B, C | Pengungsi, Faskes, Penilaian, SDM → Sasaran, Pelayanan Medis, Penanggulangan, Gizi, Surveilans → Kesling, Kespro, Keswa, Promkes, DVI, Relawan |
| 9 | Logistik | Permintaan → Rincian Permintaan → Distribusi → Rincian Distribusi → Penerimaan → Rincian Penerimaan → Kartu Stok |
| 10 | F1, F2 | Setelah RKP dibangun ulang |
| 11 | Bangun ulang `RKP_`, hitung `Jumlah_Kasus_Sistem`, laporan rekonsiliasi | `MIGRATION_MODE` dimatikan setelah ini |
| 12 | **Validasi massal** Admin Provinsi per batch × kabupaten × tabel (`Terverifikasi → Tervalidasi`) | Hanya bila rekonsiliasi lulus dan `MIG_Review` kosong (A12) |

Setiap langkah memakai `TimeBudget` (potongan ±500 baris) dan menulis **satu entri audit ringkasan per batch**, bukan per baris.

### 4.2 Rekonsiliasi per tabel

| Tabel | Pemeriksaan jumlah baris | Pemeriksaan total angka |
| --- | --- | --- |
| Pengungsi | baris lama = baris baru + `MIG_Error` + tinjauan | Σ Jumlah Pengungsi per kabupaten |
| Faskes, Penilaian, SDM | idem | Σ Jumlah SDM per kabupaten; hitungan kondisi per kategori |
| Sasaran | baris baru = Σ sel terisi di lama | Σ semua kelompok per puskesmas |
| Pelayanan Medis, Gizi | idem; jumlah pasien unik dilaporkan | Hitungan per Status dan Kategori Usia |
| Penanggulangan, Surveilans | idem | Σ Jumlah Kasus per penyakit |
| Kesling, Kespro, Keswa, DVI | idem | Σ kolom Tersedia/Riil/Terdampak; selisih turunan (T-COMPARE) |
| Logistik | header dan rincian per `ID_Permintaan` | Σ Jumlah Permintaan, Dikeluarkan, Diterima per barang; Σ Masuk−Keluar = Sisa Kartu Stok |
| F1, F2, Relawan | idem | Σ Angka Resmi; jumlah anggota relawan |

Laporan akhir: ringkasan per tabel (diterima / ditolak / tinjauan / selisih), daftar peringatan baris ganda, dan daftar tanggal yang diisi otomatis.

---

## 5. Perubahan skema (final)

Seluruhnya dikonsolidasikan di **A13** (Paket Prompt Bertahap Revisi 3) dan diterapkan di Tahap 1 serta Tahap 12. Ringkasan:

1. `Legacy_ID`, `Legacy_Data`, `Migration_Batch` pada semua tabel yang dimigrasi.
2. Sheet `MIG_IdMap`, `MIG_Error`, `MIG_Review`, `SYS_MigrationBatch`, `STG_*`, `STG_Master_Baru`.
3. `MST_Posko.ID_Faskes_Pengelola` (wajib) dan stamping `ID_Faskes` oleh server (**A9**).
4. `MST_Faskes.Kategori_Entitas` (Faskes/Instansi/Gudang) dan `Jenis_Faskes` diperluas (**A10**).
5. `MST_Penyakit.Sinonim` dan `Status_Verifikasi`, seed Lampiran J (**A11**).
6. Kolom sistem `Verified_By/At`, `Validated_By/At`, `Catatan_Verifikasi` (**A12**).
7. `TRX_Distribusi.ID_Faskes` = faskes pengirim.
8. `REF_Dropdown` baru (`Kelompok_Sasaran` 12 kode, dll.) dan `MIGRATION_MODE`.

## 6. Keputusan final

| # | Hal | Keputusan | Alasan |
| --- | --- | --- | --- |
| 1 | `Tanggal_Snapshot` | **Tanggal harian** (`yyyy-MM-dd`), satu nilai per batch, default tanggal pembekuan sistem lama | Selaras dengan sifat data harian (F1) dan Pengungsi snapshot per tanggal |
| 2 | `Status_Data_Migrasi` | **`Terverifikasi`**, menjadi `Tervalidasi` lewat validasi massal Admin Provinsi | Data lama belum pernah divalidasi Provinsi di sistem baru, dan Admin Posko tetap terkunci dari edit |
| 3 | `Mode_Kartu_Stok` | `RIWAYAT` dengan cadangan otomatis `SALDO_AWAL` | Riwayat tersimpan bila saldonya terbukti cocok, tanpa mengorbankan konsistensi ledger. Belum ada keputusan eksplisit, bisa diubah per batch |
| 4 | Struktur lama Korban | Pemetaan sementara 3.25 + `inspectLegacyKorban()` | Struktur aktual tidak tersedia. Alat pemeriksa menghasilkan fakta yang menyelesaikan dugaan |
| 5 | Lingkup Admin Posko | `ID_Faskes_Pengelola` + stamping `ID_Faskes` oleh server + tipe lingkup F/P/R/K (**A9**) | Filter seragam dan cepat, tidak ada join saat baca, mencegah input atas nama posko lain |
| 6 | Instansi non-faskes | Satu tabel `MST_Faskes` + `Kategori_Entitas` (**A10**) | Logistik perlu menunjuk Dinkes/BPBD/Gudang, sementara hitungan faskes tidak boleh tercemar |
| 7 | ICD-10 | Seed 63 penyakit status `Usulan` + verifikasi Dinkes + pencocokan tanpa auto-terima (**A11**) | Tidak menunda migrasi, tetapi tidak mengklaim kode resmi sebelum diverifikasi |

## 7. Tambahan untuk prompt Tahap 12

Tempel kalimat berikut di akhir prompt Tahap 12 pada Paket Prompt:

> Pemetaan kolom lama → baru **sudah tersedia** di berkas "Pemetaan Migrasi Struktur Lama ke Baru". Jangan membuat ulang. Tugas Anda: (1) verifikasi setiap baris pemetaan terhadap data aktual lewat `dryRun()` dan laporkan pemetaan yang salah; (2) terapkan perubahan skema Bagian 5; (3) bangun `Migration.gs` sesuai urutan Bagian 4.1, memakai parameter Bagian 2.1; (4) buat antrean tinjauan (`MIG_Review`) dan laporan rekonsiliasi Bagian 4.2.
