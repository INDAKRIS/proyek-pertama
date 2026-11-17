/**
 * Repo.gs — Repository generik untuk menu data M01–M26 (definisi di Config.gs: buildMenuConfig).
 * Dipanggil dari Code.gs (getMenuData, saveMenuData, updateMenuData, deleteMenuData, aksiMenuData,
 * exportMenuData, koreksiStok) dan dari Auth.gs (requireSession_ -> Repo.cfg).
 * Bacaan memakai readAllCached_ (cepat); tulisan selalu membaca sheet langsung di dalam LockService.
 */
var Repo = (function () {
  var ST = { DRAFT: 'Draft', DIAJUKAN: 'Diajukan', TERVERIFIKASI: 'Terverifikasi', TERVALIDASI: 'Tervalidasi', DIKEMBALIKAN: 'Dikembalikan' };
  var SYS_COLS = ['ID_Kabupaten', 'ID_Faskes', 'ID_Posko', 'Keterangan', 'Status_Data', 'Catatan_Verifikasi', 'Version', 'Request_ID',
    'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Verified_By', 'Verified_At', 'Validated_By', 'Validated_At', 'Is_Deleted'];
  var _menus = null;

  // ---------- Konfigurasi menu ----------
  function cfg(kode) {
    if (!_menus) _menus = buildMenuConfig();
    var m = _menus.filter(function (x) { return x.kode === kode; })[0];
    if (!m || m.custom) validasi_('Menu tidak dikenal.');
    if (m.kode === 'M24' && !m._m24Siap) siapkanM24_(m);
    return m;
  }
  // Relawan (M24): penempatan = input manual (kolom teks sendiri, TIDAK menimpa ID_Faskes/ID_Posko yang dipakai
  // untuk lingkup wilayah); Keterangan = dropdown Kedatangan / Bertugas.
  var KET_M24 = ['Kedatangan', 'Bertugas'];
  function siapkanM24_(m) {
    var ada = {};
    // Penempatan (Faskes) / (Posko) tidak dipakai lagi pada form Relawan: hanya Lokasi Penempatan (detail)
    var fields = (m.fields || []).filter(function (f) {
      var l = String(f.l || '').toLowerCase();
      return l.indexOf('penempatan (faskes)') !== 0 && l.indexOf('penempatan (posko)') !== 0 && f.k !== 'Penempatan_Faskes' && f.k !== 'Penempatan_Posko';
    }).map(function (f) {
      var lbl = String(f.l || '').toLowerCase();
      if (f.k === 'Keterangan' || lbl === 'keterangan') { ada.Keterangan = true; return Object.assign({}, f, { k: 'Keterangan', t: 'select', opts: KET_M24, req: false }); }
      if (f.k === 'Lokasi_Penempatan' || /^lokasi penempatan/.test(lbl)) { ada.L = true; return Object.assign({}, f, { k: 'Lokasi_Penempatan', t: 'text', ref: undefined, opts: undefined, max: 300, req: false }); }
      return f;
    });
    if (!ada.L) fields.push({ k: 'Lokasi_Penempatan', l: 'Lokasi Penempatan (detail)', t: 'text', max: 300 });
    if (!ada.Keterangan) fields.push({ k: 'Keterangan', l: 'Keterangan', t: 'select', opts: KET_M24 });
    m.fields = fields;
    m._m24Siap = true;
  }
  function idKey_(m) { return m.kode === 'M24' ? 'ID_Tim' : 'ID_Record'; }
  function publicCfg_(m) {
    return { kode: m.kode, nama: m.nama, kluster: m.kluster, cols: m.cols || [], fields: m.fields || [], readOnly: !!m.readOnly, appendOnly: !!m.appendOnly };
  }
  function headersFor_(m) {
    var h = [idKey_(m)];
    (m.fields || []).forEach(function (f) { if (h.indexOf(f.k) < 0) h.push(f.k); });
    SYS_COLS.forEach(function (k) { if (h.indexOf(k) < 0) h.push(k); });
    return h;
  }
  // Untuk TULIS: buat sheet bila belum ada, tambahkan kolom yang kurang
  function ensureSheet_(m) {
    var ss = getSS_(CFG.KEY.SS_UTAMA);
    var want = headersFor_(m);
    var sh = ss.getSheetByName(m.sheet);
    if (!sh) return getSheet_(ss, m.sheet, want);
    var h = headersOf_(sh);
    var miss = want.filter(function (k) { return h.indexOf(k) < 0; });
    if (miss.length) sh.getRange(1, h.length + 1, 1, miss.length).setValues([miss]);
    return sh;
  }

  // ---------- Hak akses & lingkup ----------
  function inScope_(user, m, r) {
    var role = user.role;
    if (role === ROLE.SUPER || role === ROLE.PROV) return true;
    if (role === ROLE.KAB) return !!user.idKabupaten && String(r.ID_Kabupaten) === String(user.idKabupaten);
    if (role === ROLE.PUSKESMAS) {
      if (m.scopeType === 'K' || m.scopeType === 'R') return !!user.idKabupaten && String(r.ID_Kabupaten) === String(user.idKabupaten);
      return !!user.idFaskes && String(r.ID_Faskes) === String(user.idFaskes);
    }
    if (role === ROLE.POSKO) {
      if (m.scopeType === 'P') return !!user.idPosko && String(r.ID_Posko) === String(user.idPosko);
      if (m.scopeType === 'F') return (!!user.idFaskes && String(r.ID_Faskes) === String(user.idFaskes)) || (!!user.idPosko && String(r.ID_Posko) === String(user.idPosko));
      return !!user.idKabupaten && String(r.ID_Kabupaten) === String(user.idKabupaten);
    }
    return false;
  }
  function punya_(acc, aksi, role) { return !!acc[aksi] && acc[aksi].indexOf(role) >= 0; }
  function bolehEdit_(user, m, acc, r) {
    if (m.readOnly || m.appendOnly || !punya_(acc, 'write', user.role)) return false;
    var s = r.Status_Data || ST.DRAFT;
    return s === ST.DRAFT || s === ST.DIKEMBALIKAN || (user.role === ROLE.SUPER && s !== ST.TERVALIDASI);
  }
  // Relawan (M24): Admin Kabupaten boleh mengisi Lokasi Penempatan pada baris di wilayahnya, apa pun statusnya
  function bolehEditPenempatan_(user, m, acc) {
    return m.kode === 'M24' && user.role === ROLE.KAB && !m.readOnly && punya_(acc, 'write', user.role);
  }
  function aksiTersedia_(user, m, acc, r) {
    var out = [], s = r.Status_Data || ST.DRAFT, role = user.role;
    if (m.readOnly) return out;
    if (punya_(acc, 'write', role) && (s === ST.DRAFT || s === ST.DIKEMBALIKAN)) out.push('Ajukan');
    if (punya_(acc, 'verify', role) && s === ST.DIAJUKAN) out.push('Verifikasi');
    if (punya_(acc, 'validate', role) && s === ST.TERVERIFIKASI) out.push('Validasi');
    if ((punya_(acc, 'verify', role) && s === ST.DIAJUKAN) || (punya_(acc, 'validate', role) && s === ST.TERVERIFIKASI) || (role === ROLE.SUPER && s === ST.TERVALIDASI)) out.push('Kembalikan');
    if (punya_(acc, 'del', role) && (s !== ST.TERVALIDASI || role === ROLE.SUPER)) out.push('Hapus');
    return out;
  }

  // ---------- Filter, urut, hitung ----------
  function dateKey_(m) {
    var f = (m.fields || []).filter(function (x) { return x.t === 'date'; })[0];
    if (f) return f.k;
    var c = (m.cols || []).filter(function (x) { return x.date; })[0];
    return c ? c.k : 'Created_At';
  }
  function saring_(user, m, rows, p) {
    p = p || {};
    var dk = dateKey_(m), q = p.search ? String(p.search).toLowerCase() : '';
    var keys = (m.cols || []).map(function (c) { return c.k; });
    keys.push(idKey_(m));
    return rows.filter(function (r) {
      if (r.Is_Deleted === true || String(r.Is_Deleted).toUpperCase() === 'TRUE') return false;
      if (!inScope_(user, m, r)) return false;
      if (p.idKabupaten && (user.role === ROLE.SUPER || user.role === ROLE.PROV) && String(r.ID_Kabupaten) !== String(p.idKabupaten)) return false; // peran lain: filter kabupaten diabaikan (sudah dibatasi inScope_)
      if (p.dari || p.sampai) {
        var d = String(r[dk] || '').substring(0, 10);
        if (!d) return false;
        if (p.dari && d < p.dari) return false;
        if (p.sampai && d > p.sampai) return false;
      }
      if (q) {
        var hit = keys.some(function (k) { return r[k] !== undefined && r[k] !== null && String(r[k]).toLowerCase().indexOf(q) >= 0; });
        if (!hit) return false;
      }
      return true;
    });
  }
  function urut_(m, rows) {
    var ik = idKey_(m);
    rows.sort(function (a, b) {
      return String(b.Created_At || '').localeCompare(String(a.Created_At || '')) || String(b[ik] || '').localeCompare(String(a[ik] || ''));
    });
    return rows;
  }
  function bacaBaris_(m) {
    try { return readAllCached_(CFG.KEY.SS_UTAMA, m.sheet, 120); }
    catch (e) { if (/^SHEET_TIDAK_ADA/.test(String(e && e.message))) return []; throw e; }
  }
  function refsOf_(m) {
    var out = [];
    (m.cols || []).forEach(function (c) { if (c.ref && out.indexOf(c.ref) < 0) out.push(c.ref); });
    return out;
  }

  // ---------- LIST ----------
  function list(user, kode, p) {
    p = p || {};
    var m = cfg(kode), acc = menuAccess(m);
    var dasar = saring_(user, m, bacaBaris_(m), p);
    var counts = { total: dasar.length };
    Object.keys(ST).forEach(function (k) { counts[k] = 0; });
    dasar.forEach(function (r) {
      var s = r.Status_Data || ST.DRAFT;
      Object.keys(ST).forEach(function (k) { if (ST[k] === s) counts[k]++; });
    });
    var rows = dasar;
    if (p.status) rows = rows.filter(function (r) { return (r.Status_Data || ST.DRAFT) === p.status; });
    urut_(m, rows);
    var pageSize = Math.min(Math.max(1, Number(p.pageSize) || CFG.PAGESIZE_DEFAULT), CFG.PAGESIZE_MAX);
    var page = Math.max(1, Number(p.page) || 1);
    var total = rows.length;
    var slice = rows.slice((page - 1) * pageSize, page * pageSize);

    var refs = refsOf_(m);
    var maps = slice.length && refs.length ? lookupMaps_(refs) : {};
    var ik = idKey_(m), mapFaskesLama = null;
    var out = slice.map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { if (k !== '_row' && k !== 'Is_Deleted') o[k] = r[k]; });
      // M04: data lama hanya punya ID_Faskes -> tampilkan nama dari REF_Faskes
      if (m.kode === 'M04' && !o.Nama_Faskes && r.ID_Faskes) { mapFaskesLama = mapFaskesLama || lookupMaps_(['faskes']); o.Nama_Faskes = (mapFaskesLama.faskes || {})[r.ID_Faskes] || ''; }
      o.ID_Record = r[ik];
      o.Status_Data = r.Status_Data || ST.DRAFT;
      o.Version = toInt_(r.Version) || 1;
      (m.cols || []).forEach(function (c) { if (c.ref && maps[c.ref]) o[c.k + '_ref'] = maps[c.ref][r[c.k]] || ''; });
      o._editable = bolehEdit_(user, m, acc, r);
      o._editPenempatan = bolehEditPenempatan_(user, m, acc);
      o._aksi = aksiTersedia_(user, m, acc, r);
      return o;
    });
    return { cfg: publicCfg_(m), counts: counts, rows: out, total: total, page: page, pageSize: pageSize };
  }

  // ---------- Validasi isian ----------
  function bersih_(m, payload, parsial) {
    var out = {};
    (m.fields || []).forEach(function (f) {
      if (f.auto) return;
      if (parsial && payload[f.k] === undefined) return;
      var v = payload[f.k];
      v = (v === undefined || v === null) ? '' : v;
      if (f.t === 'number') {
        v = String(v).trim();
        if (v !== '') { if (!/^\d+$/.test(v)) validasi_(f.l + ' harus bilangan bulat >= 0.'); v = parseInt(v, 10); }
      } else if (f.t === 'date') {
        v = String(v).trim().substring(0, 10);
        if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !parseDateSafe_(v))) validasi_(f.l + ' bukan tanggal yang sah.');
      } else if (f.t === 'select') {
        v = String(v).trim();
        if (v && f.opts && f.opts.indexOf(v) < 0) validasi_(f.l + ' tidak sah.');
      } else {
        v = sanitizeText_(v, f.max || (f.t === 'textarea' ? 1000 : 200));
      }
      if (f.req && v === '') validasi_(f.l + ' wajib diisi.');
      out[f.k] = v;
    });
    if (payload.Keterangan !== undefined && out.Keterangan === undefined) out.Keterangan = sanitizeText_(payload.Keterangan, 1000);
    return out;
  }

  // M04: pilihan Kabupaten/Kota hanya berlaku untuk Super Admin & Admin Provinsi; peran lain selalu memakai wilayah akunnya
  function jagaKabM04_(user, m, c) {
    if (m.kode !== 'M04' || !c) return;
    if (user.role !== ROLE.SUPER && user.role !== ROLE.PROV) { delete c.ID_Kabupaten; return; }
    if (c.ID_Kabupaten) {
      var ada = readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Kabupaten', 300).filter(function (x) { return String(x.ID_Kabupaten) === String(c.ID_Kabupaten) && !x.Is_Deleted; })[0];
      if (!ada) validasi_('Kabupaten/Kota tidak ditemukan.');
    }
  }

  // ---------- Stempel wilayah ----------
  function stamp_(user, m, c) {
    var role = user.role, tinggi = role === ROLE.SUPER || role === ROLE.PROV;
    var s = { ID_Kabupaten: user.idKabupaten || '', ID_Faskes: user.idFaskes || '', ID_Posko: user.idPosko || '' };
    var kolom = (m.fields || []).map(function (f) { return f.k; });
    // Posko
    var idPosko = role === ROLE.POSKO ? (user.idPosko || '') : (c.ID_Posko || '');
    if (idPosko) {
      var p = readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Posko', 300).filter(function (r) { return r.ID_Posko === idPosko; })[0];
      if (!p) validasi_('Posko tidak ditemukan.');
      if (role === ROLE.PUSKESMAS && p.ID_Faskes_Pengelola !== user.idFaskes) aksesDitolak_('Posko di luar wewenang Anda.');
      s.ID_Posko = idPosko;
      s.ID_Kabupaten = p.ID_Kabupaten || s.ID_Kabupaten;
      if (p.ID_Faskes_Pengelola) s.ID_Faskes = p.ID_Faskes_Pengelola;
    }
    // Faskes yang dipilih pada formulir (mis. Relawan) hanya untuk peran di atas Puskesmas
    if (c.ID_Faskes && (tinggi || role === ROLE.KAB) && kolom.indexOf('ID_Faskes') >= 0) {
      var f = readAllCached_(CFG.KEY.SS_UTAMA, 'REF_Faskes', 300).filter(function (r) { return r.ID_Faskes === c.ID_Faskes; })[0];
      if (!f) validasi_('Faskes tidak ditemukan.');
      s.ID_Faskes = c.ID_Faskes;
      s.ID_Kabupaten = f.ID_Kabupaten || s.ID_Kabupaten;
    }
    if (c.ID_Kabupaten && (tinggi || role === ROLE.KAB)) s.ID_Kabupaten = c.ID_Kabupaten;
    if (role === ROLE.KAB && String(s.ID_Kabupaten) !== String(user.idKabupaten)) aksesDitolak_('Data di luar wilayah Anda.');
    return s;
  }

  // ---------- Kolom otomatis (hanya yang aturannya jelas di Config) ----------
  function konfigAngka_(key, def) {
    try {
      var r = readAllCached_(CFG.KEY.SS_UTAMA, 'SYS_Config', 300).filter(function (x) { return x.Key === key; })[0];
      var n = r ? toInt_(r.Value) : null;
      return n && n > 0 ? n : def;
    } catch (e) { return def; }
  }
  function otomatis_(m, rec, id) {
    (m.fields || []).forEach(function (f) { if (/^No_(Permintaan|Distribusi|Penerimaan)$/.test(f.k) && !rec[f.k]) rec[f.k] = id; });
    if (m.kode === 'M08' && rec.ID_Posko) {
      var peng = readAllCached_(CFG.KEY.SS_UTAMA, 'TRX_Pengungsi', 120).filter(function (r) {
        return r.ID_Posko === rec.ID_Posko && !r.Is_Deleted && r.Status_Data !== ST.DIKEMBALIKAN;
      });
      peng.sort(function (a, b) { return String(b.Tanggal || '').localeCompare(String(a.Tanggal || '')); });
      var jml = peng.length ? (toInt_(peng[0].Jml_Jiwa) || 0) : 0;
      rec.Jml_Pengungsi = jml;
      rec.Kebutuhan_Air_L = jml * konfigAngka_('STANDAR_AIR_L_ORANG_HARI', 15);
      rec.Kebutuhan_Toilet = Math.ceil(jml / konfigAngka_('STANDAR_ORANG_PER_TOILET', 20));
    }
    if (m.kode === 'M13') {
      var tot = (toInt_(rec.Jml_Jenazah_Utuh) || 0) + (toInt_(rec.Jml_Bagian_Tubuh) || 0);
      rec.Jml_Belum_Teridentifikasi = Math.max(0, tot - (toInt_(rec.Jml_Teridentifikasi) || 0));
    }
  }

  // ---------- Util tulis ----------
  function setv_(vals, h, k, v) { var i = h.indexOf(k); if (i >= 0) vals[i] = sanitizeCell_(v); }
  function cariBaris_(sh, m, id) {
    var ik = idKey_(m);
    var r = readAll_(sh).filter(function (x) { return String(x[ik]) === String(id) && !x.Is_Deleted; })[0];
    if (!r) validasi_('Data tidak ditemukan.');
    return r;
  }
  function selesai_() {
    bumpData_();
    invalidasiCache_(CFG.CACHE_PREFIX.SYS);
    invalidasiCache_(CFG.CACHE_PREFIX.PUB);
  }

  // ---------- INSERT ----------
  function insert(user, kode, payload, requestId, submitFlag) {
    var m = cfg(kode), acc = menuAccess(m);
    if (m.khusus) validasi_('Menu ini memakai formulir khusus.');
    if (m.readOnly || !punya_(acc, 'write', user.role)) aksesDitolak_('Anda tidak berhak menambah data pada menu ini.');
    var c = bersih_(m, payload || {}, false);
    jagaKabM04_(user, m, c);
    var ajukan = submitFlag === 'ajukan';
    var hasil = withLock_(function () {
      var sh = ensureSheet_(m), h = headersOf_(sh), ss = getSS_(CFG.KEY.SS_UTAMA), ik = idKey_(m);
      requestId = sanitizeText_(requestId || '', 80);
      if (requestId && h.indexOf('Request_ID') >= 0 && sh.getLastRow() > 1) {
        var col = sh.getRange(2, h.indexOf('Request_ID') + 1, sh.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < col.length; i++) {
          if (col[i][0] === requestId) {
            var idLama = sh.getRange(i + 2, h.indexOf(ik) + 1).getValue();
            return { id: idLama, duplikat: true };
          }
        }
      }
      var st = stamp_(user, m, c);
      var id = m.idPrefix + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, 'REPO_' + m.kode), 4);
      var rec = {};
      Object.keys(c).forEach(function (k) { rec[k] = c[k]; });
      rec[ik] = id;
      rec.ID_Kabupaten = st.ID_Kabupaten; rec.ID_Faskes = st.ID_Faskes; rec.ID_Posko = st.ID_Posko;
      otomatis_(m, rec, id);
      rec.Status_Data = ajukan ? ST.DIAJUKAN : ST.DRAFT;
      rec.Catatan_Verifikasi = '';
      rec.Version = 1; rec.Request_ID = requestId;
      rec.Created_At = nowWita_(); rec.Created_By = user.username; rec.Updated_At = nowWita_(); rec.Updated_By = user.username;
      rec.Is_Deleted = '';
      sh.appendRow(objToRow_(h, rec));
      return { id: id, status: rec.Status_Data };
    });
    if (!hasil.duplikat) { selesai_(); logAudit_(user, 'TAMBAH_DATA', m.nama, hasil.id, 'OK'); }
    return ok_({ id: hasil.id, ID_Record: hasil.id, status: hasil.status }, hasil.duplikat ? 'Data sudah tersimpan sebelumnya.' : (ajukan ? 'Data tersimpan dan diajukan.' : 'Data tersimpan sebagai Draft.'));
  }

  // ---------- UPDATE ----------
  function update(user, kode, id, patch, version) {
    var m = cfg(kode), acc = menuAccess(m);
    if (m.khusus) validasi_('Menu ini memakai formulir khusus.');
    var khusus = bolehEditPenempatan_(user, m, acc);
    if (m.readOnly || (m.appendOnly && !khusus) || !punya_(acc, 'write', user.role)) aksesDitolak_('Anda tidak berhak mengubah data pada menu ini.');
    patch = patch || {};
    var hasil = withLock_(function () {
      var sh = ensureSheet_(m), h = headersOf_(sh);
      var r = cariBaris_(sh, m, id);
      if (!inScope_(user, m, r)) aksesDitolak_('Data di luar lingkup Anda.');
      // Relawan oleh Admin Kabupaten: baris bersumber TDM/TDP atau yang tidak lagi bisa diedit biasa
      // hanya boleh mengubah Lokasi_Penempatan dan Keterangan; kolom lain tidak disentuh.
      var terbatas = khusus && (r.Sumber_Modul === 'TDM' || r.Sumber_Modul === 'TDP' || !bolehEdit_(user, m, acc, r));
      var c;
      if (terbatas) {
        c = {};
        if (patch.Lokasi_Penempatan !== undefined) c.Lokasi_Penempatan = sanitizeText_(patch.Lokasi_Penempatan, 300);
        if (patch.Keterangan !== undefined) {
          var ketBaru = String(patch.Keterangan || '').trim();
          // nilai lama (mis. 'Selesai Bertugas' dari form kepulangan) boleh tetap; selain itu hanya Kedatangan/Bertugas
          if (ketBaru && KET_M24.indexOf(ketBaru) < 0 && ketBaru !== r.Keterangan) validasi_('Keterangan tidak sah.');
          c.Keterangan = ketBaru;
        }
      } else {
        if (!bolehEdit_(user, m, acc, r)) aksesDitolak_('Data berstatus ' + (r.Status_Data || ST.DRAFT) + ' tidak dapat diubah.');
        // M24: nilai Keterangan lama yang tidak ada di dropdown (mis. 'Selesai Bertugas') dibiarkan bila tidak diubah
        if (m.kode === 'M24' && patch.Keterangan !== undefined && String(patch.Keterangan) === String(r.Keterangan || '') && KET_M24.indexOf(String(patch.Keterangan)) < 0) { patch = Object.assign({}, patch); delete patch.Keterangan; }
        c = bersih_(m, patch, true);
        jagaKabM04_(user, m, c);
      }
      var vSaatIni = toInt_(r.Version) || 1;
      if (version !== undefined && version !== null && version !== '' && Number(version) !== vSaatIni) validasi_('Data telah diubah pengguna lain. Muat ulang lalu coba lagi.');
      var rec = {};
      Object.keys(r).forEach(function (k) { rec[k] = r[k]; });
      Object.keys(c).forEach(function (k) { rec[k] = c[k]; });
      otomatis_(m, rec, id);
      var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0];
      Object.keys(c).forEach(function (k) { setv_(vals, h, k, c[k]); });
      ['Jml_Pengungsi', 'Kebutuhan_Air_L', 'Kebutuhan_Toilet', 'Jml_Belum_Teridentifikasi'].forEach(function (k) { if (rec[k] !== r[k]) setv_(vals, h, k, rec[k]); });
      setv_(vals, h, 'Version', vSaatIni + 1);
      setv_(vals, h, 'Updated_At', nowWita_()); setv_(vals, h, 'Updated_By', user.username);
      sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
      return { versi: vSaatIni + 1 };
    });
    selesai_(); logAudit_(user, 'UBAH_DATA', m.nama, id, 'OK');
    return ok_({ id: id, ID_Record: id, Version: hasil.versi }, 'Data diperbarui.');
  }

  // ---------- HAPUS (soft delete) ----------
  function softDelete(user, kode, id) {
    var m = cfg(kode), acc = menuAccess(m);
    if (m.readOnly || !punya_(acc, 'del', user.role)) aksesDitolak_('Anda tidak berhak menghapus data pada menu ini.');
    withLock_(function () {
      var sh = ensureSheet_(m), h = headersOf_(sh);
      var r = cariBaris_(sh, m, id);
      if (!inScope_(user, m, r)) aksesDitolak_('Data di luar lingkup Anda.');
      if (r.Status_Data === ST.TERVALIDASI && user.role !== ROLE.SUPER) aksesDitolak_('Data yang sudah Tervalidasi hanya dapat dihapus Super Admin.');
      var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0];
      setv_(vals, h, 'Is_Deleted', 'TRUE'); setv_(vals, h, 'Version', (toInt_(r.Version) || 1) + 1);
      setv_(vals, h, 'Updated_At', nowWita_()); setv_(vals, h, 'Updated_By', user.username);
      sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
    });
    selesai_(); logAudit_(user, 'HAPUS_DATA', m.nama, id, 'OK');
    return ok_({ id: id }, 'Data dihapus.');
  }

  // ---------- ALUR STATUS ----------
  function aksi(user, kode, id, aksiNama, catatan) {
    var m = cfg(kode), acc = menuAccess(m);
    if (m.khusus) validasi_('Menu ini memakai formulir khusus.');
    if (m.readOnly) aksesDitolak_('Menu ini hanya-baca.');
    var baru = withLock_(function () {
      var sh = ensureSheet_(m), h = headersOf_(sh);
      var r = cariBaris_(sh, m, id);
      if (!inScope_(user, m, r)) aksesDitolak_('Data di luar lingkup Anda.');
      var s = r.Status_Data || ST.DRAFT;
      if (aksiTersedia_(user, m, acc, r).indexOf(aksiNama) < 0 || aksiNama === 'Hapus') aksesDitolak_('Aksi "' + aksiNama + '" tidak tersedia untuk data berstatus ' + s + '.');
      var vals = sh.getRange(r._row, 1, 1, h.length).getValues()[0], status = s, now = nowWita_();
      if (aksiNama === 'Ajukan') status = ST.DIAJUKAN;
      else if (aksiNama === 'Verifikasi') { status = ST.TERVERIFIKASI; setv_(vals, h, 'Verified_By', user.username); setv_(vals, h, 'Verified_At', now); }
      else if (aksiNama === 'Validasi') { status = ST.TERVALIDASI; setv_(vals, h, 'Validated_By', user.username); setv_(vals, h, 'Validated_At', now); }
      else if (aksiNama === 'Kembalikan') {
        if (!catatan || !String(catatan).trim()) validasi_('Alasan pengembalian wajib diisi.');
        status = ST.DIKEMBALIKAN; setv_(vals, h, 'Catatan_Verifikasi', sanitizeText_(catatan, 500));
      } else validasi_('Aksi tidak dikenal.');
      setv_(vals, h, 'Status_Data', status);
      setv_(vals, h, 'Version', (toInt_(r.Version) || 1) + 1);
      setv_(vals, h, 'Updated_At', now); setv_(vals, h, 'Updated_By', user.username);
      sh.getRange(r._row, 1, 1, h.length).setValues([vals]);
      return status;
    });
    selesai_(); logAudit_(user, 'STATUS_' + String(aksiNama).toUpperCase(), m.nama, id + ' => ' + baru, 'OK');
    return ok_({ id: id, status: baru }, 'Status data diubah menjadi ' + baru + '.');
  }

  // ---------- EKSPOR CSV ----------
  function csvSel_(v) {
    var s = sanitizeCell_(v === null || v === undefined ? '' : v);
    s = String(s);
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv(user, kode, p) {
    var m = cfg(kode);
    var rows = urut_(m, saring_(user, m, bacaBaris_(m), p)).slice(0, 5000);
    var refs = refsOf_(m), maps = rows.length && refs.length ? lookupMaps_(refs) : {};
    var cols = m.cols || [];
    var lines = [['ID'].concat(cols.map(function (c) { return c.l; })).map(csvSel_).join(',')];
    rows.forEach(function (r) {
      lines.push([r[idKey_(m)]].concat(cols.map(function (c) {
        var v = r[c.k];
        if (c.ref && maps[c.ref] && maps[c.ref][v]) v = maps[c.ref][v];
        return v;
      })).map(csvSel_).join(','));
    });
    return { nama: m.nama.replace(/[^A-Za-z0-9]+/g, '_') + '_' + todayWita_() + '.csv', csv: '\ufeff' + lines.join('\r\n') };
  }

  // ---------- KOREKSI STOK (Kartu Stok M20) ----------
  function koreksiStok(user, idBarang, lokasi, jml, alasan) {
    var m = cfg('M20');
    if (user.role !== ROLE.SUPER && user.role !== ROLE.KAB && user.role !== ROLE.PUSKESMAS) aksesDitolak_('Anda tidak berhak mengoreksi stok.');
    idBarang = sanitizeText_(idBarang, 40); lokasi = sanitizeText_(lokasi, 40);
    var baru = toInt_(jml);
    if (!idBarang || !lokasi) validasi_('Barang dan lokasi wajib diisi.');
    if (baru === null || baru < 0) validasi_('Jumlah stok baru harus bilangan bulat >= 0.');
    if (!alasan || !String(alasan).trim()) validasi_('Alasan koreksi wajib diisi.');
    if (user.role === ROLE.PUSKESMAS && lokasi !== user.idFaskes) aksesDitolak_('Lokasi di luar wewenang Anda.');
    withLock_(function () {
      var ss = getSS_(CFG.KEY.SS_UTAMA);
      var sh = getSheet_(ss, m.sheet, ['ID_Record', 'Tanggal', 'ID_Faskes', 'ID_Barang', 'Riwayat', 'Jml', 'Sisa', 'Referensi', 'Status_Data', 'ID_Kabupaten', 'Created_At', 'Created_By', 'Is_Deleted']);
      var h = headersOf_(sh);
      var lama = readAll_(sh).filter(function (r) { return r.ID_Faskes === lokasi && r.ID_Barang === idBarang && !r.Is_Deleted; });
      var sisaLama = lama.length ? (toInt_(lama[lama.length - 1].Sisa) || 0) : 0;
      var id = m.idPrefix + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMM') + '-' + pad_(nextSeq_(ss, 'REPO_M20'), 4);
      sh.appendRow(objToRow_(h, { ID_Record: id, Tanggal: todayWita_(), ID_Faskes: lokasi, ID_Barang: idBarang, Riwayat: 'Koreksi', Jml: baru - sisaLama, Sisa: baru,
        Referensi: sanitizeText_(alasan, 300), Status_Data: ST.TERVALIDASI, ID_Kabupaten: user.idKabupaten || '', Created_At: nowWita_(), Created_By: user.username, Is_Deleted: '' }));
    });
    selesai_(); logAudit_(user, 'KOREKSI_STOK', m.nama, idBarang + '@' + lokasi + ' => ' + baru, 'OK');
    return ok_({ idBarang: idBarang, lokasi: lokasi, stok: baru }, 'Koreksi stok tersimpan.');
  }

  // [PERUBAHAN RHA] Dipakai sinkron RHA: sheet menu + kolom tambahan (hanya ditambahkan bila belum ada), dibaca langsung (segar).
  function siapkanSheetSinkron(kode, kolomTambahan) {
    var m = cfg(kode), sh = ensureSheet_(m), h = headersOf_(sh);
    var miss = (kolomTambahan || []).filter(function (k) { return h.indexOf(k) < 0; });
    if (miss.length) { sh.getRange(1, h.length + 1, 1, miss.length).setValues([miss]); h = headersOf_(sh); }
    return { sh: sh, h: h, idKey: idKey_(m), status: ST };
  }
  return { cfg: cfg, list: list, insert: insert, update: update, softDelete: softDelete, aksi: aksi, exportCsv: exportCsv, koreksiStok: koreksiStok, siapkanSheetSinkron: siapkanSheetSinkron };
})();
