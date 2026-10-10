# PRJEDU_pages — web pages the engine writes (.ayp)

One engine, one command, and a browser:

```bat
run.bat
```

On Linux: `./run.sh`. Then open **http://127.0.0.1:8115/**.

A small tank farm: three tanks, each filled by a pump that a level controller
switches between two set points, with alarms on the levels. The pages show
it and let you change the set points — and **there is no JavaScript in the
browser and no API behind it**. Every page is a file in `www\` that the engine
runs on each request and answers with the HTML it writes.

```html
<p>Level: <%= evt.GetValue("id('T1_LVL')/@val") %> %</p>
```

If you have written ASP, JSP, PHP or EJS, you already know the syntax.

## The syntax

| Form | Meaning |
|---|---|
| `<% code %>` | statements in the engine's script language |
| `<%= expr %>` | the value, **HTML-escaped** (`&` `<` `>` `"` `'`) |
| `<%- expr %>` | the value as it is — markup or JSON you built yourself |
| `<%-- comment --%>` | dropped |
| `<%@ page type="application/json" %>` | the page's content type |
| `<%@ include file="part/head.ayp" %>` | another file, spliced in |
| `-%>` | ends a tag and drops the line break after it |

A page sees `evt` (read and write the plant: `evt.GetValue`, `evt.SetValue`),
`req` (the request: `method`, `getForm`, `getParam`, `getHeader`), `res` (the
answer: `status`, `type`, `header`, `redirect`), `ses` (the visitor's
session) and the document's script by its name (`main.tank(evt, "T1")`).

## The files

| File | What it shows |
|---|---|
| `www\index.ayp` | the overview: a loop writes one table row per tank; the page reloads itself every 2 s |
| `www\tank.ayp` | one tank and a form: **validate on the server, never put request text in an address, redirect after a POST** |
| `www\api.ayp` | the same data as JSON, for a program: `curl http://127.0.0.1:8115/api.ayp` |
| `www\access.ayp` | what a page may read: a value closed to Guest reads as nothing |
| `www\part\head.ayp`, `foot.ayp` | included by every page; they see the including page's `title` |
| `www\style.css` | an ordinary file: anything that is not `.ayp` is sent as it is |
| `db\db_FARM.xml` | the tanks, their alarms, the closed value, the web listener |
| `db\db_FARM.js` | the simulation and controllers, and `tank()` / `set_points()` — the helpers every page calls |

## What it teaches

* **A page is a script with HTML around it.** It reads the plant with the
  same `evt.GetValue` every script uses; there is nothing to publish, poll or
  subscribe. Look at a page's source in the browser: the values are in the
  HTML.
* **Escape by default.** Tank 3 is called `Oil & grease <sump>`; `<%= %>`
  writes `Oil &amp; grease &lt;sump&gt;`, so a name — or anything a user
  typed — can never become markup. `<%- %>` is the one place that does not
  escape, and `api.ayp` uses it for the JSON text.
* **Keep the knowledge in one place.** The pages call `main.tank()` and
  `main.set_points()` from `db_FARM.js`; the HTML page and the JSON page can
  never disagree, and the rule "stop the pump between 20 and 95 %" exists
  once.
* **Input is checked on the server.** `tank.ayp?id=T9` is a 404, not an
  address `id('T9_LVL')` built from what the browser sent. A stop level of 99
  is refused with the reason, whatever the form allowed.
* **POST, then redirect.** A saved form answers `303 See Other` to
  `tank.ayp?id=T1&saved=1`; reloading the page repeats the harmless GET, not
  the write.
* **A page has the visitor's rights.** Nobody logs in here, so every page is
  Guest (role 0). `MNT_CODE` has `xdb_acl="0xFFFFFFF0"` — no rights for
  role 0 — and `access.ayp` gets nothing for it. A page is not a back door:
  the same `xdb_acl` that guards MQTT, MCP and the telnet shell guards it.

## What happens on a request

```
GET /tank.ayp?id=T1
  CN_WEB (PRO.http) finds www\tank.ayp
  first time, or the file / an include changed:   translate it into a script
                                                  (kept; the next request only stats the files)
  run the script on the connection's thread, with the visitor's role
  answer status + headers + the HTML it wrote, Content-Length exact
```

A page that fails is answered **500 `Server page error`** and the reason goes
to the log (`log\FARM.log`) with the template's line number — never to the
browser. Edit a page while the engine runs: the next request uses it.

## Try this

| Do | See |
|---|---|
| set Treated water to stop at 95 | the level climbs past 88 %: the row turns yellow (warning) — the colour is `ALM.onlvl`'s, the page only prints `t.alarm` |
| type `abc` as a set point | "Not saved: both set points must be numbers" — nothing written |
| open `tank.ayp?id=T1'` | 404: the id never reaches an address |
| remove a `%>` from `index.ayp` | 500 in the browser; in the log `page '...index.ayp' REFUSED -- ... line N: '<%' without '%>'` |
| add `<% throw "test"; %>` to `access.ayp` | 500; the log names the page and the line |
| change `<%= t.name %>` to `<%- t.name %>` in `index.ayp` | tank 3's name becomes broken markup — why `<%=` is the default |
| `curl -I http://127.0.0.1:8115/` | `HEAD`: the headers alone, with the exact `Content-Length` |

## Adding a page to your own project

Any `PRO.http` connection that serves files serves `.ayp` pages; nothing to
switch on. Put the file under its `pro_http_root` — `PRJEDU_oee` does exactly
that with a printable shift report (`www\report.ayp`) beside its live page.
The engine needs to be 4.3.4.588 or later.

## Licence

One connection and two documents: inside the FREE edition.
