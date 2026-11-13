export const THEME_STORAGE_KEY = 'theme';
export const THEME_COLOR_LIGHT = '#f8fafc';
export const THEME_COLOR_DARK = '#020617';

/**
 * Sincroniza el color de barra del navegador / PWA (<meta name="theme-color"> y fondo raíz)
 * con el tema activo de la aplicación sin mutar nodos administrados por React.
 */
export function syncBrowserThemeColor(dark: boolean) {
  if (typeof document === 'undefined') return;
  const color = dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
  document.documentElement.style.backgroundColor = color;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-fluvib-theme]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.setAttribute('data-fluvib-theme', '1');
    document.head.appendChild(meta);
  }
  if (meta.content !== color) {
    meta.content = color;
  }
}

/**
 * Script en línea que se ejecuta en <head> antes del primer pintado (evita el destello del tema).
 * Lee la preferencia guardada o, si no existe, la del sistema operativo, y actualiza `meta[name="theme-color"]`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var c=d?"${THEME_COLOR_DARK}":"${THEME_COLOR_LIGHT}";var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";r.style.backgroundColor=c;var m=document.querySelector('meta[name="theme-color"][data-fluvib-theme]');if(!m){m=document.createElement("meta");m.name="theme-color";m.setAttribute("data-fluvib-theme","1");document.head.appendChild(m);}m.content=c;}catch(e){}})()`;

export const SIDEBAR_COOKIE = 'sidebar_collapsed';
