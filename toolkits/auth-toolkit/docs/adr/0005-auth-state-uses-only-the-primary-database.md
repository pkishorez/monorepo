# Auth state uses only the Primary Database

Persist sessions and verification records only in the Primary Database and remove the secondary-storage providers and deployment resources. Minimizing cost is the priority: D1 already holds sessions, its indexed reads are inexpensive, and KV adds duplicate writes while failing Better Auth's atomic-operation contract and allowing stale session reads. Reconsider secondary storage only when measured performance or cost justifies it; this decision leaves the existing Cookie Cache policy unchanged.
