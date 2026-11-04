//ADC0834: four single-ended channels over SPI mode 0, at most 400 kHz. Wiring: DI = MOSI, DO = MISO, separate.
//[CON.spi,PRO.raw], <dev pro_adr=cs con_spi_hz="200000">, <bi pro_onpol="adc.pol(evt, exc);" pro_typ="0xD418"> + <io pro_adr="0..3">
//Clocks 1-4 = start, SGL, ODD, SELECT; D7 comes on clock 7 .. D0 on clock 14, so in two bytes: >> 2.
//C643, doc/53. Checked against a model of the chip's timing; not yet tried on a real chip.
function ch(exc, a, c)
{
	var r = exc.xfer(a, [0xC0 | ((c & 1) << 5) | ((c >> 1) << 4), 0]);
	if (r == null) return 0;
	return (((r[0] << 8) | r[1]) >> 2) & 0xFF;
}

function pol(evt, exc)
{
	var a = exc.unit;
	exc.result([ch(exc, a, 0), ch(exc, a, 1), ch(exc, a, 2), ch(exc, a, 3)]);
}
