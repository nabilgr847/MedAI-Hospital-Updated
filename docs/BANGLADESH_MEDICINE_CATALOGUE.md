# Bangladesh Medicine Catalogue

## Authoritative direction
- DGDA medicine search: https://adr.dgdagov.info/medicines
- DGDA official portal: https://info.dgda.gov.bd/
- DGHS Bangladesh Core FHIR Implementation Guide, DGDA Registered Drugs ValueSet: https://fhir.dghs.gov.bd/core/0.4.6/ValueSet-dgda-registered-drugs.html
- DGHS OCL terminology collection referenced by the FHIR guide: https://tr.ocl.dghs.gov.bd/orgs/MoHFW/collections/dgda-registered-drugs-valueset/

The DGHS FHIR guide describes a DGDA registered-drug value set with 39,196 finished pharmaceutical product concepts. This repository does not bundle that full registry because it must be retrieved through an authorized/export-supported method and its data-use conditions must be confirmed. Do not claim the catalogue is complete until a current registry export has been imported and reconciled.

## Import
1. Obtain an official or otherwise licensed CSV/JSON export. Do not scrape MedEx or any other provider in violation of terms, rate limits, or copyright.
2. Normalize it to `data/bangladesh_medicine_import_template.csv` columns.
3. Set a dedicated Admin JWT in `MEDAI_ADMIN_TOKEN`.
4. Run:

```bash
python scripts/import_bd_medicines.py data/your_authorized_export.csv \
  --api https://YOUR-API-DOMAIN \
  --source-name "DGDA/DGHS authorized export" \
  --source-url "https://source.example/export" \
  --source-license "Documented permission / applicable open-data terms"
```

5. Every imported row begins as `needs_review`; it is not returned by the public autocomplete endpoint until an authorized catalogue reviewer marks it verified. This is intentional: import is not clinical validation.

## Data fields
Brand, generic/active ingredient, strength, dosage form, manufacturer, Bangladesh registration number, source name/URL, license basis, last checked timestamp, review status.

## Important
Catalogue data is reference information, not a prescription recommendation. Keep the source provenance internally for audit. Verify product registration status, spelling, strength, form, manufacturer, and update date. Do not expose a record as verified based only on automated import.
