# =====================================================================
# ua_machine.py - PRJEDU_opcua: a simulated injection moulding machine
# with an OPC UA server, the way a real one comes with one.
#
#   opc.tcp://127.0.0.1:4840/moulding/
#
# It is the machine end of the example; the engine is the other end. It
# is written with asyncua (an OPC UA stack in Python, independent of
# AyMON's own) so that the engine talks to somebody else's code.
#
# WHAT IT SERVES, under Objects/Moulding/IMM1, in the namespace
# urn:aymon:examples:moulding (the index that URI gets is the server's
# business - the engine asks for the URI):
#
#   State         Int32     0 STOPPED, 1 HEATING, 2 RUNNING
#   Run           Boolean   WRITABLE - start / stop
#   MouldTempSP   Double    WRITABLE - mould temperature setpoint, C
#   MouldTemp     Double    the mould, following the setpoint when running
#   BarrelTemp    Double[4] the four heating zones of the barrel, one array
#   CycleTime     Double    the last cycle, s
#   CycleCount    UInt32    shots since the last reset
#   Job           String    the job on the machine
#   ResetCounter()          method -> the count before the reset (UInt32)
#   SetJob(String)          method
#
# WHO MAY DO WHAT - two things a real server decides, and this one too:
#
#   identity   Anonymous may READ, browse and subscribe - not write, not
#              call. The user 'setter' (password 'setter123') may do all
#              of it. Any other user name or password is refused.
#   security   None (in the clear) and Basic256Sha256 SignAndEncrypt.
#              A client that comes with a certificate must be TRUSTED:
#              an unknown one is refused and its certificate is put in
#              pki/rejected/. Moving it to pki/trusted/ is how you trust
#              it - the same step as on a real server.
#
# The server's own certificate is made at the first start, in pki/own/
# (DER for the server, and a PEM copy for the engine's pro_trust).
#
# Run:  run_machine.bat  (or ./run_machine.sh) - needs asyncua; see the
#       README (setup.bat / setup.sh). Stop it with CTRL-C.
# =====================================================================
import asyncio
import hashlib
import math
import random
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from asyncua import Server, ua, uamethod
from asyncua.common.utils import ServiceError
from asyncua.crypto.cert_gen import setup_self_signed_certificate
from asyncua.crypto.permission_rules import (PermissionRuleset, USER_TYPES,
                                             User, UserRole)
from asyncua.server.user_managers import UserManager

ENDPOINT = "opc.tcp://127.0.0.1:4840/moulding/"
NS_URI = "urn:aymon:examples:moulding"
APP_URI = "urn:aymon:examples:moulding-sim"

HERE = Path(__file__).resolve().parent
PKI = HERE / "pki"
OWN, TRUSTED, REJECTED = PKI / "own", PKI / "trusted", PKI / "rejected"

USERS = {"setter": "setter123"}

AMBIENT = 25.0
ZONE_SP = [200.0, 210.0, 220.0, 230.0]


def say(text):
    print(datetime.now().strftime("%H:%M:%S ") + text, flush=True)


# ---- identity -------------------------------------------------------
class Users(UserManager):
    """A server that really refuses: asyncua's default accepts anyone."""

    def get_user(self, iserver, username=None, password=None, certificate=None):
        if username is None:
            return User(role=UserRole.Anonymous)
        if USERS.get(username) == password:
            say(f"LOGIN   '{username}' accepted - may read, write and call")
            return User(role=UserRole.User, name=username)
        say(f"LOGIN   '{username}' REFUSED - unknown user or wrong password")
        return None


class AnonymousReadsOnly(PermissionRuleset):
    """Per request type: Anonymous gets everything but Write and Call."""

    def __init__(self):
        everything = set(map(ua.NodeId, USER_TYPES))
        no = {ua.NodeId(ua.ObjectIds.WriteRequest_Encoding_DefaultBinary),
              ua.NodeId(ua.ObjectIds.CallRequest_Encoding_DefaultBinary)}
        self.allowed = {UserRole.Admin: everything, UserRole.User: everything,
                        UserRole.Anonymous: everything - no}

    def check_validity(self, user, action_type_id, body):
        role = user.role if user is not None else UserRole.Anonymous
        ok = action_type_id in self.allowed[role]
        if not ok:
            say("DENIED  an anonymous session tried to "
                + ("write" if action_type_id.Identifier ==
                   ua.ObjectIds.WriteRequest_Encoding_DefaultBinary else "call a method")
                + " - BadUserAccessDenied")
        return ok


