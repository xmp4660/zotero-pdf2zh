import { config } from "../../package.json";
import { setPref, getPref } from "../utils/prefs";
import {
    llmApiManager,
    LLMApiData,
    emptyLLMApi,
    formatExtraDataForDisplay,
} from "./llmApiManager";

export async function registerPrefsScripts(_window: Window) {
    if (!addon.data.prefs) {
        addon.data.prefs = {
            window: _window,
            columns: [],
            rows: [],
        };
    } else {
        addon.data.prefs.window = _window;
    }
    if (!addon.data.llmApis) {
        addon.data.llmApis = {
            map: new Map<string, LLMApiData>(),
            cachedKeys: [],
        };
    }
    bindPrefEvents();
    initTableUI();
    initializeEngineConfig();
}

function bindPrefEvents() {
    const { window } = addon.data.prefs ?? {};
    if (!window) return;
    const doc = window.document;
    if (!doc) return;
    // 为SourceLangSelect和TargetLangSelect添加html:option
    const sourceLangSelect = doc.getElementById(
        `zotero-prefpane-${config.addonRef}-sourceLangSelect`,
    );
    const targetLangSelect = doc.getElementById(
        `zotero-prefpane-${config.addonRef}-targetLangSelect`,
    );
    for (const [langName, langCode] of Object.entries(lang_map)) {
        const option = doc.createElement("option");
        option.value = langCode;
        option.textContent = langName;
        sourceLangSelect?.appendChild(option.cloneNode(true));
        targetLangSelect?.appendChild(option.cloneNode(true));
    }
    // ********************* Engine *********************
    const groupbox = doc.querySelector("groupbox");
    if (groupbox) {
        groupbox.addEventListener("DOMContentLoaded", () => {
            setTimeout(() => {
                initializeEngineConfig();
            }, 200);
        });
    }
    doc
        .querySelector(`#zotero-prefpane-${config.addonRef}-engine`)
        ?.addEventListener("change", (e) => {
            const value = (e.target as HTMLInputElement).value;
            if (value) {
                setPref("engine", value);
                handleEngineChange(value);
            }
        });

    doc
        .querySelector(`#zotero-prefpane-${config.addonRef}-engineSelect`)
        ?.addEventListener("change", (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (value) {
                setPref("engine", value);
                handleEngineChange(value);
            }
        });

    // ********************* pdf1.x字体 *********************
    doc
        .querySelector(`#zotero-prefpane-${config.addonRef}-fontFile-clear`)
        ?.addEventListener("click", () => {
            setPref("fontFile", "");
        });
    doc
        .getElementById(`zotero-prefpane-${config.addonRef}-fontFile`)
        ?.addEventListener("change", function (event) {
            const file = (event.target as HTMLInputElement).files?.[0];
            ztoolkit.log("Selected font file:", getPref("fontFile"));
            if (file) {
                const validExtensions = [".ttf", ".otf", ".woff", ".woff2"];
                const extension = file.name
                    .slice(file.name.lastIndexOf("."))
                    .toLowerCase();
                if (!validExtensions.includes(extension)) {
                    alert(
                        "Invalid file type! Please select a .ttf, .otf, .woff, or .woff2 file.",
                    );
                    setPref("fontFile", "");

                    ztoolkit.log("Selected font file1:", file);
                } else {
                    setPref("fontFile", file.mozFullPath);
                    ztoolkit.log("Selected font file2:", getPref("fontFile"));
                }
            }
        });

    // ********************* LLM API 表格 *********************
    // LLM API 表格
    doc
        .querySelector(
            `#zotero-prefpane-${config.addonRef}-llmapi-table-container`,
        )
        ?.addEventListener("showing", () => {
            ztoolkit.log("LLM API 表格容器显示事件触发");
            updateLLMApiTableUI();
        });

    // 绑定 LLM API 相关按钮事件
    const addButton = doc.getElementById(
        `zotero-prefpane-${config.addonRef}-llmapi-add`,
    );
    const removeButton = doc.getElementById(
        `zotero-prefpane-${config.addonRef}-llmapi-remove`,
    );
    const editButton = doc.getElementById(
        `zotero-prefpane-${config.addonRef}-llmapi-edit`,
    );
    const activateButton = doc.getElementById(
        `zotero-prefpane-${config.addonRef}-llmapi-activate`,
    );
    const toTopButton = doc.getElementById(
        `zotero-prefpane-${config.addonRef}-llmapi-totop`,
    );
    addButton?.addEventListener("command", async () => {
        await openLLMApiEditDialog();
    });
    removeButton?.addEventListener("command", () => {
        const selectedKeys = getLLMApiSelection();
        selectedKeys.forEach((key) => {
            if (key) {
                llmApiManager.deleteLLMApi(key);
                addon.data.llmApis?.map.delete(key);
            }
        });
        updateCachedLLMApiKeys();
        saveLLMApisToPrefs();
        updateLLMApiTableUI();
    });
    editButton?.addEventListener("command", async () => {
        const selectedKeys = getLLMApiSelection();
        if (selectedKeys.length === 1) {
            await openLLMApiEditDialog(selectedKeys[0]);
        }
    });
    activateButton?.addEventListener("command", () => {
        const selectedKeys = getLLMApiSelection();
        if (selectedKeys.length === 1) {
            const key = selectedKeys[0];
            const llmApi = addon.data.llmApis?.map.get(key);
            if (llmApi) {
                if (llmApi.activate) {
                    llmApiManager.deactivateLLMApi(key);
                } else {
                    llmApiManager.activateLLMApi(key);
                }
                // 更新addon.data中的数据
                addon.data.llmApis?.map.set(key, llmApiManager.getLLMApi(key)!);
                // 保存到偏好设置
                saveLLMApisToPrefs();
                // 更新表格显示
                updateLLMApiTableUI();
            }
        }
    });
    toTopButton?.addEventListener("command", () => {
        // 将这个条目移动到所有条目的最上面
        const selectedKeys = getLLMApiSelection();
        if (selectedKeys.length === 1) {
            const key = selectedKeys[0];
            const llmApi = addon.data.llmApis?.map.get(key);
            if (llmApi) {
                const llmApis = Array.from(
                    addon.data.llmApis?.map.values() || [],
                );
                const index = llmApis.findIndex((llmApi) => llmApi.key === key);
                if (index !== -1) {
                    llmApis.splice(index, 1);
                    llmApis.unshift(llmApi);
                    addon.data.llmApis?.map.clear();
                    llmApis.forEach((llmApi) => {
                        addon.data.llmApis?.map.set(llmApi.key, llmApi);
                    });
                    updateCachedLLMApiKeys();
                    saveLLMApisToPrefs();
                    updateLLMApiTableUI();
                }
            }
        }
    });
}

