// =====================================================================
// PLT/S00 - the tank, and the plant's look at its own configuration.
//
//   step(evt)        twice a second: valve, pump, trip, level
//   self_check(evt)  every five seconds: what the configuration says about
//                    who may do what - as findings for the page
//
// The self-check only READS the configuration; it never prints a
// password or a hash, only whether there is one.
// =====================================================================

function get(evt, id)    { return evt.GetValue("id('" + id + "')/@val"); }
function getf(evt, id)   { return parseFloat("" + get(evt, id)); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function r1(v)           { return (0.0 + Math.round(v * 10.0)) / 10.0; }

// 0xFF113110 from a number: eight hex digits
function hex8(v)
{
    var d = "0123456789ABCDEF", s = "";
    for (var i = 7; i >= 0; i--) s = s + d.charAt((v >> (4 * i)) & 15);
    return "0x" + s;
}

function start(evt)
{
    evt.Log(4, "PLT: the tank - page and live values on http://127.0.0.1:8101/");
    return 0;
}

// ---------------------------------------------------------------------
// THE PROCESS
// ---------------------------------------------------------------------
function step(evt)
{
    var dt = 0.5;
    var level = getf(evt, "LEVEL");
    var sp = getf(evt, "SETPOINT"), trip = getf(evt, "TRIP_LEVEL");
    var cmd = "" + get(evt, "PUMP_CMD");

    // the trip: closes the inlet at TRIP_LEVEL, opens it ten points lower
    var tripped = parseInt("" + get(evt, "TRIPPED"));
    if (!tripped && level >= trip) { tripped = 1; set(evt, "MSG", "high-level trip at " + r1(level) + " %"); }
    else if (tripped && level < trip - 10.0) tripped = 0;
    set(evt, "TRIPPED", tripped);
    set(evt, "VALVE", tripped ? 0 : 1);

    // the pump: AUTO holds the level near the setpoint, anything else stops it
    var pump = parseInt("" + get(evt, "PUMP"));
    if (cmd == "AUTO") {
        if (level > sp + 2.0) pump = 1;
        else if (level < sp - 2.0) pump = 0;
    }
    else pump = 0;
    set(evt, "PUMP", pump);

    level = level + (tripped ? 0.0 : 2.0 * dt) - (pump ? 3.0 * dt : 0.0);
    if (level < 0.0) level = 0.0;
    if (level > 100.0) {
        set(evt, "OVERFLOW", getf(evt, "OVERFLOW") + (level - 100.0));
        if (getf(evt, "LEVEL") <= 100.0) set(evt, "MSG", "the tank overflows");
        level = 100.0;
    }
    set(evt, "LEVEL", level);
    return 0;
}

// ---------------------------------------------------------------------
// THE SELF-CHECK
// ---------------------------------------------------------------------
// One finding: {id, ok, what, detail}. 'what' is the rule, 'detail' what
// the configuration says.
function finding(list, id, ok, what, detail)
{
    list.push({ id: id, ok: ok ? true : false, what: what, detail: detail });
}

// the elements of an XPath as a list of attribute objects
function elms(evt, xpath)
{
    var s = "" + evt.GetValue("json(" + xpath + ")");
    return (s && s != "undefined") ? JSON.parse(s) : [];
}

// An xdb_acl as the engine reads it: four bits per role, role 0 in the
// lowest nibble (1 read, 2 write, 4 create, 8 delete). 0 or missing
// means NO access control at all.
function acl_of(v)
{
    if (v == null || "" + v == "" || "" + v == "undefined") return 0;
    var s = "" + v;
    return (s.substring(0, 2) == "0x") ? parseInt(s.substring(2), 16) : parseInt(s);
}
function nib(acl, role) { return (acl >> (4 * role)) & 15; }

function self_check(evt)
{
    var out = [];

    // 1 - every listener names the addresses that may connect
    var cons = elms(evt, "//con[@con_mod='SERVER']");
    var open = [];
    for (var i = 0; i < cons.length; i++)
        if (!cons[i].con_acl) open.push(cons[i].id);
    finding(out, 1, open.length == 0, "every listener has con_acl - the addresses that may connect",
            open.length ? open.join(", ") + ": no con_acl - any address that reaches the port may connect"
                        : "all " + cons.length + " listeners have one");

    // 2 - the live channel logs people in, and nobody starts above Guest
    var live = elms(evt, "id('CN_LIVE')");
    var auth = live.length ? "" + (live[0].con_auth ? live[0].con_auth : "") : "";
    var role = live.length && live[0].con_role ? parseInt("" + live[0].con_role) : 0;
    finding(out, 2, auth != "" && role == 0, "CN_LIVE logs every session in (con_auth), and a session starts as Guest (con_role 0)",
            (auth == "" ? "no con_auth: nobody logs in" : "con_auth " + auth) + ", con_role " + role
            + (role > 0 ? " - every connection starts with role " + role : ""));

    // 3 - what nobody was given is refused: the document has an xdb_acl, and Guest gets nothing
    var root = acl_of(evt.GetValue("/xdb/@xdb_acl"));
    finding(out, 3, root != 0 && nib(root, 0) == 0, "the document has an xdb_acl, and it gives Guest (role 0) nothing",
            root == 0 ? "no xdb_acl on the document: every element without its own is open to every role"
                      : "xdb_acl " + hex8(root) + (nib(root, 0) ? " - Guest may still read" : ""));

    // 6 - the accounts: passwords stored as hashes, the list readable by the administrator only
    var usrs = elms(evt, "//auth/usr"), plain = [];
    for (var j = 0; j < usrs.length; j++)
        if (("" + usrs[j].usr_pwd).substring(0, 15) != "$pbkdf2-sha256$") plain.push(usrs[j].usr_id);
    var auths = elms(evt, "//auth");
    var aacl = auths.length ? acl_of(auths[0].xdb_acl) : 0;
    var lower = 0;
    for (var r = 0; r <= 6; r++) lower = lower | nib(aacl, r);
    finding(out, 6, plain.length == 0 && aacl != 0 && lower == 0,
            "passwords are stored as hashes, and only the administrator may read the account list",
            (plain.length ? plain.length + " of " + usrs.length + " passwords in clear text (" + plain.join(", ") + ")" : "all passwords hashed")
            + "; account list " + (aacl == 0 ? "has no xdb_acl - readable by every role" : (lower ? "readable below Admin" : "Admin only")));

    // 7 - a password cannot be guessed at leisure
    var at = auths.length ? parseInt("" + (auths[0].auth_try ? auths[0].auth_try : 0)) : 0;
    var al = auths.length ? parseInt("" + (auths[0].auth_lock ? auths[0].auth_lock : 0)) : 0;
    finding(out, 7, at > 0 && al > 0, "wrong passwords lock the account for a while (auth_try, auth_lock)",
            at > 0 && al > 0 ? at + " wrong tries lock it for " + al + " s" : "no auth_try / auth_lock: guesses are not counted");

    set(evt, "SELF_CHECK", JSON.stringify(out));
    return 0;
}
