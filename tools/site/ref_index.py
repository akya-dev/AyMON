"""Rebuild the 'Every name' block of docs/reference/README.md from the pages' headings.

    python tools/site/ref_index.py

Run it after adding or renaming a heading on a reference page. Every '##' of a page
is a scope, every '###' under it a name; the block between the index:begin and
index:end markers is replaced, nothing else in README.md is touched.

Anchor = Python-Markdown's default slug (what MkDocs uses); for a '### Scope.name'
heading it is also GitHub's ('mathround'). Duplicate headings in one page get
_1, _2 like Python-Markdown does.
"""
import os, re, sys, unicodedata, collections

REF = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "reference"))
BEGIN = "<!-- index:begin -->"
END = "<!-- index:end -->"

def slug(v):
    v = unicodedata.normalize("NFKD", v).encode("ascii", "ignore").decode("ascii")
    v = re.sub(r"[^\w\s-]", "", v).strip().lower()
    return re.sub(r"[-\s]+", "-", v)

FENCE = re.compile(r"^\s*(```|~~~)")

def headings(path):
    out, fenced, seen = [], False, collections.Counter()
    for line in open(path, encoding="utf-8"):
        if FENCE.match(line):
            fenced = not fenced
            continue
        if fenced:
            continue
        m = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
        if not m:
            continue
        text = m.group(2)
        plain = re.sub(r"`([^`]*)`", r"\1", text)
        plain = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", plain)
        s = slug(plain)
        n = seen[s]
        seen[s] += 1
        anchor = s if n == 0 else "%s_%d" % (s, n)
        out.append((len(m.group(1)), plain, anchor))
    return out

def main():
    pages = sorted(f for f in os.listdir(REF) if re.match(r"\d\d_.*\.md$", f))
    rows = []
    total = 0
    for page in pages:
        hs = headings(os.path.join(REF, page))
        title = next((t for lvl, t, a in hs if lvl == 1), page)
        cur_sec, cur_items = None, []
        secs = []
        for lvl, text, anchor in hs:
            if lvl == 2:
                if cur_sec is not None:
                    secs.append((cur_sec, cur_items))
                cur_sec, cur_items = (text, anchor), []
            elif lvl == 3 and cur_sec is not None:
                cur_items.append((text, anchor))
        if cur_sec is not None:
            secs.append((cur_sec, cur_items))
        rows.append((page, title, secs))
    lines = [BEGIN, ""]
    for page, title, secs in rows:
        lines.append("### %s" % title)
        lines.append("")
        for (stext, sanchor), items in secs:
            if not items:
                lines.append("* [%s](%s#%s)" % (stext, page, sanchor))
                continue
            links = []
            for text, anchor in items:
                total += 1
                fmt = "[`%s`](%s#%s)" if (" " not in text or text.startswith("new ")) else "[%s](%s#%s)"
                links.append(fmt % (text, page, anchor))
            lines.append("* **[%s](%s#%s)** — %s" % (stext, page, sanchor, " · ".join(links)))
        lines.append("")
    lines.append(END)
    readme = os.path.join(REF, "README.md")
    text = open(readme, encoding="utf-8").read()
    block = "\n".join(lines)
    if BEGIN in text:
        text = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda m: block, text, flags=re.S)
    else:
        text = text.rstrip("\n") + "\n\n## Every name\n\n" + block + "\n"
    open(readme, "w", encoding="utf-8", newline="\n").write(text)
    print("entries:", total, "pages:", len(pages))

if __name__ == "__main__":
    main()
