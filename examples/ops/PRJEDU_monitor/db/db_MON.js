// PRJEDU_monitor / MON/S00 -- a little work, so /metrics has something to show.

function start(evt)
{
	evt.Log(4, "PRJEDU_monitor: /metrics and /health on port 9464, MQTT with $SYS on 1886.");
	evt.Log(4, "PRJEDU_monitor: curl -H 'Authorization: Bearer change-me-metrics-key' http://localhost:9464/metrics");
	return 0;
}

// ten times a second: a value that moves
function fast(evt)
{
	var v = 50 + 10 * Math.sin(Time.GetTimeMs() / 10000);
	evt.SetValue("id('FAST')/@val", v);
	return 0;
}

// every 15 s: 1.5 s of work on a worker of TH_WORK
function slow(evt)
{
	Time.SleepMs(1500);
	var n = evt.GetValue("id('SLOW')/@val") + 1;
	evt.SetValue("id('SLOW')/@val", n);
	evt.Log(4, "PRJEDU_monitor: slow job " + n + " done");
	return 0;
}

// once a second: a retained message on the example's broker
function pub(evt)
{
	var n = evt.GetValue("id('PUB')/@val") + 1;
	evt.SetValue("id('PUB')/@val", n);
	MQTT.publish("CN_MQ", "mon/fast", "" + evt.GetValue("id('FAST')/@val"), 0, 1);
	return 0;
}

// once a second: one link held for good (a long job), the other borrowed for a query and given back
var g_held = null;
function sql(evt)
{
	if (g_held == null) g_held = SQL.attach("CN_SQL");
	var c = SQL.attach("CN_SQL");
	if (c) {
		var rs = SQL.exec_direct(c, "SELECT 1");
		if (rs) SQL.close(rs);
		SQL.disconnect(c);
		evt.SetValue("id('SQLJOB')/@val", evt.GetValue("id('SQLJOB')/@val") + 1);
	}
	return 0;
}
