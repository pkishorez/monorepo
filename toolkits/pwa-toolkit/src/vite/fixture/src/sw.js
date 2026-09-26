// Custom worker entry: exposes the inlined WorkerBuildInfo for the test.
import info from 'virtual:pwa-toolkit/build';

self.__PWA_INFO__ = info;
