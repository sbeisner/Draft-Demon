# PyInstaller spec for the Inkubus backend (FastAPI + uvicorn), one-dir build.
# Build from the backend/ dir:  pyinstaller --noconfirm inkubus-backend.spec
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []

# uvicorn selects its loop/protocol/lifespan impls by string at runtime, and
# python-docx ships template data — collect both fully so nothing is missing.
for pkg in ("uvicorn", "docx"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h
hiddenimports += collect_submodules("uvicorn")

a = Analysis(
    ["run.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="inkubus-backend",
    console=True,
    target_arch="arm64",
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    name="inkubus-backend",
)
