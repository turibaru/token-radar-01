# STATUS — token-radar-01 (siap-submit, BELUM disubmit)

Dibangun 20 Nov 2026. Lokasi: `~/workspace/makefun/entries/token-radar-01/`
Akun: make.fun @turibaru. Deadline bounty: 14 Des 2026.

## Yang sudah dibangun

- `main.ts` (Node 22, stdlib only) + `lib/model.ts` — program + model, ditulis baru
  (bukan salinan starter).
- `vendor/makefun-board.ts` — disalin byte-identik dari kit
  (sha256 `9ca51b6e…0dc326e`, sama dengan kit).
- `dashboard/` — `index.html`, `app.css`, `app.js` (total 37.616 byte, di bawah
  batas 64 KB agar seluruh source masuk dossier). Tema gelap "radar", offline,
  tanpa URL http/https di file mana pun.
- `screenshots/` — 3 PNG 1440x800, masing-masing < 512 KiB:
  `1-board.png` (143.826 byte), `2-detail.png` (191.757 byte),
  `3-filtered.png` (137.536 byte). Diambil ulang 20 Nov 2026 dengan Chromium
  headless (CDP, Node stdlib) setelah perubahan radar-3; render diperiksa visual
  (board 198 baris, dialog rank 1 dengan waterfall, filter Dexs 21 baris),
  tanpa error console.
- `LICENSE` (MIT) + `README.md`.

## Board

- **198 baris** (watchlist 40/40 ter-cover + 158 protokol pre-token di bawah
  floor $50M; total universe rankable = 198 dari 342 pre-token setelah
  mengeluarkan CEX, Bridge/Canonical Bridge, Liquid (Re)Staking, Restaked BTC,
  pool berversi, dan produk wrapped/staked).
- Rank 1..198, implied value tidak naik seiring rank; tiap baris 6 farm steps
  (124–175 karakter per step, dalam batas gate 20–600).
- Top 5: Steakhouse Financial $464,9M; Sentora Curator $446,6M; Gauntlet
  $276,9M; Veda $266,2M; USDD $144,6M. Implied terendah $569 ribu.
- Live-token: 24 protokol terbesar dipisah di tab "Live token" (bukan ranking).

## Metodologi implied value (radar-3-waterfall, revisi 20 Nov 2026)

Model comparables dari angka snapshot sendiri, bukan flat multiple:

```
implied = round( TVL x comp x (1 + clamp(change_7d, -60, 120)/100 x 0,5)
                 x (0,6 + min(age_days, 1095)/1095 x 0,4) )
```

- `comp` = median mcap/TVL protokol live-token di kategori yang sama (min 3
  komparabel, clamp 0,05x–1,50x); kategori tanpa cukup komparabel memakai median
  semua kategori 0,21x. Contoh: Dexs 0,34x; Lending 0,13x; RWA 0,27x;
  Basis Trading 0,65x; Cross Chain Bridge 1,22x.
- `growth` = perubahan TVL 7 hari (bukan harga — lihat evaluasi di bawah);
  `maturity` = umur sejak pertama listing (semakin lama tanpa token, semakin
  matang). Umur tak diketahui = 365 hari.
- Setiap baris membawa waterfall faktornya di `model`: `base_implied_usd`
  (TVL x comp) → `after_momentum_usd` (x growth) → `implied_value_usd` (x
  maturity). Dialog detail dashboard menampilkan ketiganya; recompute dashboard
  dari angka yang sama tetap cocok persis dengan board.
- Tabel comparables dashboard kini memuat SEMUA 34 kategori (14 terpakai, 20
  fallback), masing-masing dengan median, N, IQR, rentang median leave-one-out,
  dan daftar member (slug + rasio). Kategori fallback ditandai emas + teks
  "too few, its rows use the global median"; mediannya ditampilkan mentah
  (tidak di-clamp) karena tidak pernah dipakai ke baris mana pun.