// 初始化 LLM API 表格
export async function initTableUI() {
    if (!addon.data.prefs?.window) return;
    loadLLMApisFromPrefs();
    const renderLock = Zotero.Promise.defer();
    addon.data.prefs.tableHelper = new ztoolkit.VirtualizedTable(
        addon.data.prefs.window!,
    )
        .setContainerId(
            `zotero-prefpane-${config.addonRef}-llmapi-table-container`,
        )
        .setProp({
            id: `zotero-prefpane-${config.addonRef}-llmapi-table`,
            columns: [
                { dataKey: "service", label: "服务", width: 150 },
                { dataKey: "model", label: "模型", width: 150 },
                { dataKey: "apiUrl", label: "API URL", width: 180 },
                { dataKey: "apiKey", label: "API Key", width: 90 },
                { dataKey: "activate", label: "激活", width: 80 },
                { dataKey: "extraData", label: "额外参数", width: 120 },
            ],
            showHeader: true,
            multiSelect: true,
            staticColumns: false,
            disableFontSizeScaling: true,
        })
        .setProp(
            "getRowCount",
            () => addon.data.llmApis?.cachedKeys.length || 0,
        )
        .setProp("getRowData", getRowData)
        .setProp("onSelectionChange", (selection) => {
            const selectedKeys = getLLMApiSelection();
            addon.data.llmApis.selectedKey = selectedKeys[0];
            addon.data.prefs?.window?.document
                .querySelectorAll(".llmapi-selection")
                ?.forEach((e) =>
                    setButtonDisabled(
                        e as XULButtonElement,
                        selectedKeys.length === 0,
                    ),
                );
            addon.data.prefs?.window?.document
                .querySelectorAll(".llmapi-selection-single")
                ?.forEach((e) =>
                    setButtonDisabled(
                        e as XULButtonElement,
                        selectedKeys.length !== 1,
                    ),
                );
        })
        .setProp("onKeyDown", (event: KeyboardEvent) => {
            if (
                event.key == "Delete" ||
                (Zotero.isMac && event.key == "Backspace")
            ) {
                const selectedKeys = getLLMApiSelection();
                selectedKeys.forEach((key) => {
                    if (key) {
                        llmApiManager.deleteLLMApi(key);
                        addon.data.llmApis?.map.delete(key);
                    }
                });
                updateCachedLLMApiKeys();
                saveLLMApisToPrefs();
                updateLLMApiTableUI();
                return false;
            }
            return true;
        })
        .render(-1, () => {
            renderLock.resolve();
        });
    await renderLock.promise;
    updateLLMApiTableUI();
    // 强制刷新表格显示所有行;
    setTimeout(() => {
        ztoolkit.log("Forcing table refresh...");
        const tableHelper = (addon.data.prefs as any).tableHelper;
        if (tableHelper && tableHelper.treeInstance) {
            // 强制重新计算行数
            const rowCount = addon.data.llmApis?.cachedKeys.length || 0;
            // 强制重新渲染
            tableHelper.treeInstance.invalidate();
            tableHelper.render(-1, () => {
                ztoolkit.log("Forced table refresh completed");
            });
        }
    }, 500);
}

