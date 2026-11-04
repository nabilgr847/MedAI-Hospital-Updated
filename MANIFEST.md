# MedAI Hospital update manifest

Generated: 2026-11-04

## Modified existing files
- `apps/api/package.json` — SHA-256 `a2e5a221b4629236a50110aa7fb9b1df9c0e6b70df874232139f3e3e40e4bb5b`
- `apps/api/src/models.js` — SHA-256 `2b9ed65c3498e0f006e03f4a2250ff9a430b2a6735ebaf4b1decb35eca26da92`
- `apps/api/src/routes.js` — SHA-256 `33bcda230520092e184de82f255c79417eda17974406a0a822b40d5985a11ee5`
- `apps/api/src/server.js` — SHA-256 `c80016565c5645411b37c5111d2dc49e64359da091182998ee8d1c04da262845`
- `apps/api/src/util.js` — SHA-256 `cc2656fb44ce8cff89fb3c8e59a4ef5b911cd473989053416ddabe88b7727f00`
- `apps/web/src/AdminPanel.tsx` — SHA-256 `2fd290b886c22a4a1ba5e888494cc82e42f59d499bd9d3d83483873f54a43f76`
- `apps/web/src/DoctorPanel.tsx` — SHA-256 `7b3f23a453664adcc8373353e2cba540201bb0f67079b953469c652aa84d612a`
- `apps/web/src/PatientPanel.tsx` — SHA-256 `0e10b2db8c9dcb24d8f47db89a0ecaa34c88705aa0bba4fe93a8f04c821a5c18`
- `docs/API_REFERENCE.md` — SHA-256 `f9ebb81449599a5d8aadc701f5256bd2696d09132b74ed4e68ee058350878b3a`
- `render.yaml` — SHA-256 `8d6d536024a472cc9ff1c223d9e1c6b6d167da8f6e7e349d895671815bb6f0a0`
- `tests/util.test.js` — SHA-256 `3f182aa1955d648f1fa6a2f8dc22e989415b1e0f92397bb8a2a7e4db57372443`

## Newly created files
- `CHANGELOG_V2_4.md` — SHA-256 `2a3c16155a9869c85655033d54ceeafd73a140e8849a90220fe616e6948dce7b`
- `TESTING_REPORT.md` — SHA-256 `3997cef596c29686b88ed4759a162907fcd9eec60cdd4fd8732e2de95baacac5`
- `apps/api/src/pdf.js` — SHA-256 `d1fe31f345584088ce2a4bad7ec5b60625edfdfd26546ddb833e35702e78e2fd`
- `apps/api/src/reportRules.js` — SHA-256 `a5d0966981ca746a8f24d2947326234c01b6d18484ea8e2c27c51f1846892bd3`
- `docs/IMPLEMENTATION_ADDENDUM_2026.md` — SHA-256 `a919a34c1d65ab35392ce9ba6ff4e4912e8da4519421fba8a1729e974a4c204d`
- `scripts/colab_install_patch.py` — SHA-256 `d3d1797a8a12d1bb4608519b233fd15d7d8e4e67d4da8f56bfd0944fed552839`
- `tests/report-rules.test.js` — SHA-256 `3a03f7d43d0cb5a77af597831c074b8416874081529c844851409e01a85e5701`

## Manifest note
- `MANIFEST.md` is this manifest and is not self-hashed.

## Protected / excluded
- No Map or Map Data source file was changed. The `NearbyCare()` map component in `apps/web/src/PatientPanel.tsx` is byte-for-byte identical to the original.
- `.env` and `apps/api/.env` are intentionally excluded from distributable ZIPs. The Colab installer never overwrites local `.env` files.
- No unrelated existing files were deleted.


## V2.6 update files
- `CHANGELOG_V2_6.md` and `RELEASE_NOTES_V2_6_BN.md` describe report-image vision support, Admin live monitoring, online-presence heartbeats, and metadata-only call-session tracking.
- `docs/IMPLEMENTATION_STATUS.md`, `docs/FEATURE_MATRIX.md`, `docs/DEPLOYMENT.md`, and `TESTING_REPORT.md` document scope, configuration, and outstanding validation.
