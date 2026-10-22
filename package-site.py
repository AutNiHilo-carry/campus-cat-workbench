"""Build the static deployment ZIP, excluding tests, screenshots and browser data."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.files = {"index.html"}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        path = attrs.get("src") if tag in {"script", "img"} else attrs.get("href") if tag == "link" else None
        if path and not path.startswith(("http:", "https:", "data:", "#")):
            self.files.add(urlsplit(path).path)


assets = Assets()
assets.feed((ROOT / "index.html").read_text(encoding="utf-8"))
# The avatar atlas is referenced dynamically by the application.
assets.files.add("assets/default-cat-avatars-v4.png")
assets.files.add("vendor/pinyin-pro-LICENSE")
assets.files.update({"LICENSE", "LICENSES/MIT-HISTORICAL.txt", "THIRD_PARTY_NOTICES.md"})
output = ROOT / "danmiao-static-site.zip"
for name in assets.files:
    target = (ROOT / name).resolve()
    if not target.is_relative_to(ROOT) or not target.is_file():
        raise ValueError(f"Missing or invalid deployment asset: {name}")
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in sorted(assets.files):
        archive.write(ROOT / name, name)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert {"index.html", "mobile.css"} <= set(archive.namelist())
print(f"Ready: {output}\n{len(assets.files)} files, {output.stat().st_size / 1024 / 1024:.2f} MB")