// 更新 LLM API 缓存键列表
function updateCachedLLMApiKeys() {
    if (!addon.data.llmApis) return;
    addon.data.llmApis.cachedKeys = Array.from(addon.data.llmApis.map.keys());
}

// 打开 LLM API 编辑对话框
async function openLLMApiEditDialog(key?: string) {
    const llmApi = key ? addon.data.llmApis?.map.get(key) : emptyLLMApi;
    if (!llmApi) {
        return false;
    }

    const dialogData = {
        service: llmApi.service || "openai",
        model: llmApi.model || "",
        apiKey: llmApi.apiKey || "",
        apiUrl: llmApi.apiUrl || "",
        activate: llmApi.activate || false,
        extraData: llmApi.extraData || {},
    };

    // 创建窗口参数
    const windowArgs: {
        _initPromise: any;
        data: {
            service: string;
            model: string;
            apiKey: string;
            apiUrl: string;
            activate: boolean;
            extraData: any;
        };
        isEdit: boolean;
        result?: {
            success: boolean;
            data: {
                service: string;
                model: string;
                apiKey: string;
                apiUrl: string;
                activate: boolean;
            };
            isEdit: boolean;
            originalKey?: string;
        };
    } = {
        _initPromise: Zotero.Promise.defer(),
        data: dialogData,
        isEdit: !!key,
    };

    // 打开XHTML对话框
    const dialogWindow = Zotero.getMainWindow().openDialog(
        `chrome://${config.addonRef}/content/llmApiEditor.xhtml`,
        `${config.addonRef}-llmApiEditor`,
        `chrome,centerscreen,resizable,status,dialog=no`,
        windowArgs,
    );
    if (!dialogWindow) {
        return false;
    }
    // 等待对话框初始化完成
    await windowArgs._initPromise.promise;
    // 等待对话框关闭
    const result = await new Promise<any>((resolve) => {
        const checkClosed = () => {
            if (dialogWindow.closed) {
                resolve(windowArgs.result);
            } else {
                setTimeout(checkClosed, 100);
            }
        };
        checkClosed();
    });

    if (!result || !result.success) {
        return false;
    }

    const userData = result.data;
    try {
        // 如果是编辑现有配置，使用现有key；否则创建新的key
        const newLLMApi: LLMApiData = {
            key: key || Zotero.Utilities.generateObjectKey(),
            service: userData.service || userData.serviceselect || "",
            model: userData.model || userData.modelselect || "",
            apiKey: userData.apiKey,
            apiUrl: userData.apiUrl,
            activate: userData.activate,
            extraData: userData.extraData || {},
        };
        // 添加到addon.data.llmApis
        if (addon.data.llmApis) {
            addon.data.llmApis.map.set(newLLMApi.key, newLLMApi);
            updateCachedLLMApiKeys();
        }
        // 更新llmApiManager
        llmApiManager.updateLLMApi(newLLMApi);
        // 保存到偏好设置
        saveLLMApisToPrefs();
        // 更新表格
        updateLLMApiTableUI();
        return true;
    } catch (error) {
        return false;
    }
}

// 保存 LLM APIs 到偏好设置
function saveLLMApisToPrefs() {
    if (!addon.data.llmApis) return;
    const llmApisArray = Array.from(addon.data.llmApis.map.values());
    const llmApisJson = JSON.stringify(llmApisArray);
    setPref("llmApis", llmApisJson as string);
}

