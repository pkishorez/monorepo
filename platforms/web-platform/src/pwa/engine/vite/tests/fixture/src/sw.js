// Custom worker entry: exposes the inlined WorkerBuildInfo for the test.
import info from 'virtual:web-platform/pwa/build';

self.__PWA_INFO__ = info;
