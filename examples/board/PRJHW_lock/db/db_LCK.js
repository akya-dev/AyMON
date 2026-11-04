//PRJHW_lock: a code on the keypad (# enters, * clears) or a known card opens the bolt for 5 s; three wrong codes lock it for 30 s.
var OPEN_MS = 5000;
var BLOCK_MS = 30000;
var BEEP_MS = 800;

var g_typed = "";
var g_wrong = 0;
var g_open_until = 0;
var g_block_until = 0;
var g_beep_until = 0;
var g_msg = "";
var g_is_open = 0;
var g_card_on = 0;
var g_l1 = "";
var g_l2 = "";
var g_last = "";
var g_rst = 0;

function is_sim(evt) { return ("" + evt.GetValue("id('CN_SPI')/@con_host")).indexOf("sim:") == 0; }

function open_bolt(evt, why)
{
	g_open_until = Time.now() + OPEN_MS;
	g_wrong = 0;
	g_msg = why;
	evt.Log(4, "LOCK opened: " + why);
}

function refuse(evt, why)
{
	g_beep_until = Time.now() + BEEP_MS;
	g_msg = why;
	evt.Log(4, "LOCK refused: " + why);
}

//the block's 'pro' is the key held, "" when it is let go
function on_key(evt)
{
	if ((evt.flg & EVT.FLG_PRO_MSK) != EVT.FLG_PRO_INP) return;
	var k = "" + evt.valn;
	if (k == "") return;
	g_last = k;
	if (Time.now() < g_block_until) return;
	if (k == "*") { g_typed = ""; g_msg = ""; return; }
	if (k != "#") {
		if (g_typed.length < 8) g_typed = g_typed + k;
		return;
	}
	if (g_typed == "" + evt.GetValue("id('CODE')/@val")) open_bolt(evt, "code");
	else {
		g_wrong = g_wrong + 1;
		if (g_wrong >= 3) { g_block_until = Time.now() + BLOCK_MS; g_wrong = 0; refuse(evt, "blocked"); }
		else refuse(evt, "wrong code");
	}
	g_typed = "";
}

function ctl(evt)
{
	var now = Time.now();

	//the reader is in power-down while its RST is low, and a point is not written by being declared
	if (g_rst == 0) { g_rst = 1; evt.SetValue("id('RST')/@pro", 1); }

	//a card held to the reader counts once, when it arrives
	var on = parseInt(evt.GetValue("id('RC_ON')/@pro"));
	if (on && !g_card_on) {
		if (now >= g_block_until) {
			if ("" + evt.GetValue("id('RC_UID')/@pro") == "" + evt.GetValue("id('CARD')/@val")) open_bolt(evt, "card");
			else refuse(evt, "unknown card");
		}
	}
	g_card_on = on;

	var want = now < g_open_until ? 1 : 0;
	if (want != g_is_open) {
		g_is_open = want;
		evt.SetValue("id('BOLT')/@pro", want ? 90 : 0);
		if (!want) g_msg = "";
	}
	var bz = now < g_beep_until ? 1 : 0;
	if (bz != parseInt(evt.GetValue("id('BUZ')/@pro"))) evt.SetValue("id('BUZ')/@pro", bz);

	var l1 = g_is_open ? "OPEN" : (now < g_block_until ? "BLOCKED " + Math.round((g_block_until - now) / 1000) + " s" : "Code: " + "********".substr(0, g_typed.length));
	var l2 = g_msg;
	if (l1 != g_l1) { g_l1 = l1; evt.SetValue("id('L1')/@pro", l1); }
	if (l2 != g_l2) { g_l2 = l2; evt.SetValue("id('L2')/@pro", l2); }
}

//what the page shows; the code is never in it
function state(evt)
{
	var s = { l1: g_l1, l2: g_l2, open: g_is_open, bolt: parseFloat(evt.GetValue("id('BOLT')/@pro")), buz: parseInt(evt.GetValue("id('BUZ')/@pro")), card: g_card_on, sim: is_sim(evt) ? 1 : 0 };
	return JSON.stringify(s);
}

//row, column of a key on the keypad
function act(evt, a)
{
	if (!is_sim(evt)) return;
	if (a == "card") { SPI.sim("CN_SPI", 0, "uid=DEADBEEF"); return; }
	if (a == "stranger") { SPI.sim("CN_SPI", 0, "uid=01020304"); return; }
	if (a == "nocard") { SPI.sim("CN_SPI", 0, "uid="); return; }
	var map = "123A456B789C*0#D";
	var rows = [5, 6, 13, 26];
	var cols = [12, 22, 20, 21];
	var i = map.indexOf(a);
	if (i < 0) return;
	var r = rows[Math.floor(i / 4)];
	var c = cols[i % 4];
	GPIO.sim("CN_G", r, "join:" + c);
	Time.SleepMs(70);                    //two scans of 20 ms decide
	GPIO.sim("CN_G", r, "part:" + c);
	Time.SleepMs(70);
}
