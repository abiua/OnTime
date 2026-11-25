(function (root) {
  const languages = ['简体中文', '繁體中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español'];
  const defaults = { preferred: '简体中文', fallback: 'English' };
  const family = language => ['简体中文', '繁體中文'].includes(language) ? 'Chinese' : language;
  function detect(text) {
    if (!text.trim()) return '自动检测';
    if (/[\u3040-\u30ff]/u.test(text)) return '日本語';
    if (/[\uac00-\ud7af]/u.test(text)) return '한국어';
    const han = (text.match(/\p{Script=Han}/gu) || []).length;
    const latin = (text.match(/[a-z]/gi) || []).length;
    if (han && han * 2 >= latin) return '简体中文';
    // Only identify strong common-language signals; ambiguous text remains auto.
    if (/\b(the|hello|please|this|that|with|you|your|world|thanks|is|are)\b/i.test(text)) return 'English';
    if (/^[\x00-\x7f]+$/.test(text) && latin) return 'English';
    return '自动检测';
  }
  function chooseTarget(source, preferences = defaults) {
    return family(source) === family(preferences.preferred) ? preferences.fallback : preferences.preferred;
  }
  function valid(p) { return p && languages.includes(p.preferred) && languages.includes(p.fallback) && family(p.preferred) !== family(p.fallback); }
  const api = { languages, defaults, detect, chooseTarget, valid, family };
  if (typeof module !== 'undefined') module.exports = api;
  else root.translationPreferences = api;
})(globalThis);
