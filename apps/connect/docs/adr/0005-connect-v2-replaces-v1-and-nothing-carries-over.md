# Connect v2 replaces v1, and nothing carries over

Connect v1 and the Code app are deleted, and Connect v2 takes over every
production name of v1: the `@kestack/connect` package at its next patch
version, `ke-connect`, `connect.kishore.app`, the `Connect` stack and its
`connect-cloud-<stage>` and `connect-releases-<stage>` resources, and the
`kestack/connect/` data folder. Nothing of v1 is moved across: v1's Code
Projects and Sessions are not brought into v2, and Code returns as a Plugin.
Production v1 is left running until v2 is deployed in its place, which waits
until the work on Connect v2 is done.
