(() => {
  if (window.__PAPERCLIP_CN_RUNTIME_TRANSLATION__) return;
  window.__PAPERCLIP_CN_RUNTIME_TRANSLATION__ = true;

  const DEFAULT_LOCALE = "zh-CN";
  const TEXT_ATTRIBUTES = ["placeholder", "title", "aria-label", "aria-description", "aria-placeholder", "aria-valuetext", "alt"];
  const FORM_VALUE_TYPES = new Set(["button", "submit", "reset", "text", "search", "email", "url", "tel", ""]);
  const SKIPPED_TEXT_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"]);
  const SKIPPED_ATTRIBUTE_TAGS = new Set(["SCRIPT", "STYLE"]);
  const PLACEHOLDER_RE = /\{[a-zA-Z0-9_]+\}/g;

  let translations = {};
  let patternTranslations = [];
  let observer = null;

  const resolveLocale = () => localStorage.getItem("paperclip.locale")?.trim() || DEFAULT_LOCALE;
  const escapeRegExp = (value) => value.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  const hasMeaningfulStaticText = (value) => /[a-zA-Z0-9一-鿿]/.test(value.replace(PLACEHOLDER_RE, ""));

  const buildPatternTranslations = (table) => {
    patternTranslations = Object.entries(table).flatMap(([input, output]) => {
      const placeholders = input.match(PLACEHOLDER_RE) ?? [];
      if (
        placeholders.length === 0 ||
        !hasMeaningfulStaticText(input) ||
        placeholders.some((placeholder) => !output.includes(placeholder))
      ) return [];
      const pattern = input.split(PLACEHOLDER_RE).map(escapeRegExp).join("(.+?)");
      return [{ pattern: new RegExp("^" + pattern + "$"), output, placeholders }];
    });
  };

  const translateTrimmedValue = (value) => {
    const exact = translations[value];
    if (exact) return exact;
    for (const rule of patternTranslations) {
      const match = value.match(rule.pattern);
      if (!match) continue;
      return rule.placeholders.reduce((output, placeholder, index) => output.replaceAll(placeholder, match[index + 1] ?? ""), rule.output);
    }
    return value;
  };

  const translateSingleLineValue = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const translated = translateTrimmedValue(trimmed);
    if (translated === trimmed) return value;
    const leading = value.match(/^\s*/)?.[0] ?? "";
    const trailing = value.match(/\s*$/)?.[0] ?? "";
    return leading + translated + trailing;
  };

  const translateMultilineValue = (value) => value.split(/(\r?\n)/).map((line) => {
    if (/^\r?\n$/.test(line)) return line;
    const bullet = line.match(/^(\s*[-*]\s+)(.*?)(\s*)$/);
    if (!bullet) return translateSingleLineValue(line);
    const translated = translateTrimmedValue(bullet[2].trim());
    if (translated === bullet[2].trim()) return line;
    return bullet[1] + translated + bullet[3];
  }).join("");

  const translateValue = (value) => {
    const translated = translateSingleLineValue(value);
    if (translated !== value) return translated;
    if (!value.includes("\n")) return value;
    return translateMultilineValue(value);
  };

  const isEditableElement = (element) => element.closest("[contenteditable]:not([contenteditable='false'])") !== null;
  const shouldSkipTextElement = (element) => SKIPPED_TEXT_TAGS.has(element.tagName) || isEditableElement(element);
  const shouldSkipAttributeElement = (element) => SKIPPED_ATTRIBUTE_TAGS.has(element.tagName);

  const translateTextNode = (node) => {
    const parent = node.parentElement;
    if (!parent || shouldSkipTextElement(parent)) return;
    const translated = translateValue(node.nodeValue ?? "");
    if (translated !== node.nodeValue) node.nodeValue = translated;
  };

  const setFormValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(element, value);
    else element.value = value;
    element.defaultValue = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const translateFormValue = (element) => {
    const translated = translateValue(element.value);
    if (translated !== element.value) setFormValue(element, translated);
  };

  const translateElement = (element) => {
    if (shouldSkipAttributeElement(element)) return;
    for (const attribute of TEXT_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const translated = translateValue(value);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
    if (element instanceof HTMLInputElement && FORM_VALUE_TYPES.has(element.type)) translateFormValue(element);
    if (element instanceof HTMLTextAreaElement) translateFormValue(element);
  };

  const translateNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      translateTextNode(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node;
    translateElement(element);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let current = walker.nextNode();
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) translateTextNode(current);
      else if (current.nodeType === Node.ELEMENT_NODE) translateElement(current);
      current = walker.nextNode();
    }
  };

  const translateDocument = () => {
    translateNode(document.documentElement);
    document.title = translateValue(document.title);
  };

  const loadTranslations = async (locale) => {
    const response = await fetch("/locales/" + encodeURIComponent(locale) + "/common.json", { cache: "no-store" });
    if (!response.ok) return {};
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string"));
  };

  const init = async () => {
    const locale = resolveLocale();
    document.documentElement.lang = locale;
    try {
      translations = await loadTranslations(locale);
    } catch {
      translations = {};
    }
    buildPatternTranslations(translations);
    if (Object.keys(translations).length === 0) return;
    translateDocument();
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" || mutation.type === "attributes") {
          translateNode(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) translateNode(node);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TEXT_ATTRIBUTES, "value"],
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
  else void init();
})();
