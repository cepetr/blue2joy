import picoCss from "@picocss/pico/css/pico.min.css?raw";

// Constructable stylesheet for use inside shadow DOM components
export const picoSheet: CSSStyleSheet = (() => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(picoCss);
  return sheet;
})();
