const out = await Bun.build({ entrypoints: ['./src/lib/gateway/pick-script.ts'], outdir: './node_modules/.sdk-probe', target: 'bun', external: ['@live-app-map/sdk', '@live-app-map/sdk/*'] });
console.log(out.success, out.outputs.map((o) => o.path));
const m = await import(out.outputs[0].path);
const t = m.pickerScriptText();
console.log('renamed', [...new Set(t.match(/\bcomponentNameOf\d\b/g) ?? [])]);
