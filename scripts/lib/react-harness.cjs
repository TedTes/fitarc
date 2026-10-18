// Run real React effects/handlers with deterministic time and native host stubs.
require('./load-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const renderer = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename,
}).outputText, filename);
const mocks = new Map();
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (mocks.has(request)) return mocks.get(request);
  const filename = Module._resolveFilename(request, parent);
  if (mocks.has(filename)) return mocks.get(filename);
  return originalLoad.call(this, request, parent, isMain);
};
const mockFile = (filename, value) => mocks.set(path.resolve(filename), value);
mockFile('src/runtime/runtimeStore.ts', {});
const listeners = new Set();
const AppState = { currentState: 'active', addEventListener: (_, callback) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } };
const appState = next => { AppState.currentState = next; [...listeners].forEach(callback => callback(next)); };
const native = {
  AppState, View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView', Image: 'Image', ActivityIndicator: 'ActivityIndicator',
  Keyboard: { dismiss() {} }, Platform: { OS: 'ios', select: values => values.ios ?? values.default }, BackHandler: { addEventListener: () => ({ remove() {} }) },
  Alert: { alert() {} }, StyleSheet: { create: x => x, absoluteFillObject: {} },
  PanResponder: { create: handlers => ({ panHandlers: handlers }) },
  Animated: { View: 'AnimatedView', Value: class { constructor(x) { this.value = x; } setValue(x) { this.value = x; } stopAnimation() {} interpolate() { return this.value; } }, spring: () => ({ start() {} }) },
};
mocks.set('react-native', native);
mocks.set('@expo/vector-icons', { Ionicons: 'Ionicons' });
mocks.set('react-native-safe-area-context', { useSafeAreaInsets: () => ({ bottom: 0 }) });
mockFile('src/screens/runtime/ui.tsx', { Txt: 'Txt', Button: 'Button', IconButton: 'IconButton', Sheet: 'Sheet', Choice: 'Choice' });
mockFile('src/screens/runtime/PlanKit.tsx', { PlanText: 'PlanText' });
mockFile('src/screens/runtime/MuscleMap.tsx', { MuscleMap: 'MuscleMap' });
mockFile('src/screens/runtime/ExerciseMuscles.tsx', { ExerciseDetailsSheet: 'ExerciseDetailsSheet', ExerciseMuscleDetails: 'ExerciseMuscleDetails', ExerciseTargetPreview: 'ExerciseTargetPreview' });
let now = Date.parse('2026-10-17T16:00:00Z'), sequence = 0;
const timers = new Map();
const originalNow = Date.now;
Date.now = () => now;
const timerGlobals = Object.fromEntries(['setTimeout','clearTimeout','setInterval','clearInterval'].map(key => [key,global[key]]));
global.setTimeout = (callback, delay = 0) => { const id = ++sequence; timers.set(id, { callback, at: now + delay }); return id; };
global.setInterval = (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: now + delay, interval: delay }); return id; };
global.clearTimeout = global.clearInterval = id => timers.delete(id);
const act = renderer.act;
async function advance(ms) {
  const target = now + ms;
  for (let n = 0; n < 10000; n++) {
    const entry = [...timers].filter(([,timer]) => timer.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
    if (!entry) break;
    const [id,timer] = entry; now = timer.at;
    if (timer.interval) timer.at += timer.interval; else timers.delete(id);
    await act(async () => { timer.callback(); });
  }
  now = target;
}
async function render(element) { let tree; await act(async () => { tree = renderer.create(element, { createNodeMock: () => ({ blur() {} }) }); }); return tree; }
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes;reject=no; }); return {promise,resolve,reject}; };
function restore() { Date.now=originalNow;Object.assign(global,timerGlobals);Module._load=originalLoad; }
module.exports = { React, act, render, advance, deferred, appState, native, mockFile, mocks, timers, listeners, restore };
