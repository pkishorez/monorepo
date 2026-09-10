# Store capabilities use separate client and backend module graphs

Store management, state browsing, resource browsing, outputs, deletion preview and deletion execution form one Console experience, but have different policies and reasons to change. We keep these capabilities private behind a client workspace and a user-scoped backend operation boundary, with explicit Laymos edges inside each graph. The graphs remain in separate layers because browser interaction and server execution have different dependency rights; shared schema-first Effect RPC contracts connect them.

Session infrastructure owns connection and cache lifetime. Capability modules own their queries, interaction state and mutation cache policy; the workspace coordinates navigation and refresh across capabilities.
