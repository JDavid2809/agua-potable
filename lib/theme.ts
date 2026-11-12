export const THEME_STORAGE_KEY = 'theme';
export const THEME_COLOR_LIGHT = '#f8fafc';
export const THEME_COLOR_DARK = '#020617';

/**
 * Sincroniza el color de barra del navegador / PWA (<meta name="theme-color"> y fondo raíz)
 * con el tema activo de la aplicación (claro u oscuro) para que las barras del sistema
 * cambien dinámicamente al alternar el tema.
 */
export function syncBrowserThemeColor(dark: boolean) {
  if (typeof document === 'undefined') return;
  const color = dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
  document.documentElement.style.backgroundColor = color;

  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    document.head.appendChild(meta);
    return;
  }

  metas.forEach((meta, idx) => {
    if (idx === 0) {
      meta.removeAttribute('media');
      meta.setAttribute('content', color);
    } else {
      meta.remove();
    }
  });
}

/**
 * Script en línea que se ejecuta en <head> antes del primer pintado (evita el destello del tema).
 * Lee la preferencia guardada o, si no existe, la del sistema operativo, y actualiza `meta[name="theme-color"]`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var c=d?"${THEME_COLOR_DARK}":"${THEME_COLOR_LIGHT}";var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";r.style.backgroundColor=c;var ms=document.querySelectorAll('meta[name="theme-color"]');if(ms.length){for(var i=0;i<ms.length;i++){if(i===0){ms[i].removeAttribute("media");ms[i].setAttribute("content",c);}else{ms[i].remove();}}}else{var m=document.createElement("meta");m.name="theme-color";m.content=c;document.head.appendChild(m);}}catch(e){}})()`;

export const SIDEBAR_COOKIE = 'sidebar_collapsed';
