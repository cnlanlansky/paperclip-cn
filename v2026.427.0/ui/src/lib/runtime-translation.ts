type TranslationTable = Record<string, string>;

const DEFAULT_LOCALE = "zh-CN";
const TEXT_ATTRIBUTES = [
  "placeholder",
  "title",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-valuetext",
  "alt",
] as const;
const FORM_VALUE_TYPES = new Set(["button", "submit", "reset"]);
const SKIPPED_TEXT_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"]);
const SKIPPED_ATTRIBUTE_TAGS = new Set(["SCRIPT", "STYLE"]);
const PLACEHOLDER_RE = /\{[a-zA-Z0-9_]+\}/g;

let translations: TranslationTable = {};
let patternTranslations: Array<{ pattern: RegExp; output: string; placeholders: string[] }> = [];
let observer: MutationObserver | null = null;

function resolveLocale() {
  return localStorage.getItem("paperclip.locale")?.trim() || DEFAULT_LOCALE;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPatternTranslations(table: TranslationTable) {
  patternTranslations = Object.entries(table).flatMap(([input, output]) => {
    const placeholders = input.match(PLACEHOLDER_RE) ?? [];
    if (placeholders.length === 0 || placeholders.some((placeholder) => !output.includes(placeholder))) {
      return [];
    }

    const pattern = input
      .split(PLACEHOLDER_RE)
      .map(escapeRegExp)
      .join("(.+?)");
    return [{ pattern: new RegExp(`^${pattern}$`), output, placeholders }];
  });
}

function translateTrimmedValue(value: string) {
  const exact = translations[value];
  if (exact) return exact;

  for (const rule of patternTranslations) {
    const match = value.match(rule.pattern);
    if (!match) continue;
    return rule.placeholders.reduce(
      (output, placeholder, index) => output.replaceAll(placeholder, match[index + 1] ?? ""),
      rule.output,
    );
  }

  return value;
}

function translateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const translated = translateTrimmedValue(trimmed);
  if (translated === trimmed) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function isEditableElement(element: Element) {
  return element.closest("[contenteditable]:not([contenteditable='false'])") !== null;
}

function shouldSkipTextElement(element: Element) {
  if (SKIPPED_TEXT_TAGS.has(element.tagName)) return true;
  if (isEditableElement(element)) return true;
  return false;
}

function shouldSkipAttributeElement(element: Element) {
  return SKIPPED_ATTRIBUTE_TAGS.has(element.tagName);
}

function translateTextNode(node: Text) {
  const parent = node.parentElement;
  if (!parent || shouldSkipTextElement(parent)) return;
  const translated = translateValue(node.nodeValue ?? "");
  if (translated !== node.nodeValue) node.nodeValue = translated;
}

function translateElement(element: Element) {
  if (shouldSkipAttributeElement(element)) return;

  for (const attribute of TEXT_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const translated = translateValue(value);
    if (translated !== value) element.setAttribute(attribute, translated);
  }

  if (element instanceof HTMLInputElement && FORM_VALUE_TYPES.has(element.type)) {
    const translated = translateValue(element.value);
    if (translated !== element.value) element.value = translated;
  }
}

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    translateTextNode(node as Text);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  translateElement(element);

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      translateTextNode(current as Text);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      translateElement(current as Element);
    }
    current = walker.nextNode();
  }
}

function translateDocument() {
  translateNode(document.documentElement);
  document.title = translateValue(document.title);
}

async function loadTranslations(locale: string) {
  const response = await fetch(`/locales/${encodeURIComponent(locale)}/common.json`, {
    cache: "no-store",
  });
  if (!response.ok) return {};
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.fromEntries(
    Object.entries(data).filter(
      (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

export async function initRuntimeTranslation() {
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
      if (mutation.type === "characterData") {
        translateNode(mutation.target);
        continue;
      }
      if (mutation.type === "attributes") {
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
}
