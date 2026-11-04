# Google Colab one-cell installer for MedAI Hospital Patch ZIP.
# Paste this entire file into ONE Colab code cell and run it.
from pathlib import Path
from datetime import datetime
import hashlib, os, shutil, zipfile

try:
    from google.colab import files, drive
except Exception as exc:
    raise RuntimeError("Run this installer inside Google Colab.") from exc

print("MedAI Hospital safe patch installer")
print("1) Mount Google Drive so you can select your existing project folder.")
drive.mount('/content/drive')
print("2) Upload MedAI_Hospital_Patch.zip when prompted.")
uploaded = files.upload()
if not uploaded:
    raise RuntimeError("No patch ZIP was uploaded.")
patch_zip = Path('/content') / next(iter(uploaded.keys()))
if not zipfile.is_zipfile(patch_zip):
    raise RuntimeError("The uploaded file is not a valid ZIP archive.")
project_text = input("Enter the existing MedAI project folder path (e.g. /content/drive/MyDrive/MedAI_Hospital): ").strip()
project = Path(project_text).expanduser().resolve()
if not project.is_dir() or not (project / 'apps' / 'api' / 'src').is_dir():
    raise RuntimeError("Project folder not found or does not look like MedAI Hospital (apps/api/src missing).")

stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
backup = project.parent / f"{project.name}_BACKUP_{stamp}.zip"
print(f"Creating full backup: {backup}")
with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as zbackup:
    for path in project.rglob('*'):
        if path.is_file():
            zbackup.write(path, path.relative_to(project).as_posix())
print(f"Backup complete ({backup.stat().st_size:,} bytes).")

blocked_parts = {'.git', 'private_uploads', 'node_modules'}
replace_files, add_files, skipped = [], [], []
with zipfile.ZipFile(patch_zip) as zpatch:
    bad = zpatch.testzip()
    if bad:
        raise RuntimeError(f"Corrupt ZIP entry: {bad}")
    entries = []
    for info in zpatch.infolist():
        if info.is_dir():
            continue
        rel = Path(info.filename)
        if rel.is_absolute() or '..' in rel.parts or not rel.parts:
            raise RuntimeError(f"Unsafe ZIP path rejected: {info.filename}")
        if rel.name.lower() == '.env' or any(part in blocked_parts for part in rel.parts):
            raise RuntimeError(f"Protected file/path rejected from patch: {info.filename}")
        # Map and Map Data are protected. The PatientPanel change keeps its NearbyCare/map code byte-for-byte unchanged.
        lowered = [part.lower().replace('_', '').replace('-', '') for part in rel.parts]
        if any(part in {'map', 'mapdata'} for part in lowered):
            raise RuntimeError(f"Map/Map Data paths are protected: {info.filename}")
        entries.append((info, rel))
    for info, rel in entries:
        target = (project / rel).resolve()
        if project not in target.parents:
            raise RuntimeError(f"Path escapes project directory: {info.filename}")
    for info, rel in entries:
        target = project / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        existed = target.exists()
        with zpatch.open(info, 'r') as src, open(target, 'wb') as dst:
            shutil.copyfileobj(src, dst)
        (replace_files if existed else add_files).append(rel.as_posix())

# Verify each installed file against the exact ZIP payload.
verification_errors = []
with zipfile.ZipFile(patch_zip) as zpatch:
    for info in zpatch.infolist():
        if info.is_dir():
            continue
        rel = Path(info.filename)
        target = project / rel
        if not target.is_file() or hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(zpatch.read(info)).digest():
            verification_errors.append(info.filename)

print("\nINSTALL SUMMARY")
print(f"Replaced existing files: {len(replace_files)}")
for name in replace_files: print("  REPLACED:", name)
print(f"Added new files: {len(add_files)}")
for name in add_files: print("  ADDED:", name)
if verification_errors:
    print("Verification errors:")
    for name in verification_errors: print("  ERROR:", name)
    raise RuntimeError(f"Installation verification failed. Full backup is available at {backup}")
print("All patched files passed SHA-256 verification.")
print("Existing .env files were not included in the patch and remain untouched.")
print("Map and Map Data paths were protected by installer validation.")
print(f"\nBACKUP FOR ROLLBACK: {backup}")

if input("Rollback now using the backup? Type YES to restore the entire pre-install folder: ").strip().upper() == 'YES':
    # Remove current project contents, then restore the complete backup archive.
    for child in project.iterdir():
        if child.is_dir(): shutil.rmtree(child)
        else: child.unlink()
    with zipfile.ZipFile(backup) as zbackup:
        zbackup.extractall(project)
    print("Rollback complete. Project restored from the pre-install backup.")
else:
    print("Installation finished. Keep the backup ZIP until you have tested the deployment.")
