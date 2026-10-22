"""Package the runnable local app without databases, uploads, accounts or logs."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import subprocess
import sys

root = Path(__file__).resolve().parent
subprocess.run([sys.executable, str(root / "package-site.py")], check=True)
with ZipFile(root / "danmiao-static-site.zip") as archive:
    files = set(archive.namelist())
files.update({"package.json", ".gitignore", "start-local.cmd", "login.html", "backend-client.js", "backend.css", "LOCAL-BACKEND.md", "README.md", "REQUIREMENTS.md", "workbench-check.cjs", "workflow-check.cjs", "package-site.py", "package-backend.py"})
files.add("server/demo-seed.json")
files.update({"Dockerfile", "compose.yaml", "Caddyfile", ".dockerignore", ".env.example", ".gitattributes", "DEPLOYMENT.md", "GITHUB.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "CONTRIBUTING.md", "SECURITY.md", "UPGRADE-NOTES.md", "PROJECT-AUDIT.md", ".github/workflows/check.yml"})
files.update(str(p.relative_to(root)).replace("\\", "/") for p in (root / "server").glob("*.cjs") if p.name != "ui-fixture.cjs")
output = root / "danmiao-local-backend.zip"
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in sorted(files):
        archive.write(root / name, name)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any(name.startswith(("data/", "node_modules/")) for name in archive.namelist())
print(f"Local app: {output}\n{len(files)} files; no live user data included")
