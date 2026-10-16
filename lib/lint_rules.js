// Claim checker rules for health/wellness ads. One rule = one message (English key, translated in the UI) + patterns per language (nl/en/ru/uk).
// A match flags text that is a typical source of misleading advertising; the user decides what to do.
// Note: JS \w does not match Cyrillic, so Cyrillic word endings use W (any run of non-separator characters).
const W = '[^\\s.,!?;:]*';
const re = (s, f = 'i') => new RegExp(s.split('~').join(W), f);
const R = (msg, ...res) => ({ msg, res });

const NUM_EN = '(?:\\d+|one|two|three|four|a few)', NUM_RU = '(?:\\d+|один|два|три|четыре|несколько)', NUM_UK = '(?:\\d+|один|два|три|чотири|кілька)', NUM_NL = '(?:\\d+|een|twee|drie|vier)';
const T_EN = '(?:hours?|days?|weeks?)', T_RU = '(?:час~|дн~|день|недел~)', T_UK = '(?:годин~|дн~|день|тиж~)', T_NL = '(?:uur|dagen|dag|weken|week)';
const LOSS_EN = '(?:lose|loss|weight|pounds|kilos?|fat)', LOSS_RU = '(?:похуд~|сброс~|минус|килограмм~|жир~)', LOSS_UK = '(?:схуд~|скин~|мінус|кілограм~|жир~)', LOSS_NL = '(?:kilo|afval~|verlies~|vet)';

