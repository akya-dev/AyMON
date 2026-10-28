# PRJEDU_pages — web pages the engine writes (.ayp)

One engine, one command, and a browser:

```bat
run.bat
```

On Linux: `./run.sh`. Then open **http://127.0.0.1:8115/**.

A small tank farm: three tanks, each filled by a pump that a level controller
switches between two set points, with alarms on the levels. The pages show
it to anyone and let an **operator who has logged in** change the set points
— and **there is no JavaScript in the browser and no API behind it**. Every
page is a file in `www\` that the engine runs on each request and answers with
the HTML it writes.

Users: **opr** / **opr123** (operator) and **eng** / **eng123** (engineer).

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
| `www\tank.ayp` | one tank and a form: **validate on the server, never put request text in an address, redirect after a POST**; the form only for an operator, with the login's CSRF token |
| `www\login.ayp` | the login form — it posts to `/auth/login`, which the **engine** answers |
| `www\api.ayp` | the same data as JSON, for a program: `curl http://127.0.0.1:8115/api.ayp` |
| `www\access.ayp` | what a page may read: the same table for a Guest, an operator and an engineer |
| `www\part\head.ayp`, `foot.ayp` | included by every page; they see the including page's `title`; the header shows who is logged in and a log-out button |
| `www\style.css` | an ordinary file: anything that is not `.ayp` is sent as it is |
| `db\db_FARM.xml` | the tanks, their alarms, who may change what (`xdb_acl`), the users (`<auth>`), the web listener (`con_auth`) |
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
* **A page has the visitor's rights.** Before a login every page is Guest
  (role 0); after one, the user's role. The set points carry
  `xdb_acl="0x33333111"` (everyone reads, Operator and up write), `MNT_CODE`
  `0xFF000000` (Engineer and Admin only). A page is not a back door: the same
  `xdb_acl` that guards MQTT, MCP and the telnet shell guards it.

## Logging in

The engine does the login; the pages only show it.

```xml
<auth id="A_FARM" auth_prv="local" auth_map="operator:3, engineer:6" ...>
  <usr usr_id="opr" usr_pwd="opr123" usr_grp="operator"/>
  <usr usr_id="eng" usr_pwd="eng123" usr_grp="engineer"/>
</auth>
<con id="CN_WEB" xdb_fnc="[CON.tcp,PRO.http]" ... con_auth="A_FARM" .../>
```

`con_auth` gives the listener logins. The engine then answers `POST
/auth/login` and `POST /auth/logoff` itself, and every request is judged by
the **login cookie** it carries — the cookie is `HttpOnly`, a page's script
never sees it. A page reads the result: `ses.user` (`""` for a Guest) and
`ses.user_role`.

`login.ayp` is a plain HTML form:

```html
<form method="post" action="/auth/login">
  <input type="hidden" name="next" value="/tank.ayp?id=T1">
  <input type="hidden" name="fail" value="/login.ayp?next=/tank.ayp?id=T1">
  <input name="usr"> <input name="pwd" type="password"> <button>Log in</button>
</form>
```

Because it sends `next`, the engine answers like a page: **303** to `next`
with the cookie set, or to `fail` with `&err=ERR_SUB_INVPASS` (wrong name or
password — the answer never says which) or `ERR_SUB_LOCKED` (five wrong
passwords lock that name for a minute). `next` and `fail` must be paths on
this server: anything else (`//evil.example`, `http://...`) gets no redirect.
Logging out is a form too (`part\head.ayp`).

**A form that changes something carries the login's CSRF token:**

```html
<input type="hidden" name="_csrf" value="<%= req.csrf %>">
```

`req.csrf` is a secret of this login. A page on another site can make the
visitor's browser post to `tank.ayp` — the browser may even send the cookie —
but it cannot know this value, and the engine answers **403** before the page
runs. A GET needs no token, which is one more reason a page changes nothing on
a GET.

**The page hides the form from a Guest, but that is not what protects the set
points**: `xdb_acl` is. Post the form without logging in (try it with curl)
and `main.set_points` answers "your role (0) may not change set points" —
`evt.SetValue` returned false.

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
| open a tank without logging in | the set points, no form, a "Log in as an operator" link |
| log in as `opr` with a wrong password | back on the login page with the reason; `log\FARM.log` has `AUTH(FARM/S00/A_FARM): http 'opr'@127.0.0.1 REFUSED: wrong password` |
| log in as `opr`, change a set point | saved; the log says `set points of T1 changed ... (from a page, role 3)` |
| `curl -d "id=T1&hi=70&lo=30" http://127.0.0.1:8115/tank.ayp` | "Not saved: your role (0) may not change set points" — `xdb_acl`, not the page |
| post the form with the cookie but without `_csrf` (remove the line from `tank.ayp`) | **403** from the engine; the log: `refused -- CSRF token missing` |
| open Access as Guest, as `opr`, as `eng` | `MNT_CODE` appears only for `eng` |
| add `pro_http_auth="1" pro_http_pub="/,/index.ayp,/login.ayp,/style.css"` to `CN_WEB` | a Guest gets only those; every other page answers 401 |

## Adding a page to your own project

Any `PRO.http` connection that serves files serves `.ayp` pages; nothing to
switch on. Put the file under its `pro_http_root` — `PRJEDU_oee` does exactly
that with a printable shift report (`www\report.ayp`) beside its live page.
The engine needs to be 4.3.4.588 or later; logins on HTTP 4.3.4.592, the
form login with `next` 4.3.4.594. The engine's own guide to the login, the
cookie, CSRF and the endpoints: `AyPROv43/doc/EN/Authentication_config.md` §9b.

## Licence

One connection, two documents, two logged-in users: inside the FREE edition.
