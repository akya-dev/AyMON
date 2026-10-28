This directory holds the engine's OWN OPC UA certificate and private key:

  aymon_cert.pem   the certificate - the engine shows it to the machine
  aymon_key.pem    its private key - never leaves this computer

Both are made by main.start (OPC.cert) at the first run, and only if they
are not here. Delete both to get a new pair - and then trust the new
certificate on the machine again (see the README).

They are not in the repository on purpose: a private key belongs to one
installation.
