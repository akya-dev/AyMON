// =====================================================================
// SYS/S00 - one node's own equipment (shared by both nodes).
//
//   init(evt)        before any connection exists: which node am I, and
//                    so which port do I listen on
//   tick(evt)        twice a second: the cluster's state (CLT.info) and
//                    the job's values on this node, for the page
//   on_clt_cmd(evt)  the page asks for a hand-over
// =====================================================================

function get(evt, id)    { return evt.GetValue("id('" + id + "')/@val"); }
function set(evt, id, v) { evt.SetValue("id('" + id + "')/@val", v); }
function app(evt, id)    { return evt.GetValue("doc('APP/S00')/id('" + id + "')/@val"); }

// The node's name is the root document's tid - the one line that differs
// between AyXDB_S01.xml and AyXDB_S02.xml.
function tid(evt) { return "" + evt.GetValue("doc('XDB')/@tid"); }

function hex4(v)
{
    var d = "0123456789ABCDEF", s = "";
    for (var i = 3; i >= 0; i--) s = s + d.charAt((v >> (4 * i)) & 15);
    return "0x" + s;
}

// xdb_init runs before the <con> elements are created, so what it writes
// into CN_EXT is what CN_EXT starts with. S01 -> 9201, S02 -> 9202.
function init(evt)
{
    var me = tid(evt);
    var n = parseInt(me.substring(1));
    evt.SetValue("id('CN_EXT')/@con_port", "" + (9200 + n));
    set(evt, "NODE", me);
    set(evt, "PORT", 9200 + n);
    set(evt, "PEER", me == "S01" ? "S02" : "S01");
    return 0;
}

function start(evt)
{
    evt.Log(4, "SYS: node " + get(evt, "NODE") + " - page and links on 127.0.0.1:" + get(evt, "PORT")
               + ", the other node is " + get(evt, "PEER"));
    return 0;
}

function tick(evt)
{
    // CLT.info: the whole cluster as this node sees it, in one call. It
    // only reads. mas_conf says whether the master is PROVEN (heard on
    // /sta or /hot) or only a candidate - do not call a candidate master.
    var c = CLT.info(evt);
    if (c) {
        // before the first election (term 0, no master heard) PRO.clt says
        // SPARE; it is only listening yet
        var role = ("" + c.role == "SPARE" && c.term == 0 && !c.mas_conf) ? "STARTING" : "" + c.role;
        if (role != "" + get(evt, "ROLE")) {
            var log = JSON.parse(get(evt, "ROLES"));
            log.push({ t: Time.GetTimeStr(0).substring(11, 19), role: role, term: c.term });
            var keep = [];
            for (var i = log.length > 8 ? log.length - 8 : 0; i < log.length; i++) keep.push(log[i]);
            set(evt, "ROLES", JSON.stringify(keep));
            evt.Log(4, "SYS: this node is now " + role + " (term " + c.term + ")");
        }
        set(evt, "ROLE", role);
        set(evt, "MASTER", c.mas_conf ? "" + c.mas_nid : "");
        set(evt, "TERM", c.term);
        var up = 0;
        var peers = c.peers ? c.peers : [];
        for (var j = 0; j < peers.length; j++)
            if ("" + peers[j].nid == "" + get(evt, "PEER") && peers[j].alive) up = 1;
        set(evt, "PEER_UP", up);
    }

    // the job, as it is on THIS node
    var sta = parseInt("" + evt.GetValue("doc('APP/S00')/@sta"));
    set(evt, "APP_STA", hex4(sta));
    set(evt, "A_RUN", app(evt, "RUN"));
    set(evt, "A_RATE", app(evt, "RATE"));
    set(evt, "A_COUNT", app(evt, "COUNT"));
    set(evt, "A_BATCH", app(evt, "BATCH"));
    set(evt, "A_BY", app(evt, "BY"));
    var last = parseFloat("" + app(evt, "LAST_MS"));
    set(evt, "A_AGE_MS", last > 0 ? (0.0 + Time.GetTimeMs()) - last : -1);
    set(evt, "A_LOG", batches(evt));
    return 0;
}

// The finished batches: every <item> under APP's LOG, as JSON.
function batches(evt)
{
    var s = "" + evt.GetValue("doc('APP/S00')/json(id('LOG')/item)");
    return s && s != "undefined" ? s : "[]";
}

// val_fnc of CLT_CMD. The hand-over goes to this node's own election row
// (pro_clt_cmd, handled by CLT.cmd): 'standdown' on the master steps it
// down, 'takeover' on the spare takes the role.
function on_clt_cmd(evt)
{
    var c = ("" + evt.valn).trim();
    if (c != "standdown" && c != "takeover") return 0;
    evt.SetValue("id('CN_" + get(evt, "NODE") + "')/@pro_clt_cmd", c);
    evt.Log(4, "SYS: hand-over requested on this node: " + c);
    return 0;
}
