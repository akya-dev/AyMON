//MAX7219 8x8 matrix: [CON.spi,PRO.raw], <dev pro_adr=cs con_spi_hz="10000000">, <io pro_fno="rows" pro_onout="mtx.out(evt, exc);">
//The value = 8 rows in hex. Each register is one 16-bit word, latched when CS rises: one exc.wr per word.
//C643, doc/53. Bytes checked against a model of the chip; not yet tried on a real module.
function init(exc, a)
{
	exc.wr(a, [0x0F, 0x00]);    //display test off
	exc.wr(a, [0x09, 0x00]);    //no BCD decode
	exc.wr(a, [0x0A, 0x03]);    //intensity
	exc.wr(a, [0x0B, 0x07]);    //scan 8 digits
	exc.wr(a, [0x0C, 0x01]);    //on
}

function out(evt, exc)
{
	var a = exc.unit;
	var m = exc.ses.mem;
	var key = "max" + a;
	if (!m[key]) { init(exc, a); m[key] = 1; }
	var r = BYTES.hex("" + evt.valn);
	for (var i = 0; i < 8; i++) exc.wr(a, [i + 1, i < r.length ? r[i] : 0]);
	if (exc.err != "") m[key] = 0;
}
