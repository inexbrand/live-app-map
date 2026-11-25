const out = await Bun.build({ entrypoints: ['./src/lib/gateway/pick-script.ts'], outdir: 'C:/Users/Concept/AppData/Local/Temp/claude/753367833d678936/71d01c9e-4924-435d-8fae-1e6f9ae2e835/scratchpad/sdk-bundle', target: 'bun', external: ['@live-app-map/sdk', '@live-app-map/sdk/*'] });
console.log(out.success, out.outputs.map((o) => o.path));
const m = await import(out.outputs[0].path);
const t = m.pickerScriptText();
console.log('renamed', [...new Set(t.match(/\bcomponentNameOf\d\b/g) ?? [])]);
