// Languages offered on the site, and the font each non-Latin script needs (Windows system fonts that ship with the OS).
const LANGS = [
  ['en', 'English'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'],
  ['pl', 'Polish'], ['tr', 'Turkish'], ['nl', 'Dutch'], ['cs', 'Czech'], ['ro', 'Romanian'], ['bg', 'Bulgarian'], ['sv', 'Swedish'], ['da', 'Danish'], ['fi', 'Finnish'],
  ['el', 'Greek'], ['hu', 'Hungarian'], ['sk', 'Slovak'], ['hr', 'Croatian'], ['kk', 'Kazakh'], ['az', 'Azerbaijani'], ['ka', 'Georgian'], ['hy', 'Armenian'],
  ['ar', 'Arabic'], ['he', 'Hebrew'], ['fa', 'Persian'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['th', 'Thai'], ['vi', 'Vietnamese'], ['id', 'Indonesian'], ['ms', 'Malay'],
  ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean']
].map(([code, name]) => ({ code, name }));

// which script is the text written in (decides the font and the line handling)
const SCRIPTS = [
  ['cjk', /[぀-ヿ㐀-鿿豈-﫿]/], ['hangul', /[가-힯ᄀ-ᇿ]/], ['arabic', /[؀-ۿݐ-ݿ]/], ['hebrew', /[֐-׿]/],
  ['thai', /[฀-๿]/], ['indic', /[ऀ-৿਀-෿]/], ['georgian', /[Ⴀ-ჿ]/], ['armenian', /[԰-֏]/]
];
const scriptOf = text => { for (const [n, re] of SCRIPTS) if (re.test(text)) return n; return 'latin'; };
const FONT = { cjk: 'Microsoft YaHei', hangul: 'Malgun Gothic', arabic: 'Segoe UI', hebrew: 'Segoe UI', thai: 'Leelawadee UI', indic: 'Nirmala UI', georgian: 'Sylfaen', armenian: 'Sylfaen' };
const fontFor = script => FONT[script] || '';
module.exports = { LANGS, scriptOf, fontFor };
