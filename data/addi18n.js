// usage: node data/addi18n.js dict.json [rules.txt]
const fs = require('fs');
let j = fs.readFileSync('public/i18n.js', 'utf8');
const key = '  // [en, ru, uk]\n'; if (!j.includes(key)) throw new Error('dict anchor');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
j = j.replace(key, () => key + d.map(r => '  ' + JSON.stringify(r) + ',').join('\n') + '\n');
if (process.argv[3]) {
  const rules = fs.readFileSync(process.argv[3], 'utf8');
  const sec = 'R(/([\\d.]+) s\\b/g'; const i = j.indexOf(sec); if (i < 0) throw new Error('seconds rule anchor');
  j = j.slice(0, i) + rules + j.slice(i);
}
fs.writeFileSync('public/i18n.js', j);
new Function(j);
console.log('added', d.length, 'entries', process.argv[3] ? '+ rules' : '');
