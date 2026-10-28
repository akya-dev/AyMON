// =====================================================================
// PRJEDU_mcp / AI/S00 -- the 'api' scope.
//
// 'api' is the engine's name for the public script surface: remote callers
// (MCP's api_call, the web front end) may reach functions here and nowhere
// else. This example exposes only one:
//
//   help()  -- if it exists, MCP's system_info hands its text to the
//              assistant as 'api_help'. It is the place to say, in plain
//              words, what this installation is and how to use it. Without
//              it system_info still works; an engine older than 4.3.4.449
//              also logs, on every call, that it looked for api.help and
//              did not find it.
//
// Put nothing here that you would not hand to every caller that can reach
// api_call: on a pro_mcp_acc="rw" endpoint the assistant may call any
// function in this scope.
// =====================================================================

function help()
{
    return "AyMON example plant (PRJEDU_mcp). Document PLT/S00 is a simulated tank: "
         + "LEVEL is measured and read only, SETPOINT (20..90 %) is the one value an "
         + "operator may change, PUMP is driven by the controller unless MAINT is 1. "
         + "Start with the plant_status tool; use set_setpoint to change the setpoint.";
}
