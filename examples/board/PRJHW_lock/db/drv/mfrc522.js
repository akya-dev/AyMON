//MFRC522: is a tag there, and its UID. [CON.spi,PRO.raw], <bi pro_onpol="rfid.pol(evt, exc);" pro_typ="0xD418"> + slot 0 present, slot 1 UID as a number.
//Each poll: WUPA (wakes a halted tag too), anticollision, HLTA, so a tag lying on the reader stays "present".
//C643, doc/53. Checked against a model of the chip and of a tag; not yet tried on a real reader.
function w(exc, a, r, v) { exc.xfer(a, [(r << 1) & 0x7E, v]); }

function rd(exc, a, r)
{
	var x = exc.xfer(a, [((r << 1) & 0x7E) | 0x80, 0]);
	return x == null ? 0 : x[1];
}

function init(exc, a)
{
	w(exc, a, 0x01, 0x0F);              //soft reset
	Time.SleepMs(50);
	w(exc, a, 0x2A, 0x8D);              //timer: 25 ms, the time-out of a transceive
	w(exc, a, 0x2B, 0x3E);
	w(exc, a, 0x2D, 30);
	w(exc, a, 0x2C, 0);
	w(exc, a, 0x15, 0x40);              //100 % ASK
	w(exc, a, 0x11, 0x3D);              //CRC preset 6363
	w(exc, a, 0x14, rd(exc, a, 0x14) | 0x03);   //antenna on
}

//data to the tag, its answer back; null = nobody answered. bits = valid bits of the last byte, 0 = all.
function tcv(exc, a, data, bits)
{
	w(exc, a, 0x01, 0x00);              //idle
	w(exc, a, 0x04, 0x7F);              //clear the interrupt flags
	w(exc, a, 0x0A, 0x80);              //flush the FIFO
	for (var i = 0; i < data.length; i++) w(exc, a, 0x09, data[i]);
	w(exc, a, 0x01, 0x0C);              //transceive
	w(exc, a, 0x0D, 0x80 | bits);       //start sending
	var irq = 0;
	var k = 0;
	while (k < 30) {
		irq = rd(exc, a, 0x04);
		if (irq & 0x31) break;          //Rx, Idle, Timer
		Time.SleepMs(1);
		k = k + 1;
	}
	w(exc, a, 0x0D, 0x00);
	if (!(irq & 0x30) || (irq & 0x01)) return null;
	if (rd(exc, a, 0x06) & 0x13) return null;   //buffer overflow, parity, protocol
	var n = rd(exc, a, 0x0A);
	var o = [];
	for (var j = 0; j < n; j++) o.push(rd(exc, a, 0x09));
	return o;
}

function pol(evt, exc)
{
	var a = exc.unit;
	var m = exc.ses.mem;
	var key = "rc" + a;
	if (!m[key]) {
		if (rd(exc, a, 0x37) == 0) { exc.err = "MFRC522: VersionReg reads 0: no chip"; return; }
		init(exc, a);
		m[key] = 1;
	}
	var at = tcv(exc, a, [0x52], 7);
	if (at == null) { exc.result([0, 0]); return; }
	var u = tcv(exc, a, [0x93, 0x20], 0);
	if (u == null || u.length != 5 || ((u[0] ^ u[1] ^ u[2] ^ u[3]) != u[4])) { exc.result([0, 0]); return; }
	tcv(exc, a, [0x50, 0x00, 0x57, 0xCD], 0);   //HLTA with its CRC_A
	exc.result([1, BYTES.u32be(u, 0)]);
}
