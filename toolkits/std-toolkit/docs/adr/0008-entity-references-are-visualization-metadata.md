# Entity references are visualization metadata

An ESchema field may name a target Entity by stable identity so table snapshots can render field-to-identifier connectors. The reference is stored in the snapshot and its changes are safe, but it changes no validation, persistence, lookup, or referential-integrity behavior; name-based targets keep cyclic and external references representable without coupling schema declarations to JavaScript initialization order or table registration.
