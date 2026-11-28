# A Plugin Server runs in its own process

`ke-connect` runs each Plugin Server as its own Node process, not as a child
Actor loaded into `ke-connect` itself, though the plugin utilities make it
read like one: the Directory arrives as its Kabuki props over its socket. In
one process, a Plugin that crashed, hung or ran out of memory, such as Code's
agents or KE Video's transcription, would take `ke-connect` and every other
Plugin with it; one Plugin could not be stopped alone; and a module once
imported is never unloaded, so each new Release would keep the old one in
memory until `ke-connect` restarted.
