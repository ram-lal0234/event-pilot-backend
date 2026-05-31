const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const lines = fs.readFileSync(path.join(__dirname, 'prepare-layers.sh'), 'utf8').split('\n');
const included = new Set();

for (const line of lines) {
  const match = line.match(/copy_src "\$\{SHARED_LAYER\}" "([^"]+)"/);
  if (match) included.add(match[1]);
}

for (const file of fs.readdirSync(path.join(ROOT, 'repositories'))) {
  if (file.endsWith('.js')) included.add(`repositories/${file}`);
}

const missing = new Set();
const visited = new Set();

const resolveRelative = (fromAbs, req) => {
  if (!req.startsWith('.')) return null;
  let target = path.resolve(path.dirname(fromAbs), req);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.js');
  }
  if (!target.endsWith('.js')) target += '.js';
  return fs.existsSync(target) ? target : null;
};

const walk = (rel) => {
  if (visited.has(rel)) return;
  visited.add(rel);

  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;

  const source = fs.readFileSync(abs, 'utf8');
  for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
    const targetAbs = resolveRelative(abs, match[1]);
    if (!targetAbs) continue;

    const relTarget = path.relative(ROOT, targetAbs);
    if (!included.has(relTarget)) {
      missing.add(relTarget);
      continue;
    }
    walk(relTarget);
  }
};

for (const rel of included) walk(rel);

console.log(`Included files: ${included.size}`);
console.log(`Missing transitive deps (${missing.size}):`);
for (const dep of [...missing].sort()) {
  console.log(` - ${dep}`);
}

if (missing.size > 0) process.exit(1);
