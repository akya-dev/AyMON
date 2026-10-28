# AI assistants, Python and vision

An AI assistant on the plant inside rules it cannot change, Python beside the engine, and a camera that is a connection.

| Example | What it is | Needs |
|---|---|---|
| [PRJEDU_mcp](PRJEDU_mcp/) | an AI assistant reads the plant over MCP, and may change one value | nothing; an MCP client to try it with an assistant |
| [PRJEDU_robot_mcp](PRJEDU_robot_mcp/) | the robot cell of PRJEDU_robotarm run by an AI assistant over MCP - inside rules it cannot change | an MCP client to connect an assistant |
| [PRJEDU_gauge](PRJEDU_gauge/) | a camera reads a dial gauge: Python and numpy beside the engine, the picture a blob fetched over HTTP | Python 3.11 with numpy |
| [PRJEDU_pycall](PRJEDU_pycall/) | Python called from the XML and from JScript, asynchronously: a pump bearing's vibration analysed in Python | Python 3.11 |
| [PRJEDU_vision](PRJEDU_vision/) | a camera inspects bottles on a filling line, in the engine: the camera is a connection, the inspection IMG.* in JScript (~500 frames/s) | nothing |

Every example starts with one command from its own folder:

```bat
cd PRJEDU_mcp
run.bat
```

On Linux: `cd PRJEDU_mcp` and `./run.sh`. The engine and the licence are found in `../../../bin`, at the top of the repository.

[All the examples](../README.md) · [the top README](../../README.md)
