const tokens = text => text.toLowerCase().match(/[a-z0-9]+/g) || [];
const words = text => [...new Set(tokens(text))];
export function matchSentence(sentences, current, transcript) {
  if (!sentences.length) return current;
  const heard = words(transcript).slice(-35);
  const exactHeard = tokens(transcript).join(' ');
  const matches = [];
  for (let i = current; i < Math.min(sentences.length, current + 4); i++) {
    const candidate = words(sentences[i]);
    if (!candidate.length) continue;
    const exact = tokens(sentences[i]).join(' ');
    if (tokens(sentences[i]).length <= 2) {
      if (exact === exactHeard) matches.push({index:i, score:1});
      continue;
    }
    const shared = heard.filter(word => candidate.includes(word)).length;
    const score = 2 * shared / (heard.length + candidate.length);
    if (shared >= 3 && score >= 0.48) matches.push({index:i, score});
  }
  matches.sort((a,b) => b.score - a.score);
  if (!matches.length || (matches[1] && matches[0].score - matches[1].score <= 0.05)) return current;
  return matches[0].index;
}
export function localSupport(Recognition) {
  if(!Recognition) return {supported:false,reason:'Speech recognition API absent'};
  try {
    const instance=new Recognition();
    if(!('processLocally' in instance) || typeof Recognition.available!=='function')
      return {supported:false,reason:'Explicit on-device API absent; cloud fallback disabled'};
    return {supported:true,reason:'On-device API present; language availability still needs checking'};
  } catch(error){return {supported:false,reason:`Constructor failed: ${error.name}`};}
}