# ---- trust: the client certificates this server accepts --------------
def _cert_name(cert):
    cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
    name = cn[0].value if cn else "client"
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:40]


def _trusted_ders():
    out = []
    for f in TRUSTED.glob("*"):
        data = f.read_bytes()
        try:
            c = (x509.load_pem_x509_certificate(data) if b"-----BEGIN" in data
                 else x509.load_der_x509_certificate(data))
            out.append(c.public_bytes(Encoding.DER))
        except ValueError:
            say(f"TRUST   {f.name} is not a certificate - ignored")
    return out


async def check_client_cert(cert, app_description):
    der = cert.public_bytes(Encoding.DER)
    if der in _trusted_ders():
        return
    thumb = hashlib.sha1(der).hexdigest()
    path = REJECTED / f"{_cert_name(cert)}_{thumb[:8]}.der"
    if not path.exists():
        path.write_bytes(der)
    say(f"CERT    '{cert.subject.rfc4514_string()}' is not trusted - REFUSED. "
        f"It is in pki/rejected/{path.name}; move it to pki/trusted/ to trust it.")
    raise ServiceError(ua.StatusCodes.BadCertificateUntrusted)


# ---- the machine ----------------------------------------------------
class Machine:
    def __init__(self):
        self.mould = AMBIENT
        self.zones = [40.0, 40.0, 40.0, 40.0]
        self.progress = 0.0      # of the running cycle, s
        self.count = 0
        self.cycle = 0.0
        self.state = 0
        self.target = None       # length of the running cycle, s

    def step(self, dt, run, sp):
        target = sp if run else AMBIENT
        self.mould += (target - self.mould) * (1 - math.exp(-dt / 12.0))
        for i in range(4):
            zt = ZONE_SP[i] if run else 40.0
            self.zones[i] += (zt - self.zones[i]) * (1 - math.exp(-dt / 8.0))
        if not run:
            self.state, self.progress, self.target = 0, 0.0, None
            return False
        hot = abs(self.mould - sp) <= 3.0 and all(abs(self.zones[i] - ZONE_SP[i]) <= 5.0 for i in range(4))
        if not hot:
            self.state, self.progress, self.target = 1, 0.0, None
            return False
        self.state = 2
        # a hotter mould takes longer to cool the part: 4 s at 40 C, +0.05 s
        # per degree above, and no two shots quite alike
        if self.target is None:
            self.target = (4.0 + 0.05 * max(0.0, sp - 40.0)) * random.uniform(0.96, 1.04)
        self.progress += dt
        if self.progress >= self.target:
            self.cycle, self.progress, self.target = self.progress, 0.0, None
            self.count += 1
            return True
        return False


