import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bindTabWorkingFile,
  getOrCreateTabSessionId,
  getTabWorkingFileContext,
  normalizeWorkingFilename,
  readFilenameFromUrl,
  readWorkingFileIdFromUrl,
  resolvePreferredWorkingFileId,
  resolvePreferredWorkingFileName,
  setTabWorkingFileContext,
  syncWorkingFileIdInUrl,
  WORKING_FILE_ID_URL_PARAM,
  WORKING_FILE_URL_PARAM,
} from "@/lib/working-file-tab-context";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  };
}

describe("working-file-tab-context", () => {
  let href = "http://localhost/";
  let documentTitle = "T2";

  beforeEach(() => {
    href = "http://localhost/";
    documentTitle = "T2";
    const session = createMemoryStorage();
    const local = createMemoryStorage();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: session,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: local,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        get title() {
          return documentTitle;
        },
        set title(value: string) {
          documentTitle = value;
        },
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get location() {
          return new URL(href);
        },
        history: {
          state: {},
          replaceState: (_state: unknown, _title: string, url?: string | URL | null) => {
            if (url != null) href = new URL(String(url), href).toString();
          },
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "sessionStorage");
    Reflect.deleteProperty(globalThis, "localStorage");
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
  });

  it("normalizes filenames for keys / locks", () => {
    expect(normalizeWorkingFilename("  Projekt-A.storm.json ")).toBe("projekt-a.storm.json");
    expect(normalizeWorkingFilename("path/to/Board.JSON")).toBe("board.json");
    expect(normalizeWorkingFilename("")).toBe("");
  });

  it("creates a stable tab session id in sessionStorage", () => {
    const a = getOrCreateTabSessionId();
    const b = getOrCreateTabSessionId();
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("reads legacy filename and wf from URL", () => {
    expect(readFilenameFromUrl("?filename=alpha.storm.json&room=ABCD")).toBe("alpha.storm.json");
    expect(readWorkingFileIdFromUrl("?filename=a&wf=slot-1")).toBe("slot-1");
    expect(readFilenameFromUrl("?room=ABCD")).toBe(null);
  });

  it("syncs only wf into the URL and strips legacy filename", () => {
    href = "http://localhost/?room=ZZZZ&filename=stale.storm.json";
    syncWorkingFileIdInUrl("wf-beta");
    const params = new URLSearchParams(new URL(href).search);
    expect(params.get(WORKING_FILE_ID_URL_PARAM)).toBe("wf-beta");
    expect(params.get(WORKING_FILE_URL_PARAM)).toBe(null);
    expect(params.get("room")).toBe("ZZZZ");

    syncWorkingFileIdInUrl("wf-other");
    expect(new URLSearchParams(new URL(href).search).get(WORKING_FILE_ID_URL_PARAM)).toBe(
      "wf-other",
    );

    syncWorkingFileIdInUrl(null);
    const cleared = new URLSearchParams(new URL(href).search);
    expect(cleared.get(WORKING_FILE_ID_URL_PARAM)).toBe(null);
    expect(cleared.get("room")).toBe("ZZZZ");
  });

  it("stores tab context in sessionStorage", () => {
    setTabWorkingFileContext("wf-gamma", "gamma.storm.json");
    expect(getTabWorkingFileContext().label).toBe("gamma.storm.json");
    expect(getTabWorkingFileContext().wf).toBe("wf-gamma");
    expect(getTabWorkingFileContext().attachedAt).toBeTypeOf("number");
    setTabWorkingFileContext(null, null);
    expect(getTabWorkingFileContext().label).toBe(null);
    expect(getTabWorkingFileContext().wf).toBe(null);
  });

  it("resolves preferred id from URL then session; label is separate", () => {
    localStorage.setItem("t2-last-working-file-name", "from-ls.storm.json");
    href = "http://localhost/?wf=from-url-wf&filename=from-url.storm.json";
    expect(resolvePreferredWorkingFileId()).toBe("from-url-wf");
    expect(resolvePreferredWorkingFileName()).toBe("from-url.storm.json");

    setTabWorkingFileContext("wf-session", "from-session.storm.json");
    // Bookmark / deep-link URL wins over a later session board.
    expect(resolvePreferredWorkingFileId()).toBe("from-url-wf");
    expect(resolvePreferredWorkingFileName()).toBe("from-url.storm.json");
  });

  it("uses session id when URL has no wf", () => {
    href = "http://localhost/";
    setTabWorkingFileContext("wf-session", "from-session.storm.json");
    expect(resolvePreferredWorkingFileId()).toBe("wf-session");
    expect(resolvePreferredWorkingFileName()).toBe("from-session.storm.json");
  });

  it("uses session label when URL wf matches session", () => {
    href = "http://localhost/?wf=wf-same";
    setTabWorkingFileContext("wf-same", "session-label.storm.json");
    expect(resolvePreferredWorkingFileId()).toBe("wf-same");
    expect(resolvePreferredWorkingFileName()).toBe("session-label.storm.json");
  });

  it("does not fall back to localStorage when URL and session are empty", () => {
    localStorage.setItem("t2-last-working-file-name", "legacy.storm.json");
    expect(resolvePreferredWorkingFileId()).toBe(null);
    expect(resolvePreferredWorkingFileName()).toBe(null);
  });

  it("bindTabWorkingFile updates session, wf URL, and title", () => {
    bindTabWorkingFile("wf-bound", "bound.storm.json");
    expect(getTabWorkingFileContext().label).toBe("bound.storm.json");
    expect(getTabWorkingFileContext().wf).toBe("wf-bound");
    expect(readWorkingFileIdFromUrl()).toBe("wf-bound");
    expect(readFilenameFromUrl()).toBe(null);
    expect(documentTitle).toBe("bound.storm.json · T2");
  });

  it("same label with different wf yields different bookmark URLs", () => {
    bindTabWorkingFile("wf-alpha", "board.storm.json");
    expect(href).toContain("wf=wf-alpha");
    expect(href).not.toContain("filename=");

    bindTabWorkingFile("wf-beta", "board.storm.json");
    expect(href).toContain("wf=wf-beta");
    expect(href).not.toContain("wf=wf-alpha");
    expect(documentTitle).toBe("board.storm.json · T2");
  });

  it("reads legacy session filename field as label", () => {
    sessionStorage.setItem(
      "t2.working-file.tab-context",
      JSON.stringify({ filename: "old.storm.json", wf: "wf-old", attachedAt: 1 }),
    );
    expect(getTabWorkingFileContext().label).toBe("old.storm.json");
    expect(getTabWorkingFileContext().wf).toBe("wf-old");
  });
});
