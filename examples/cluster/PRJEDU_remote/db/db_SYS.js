// =====================================================================
// SYS/S00 - one node's own equipment (shared by S01 and S02).
// =====================================================================

// xdb_init runs before the <con> elements are created, so what it writes is
// what they start with. S01 -> 9211 + 9221, S02 -> 9212 + 9222.
function init(evt)
{
    var me = "" + evt.GetValue("doc('XDB')/@tid");
    var n = parseInt(me.substring(1));
    evt.SetValue("id('CN_EXT')/@con_port", "" + (9210 + n));
    evt.SetValue("id('CN_RPC')/@con_port", "" + (9220 + n));
    return 0;
}
