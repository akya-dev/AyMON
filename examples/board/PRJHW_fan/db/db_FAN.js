//PRJHW_fan: the temperature decides the fan; the button forces it full for as long as it is latched on.
//This script language keeps the LEFT operand's type: 1 / 2.5 is an integer. Every sum here starts from a float.
var g_temp = 0.0;      //degrees, from the thermistor
var g_set = 0.0;       //degrees, from the knob: where the fan starts
var g_duty = 0;        //percent
var g_force = 0;       //the button
var g_l1 = "";
var g_l2 = "";
var g_dir = 0;

//what the page's "world" holds when there are no parts: a room, its heat, the fan cooling it
var g_room = 24.0;
var g_load = 0;
var g_knob = 26.0;
var g_t = 24.0;

function is_sim(evt) { return ("" + evt.GetValue("id('CN_SPI')/@con_host")).indexOf("sim:") == 0; }

//NTC 10 kOhm, B = 3950, to ground, with 10 kOhm to the supply
function counts_to_deg(c)
{
	if (c <= 0) return -40;
	if (c >= 255) return 125;
	var rt = 10000.0 * c / (255.0 - c);
	return 1.0 / (Math.log(rt / 10000.0) / 3950.0 + 1.0 / 298.15) - 273.15;
}

function deg_to_counts(t)
{
	var rt = 10000.0 * Math.exp(3950.0 * (1.0 / (t + 273.15) - 1.0 / 298.15));
	return Math.round(255.0 * rt / (rt + 10000.0));
}

//the knob: 20 to 40 degrees
function knob_to_deg(c) { return 20.0 + 20.0 * c / 255.0; }

//the chips in memory get what real parts would read
function world(evt)
{
	g_t = g_t + (g_room - g_t) * 0.05 + (g_load ? 0.15 : 0.0) - 0.012 * g_duty;
	SPI.sim("CN_SPI", 0, "0=" + deg_to_counts(g_t) + ",1=" + Math.round((g_knob - 20.0) * 255.0 / 20.0));
}

function ctl(evt)
{
	if (is_sim(evt)) world(evt);

	//one direction, once: a point is not written by being declared, and an L293D with both inputs loose may do anything
	if (g_dir == 0) { g_dir = 1; evt.SetValue("id('IN2')/@pro", 0); evt.SetValue("id('IN1')/@pro", 1); }
	g_temp = counts_to_deg(parseFloat(evt.GetValue("id('AD_T')/@pro")));
	g_set = knob_to_deg(parseFloat(evt.GetValue("id('AD_K')/@pro")));

	//below the set point off, 5 degrees above it full; a DC fan does not start under about 30 %
	var d = 0.0;
	if (g_temp > g_set) d = 30.0 + (g_temp - g_set) * 14.0;
	if (d > 100.0) d = 100.0;
	if (g_force) d = 100.0;
	d = Math.round(d);
	if (d != g_duty) {
		g_duty = d;
		evt.SetValue("id('FAN')/@pro", d);
	}

	var l1 = "Temp " + g_temp.toFixed(1) + " Set " + Math.round(g_set);
	var l2 = "Fan " + d + "%" + (g_force ? " FORCED" : "");
	if (l1 != g_l1) { g_l1 = l1; evt.SetValue("id('L1')/@pro", l1); }
	if (l2 != g_l2) { g_l2 = l2; evt.SetValue("id('L2')/@pro", l2); }
}

//pro_gpio_edge="fall": an event, 1 then 0
function on_btn(evt)
{
	if ((evt.flg & EVT.FLG_PRO_MSK) != EVT.FLG_PRO_INP) return;
	if (parseInt(evt.valn) == 1) g_force = g_force ? 0 : 1;
}

//what the page shows, and what its buttons do
function state(evt)
{
	var s = { temp: g_temp, set: g_set, duty: g_duty, force: g_force, l1: g_l1, l2: g_l2, sim: is_sim(evt) ? 1 : 0, room: g_room, load: g_load, knob: g_knob };
	return JSON.stringify(s);
}

function act(evt, a)
{
	if (!is_sim(evt)) return;
	if (a == "hot") g_load = g_load ? 0 : 1;
	if (a == "room+") g_room = g_room + 2;
	if (a == "room-") g_room = g_room - 2;
	if (a == "knob+" && g_knob < 40) g_knob = g_knob + 1;
	if (a == "knob-" && g_knob > 20) g_knob = g_knob - 1;
	if (a == "button") GPIO.sim("CN_G", 17, "0:0,30000:1");   //a press of 30 ms, the times given
}
