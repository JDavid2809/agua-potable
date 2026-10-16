export const THEME_STORAGE_KEY = 'theme';

/**
 * Script en línea que se ejecuta en <head> antes del primer pintado (evita el destello del tema).
 * Lee la preferencia guardada o, si no existe, la del sistema operativo.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export const SIDEBAR_COOKIE = 'sidebar_collapsed';
