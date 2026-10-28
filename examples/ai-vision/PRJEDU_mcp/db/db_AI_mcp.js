// =====================================================================
// PRJEDU_mcp / AI/S00 -- the project's own MCP tools.
//
// The built-in tools know the ENGINE's model (elements, values, sta,
// history). They do not know YOUR plant: that "status" means level +
// setpoint + pump + mode, or that a setpoint outside 20..90 % is a
// mistake worth explaining rather than silently clamping. Those belong
// here, in the project, and need no compiler:
//
//     <con ... pro_mcp_tools="mcp.tools">
//
// tools() returns an array of declarations
//     { name, description, inputSchema, fnc?, write? }
// and the engine merges them into tools/list after its own. Without 'fnc'
// the handler is <this scope>.<name>, i.e. mcp.plant_status below.
//
// Rules worth knowing (all of them measured, none of them obvious):
//   * Whatever the handler RETURNS is the tool's answer -- the engine puts
//     no envelope around it. You own the shape of the reply.
//   * Not cached. Edit this file, reload the script (sta 0x0000 -> 0x0303
//     on the <script> element) and the tool list is new. No restart.
//   * Built-ins win: a tool named 'set_value' here is skipped and logged.
//   * write: true -> listed only on an endpoint with pro_mcp_acc="rw".
//   * THE ROLE TRAVELS. A handler runs with the endpoint's pro_mcp_role,
//     not as the engine. Otherwise every project tool would be a way
//     around xdb_acl. set_setpoint below is refused on any element an
//     Operator may not write, exactly like set_value.
//   * The engine does NOT validate arguments against inputSchema. They
//     arrive as the client sent them; check them here.
// =====================================================================

// The address of one attribute in the plant document. A script file is a
// collection of functions, not a program: nothing at file level runs, so a
// shared constant is a function too.
function plt(id, atr)
{
    return "doc('PLT/S00')/id('" + id + "')/@" + atr;
}

function tools()
{
    return [
    {
        name: "plant_status",
        description: "One-call status of the tank plant: level, setpoint, pump, "
                   + "control mode and the level's alarm state (normal, WARNING, "
                   + "ALARM, EMERGENCY). Use this first for 'how is the plant doing'.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
        name: "set_setpoint",
        description: "Change the tank level setpoint (percent). Accepts 20..90; "
                   + "anything else is refused with a reason instead of being "
                   + "clamped. The controller follows the new value within seconds.",
        inputSchema: {
            type: "object",
            properties: {
                value: { type: "number", minimum: 20, maximum: 90,
                         description: "new setpoint in percent" }
            },
            required: ["value"],
            additionalProperties: false
        },
        write: true
    }];
}

// sta carries the alarm level in bits 2..3 of its low byte:
// 0 normal, 4 warning, 8 alarm, C emergency.
function alarm_word(sta)
{
    var a = sta & 0x000C;
    if (a == 0x0004) return "WARNING";
    if (a == 0x0008) return "ALARM";
    if (a == 0x000C) return "EMERGENCY";
    return "normal";
}

function plant_status(args)
{
    return {
        level_pct:    evt.GetValue(plt("LEVEL", "val")),
        level_state:  alarm_word(evt.GetValue(plt("LEVEL", "sta"))),
        setpoint_pct: evt.GetValue(plt("SETPOINT", "val")),
        pump:         evt.GetValue(plt("PUMP", "val"))  ? "running" : "stopped",
        mode:         evt.GetValue(plt("MAINT", "val")) ? "maintenance (manual)" : "automatic",
        step:         evt.GetValue(plt("COUNT", "val"))
    };
}

function set_setpoint(args)
{
    if (!args || args.value === undefined || args.value === null || args.value === "")
        return { ok: 0, error: "value is required" };

    // Numbers arrive as the client sent them -- possibly as text. Convert,
    // then check: the schema above is a promise to the client, not a check.
    var v = ("" + args.value).toFLT();
    if (v < 20 || v > 90)
        return { ok: 0, error: "setpoint " + args.value + " is outside 20..90 %; nothing was written" };

    // The write runs with THIS endpoint's role (Operator). SETPOINT's
    // xdb_acl allows it; point the same line at LEVEL and it answers 0.
    var ok = evt.SetValue(plt("SETPOINT", "val"), v);
    if (!ok)
        return { ok: 0, error: "the write was refused; the engine log names the reason" };

    return { ok: 1, setpoint_pct: evt.GetValue(plt("SETPOINT", "val")) };
}