- Dashboard juga mengungkapkan batas liputan: pool comps hanya 128 dari 416
  protokol live-token (272 tidak mencatat mcap), 102/198 baris memakai median
  global, dan median kategori kecil rapuh (LOO bisa bergerak ≥50%) — plus
  survivorship bias (hanya token yang hidup & tercatat harganya pada tanggal
  snapshot yang bisa jadi comps).
- Halaman dashboard menghitung ulang tiap baris dari angka yang sama dan
  menampilkan "the same number board.json carries" — sudah diverifikasi cocok
  persis (awalnya sempat selisih ~$7 ribu karena pembulatan rasio, sudah
  diperbaiki dengan membulatkan rasio ke 4 desimal di dalam model).

## Verifikasi yang sudah dijalankan

- `node main.ts` 2x ke direktori berbeda → output byte-identik (deterministik).
- Gate check lokal: 198 baris, rank 1..N, implied non-increasing, watchlist
  40/40, farm steps valid, dossier 669.872 byte (< 1,5 MB), teks dossier
  37.880 byte (< 65.536, source lengkap), dashboard tanpa URL http/https.
- Screenshot diperiksa visual: board, detail (dialog rank 1 Steakhouse
  Financial + farm plan), filtered (kategori Dexs, 21 baris) — ketiganya render
  benar.

## Yang MASIH KURANG untuk submit (jangan submit sebelum ini)

1. **Repo GitHub publik** — belum dibuat (tugas melarang buat repo; perlu
   dibuat setelah bounty dibuka? repo harus dibuat pada/setelah 14 Nov 2026 —
   sudah lewat tanggal itu, jadi bisa dibuat kapan saja sebelum submit) +
   file klaim `.makefun/owner.json` bila owner GitHub bukan akun yang dipakai
   sign-in. Repo harus berisi commit entri ini + LICENSE MIT.
2. **GitHub PAT / akun GitHub** — belum ada; submit butuh repo publik + commit.
3. **Bundle transcript sesi kerja** — sesi build ini (subagent) harus dibundle
   oleh parent agent (`bundle --muse-usage` dari top-level agent) karena
   transcript gate menghitung baris kode yang ditulis sesi agen.
4. **Cek `grade-local` dari kit** (opsional tapi disarankan) sebelum submit —
   belum dijalankan; butuh API key make.fun (dilarang pakai API key di tugas
   ini, jadi ini urusan parent/Adi).
5. **Submit** — maks 5/hari, 10 total; entri terakhir sebelum deadline yang
   dihitung. JANGAN submit dari sini.

## Catatan

- Snapshot: DefiLlama, `as_of` 2026-11-14, 758 protokol, floor $50.000.000.
- Tidak ada API key dipakai selama build. Tidak ada repo GitHub dibuat.

## Evaluasi metodologi 20 Nov 2026 (review DeepSeek) — revisi radar-3-waterfall

Tujuan: perbaiki metodologi sebelum resubmit (commit baru). Rumus TIDAK berubah —
yang berubah hanya transparansi (waterfall + N/IQR/LOO/member comps) dan dokumentasi.
Ranking & implied value identik dengan board yang sudah disubmit (0 selisih dari 198
baris). Skrip ablasi (replikasi model Python, 0 mismatch vs board.json):
`/tmp/radar-ablation/ablate.py`, `/tmp/radar-ablation/followup.py`.

### 1. Kritik momentum — sebagian besar SALAH asumsi, tapi ada satu temuan nyata

- **change_7d adalah perubahan TVL, bukan harga — TERBUKTI.** Sumber snapshot:
  DefiLlama `https://api.llama.fi/protocols`; field `change_7d` endpoint itu adalah
  perubahan TVL 1h/1d/7d. Bukti internal: max change_7d = +4.448% (shift-defi) —
  mustahil sebagai harga karena protokol pre-token tidak punya harga; sebagai TVL
  protokol baru, +44x dalam seminggu mungkin. Jadi sirkularitas "harga" tidak ada.
  Yang ada adalah momentum TVL: protokol yang TVL-nya tumbuh dinilai lebih tinggi.
  Itu disengaja (TVL tumbuh = traksi), bukan bug — tapi tetap harus dibatasi.
