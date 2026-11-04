//LCD1602: an HD44780 in 4-bit mode behind a PCF8574 (P0 RS, P1 RW, P2 E, P3 backlight, P4..P7 D4..D7).
//[CON.i2c,PRO.raw], pro_onout="lcd.out(evt, exc);", <io pro_fno="text" pro_adr="0|1" pro_fnc="[PRO.outc]">
//C643, doc/53. Bytes checked against a model of the chip; not yet tried on a real display.
var BL = 8;
var EN = 4;
var RS = 1;

//one 4-bit cycle: the nibble is taken when E falls
function nib(o, v, rs)
{
	o.push(v | BL | rs | EN);
	o.push(v | BL | rs);
}

function put(o, b, rs)
{
	nib(o, b & 0xF0, rs);
	nib(o, (b << 4) & 0xF0, rs);
}

//the data sheet's initialisation by instruction: the chip may be in any mode after power-up
function init(exc, a)
{
	var o = [];
	nib(o, 0x30, 0); exc.wr(a, o); Time.SleepMs(5);
	o = []; nib(o, 0x30, 0); exc.wr(a, o); Time.SleepMs(1);
	o = []; nib(o, 0x30, 0); nib(o, 0x20, 0); exc.wr(a, o);
	o = []; put(o, 0x28, 0); put(o, 0x0C, 0); put(o, 0x06, 0); put(o, 0x01, 0); exc.wr(a, o);
	Time.SleepMs(2);                     //clear takes 1.52 ms
}

//a line of 16 characters
function out(evt, exc)
{
	var a = exc.unit;
	var m = exc.ses.mem;
	var key = "lcd" + a;
	if (!m[key]) {
		init(exc, a);
		if (exc.err != "") return;       //the poll or write fails with the reason; init runs again next time
		m[key] = 1;
	}
	var t = BYTES.text("" + evt.valn);
	var o = [];
	put(o, 0x80 | (parseInt(evt.obj.pro_adr) == 1 ? 0x40 : 0), 0);
	for (var i = 0; i < 16; i++) put(o, i < t.length ? t[i] : 32, RS);
	exc.wr(a, o);
	if (exc.err != "") m[key] = 0;
}
