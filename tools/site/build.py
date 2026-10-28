"""Build the documentation site of this repository.

The site is made from the Markdown that is already here -- README.md, docs/,
examples/README.md, each group's README.md and every example's README.md --
so writing an example's README IS writing the site; nothing is kept twice.
The groups come in the order examples/README.md lists them; an example's page
keeps its flat address (PRJEDU_modbus/) whatever group folder holds it. This script copies those files into
tools/site/_build/src, turns links to files that are not pages into links to
GitHub, writes the navigation, and writes two files for AI assistants:
llms.txt (an index) and llms-full.txt (every page in one file, to hand to an
assistant as context).

    python tools/site/build.py            stage only (then: mkdocs build -f tools/site/_build/mkdocs.yml)
    python tools/site/build.py --serve    stage and preview at http://127.0.0.1:8000/
    python tools/site/build.py --build    stage and build into tools/site/_build/site

Needs: pip install -r tools/site/requirements.txt
"""

import os
import re
import shutil
import subprocess
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "_build")
SRC = os.path.join(OUT, "src")

REPO_URL = "https://github.com/akya-dev/AyMON"
BRANCH = "main"


def _tracked():
    """Every file git tracks, and every directory above one. The site is built
    from a sparse checkout (Markdown only), so the disk does not show what the
    repository holds - git's index does."""
    try:
        out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    files, dirs = set(), set()
    for f in out.decode("utf-8").split(chr(0)):
        if f:
            files.add(f)
            d = os.path.dirname(f)
            while d and d not in dirs:
                dirs.add(d)
                d = os.path.dirname(d)
    return files, dirs


TRACKED = _tracked()


def repo_kind(rel):
    """'blob' for a tracked file, 'tree' for a directory holding one, None for neither."""
    if TRACKED is None:                       # not a git checkout: what the disk shows
        p = os.path.join(ROOT, rel)
        return "tree" if os.path.isdir(p) else "blob" if os.path.exists(p) else None
    files, dirs = TRACKED
    return "blob" if rel in files else "tree" if rel in dirs else None

LINK_RE = re.compile(r"(!?\[[^\]]*\]\()([^)\s]+)(\))")
# the same in raw HTML (README.md's picture gallery): <img src=".."> and <a href="..">
HTML_RE = re.compile(r"(<(?:img|a)\b[^>]*?\b(?:src|href)=\")([^\"]+)(\")")
FENCE_RE = re.compile(r"^\s*(```|~~~)")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def title_of(text, fallback):
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def groups():
    """The example groups in the order examples/README.md lists them: [(folder, title)]."""
    text = read(os.path.join(ROOT, "examples", "README.md"))
    out = []
    for title, folder in re.findall(r"^\| \[([^\]]+)\]\(([a-z0-9-]+)/\) \|", text, re.M):
        if os.path.isfile(os.path.join(ROOT, "examples", folder, "README.md")):
            out.append((folder, title))
    return out


def pages():
    """(repo path, site path, nav section) of every page, in navigation order.
    A section is None (Home), a name, or (name, group title) for an example group,
    whose README is the group's own page. An example keeps the flat site path it
    had before the groups (docs.aymon.ca/PRJEDU_modbus/), whatever its folder."""
    out = [("README.md", "index.md", None)]
    out.append(("docs/README.md", "docs/index.md", "Guides"))
    for name in sorted(os.listdir(os.path.join(ROOT, "docs"))):
        if name.endswith(".md") and name != "README.md":
            out.append(("docs/" + name, "docs/" + name, "Guides"))
    out.append(("examples/README.md", "examples/index.md", "Examples"))
    for folder, title in groups():
        base = "examples/" + folder
        out.append((base + "/README.md", base + "/index.md", ("Examples", title)))
        # in the order the group's README lists them, then any it does not list
        listed = re.findall(r"\]\((PRJ[A-Z]+_[A-Za-z0-9_]+)/\)", read(os.path.join(ROOT, base, "README.md")))
        names = [n for n in os.listdir(os.path.join(ROOT, base)) if n.startswith("PRJ")]
        for name in sorted(names, key=lambda n: (listed.index(n) if n in listed else len(listed), n)):
            if os.path.isfile(os.path.join(ROOT, base, name, "README.md")):
                out.append((f"{base}/{name}/README.md", name + "/index.md", ("Examples", title)))
    return out


