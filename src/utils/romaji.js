const HIRA_TO_ROMAJI = {
  あ:'a',い:'i',う:'u',え:'e',お:'o',か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',
  た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',
  ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',や:'ya',ゆ:'yu',よ:'yo',ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',わ:'wa',を:'o',ん:'n',
  が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',
  ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',ぁ:'a',ぃ:'i',ぅ:'u',ぇ:'e',ぉ:'o',ゃ:'ya',ゅ:'yu',ょ:'yo',っ:'',ー:'-'
};
const YOON = { き:'ky',ぎ:'gy',し:'sh',じ:'j',ち:'ch',に:'ny',ひ:'hy',び:'by',ぴ:'py',み:'my',り:'ry' };

function kanaToHiragana(text = '') {
  return text.replace(/[ァ-ン]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function toRomaji(text = '') {
  const src = kanaToHiragana((text || '').replace(/[・/]/g, ' '));
  if (!/[ぁ-んァ-ン]/.test(text)) return '';
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === 'っ' && next) {
      const n = YOON[next] || HIRA_TO_ROMAJI[next] || '';
      out += n[0] || '';
      continue;
    }
    if ((next === 'ゃ' || next === 'ゅ' || next === 'ょ') && YOON[ch]) {
      out += YOON[ch] + ({ ゃ:'a', ゅ:'u', ょ:'o' }[next]);
      i++;
      continue;
    }
    if (ch === 'ー') {
      const m = out.match(/[aeiou]$/);
      if (m) out += m[0];
      continue;
    }
    out += HIRA_TO_ROMAJI[ch] ?? ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}