// 从偏好设置加载 LLM APIs
export function loadLLMApisFromPrefs() {
    const llmApisJson = getPref("llmApis");
    if (!llmApisJson || typeof llmApisJson !== "string") {
        ztoolkit.log("No valid data found in prefs");
        return;
    }
    try {
        const llmApisArray = JSON.parse(llmApisJson);
        if (Array.isArray(llmApisArray)) {
            // 清空现有数据
            addon.data.llmApis?.map.clear();
            // 加载数据到addon.data.llmApis和llmApiManager
            llmApisArray.forEach((llmApi: LLMApiData) => {
                if (llmApi.key && llmApi.service) {
                    // 为旧数据设置默认值
                    if (llmApi.activate === undefined) {
                        llmApi.activate = false;
                    }
                    if (!llmApi.extraData) {
                        llmApi.extraData = {};
                    }
                    let key = llmApi.key;
                    if (!key) {
                        key = Zotero.Utilities.generateObjectKey();
                        llmApi.key = key;
                    }
                    addon.data.llmApis?.map.set(llmApi.key, llmApi);
                    llmApiManager.updateLLMApi(llmApi);
                }
            });
            updateCachedLLMApiKeys();
        } else {
            ztoolkit.log("Parsed data is not an array");
        }
    } catch (error) {
        ztoolkit.log("Error loading LLM APIs from prefs:", error);
    }
    ztoolkit.log("LLM APIs loaded from prefs:", addon.data.llmApis);
}

function updateLLMApiTableUI() {
    setTimeout(() => addon.data.prefs?.tableHelper?.treeInstance.invalidate());
}

function setButtonDisabled(button: XUL.Button, disabled: boolean) {
    if (button) {
        button.disabled = disabled;
    }
}

function getRowData(index: number) {
    const keys = addon.data.llmApis?.cachedKeys || [];
    let llmApi = emptyLLMApi;
    if (keys && keys.length > index) {
        const key = keys[index];
        llmApi = addon.data.llmApis?.map.get(key) || emptyLLMApi;
    }
    return {
        key: llmApi.key || "",
        service: llmApi.service || "",
        model: llmApi.model || "",
        apiUrl: llmApi.apiUrl || "",
        apiKey: llmApi.apiKey || "",
        extraData: formatExtraDataForDisplay(llmApi.extraData),
        activate: llmApi.activate ? "✅" : "",
    };
}

// 获取 LLM API 选择
function getLLMApiSelection() {
    const indices =
        addon.data.prefs?.tableHelper?.treeInstance?.selection.selected;
    if (!indices) {
        return [];
    }
    const keys = addon.data.llmApis?.cachedKeys || [];
    return Array.from(indices).map((i) => keys[i]) || [];
}

// ------------ pdf2zh 1.x & pdf2zh 2.x switch ------------
// 初始化引擎配置显示
function initializeEngineConfig() {
    const { window } = addon.data.prefs ?? {};
    if (!window) {
        ztoolkit.log("Window object not found");
        return;
    }
    // 延迟执行，确保DOM完全加载
    setTimeout(() => {
        const engineSelect = window.document.querySelector(
            `#zotero-prefpane-${config.addonRef}-engineSelect`,
        ) as HTMLSelectElement | null;
        if (engineSelect) {
            const currentEngine = engineSelect.value;
            handleEngineChange(currentEngine);
        }
    }, 100);
}

// 引擎切换处理函数
function handleEngineChange(engine: string) {
    ztoolkit.log("引擎切换处理函数", engine);
    const { window } = addon.data.prefs ?? {};
    if (!window) {
        ztoolkit.log("窗口对象不存在");
        return;
    }
    const pdf2xConfig = window.document.getElementById(
        "pdf2x-config",
    ) as HTMLElement;
    const pdf1xConfig = window.document.getElementById(
        "pdf1x-config",
    ) as HTMLElement;
    if (engine === "pdf2zh_next") {
        pdf2xConfig.style.display = "block";
        pdf1xConfig.style.display = "none";
    } else {
        pdf2xConfig.style.display = "none";
        pdf1xConfig.style.display = "block";
    }
}