async def main():
    for d in (OWN, TRUSTED, REJECTED):
        d.mkdir(parents=True, exist_ok=True)

    host = socket.gethostname()
    key_file, der_file, pem_file = OWN / "server_key.pem", OWN / "server_cert.der", OWN / "server_cert.pem"
    await setup_self_signed_certificate(
        key_file, der_file, APP_URI, host,
        [ExtendedKeyUsageOID.SERVER_AUTH, ExtendedKeyUsageOID.CLIENT_AUTH],
        {"countryName": "TR", "organizationName": "AyMON examples",
         "commonName": "AyMON example moulding machine"})
    cert = x509.load_der_x509_certificate(der_file.read_bytes())
    pem = cert.public_bytes(Encoding.PEM)
    if not pem_file.exists() or pem_file.read_bytes() != pem:
        pem_file.write_bytes(pem)

    server = Server(user_manager=Users())
    await server.init()
    server.set_endpoint(ENDPOINT)
    server.set_server_name("AyMON example - moulding machine IMM1")
    await server.set_application_uri(APP_URI)
    await server.load_certificate(str(der_file))
    await server.load_private_key(str(key_file))
    server.set_security_policy([ua.SecurityPolicyType.NoSecurity,
                                ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt],
                               permission_ruleset=AnonymousReadsOnly())
    server.set_identity_tokens([ua.AnonymousIdentityToken, ua.UserNameIdentityToken])
    server.set_certificate_validator(check_client_cert)

    ns = await server.register_namespace(NS_URI)
    folder = await server.nodes.objects.add_folder(ua.NodeId("Moulding", ns), "Moulding")
    imm = await folder.add_object(ua.NodeId("IMM1", ns), "IMM1")

    async def var(name, value, vtype, writable=False):
        n = await imm.add_variable(ua.NodeId("IMM1." + name, ns), name, ua.Variant(value, vtype))
        if writable:
            await n.set_writable()
        return n

    n_state = await var("State", 0, ua.VariantType.Int32)
    n_run = await var("Run", False, ua.VariantType.Boolean, True)
    n_sp = await var("MouldTempSP", 60.0, ua.VariantType.Double, True)
    n_mould = await var("MouldTemp", AMBIENT, ua.VariantType.Double)
    n_zones = await var("BarrelTemp", [40.0] * 4, ua.VariantType.Double)
    n_cycle = await var("CycleTime", 0.0, ua.VariantType.Double)
    n_count = await var("CycleCount", 0, ua.VariantType.UInt32)
    n_job = await var("Job", "J-1001 cap 28 mm", ua.VariantType.String)

    m = Machine()

    @uamethod
    def reset_counter(parent):
        before = m.count
        m.count = 0
        say(f"CALL    ResetCounter() - was {before}")
        return ua.Variant(before, ua.VariantType.UInt32)

    @uamethod
    async def set_job(parent, name):
        await n_job.write_value(ua.Variant(str(name), ua.VariantType.String))
        say(f"CALL    SetJob({name!r})")

    await imm.add_method(ua.NodeId("IMM1.ResetCounter", ns), "ResetCounter", reset_counter,
                         [], [ua.VariantType.UInt32])
    await imm.add_method(ua.NodeId("IMM1.SetJob", ns), "SetJob", set_job,
                         [ua.VariantType.String], [])

    async def put(node, value, vtype):
        now = datetime.now(timezone.utc)
        await node.write_value(ua.DataValue(ua.Variant(value, vtype), SourceTimestamp=now, ServerTimestamp=now))

    async with server:
        say(f"READY   {ENDPOINT}  namespace '{NS_URI}' = ns={ns}")
        say(f"        server certificate: pki/own/server_cert.pem  (trusted clients: pki/trusted/)")
        last = {"run": None, "sp": None, "state": None, "mould": None, "zones": None}
        t0 = asyncio.get_running_loop().time()
        while True:
            await asyncio.sleep(0.2)
            t1 = asyncio.get_running_loop().time()
            dt, t0 = t1 - t0, t1
            run = bool(await n_run.read_value())
            sp = float(await n_sp.read_value())
            if run != last["run"]:
                if last["run"] is not None:
                    say(f"WRITE   Run = {run}")
                last["run"] = run
            if sp != last["sp"]:
                if last["sp"] is not None:
                    say(f"WRITE   MouldTempSP = {sp}")
                last["sp"] = sp
            shot = m.step(dt, run, sp)
            if m.state != last["state"]:
                await put(n_state, m.state, ua.VariantType.Int32)
                say("STATE   " + ("STOPPED", "HEATING", "RUNNING")[m.state])
                last["state"] = m.state
            mould = round(m.mould, 1)
            if mould != last["mould"]:
                await put(n_mould, mould, ua.VariantType.Double)
                last["mould"] = mould
            zones = [round(z, 1) for z in m.zones]
            if zones != last["zones"]:
                await put(n_zones, zones, ua.VariantType.Double)
                last["zones"] = zones
            if shot:
                await put(n_cycle, round(m.cycle, 2), ua.VariantType.Double)
            if shot or (await n_count.read_value()) != m.count:
                await put(n_count, m.count, ua.VariantType.UInt32)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
