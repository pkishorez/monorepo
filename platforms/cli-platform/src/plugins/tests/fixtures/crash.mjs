// A Plugin that dies as it starts.
console.log('starting');
console.error('boom');
process.exit(1);
