import {loadStationeryResources} from './resources.mjs';
import {buildStationeryEditor} from './editor-build.mjs';
console.log(await buildStationeryEditor(await loadStationeryResources()));
