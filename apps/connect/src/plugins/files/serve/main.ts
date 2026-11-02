import { Plugin } from '@kestack/cli-platform/plugins/plugin';
import { FILES_PLUGIN } from '../api/contract/index.js';
import { filesPlugin } from './serve.js';

/*
 * The files Plugin's file, as Connect runs it: the files Plugin on the
 * socket Connect gives, its File Tickets served in its Public Area. It
 * keeps nothing in its folders.
 */

const { api, layer, publicRoutes } = filesPlugin();

Plugin.make({ name: FILES_PLUGIN, group: api, layer, publicRoutes })();