def rewrite_links(text, repo_path, site_of):
    """Links to pages stay relative; links to any other file go to GitHub -
    a picture to its raw file, so that it shows on the site too."""
    base = os.path.dirname(repo_path)
    site_base = os.path.dirname(site_of[repo_path])

    def fix(m):
        target = m.group(2)
        if re.match(r"^[a-z]+:", target) or target.startswith("#"):
            return m.group(0)
        html = m.group(1).startswith("<")
        picture = m.group(1).startswith(("!", "<img"))
        path, _, anchor = target.partition("#")
        anchor = "#" + anchor if anchor else ""
        rel = os.path.normpath(os.path.join(base, path)).replace("\\", "/")
        if os.path.isdir(os.path.join(ROOT, rel)) and (rel + "/README.md") in site_of:
            rel = rel + "/README.md"
        if rel in site_of:
            new = os.path.relpath(site_of[rel], site_base or ".").replace("\\", "/")
            if html:  # MkDocs turns x.md into a URL in Markdown links only
                new = new[:-len("index.md")] if new.endswith("index.md") else new[:-3] + "/"
                new = new or "./"
            return m.group(1) + new + anchor + m.group(3)
        kind = repo_kind(rel)
        if kind:
            if picture and kind == "blob":
                kind = "raw"
            return m.group(1) + f"{REPO_URL}/{kind}/{BRANCH}/{rel}{anchor}" + m.group(3)
        return m.group(0)

    lines, fenced = [], False
    for line in text.splitlines(keepends=True):
        if FENCE_RE.match(line):
            fenced = not fenced
        lines.append(line if fenced else HTML_RE.sub(fix, LINK_RE.sub(fix, line)))
    return "".join(lines)


def example_banner(repo_path):
    folder = os.path.dirname(repo_path)
    name = os.path.basename(folder)
    if not name.startswith("PRJ"):
        return ""
    return (f"!!! info \"\"\n    Every file of this example — the XML, the scripts, the page — is in\n"
            f"    [**{folder}** on GitHub]({REPO_URL}/tree/{BRANCH}/{folder}).\n"
            f"    Run it with `run.bat` (Windows) or `./run.sh` (Linux) from that folder.\n\n")


def stage():
    if os.path.isdir(SRC):
        shutil.rmtree(SRC)
    plist = pages()
    site_of = {repo: site for repo, site, _ in plist}
    nav, sections, full = [], {}, []
    for repo, site, section in plist:
        text = read(os.path.join(ROOT, repo))
        title = title_of(text, os.path.dirname(repo) or "Home")
        body = rewrite_links(text, repo, site_of)
        banner = example_banner(repo)
        if banner:  # after the H1
            head, sep, rest = body.partition("\n")
            body = head + sep + "\n" + banner + rest
        write(os.path.join(SRC, site), body)
        full.append((title, site, text))
        label = title
        if site in ("docs/index.md", "examples/index.md"):
            label = "Overview"
        elif os.path.basename(os.path.dirname(repo)).startswith("PRJ"):  # the folder name; the full title is on the page
            label = os.path.basename(os.path.dirname(repo))
        entry = {label: site}
        if section is None:
            nav.append({"Home": site})
            continue
        top = section[0] if isinstance(section, tuple) else section
        if top not in sections:
            sections[top] = []
            nav.append({top: sections[top]})
        if isinstance(section, tuple):   # an example group: its README is the section's own page
            if section not in sections:
                sections[section] = [site]
                sections[top].append({section[1]: sections[section]})
            else:
                sections[section].append(entry)
        else:
            sections[top].append(entry)

    # pages that exist only on the site
    for name in sorted(os.listdir(os.path.join(HERE, "pages"))):
        text = read(os.path.join(HERE, "pages", name))
        write(os.path.join(SRC, name), text)
        nav.append({title_of(text, name): name})
        full.append((title_of(text, name), name, text))
    assets = os.path.join(HERE, "assets")
    for name in (os.listdir(assets) if os.path.isdir(assets) else []):
        dst = os.path.join(SRC, "assets", name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(HERE, "assets", name), dst)

    cfg = yaml.safe_load(read(os.path.join(HERE, "site.yml")))
    site_url = os.environ.get("SITE_URL") or cfg.get("site_url", "")
    cfg["site_url"] = site_url
    cfg["docs_dir"] = "src"
    cfg["site_dir"] = "site"
    cfg["nav"] = nav
    write(os.path.join(OUT, "mkdocs.yml"), yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True))

    # for AI assistants (https://llmstxt.org/)
    url = lambda p: site_url.rstrip("/") + "/" + (p[:-len("index.md")] if p.endswith("index.md") else p[:-3] + "/")
    idx = ["# AyMON", "",
           "> Runnable example projects and short guides for AyMON, an industrial monitoring",
           "> and automation engine configured in XML and scripted in a JavaScript-like language.", "",
           f"Everything below in one file: {site_url.rstrip('/')}/llms-full.txt", "", "## Pages", ""]
    idx += [f"- [{t}]({url(p)})" for t, p, _ in full]
    write(os.path.join(SRC, "llms.txt"), "\n".join(idx) + "\n")
    parts = ["# AyMON — every page in one file",
             "",
             "Hand this file to an AI assistant and ask it about AyMON. Source: " + REPO_URL,
             ""]
    for t, p, text in full:
        parts += ["", "=" * 78, f"PAGE: {t}", f"URL:  {url(p)}", "=" * 78, "", text.strip(), ""]
    write(os.path.join(SRC, "llms-full.txt"), "\n".join(parts))
    print(f"staged {len(full)} pages into {SRC}")


if __name__ == "__main__":
    stage()
    cfg = os.path.join(OUT, "mkdocs.yml")
    if "--serve" in sys.argv:
        sys.exit(subprocess.call([sys.executable, "-m", "mkdocs", "serve", "-f", cfg]))
    if "--build" in sys.argv:
        sys.exit(subprocess.call([sys.executable, "-m", "mkdocs", "build", "--strict", "-f", cfg]))