const lang_map = {
    English: "en",
    "Simplified Chinese": "zh-CN",
    "Traditional Chinese - Hong Kong": "zh-HK",
    "Traditional Chinese - Taiwan": "zh-TW",
    Japanese: "ja",
    Korean: "ko",
    Polish: "pl",
    Russian: "ru",
    Spanish: "es",
    Portuguese: "pt",
    "Brazilian Portuguese": "pt-BR",
    French: "fr",
    Malay: "ms",
    Indonesian: "id",
    Turkmen: "tk",
    "Filipino (Tagalog)": "tl",
    Vietnamese: "vi",
    "Kazakh (Latin)": "kk",
    German: "de",
    Dutch: "nl",
    Irish: "ga",
    Italian: "it",
    Greek: "el",
    Swedish: "sv",
    Danish: "da",
    Norwegian: "no",
    Icelandic: "is",
    Finnish: "fi",
    Ukrainian: "uk",
    Czech: "cs",
    Romanian: "ro",
    Hungarian: "hu",
    Slovak: "sk",
    Croatian: "hr",
    Estonian: "et",
    Latvian: "lv",
    Lithuanian: "lt",
    Belarusian: "be",
    Macedonian: "mk",
    Albanian: "sq",
    "Serbian (Cyrillic)": "sr",
    Slovenian: "sl",
    Catalan: "ca",
    Bulgarian: "bg",
    Maltese: "mt",
    Swahili: "sw",
    Amharic: "am",
    Oromo: "om",
    Tigrinya: "ti",
    "Haitian Creole": "ht",
    Latin: "la",
    Lao: "lo",
    Malayalam: "ml",
    Gujarati: "gu",
    Thai: "th",
    Burmese: "my",
    Tamil: "ta",
    Telugu: "te",
    Oriya: "or",
    Armenian: "hy",
    "Mongolian (Cyrillic)": "mn",
    Georgian: "ka",
    Khmer: "km",
    Bosnian: "bs",
    Luxembourgish: "lb",
    Romansh: "rm",
    Turkish: "tr",
    Sinhala: "si",
    Uzbek: "uz",
    Kyrgyz: "ky",
    Tajik: "tg",
    Abkhazian: "ab",
    Afar: "aa",
    Afrikaans: "af",
    Akan: "ak",
    Aragonese: "an",
    Avaric: "av",
    Ewe: "ee",
    Aymara: "ay",
    Ojibwa: "oj",
    Occitan: "oc",
    Ossetian: "os",
    Pali: "pi",
    Bashkir: "ba",
    Basque: "eu",
    Breton: "br",
    Chamorro: "ch",
    Chechen: "ce",
    Chuvash: "cv",
    Tswana: "tn",
    "Ndebele, South": "nr",
    Ndonga: "ng",
    Faroese: "fo",
    Fijian: "fj",
    "Frisian, Western": "fy",
    Ganda: "lg",
    Kongo: "kg",
    Kalaallisut: "kl",
    "Church Slavic": "cu",
    Guarani: "gn",
    Interlingua: "ia",
    Herero: "hz",
    Kikuyu: "ki",
    Rundi: "rn",
    Kinyarwanda: "rw",
    Galician: "gl",
    Kanuri: "kr",
    Cornish: "kw",
    Komi: "kv",
    Xhosa: "xh",
    Corsican: "co",
    Cree: "cr",
    Quechua: "qu",
    "Kurdish (Latin)": "ku",
    Kuanyama: "kj",
    Limburgan: "li",
    Lingala: "ln",
    Manx: "gv",
    Malagasy: "mg",
    Marshallese: "mh",
    Maori: "mi",
    Navajo: "nv",
    Nauru: "na",
    Nyanja: "ny",
    "Norwegian Nynorsk": "nn",
    Sardinian: "sc",
    "Northern Sami": "se",
    Samoan: "sm",
    Sango: "sg",
    Shona: "sn",
    Esperanto: "eo",
    "Scottish Gaelic": "gd",
    Somali: "so",
    "Southern Sotho": "st",
    Tatar: "tt",
    Tahitian: "ty",
    Tongan: "to",
    Twi: "tw",
    Walloon: "wa",
    Welsh: "cy",
    Venda: "ve",
    Volapük: "vo",
    Interlingue: "ie",
    "Hiri Motu": "ho",
    Igbo: "ig",
    Ido: "io",
    Inuktitut: "iu",
    Inupiaq: "ik",
    "Sichuan Yi": "ii",
    Yoruba: "yo",
    Zhuang: "za",
    Tsonga: "ts",
    Zulu: "zu",
};
