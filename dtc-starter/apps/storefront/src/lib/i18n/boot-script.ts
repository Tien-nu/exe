import { LANGUAGE_COOKIE } from "./translate"

/**
 * Runs in <head> before the page paints: picks the saved language, or the
 * browser's when nothing is saved, and hides Vietnamese pages until the
 * runtime has translated them (CSS reveals them after 1.5s regardless).
 */
export const LANGUAGE_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,m=document.cookie.match(/(?:^|; )${LANGUAGE_COOKIE}=(en|vi)(?:;|$)/),l=m?m[1]:((navigator.languages||[navigator.language]).some(function(x){return /^vi\\b/i.test(x)})?"vi":"en");d.dataset.lang=l;d.lang=l;if(l==="vi")d.dataset.i18n="pending"}catch(e){}})()`
