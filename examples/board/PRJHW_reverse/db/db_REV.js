//PRJHW_reverse: the nearer the obstacle, the faster the beep and the fuller the bar. Floats on the left: this
//script language keeps the left operand's type.
var g_cm = -1.0;
var g_tick = 0;
var g_beep = 0;
var g_rows = "";
var g_seen = 0;

//the world when no parts are wired
var g_dist = 120.0;
var g_tilt = 0.0;
var g_room = 22;

function is_sim(evt) { return ("" + evt.GetValue("id('CN_SPI')/@con_host")).indexOf("sim:") == 0; }

//331.3 + 0.606 T m/s; there and back
function us_to_cm(us, deg) { return us * (331.3 + 0.606 * deg) / 20000.0; }

function world(evt)
{
	if (g_seen == 0) { GPIO.sim("CN_G", 4, "dht:" + g_room + ":45"); g_seen = 1; }
	var deg = parseFloat(evt.GetValue("id('DEG')/@pro"));
	var us = Math.round(g_dist * 20000.0 / (331.3 + 0.606 * deg));
	GPIO.sim("CN_G", 24, "0:1," + us + ":0");
	//1 g = 16384 at the chip's default range
	I2C.sim("CN_I2C", 0x68, "ax=" + Math.round(16384.0 * Math.sin(g_tilt * 0.0174533)) + ",az=" + Math.round(16384.0 * Math.cos(g_tilt * 0.0174533)));
}

function ctl(evt)
{
	if (is_sim(evt)) world(evt);
	var us = parseFloat(evt.GetValue("id('SON_US')/@pro"));
	var deg = parseFloat(evt.GetValue("id('DEG')/@pro"));
	g_cm = us > 0.0 && us < 30000.0 ? us_to_cm(us, deg) : -1.0;

	//a beep every n ticks of 0.1 s: under 10 cm one long tone, over 100 cm none
	var n = 0;
	if (g_cm >= 0.0 && g_cm < 100.0) n = g_cm < 10.0 ? 1 : Math.round(g_cm / 10.0) + 1;
	g_tick = g_tick + 1;
	var on = 0;
	if (n == 1) on = 1;
	else if (n > 1 && (g_tick % n) == 0) on = 1;
	if (on != g_beep) {
		g_beep = on;
		evt.SetValue("id('BUZ')/@pro", on ? 50 : 0);
	}

	//the bar: one more row of the matrix for every 12 cm nearer
	var lit = 0;
	if (g_cm >= 0.0 && g_cm < 96.0) lit = 8 - Math.floor(g_cm / 12.0);
	var rows = "";
	for (var i = 0; i < 8; i++) rows = rows + (i < lit ? "FF " : "00 ");
	if (rows != g_rows) {
		g_rows = rows;
		evt.SetValue("id('ROWS')/@pro", rows);
	}
}

function state(evt)
{
	var ax = parseFloat(evt.GetValue("id('AX')/@pro"));
	var az = parseFloat(evt.GetValue("id('AZ')/@pro"));
	var s = { cm: g_cm, deg: parseFloat(evt.GetValue("id('DEG')/@pro")), hum: parseFloat(evt.GetValue("id('HUM')/@pro")), slope: Math.atan2(ax, az) * 57.29578,
	          beep: g_beep, rows: g_rows, sim: is_sim(evt) ? 1 : 0, dist: g_dist, tilt: g_tilt };
	return JSON.stringify(s);
}

function act(evt, a)
{
	if (!is_sim(evt)) return;
	if (a == "near" && g_dist > 5.0) g_dist = g_dist - 10.0;
	if (a == "far" && g_dist < 300.0) g_dist = g_dist + 10.0;
	if (a == "up") g_tilt = g_tilt + 2.0;
	if (a == "down") g_tilt = g_tilt - 2.0;
}
