import { readFile, writeFile } from 'node:fs/promises';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const [template, css, storage, app] = await Promise.all([
  read('page.html'), read('style.css'), read('storage.mjs'), read('app.mjs'),
]);
// These are our own source files, not user input. Embed them so previews need
// no relative resource requests or ES module loader.
const script = storage.replace(/^export /gm, '') + '\n' + app.replace(/^import .*;\r?\n/, '');
const html = template
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`)
  .replace(/^[ \t]*<script type="module" src="app.mjs"><\/script>\r?\n/m, '')
  .replace('</body>', () => `<script>\n(() => {\n${script.replace(/<\/script/gi, '<\\/script')}\n})();\n</script>\n</body>`);
await writeFile(new URL('index.html', import.meta.url), html);
console.log('Built standalone index.html');
