# STATUS — token-radar-01 (siap-submit, BELUM disubmit)

Dibangun 20 Nov 2026. Lokasi: `~/workspace/makefun/entries/token-radar-01/`
Akun: make.fun @turibaru. Deadline bounty: 14 Des 2026.

## Yang sudah dibangun

- `main.ts` (Node 22, stdlib only) + `lib/model.ts` — program + model, ditulis baru
  (bukan salinan starter).
- `vendor/makefun-board.ts` — disalin byte-identik dari kit
  (sha256 `9ca51b6e…0dc326e`, sama dengan kit).
- `dashboard/` — `index.html`, `app.css`, `app.js` (total 35.253 byte, di bawah
  batas 64 KB agar seluruh source masuk dossier). Tema gelap "radar", offline,
  tanpa URL http/https di file mana pun.
- `screenshots/` — 3 PNG 1440x800, masing-masing < 512 KiB:
  `1-board.png` (143 KB), `2-detail.png` (191 KB), `3-filtered.png` (137 KB).
  Diambil dengan Chromium headless Playwright lokal (meta-Chromium ditolak
  policy "Hatch WebGL domain policy", jadi dipakai binary Playwright).
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

## Metodologi implied value (radar-2-comps)

Model comparables dari angka snapshot sendiri, bukan flat multiple:

```
implied = round( TVL x comp x (1 + clamp(change_7d, -60, 120)/100 x 0,5)
                 x (0,6 + min(age_days, 1095)/1095 x 0,4) )
```

- `comp` = median mcap/TVL protokol live-token di kategori yang sama (min 3
  komparabel, clamp 0,05x–1,50x); kategori tanpa cukup komparabel memakai median
  semua kategori 0,21x. Contoh: Dexs 0,34x; Lending 0,13x; RWA 0,27x;
  Basis Trading 0,65x; Cross Chain Bridge 1,22x.
- `growth` = perubahan TVL 7 hari; `maturity` = umur sejak pertama listing
  (semakin lama tanpa token, semakin matang). Umur tak diketahui = 365 hari.
- Halaman dashboard menghitung ulang tiap baris dari angka yang sama dan
  menampilkan "the same number board.json carries" — sudah diverifikasi cocok
  persis (awalnya sempat selisih ~$7 ribu karena pembulatan rasio, sudah
  diperbaiki dengan membulatkan rasio ke 4 desimal di dalam model).

## Verifikasi yang sudah dijalankan

- `node main.ts` 2x ke direktori berbeda → output byte-identik (deterministik).
- Gate check lokal: 198 baris, rank 1..N, implied non-increasing, watchlist
  40/40, farm steps valid, dossier 665.410 byte (< 1,5 MB), teks dossier
  35.517 byte (< 65.536, source lengkap), dashboard tanpa URL http/https.
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
