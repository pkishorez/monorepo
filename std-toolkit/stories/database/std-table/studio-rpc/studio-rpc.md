# Studio RPC

One generic Studio client discovers a table at runtime, then reads it through
the same Entity behavior application code already uses. The RPC boundary adds
no second database model: it only re-encodes Entity results for transport.
