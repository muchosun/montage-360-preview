"""Create a source ZIP locally; never deploy or install cloud resources."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
target = root.parent / 'output' / 'leads-function.zip'
target.parent.mkdir(exist_ok=True)
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for name in ('api.py', 'repository.py', 'worker.py', 'requirements.txt'):
        archive.write(root / name, name)
print(target)