const RULES = [
  R('Concrete weight-loss promise (number of kilos). Avoid figures you cannot prove.',
    re("\\b\\d+\\s*(?:-|tot|à)?\\s*\\d*\\s*(?:kilo'?s?|kg|pond)\\b"),
    re('\\b\\d+\\s*(?:-|to)?\\s*\\d*\\s*(?:kg|kilos?|kilograms?|pounds?|lbs?)\\b'),
    re('\\d+\\s*(?:-|до)?\\s*\\d*\\s*(?:кг|кило|килограмм~)'),
    re('\\d+\\s*(?:-|до)?\\s*\\d*\\s*(?:кг|кіло|кілограм~)')),
  R('Promise of fast results in hours/days/weeks.',
    re(`\\b(?:in|within)\\s+(?:just\\s+|only\\s+)?${NUM_EN}\\s+${T_EN}\\b[^.]{0,40}${LOSS_EN}`), re(`${LOSS_EN}[^.]{0,40}\\b(?:in|within)\\s+(?:just\\s+|only\\s+)?${NUM_EN}\\s+${T_EN}\\b`),
    re(`за\\s+(?:всего\\s+)?${NUM_RU}\\s+${T_RU}[^.]{0,40}${LOSS_RU}`), re(`${LOSS_RU}[^.]{0,40}за\\s+(?:всего\\s+)?${NUM_RU}\\s+${T_RU}`),
    re(`за\\s+(?:лише\\s+)?${NUM_UK}\\s+${T_UK}[^.]{0,40}${LOSS_UK}`), re(`${LOSS_UK}[^.]{0,40}за\\s+(?:лише\\s+)?${NUM_UK}\\s+${T_UK}`),
    re(`\\b(?:binnen|in)\\s+(?:slechts\\s+)?${NUM_NL}\\s+${T_NL}\\b[^.]{0,40}${LOSS_NL}`), re(`${LOSS_NL}[^.]{0,40}\\b(?:binnen|in)\\s+(?:slechts\\s+)?${NUM_NL}\\s+${T_NL}\\b`)),
  R('"Secret" / "celebrity" framing: classic misleading framing.',
    re('\\b(?:geheim|hollywood|sterren)\\b'), re('\\b(?:secret|hollywood|celebrit~)\\b'), re('(?:секрет|голливуд~|звезд~|звёзд~)'), re('(?:секрет|голлівуд~|зірк~)')),
  R('"No side effects" cannot be guaranteed.',
    re('\\bgeen bijwerkingen\\b'), re('\\bno side[- ]effects\\b'), re('без\\s+побочн~'), re('без\\s+побічн~')),
  R('"100%" claim (natural / safe / effective / guaranteed).',
    re('\\b100\\s*%\\s*(?:natuurlijk|veilig|effectief)'), re('\\b100\\s*%\\s*(?:natural|safe|effective|guaranteed)'),
    re('100\\s*%\\s*(?:натурал~|безопас~|эффектив~|гарант~)'), re('100\\s*%\\s*(?:натурал~|безпечн~|ефектив~|гаранто~)')),
  R('Names a doctor/professor: never speak on behalf of a real person without their permission.',
    re('\\b(?:[Pp]rof(?:essor)?\\.?|[Dd]r\\.?|[Dd]okter|[Aa]rts)\\s+[A-Z][a-zë]+', ''),
    re('\\b(?:[Pp]rof(?:essor)?\\.?|[Dd]r\\.?|[Dd]octor)\\s+[A-Z][a-z]+', ''),
    re('(?:[Дд]октор|[Пп]рофессор|[Вв]рач|[Дд]-р)\\s+[А-ЯЁ][а-яё]+', ''),
    re("(?:[Дд]октор|[Пп]рофесор|[Лл]ікар)\\s+[А-ЯІЇЄҐ][а-яіїєґ']+", '')),
  R('Testimonial about patients/family: only if provably true.',
    re('\\b(?:mijn vrouw|mijn man|mijn patiënten|duizenden patiënten|honderden patiënten)\\b'),
    re('\\b(?:my (?:wife|husband|patients)|thousands of (?:patients|people)|hundreds of patients)\\b'),
    re('(?:моя жена|мой муж|мои пациенты|тысячи пациентов|сотни пациентов)'),
    re('(?:моя дружина|мій чоловік|мої пацієнти|тисячі пацієнтів|сотні пацієнтів)')),
  R('Popularity claim: only if true.',
    re('\\b(?:razend populair|\\d{3}\\.?\\d{3}\\s*views|miljoen views)\\b'), re('\\b(?:going viral|\\d{3},?\\d{3}\\s+views|million views)\\b'),
    re('(?:миллион~\\s+просмотр~|набирает популярность|вирусн~)'), re('(?:мільйон~\\s+перегляд~|вірусн~)')),
  R('Artificial time pressure.',
    re('\\b(?:slechts|nog maar|alleen de komende)\\s+(?:\\w+\\s+){0,2}(?:uur|minuten|dagen)\\b.*\\b(?:gratis|korting)'),
    re('\\b(?:only (?:for|the next)\\s+(?:\\w+\\s+){0,3}(?:hours?|minutes?|days?)|limited time|today only|hurry)\\b'),
    re('(?:только сегодня|ограниченное время|только (?:следующие )?\\d+\\s*(?:час~|минут~)|успейте)'),
    re('(?:лише сьогодні|обмежений час|лише (?:наступні )?\\d+\\s*(?:годин~|хвилин~)|встигніть)')),
  R('Exaggerated result claim.',
    re('\\b(?:vetrollen|vet)\\s+(?:waren|zijn)?\\s*(?:letterlijk\\s+)?verdwenen\\b'), re('\\b(?:smelt|smelten)\\b[^.]{0,30}\\bkilo'),
    re('\\b(?:melt(?:s|ing)?\\s+away|fat\\s+(?:is\\s+)?(?:gone|disappear\\w*)|belly fat (?:vanish|gone))\\b'),
    re('(?:жир\\s+(?:тает|исчез~|сгорает мгновенно)|килограммы\\s+тают)'), re('(?:жир\\s+(?:тане|зник~)|кілограми\\s+тануть)')),
  R('Medical cure claim.',
    re('\\b(?:genees|genezen|geneest)\\b'), re('\\b(?:cures?|cured|heals?)\\b'), re('(?:излечи~|вылеч~|исцел~)'), re('(?:виліку~|зцілю~|зцілен~)'))
];

// Disclaimer: needs a "talk to your doctor" part and a "results vary" part in any supported language.
const DOC = re('(?:huisarts|dokter|\\bdoctor\\b|physician|врач~|лікар~)');
const VARY = re('(?:verschil~|resultaten|\\bvary\\b|\\bvaries\\b|\\bdiffer\\b|individual|различ~|отлича~|індивідуальн~|відрізня~|индивидуальн~)');
const DISCLAIMER_MSG = 'Missing disclaimer: add "If in doubt, consult your doctor. Results vary from person to person."';

function lint(text) {
  const out = [];
  for (const { msg, res } of RULES) for (const r of res) { const m = text.match(r); if (m) { out.push({ text: m[0], msg }); break; } }
  if (!DOC.test(text) || !VARY.test(text)) out.push({ text: '', msg: DISCLAIMER_MSG });
  return out;
}
module.exports = { lint, RULES };