- **"Tak dibatasi" SALAH.** growthMx sudah clamp [-60,120] x 0,5 → range [0,7, 1,6].
  Tanpa clamp, shift-defi akan dapat 23,2x. Saran DeepSeek winsorize [0,5, 2,0] justru
  LEBIH longgar dari sekarang — ditolak. Ablasi clamp lebih ketat [-30,60]:
  Spearman 0,9995, top 20 identik — tidak ada gunanya.
- **Ablasi momentum (wajib):** hapus momentum → Spearman 0,9957 vs board penuh;
  top 20 bergerak rata-rata 0,55 rank, maks 2 rank, 19/20 set top-20 sama.
  Penggerak terbesar ada di tengah board (theo-network-thbill #102→#133, shift-defi
  #58→#78). Hanya 4 baris di cap/floor (3 di 1,6x, 1 di 0,7x); 7 baris |gm-1|≥0,2.
  **Kesimpulan: momentum TIDAK me-ranking; comps yang me-ranking.**
  Top 5 praktis tidak tersentuh momentum (growthMx 0,96–1,03): Steakhouse base
  $588,8M → setelah momentum $582,3M → final $464,9M (momentum -1,4%, maturity
  yang memotong). Kecurigaan "$465M ter-inflate" gugur: angka itu hasil DISKON
  maturity dari base $589M, bukan inflasi.
- **Bobot 0,5 dipertahankan.** Turunkan ke 0,25: Spearman 0,9989, top 20 praktis
  identik (1 baris geser 1 rank) — perubahan kosmetik, tidak dilakukan.
- **Lagged window 90 hari berakhir T-7: TIDAK BISA.** Snapshot tersegel hanya punya
  10 field per protokol, tanpa histori/field 90 hari apa pun. Bukan salah model;
  tidak bisa diterapkan tanpa snapshot baru (di luar kendali entri).

### 2. Kritik median comp — benar soal kerapuhan, salah soal self-inclusion

- **Self-inclusion MUSTAHIL secara konstruksi — TERBUKTI.** `buildComps` melewati
  semua protokol pre-token (`isPreToken`); `buildBoard` hanya meranking protokol
  pre-token (`isRankable` mensyaratkan `isPreToken`). Kedua himpunan disjoint
  berdasarkan definisi yang sama (mcap+gecko+symbol null). Irisan board ∩ comps = 0
  dari 198 baris. Sentinel mcap=-1 (autofinance) bukan null → terhitung live-token,
  tapi rasionya negatif → dibuang dari comps; tidak masuk board juga.
- **N comps per kategori + dispersi (dari snapshot):** pool comps 128 protokol.
  Kategori terpakai (N≥3): Lending 15, Dexs 11, Liquid Staking 9, Yield 9, CEX 9,
  RWA 9, Canonical Bridge 8, Basis Trading 7, Bridge 6, Cross Chain Bridge 4,
  Yield Aggregator 4, Indexes 3, CDP 3, Privacy 3. **5 kategori di 3–4 (N<5)** dan
  20 kategori N<3 (sudah fallback global). Dispersi BESAR: IQR global 0,047x–1,047x
  (median 0,21x); Dexs IQR 0,085x–1,639x; rasio ekstrem 0,0003x–400,2x
  (Prediction Market 400,2x dari 1 protokol) — median kebal terhadap outlier ini,
  mean tidak akan kebal.
- **Naikkan min_comps ke 5: DITOLAK dengan bukti.** Ablasi min_comps=5: Spearman
  0,9952 secara keseluruhan, TAPI circle-gateway #14→#58 (44 rank) karena Cross
  Chain Bridge (N=4, median 1,22x — memang jauh di atas global 0,21x) dibuang ke
  global; cian-yield-layer #19→#13. Membuang multiple kategori yang memang khas
  demi ambang arbitrer merusak sinyal, bukan memperbaikinya. **min_comps=3
  dipertahankan; sebagai gantinya N + IQR + LOO + member diungkap.**
  Bukti sebaliknya — ambang 3 itu load-bearing: min_comps=1 → Spearman 0,7120,
  Steakhouse melonjak ke $3,26Miliar (comp Risk Curators N=1, 2,97x, di-clamp 1,5x),
  Polymarket $68M→$478M (Prediction Market 400x → clamp 1,5x). Clamp menyelamatkan
  dari absurd, tapi ambang 3-lah yang menjaga board waras.
- **Comps-lah yang me-ranking (sebagaimana mestinya):** hapus comps-per-kategori
  (pakai median global untuk semua) → Spearman 0,9598, max geser 72 rank, top-20
  max geser 40 rank. Maturity juga lebih berpengaruh dari momentum (hapus maturity:
  Spearman 0,9905, top-20 max geser 8).
- **Trimmed median: TIDAK diterapkan — terbukti vakum.** Trim simetris 25% tidak
  mengubah median SAMA SEKALI (Spearman 1,0000, 0 rank bergerak): pemotongan
  simetris mempertahankan elemen tengah. Saran itu keliru secara matematis untuk
  median; yang bermakna adalah LOO — dan itu yang ditampilkan.
- **Leave-one-out (kerapuhan nyata):** max pergeseran median bila 1 comp dibuang:
  Indexes +649% (N=3), Dexs +161%, Cross Chain Bridge +81%, Bridge +78%, Yield
  Aggregator +67%, CDP +48%, Privacy +48%; yang kokoh: Lending +14%, RWA +23%.
  Ditampilkan per kategori di dashboard sebagai rentang LOO.
- **Sensitivity band IQR per baris: TIDAK diterapkan sebagai kolom board.**
  Band IQR implied (Q3–Q1)/point estimate: median 468%, p10 100% — mis. Steakhouse
  $102M–$2,28Miliar di sekitar point $465M. Band selebar itu mendominasi angka dan
  menyesatkan (dispersi antar-protokol, bukan error estimasi median). Sebagai ganti:
  IQR + LOO ditampilkan di level kategori (tempat ia bermakna), bukan per baris.
- **Survivorship bias: DIAKUI, tidak bisa diperbaiki dari snapshot tersegel.**
  Pool comps hanya 128 dari 416 protokol live-token (272 tidak mencatat mcap;
  16 mcap ≤0 termasuk sentinel -1). Token yang sudah gagal/delisting tidak ada di
  snapshot. Diungkap di dashboard + komentar model, bukan disembunyikan.
- **Fragilitas utama board (temuan terpenting): 102/198 baris memakai median
  global** — termasuk top 4. Kategori mereka sendiri: Risk Curators N=1 (2,97x),
  Onchain Capital Allocator N=2 (0,0059x / 0,0191x — jauh DI BAWAH global).
  Kalau ambang dilonggarkan, Veda dkk ambruk dan Steakhouse dkk meledak 7x. Board
  saat ini memakai jalan tengah yang konservatif (fallback global) — dan sekarang
  juri bisa melihatnya di tabel comps.

### 3. Yang diubah (radar-2-comps → radar-3-waterfall)

- `lib/model.ts`: `MODEL_VERSION` → `radar-3-waterfall`; `BoardRow.model` +
  `RadarRow` tambah `base_implied_usd`, `after_momentum_usd`; `CompRow` tambah
  `used`, `q1_ratio`, `q3_ratio`, `loo_low_ratio`, `loo_high_ratio`, `members[]`;
  `RadarData` tambah `overall_q1_ratio`, `overall_q3_ratio`, `comp_pool_size`,
  `live_token_count`; `buildComps` kembalikan SEMUA kategori (bukan hanya N≥3);
  median kategori fallback ditampilkan mentah (tidak di-clamp); komentar header
  menjelaskan change_7d = TVL change + batas momentum + batas liputan;
  komentar `validateSnapshot` yang salah tulis "price move" diperbaiki jadi
  "TVL move"; `compFor` kini menerima `minComps` eksplisit.
- `dashboard/app.js`: panel comps menampilkan N, IQR, LOO, member list
  (`<details>` per kategori), kartu fallback ditandai; 2 paragraf disclosure
  (momentum berbatas + liputan/survivorship); dialog detail menampilkan waterfall
  (Base $588,8M → After momentum $582,3M → Implied $464,9M untuk rank 1) +
  label "Seven-day TVL growth".
- `dashboard/app.css`: gaya `.comp details/.members/.unused`.
- `screenshots/`: 3 PNG diregenerasi (CDP Chromium headless, Node stdlib;
  skrip `/tmp/radar-ablation/shots.mjs`, `shot3.mjs`).
- `README.md`: bagian model diperbarui (waterfall, transparansi, TVL change).
- `vendor/makefun-board.ts`: TIDAK DIUBAH (sha256 tetap `9ca51b6e…0dc326e`).

### 4. Verifikasi akhir (20 Nov 2026, setelah semua perubahan)

- `node main.ts` 2x ke direktori berbeda → board.json, data.js, dossier.json
  byte-identik (deterministik). SHA baru: **board.json
  `ec37587712a7c02058da1d8328eab730edb77fbf22bdd93164ba12b130c5ea82`**,
  **dossier.json
  `517345580bd9b1d06e3e62b770b63f2108d68362ce5dab7530906c4e049a22b2`**,
  data.js `96c53dc76d70fb8ec362d77f0d0b43fa70b7c6dcca15707b9ab4dccec75641e8`.
  (SHA lama: board `ba1647a5…`, dossier `178fdde5…` — berubah karena field baru
  + screenshot baru, sesuai perkiraan. Dossier sempat `10869ccf…` sebelum
  screenshot diregenerasi; SHA final di atas yang berlaku.)
- Ranking & implied value IDENTIK dengan board tersubmit: 0 selisih dari 198 baris.
- Waterfall diverifikasi recompute eksak presisi penuh dari input mentah:
  0 mismatch (base = round(TVL x comp 4dp); after = round(base x growthMx);
  final = round(after x maturity)). Recompute dashboard (`impliedOf`) juga 0 mismatch.
- Gate: 198 baris, rank 1..198, implied non-increasing, watchlist 40/40,
  farm steps valid — `boardIssue()` null (main.ts exit 0, tidak ada error).
- Dashboard dirender headless: 198 baris board, 34 kartu comps (14 terpakai,
  20 fallback), 34 `<details>` member, teks coverage/survivorship/batas momentum
  tampil, dialog rank 1 menampilkan waterfall lengkap, filter Dexs = 21 baris,
  console bersih (0 error).
- Ukuran: board.json 294.940 byte, data.js 96.256 byte, dossier 669.872 byte
  (< 1,5 MB); source dashboard 37.616 byte (< 65.536); screenshot < 512 KiB.
- Kit `check` lokal (20 Nov 2026, `--worktree`, tanpa API key): 4 passed
  (`competition_open`, `snapshot`, `license_osi`, `entrypoint`), 1 failed —
  `transcripts_present` (wajar: bundle transcript dibuat parent saat resubmit),
  15 skipped, 5 at-submission (repo publik/owner/created/commit/duplicate —
  urusan parent saat resubmit). Tidak ada temuan lain.
- TIDAK disubmit, TIDAK dibuat repo, TIDAK dipakai API key.
