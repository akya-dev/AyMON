// =====================================================================
// PRJEDU_robot_mcp / AI/S00 -- the project's own MCP tools.
//
// The built-in tools know the engine's model: documents, elements,
// values, alarms, logs. They do not know that this is a robot cell, that
// "play" needs the brakes released first, or which commands an assistant
// may give. The three tools below say that in words an assistant reads
// (the descriptions ARE the instructions it gets), and hand every request
// to the cell, which decides:
//
//     <con ... pro_mcp_tools="mcp.tools">
//
// Rules worth knowing (from PRJEDU_mcp, all measured):
//   * Whatever a handler RETURNS is the tool's answer - no envelope.
//   * THE ROLE TRAVELS: a handler runs with the endpoint's pro_mcp_role
//     (Operator). robot_command can write AI_CMD because xdb_acl lets an
//     Operator write it - point the same line at CMD and it answers 0.
//   * The engine does NOT check arguments against inputSchema. Check here.
//   * An assistant caches this list when it connects: change a tool and
//     restart the client too.
// =====================================================================

// An attribute of the cell document. File-level variables are not used:
// a script file is a collection of functions.
function cel(id, atr)
{
    return "doc('CEL/S00')/id('" + id + "')/@" + (atr ? atr : "val");
}

function tools()
{
    return [
    {
        name: "cell_status",
        description: "Everything about the robot cell in one call: the robot's mode "
                   + "(POWER_OFF, POWER_ON, IDLE, RUNNING), its safety state (NORMAL, "
                   + "PROTECTIVE_STOP, SAFEGUARD_STOP), the program and its state, the "
                   + "parts waiting and put down, time per part, speed, the six joint "
                   + "angles and the tool position, the feeder, whether the operator "
                   + "allows the assistant, and the cell's last message. The feeder "
                   + "(running/stopped, a part every feed_every_s seconds up to "
                   + "parts_waiting_max) is switched by a PERSON on the cell's page: "
                   + "while it is stopped no part comes and a playing robot waits at "
                   + "the pick position - say so and ask the person, do not restart "
                   + "the program. Call this first, and again after every command to "
                   + "see what the robot did.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
        name: "robot_command",
        description: "Send a program command to the robot through the cell. "
                   + "Allowed: 'load pick_place.urp' (the pick-and-place job), "
                   + "'load home.urp' (move to the upright home position), 'play', "
                   + "'pause', 'stop'. Powering on, releasing the brakes and unlocking "
                   + "a protective stop are for a PERSON at the cell: if the robot is "
                   + "not RUNNING or its safety is not NORMAL, say so and ask the "
                   + "person to do it on the cell's page (http://127.0.0.1:8098/). "
                   + "The answer is the cell's verdict: accepted means sent to the "
                   + "robot, not done - check cell_status a second later.",
        inputSchema: {
            type: "object",
            properties: {
                command: { type: "string",
                           enum: ["load pick_place.urp", "load home.urp", "play", "pause", "stop"],
                           description: "the command" }
            },
            required: ["command"],
            additionalProperties: false
        },
        write: true
    },
    {
        name: "set_speed",
        description: "Set the robot's speed in percent. The assistant may set 10 up to "
                   + "its ceiling (AI_SPEED_MAX, 50 % unless the operator changed it); "
                   + "above that the cell refuses and nothing is written. Slower is "
                   + "safer when a person works near the cell.",
        inputSchema: {
            type: "object",
            properties: {
                percent: { type: "number", minimum: 10, maximum: 100, description: "speed, percent" }
            },
            required: ["percent"],
            additionalProperties: false
        },
        write: true
    }];
}

function n(v) { var f = ("" + v).toFLT(); return f; }

function cell_status(args)
{
    var joints = [];
    for (var i = 0; i < 6; i++) joints.push(n(evt.GetValue(cel("J" + i))));
    return {
        robot_mode:       evt.GetValue(cel("ROBOTMODE")),
        safety:           evt.GetValue(cel("SAFETY")),
        program:          evt.GetValue(cel("PROGRAM")),
        program_state:    evt.GetValue(cel("PSTATE")),
        program_step:     evt.GetValue(cel("PSTEP")),
        gripper:          evt.GetValue(cel("GRIPPER")) == 1 ? "closed" : "open",
        parts_waiting:    evt.GetValue(cel("INFEED")),
        parts_waiting_max: evt.GetValue(cel("INFEED_MAX")),
        parts_put_down:   evt.GetValue(cel("PLACED")),
        feeder:           evt.GetValue(cel("FEED")) == 1 ? "running" : "stopped",
        feed_every_s:     n(evt.GetValue(cel("FEED_S"))),
        seconds_per_part: n(evt.GetValue(cel("CYCLE_S"))),
        parts_per_minute: n(evt.GetValue(cel("RATE"))),
        speed_pct:        evt.GetValue(cel("SPEED_REG")),
        joints_deg:       joints,
        tool_mm:          [n(evt.GetValue(cel("TCP_X"))), n(evt.GetValue(cel("TCP_Y"))), n(evt.GetValue(cel("TCP_Z")))],
        dashboard_connected: evt.GetValue(cel("LINK")) == 1,
        assistant_allowed:   evt.GetValue(cel("AI_ENABLE")) == 1,
        assistant_speed_max: evt.GetValue(cel("AI_SPEED_MAX")),
        cell_message:     evt.GetValue(cel("MSG"))
    };
}

// Write the request, read the cell's verdict back. The cell's val_fnc runs
// inside the write, so AI_OK / AI_LAST are already there when it returns.
function ask_cell(id, value)
{
    if (!evt.SetValue(cel(id), value))
        return { accepted: false, verdict: "the write was refused (xdb_acl); the log names the reason" };
    return { accepted: evt.GetValue(cel("AI_OK")) == 1, verdict: evt.GetValue(cel("AI_LAST")) };
}

function robot_command(args)
{
    var c = args ? ("" + args.command).trim() : "";
    if (!c || c == "undefined") return { accepted: false, verdict: "command is required" };
    return ask_cell("AI_CMD", c);
}

function set_speed(args)
{
    if (!args || args.percent === undefined || args.percent === null || args.percent === "")
        return { accepted: false, verdict: "percent is required" };
    var v = Math.round(("" + args.percent).toFLT());
    return ask_cell("AI_SPEED", v);
}
