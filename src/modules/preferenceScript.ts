import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { setPref, getPref } from "../utils/prefs";

// 定义偏好设置键名的常量
const PREF_KEYS = {
    MONO: "mono",
    DUAL: "dual",
    MONO_CUT: "mono_cut",
    DUAL_CUT: "dual-cut",
    COMPARE: "compare",
    RENAME: "rename",
    SERVER_IP: "serverip",
    SERVICE: "service",
    ENGINE: "engine",
    THREAD_NUM: "threadNum",
    OUTPUT_PATH: "outputPath",
    CONFIG_PATH: "configPath",
    SERVICE_SELECT: "serviceselect",
    ENGINE_SELECT: "engineselect",
    // 其他键名...
} as const;

// 定义事件绑定配置
const CHECKBOX_CONFIGS = [
    { selectorSuffix: "mono", prefKey: PREF_KEYS.MONO },
    { selectorSuffix: "dual", prefKey: PREF_KEYS.DUAL },
    { selectorSuffix: "mono-cut", prefKey: PREF_KEYS.MONO_CUT },
    { selectorSuffix: "dual-cut", prefKey: PREF_KEYS.DUAL_CUT },
    { selectorSuffix: "compare", prefKey: PREF_KEYS.COMPARE },
    { selectorSuffix: "rename", prefKey: PREF_KEYS.RENAME },
    { selectorSuffix: "mono-open", prefKey: "mono-open" },
    { selectorSuffix: "dual-open", prefKey: "dual-open" },
    { selectorSuffix: "mono-cut-open", prefKey: "mono-cut-open" },
    { selectorSuffix: "dual-cut-open", prefKey: "dual-cut-open" },
    { selectorSuffix: "compare-open", prefKey: "compare-open" },
];

const INPUT_CONFIGS = [
    { selectorSuffix: "serverip", prefKey: PREF_KEYS.SERVER_IP },
    { selectorSuffix: "service", prefKey: PREF_KEYS.SERVICE },
    { selectorSuffix: "threadNum", prefKey: PREF_KEYS.THREAD_NUM },
    { selectorSuffix: "outputPath", prefKey: PREF_KEYS.OUTPUT_PATH },
    { selectorSuffix: "configPath", prefKey: PREF_KEYS.CONFIG_PATH },
];

const SELECT_CONFIGS = [
    { selectorSuffix: "serviceselect", prefKey: PREF_KEYS.SERVICE_SELECT },
    { selectorSuffix: "engineselect", prefKey: PREF_KEYS.ENGINE_SELECT },
];

export async function registerPrefsScripts(_window: Window) {
    // This function is called when the prefs window is opened
    // See addon/content/preferences.xhtml onpaneload
    if (!addon.data.prefs) {
        addon.data.prefs = {
            window: _window,
            columns: [
                {
                    dataKey: "title",
                    label: getString("prefs-table-title"),
                    fixedWidth: true,
                    width: 100,
                },
                {
                    dataKey: "detail",
                    label: getString("prefs-table-detail"),
                },
            ],
            rows: [
                {
                    title: "python server ip",
                    detail: "enter your python server ip: (e.g: http://localhost:8888",
                },
            ],
        };
    } else {
        addon.data.prefs.window = _window;
    }
    ztoolkit.log("Preference window opened!");
    updatePrefsUI();
    bindPrefEvents();
}

async function updatePrefsUI() {
    // You can initialize some UI elements on prefs window
    // with addon.data.prefs.window.document
    // Or bind some events to the elements
    const renderLock = ztoolkit.getGlobal("Zotero").Promise.defer();
    if (addon.data.prefs?.window == undefined) return;
    const tableHelper = new ztoolkit.VirtualizedTable(addon.data.prefs?.window)
        .setContainerId(`${config.addonRef}-table-container`)
        .setProp({
            id: `${config.addonRef}-prefs-table`,
            // Do not use setLocale, as it modifies the Zotero.Intl.strings
            // Set locales directly to columns
            columns: addon.data.prefs?.columns,
            showHeader: true,
            multiSelect: true,
            staticColumns: true,
            disableFontSizeScaling: true,
        })
        .setProp("getRowCount", () => addon.data.prefs?.rows.length || 0)
        .setProp(
            "getRowData",
            (index) =>
                addon.data.prefs?.rows[index] || {
                    title: "no data",
                    detail: "no data",
                },
        )
        // Show a progress window when selection changes
        .setProp("onSelectionChange", (selection) => {
            new ztoolkit.ProgressWindow(config.addonName)
                .createLine({
                    text: `Selected line: ${addon.data.prefs?.rows
                        .filter((v, i) => selection.isSelected(i))
                        .map((row) => row.title)
                        .join(",")}`,
                    progress: 100,
                })
                .show();
        })
        // When pressing delete, delete selected line and refresh table.
        // Returning false to prevent default event.
        .setProp("onKeyDown", (event: KeyboardEvent) => {
            if (
                event.key == "Delete" ||
                (Zotero.isMac && event.key == "Backspace")
            ) {
                addon.data.prefs!.rows =
                    addon.data.prefs?.rows.filter(
                        (v, i) =>
                            !tableHelper.treeInstance.selection.isSelected(i),
                    ) || [];
                tableHelper.render();
                return false;
            }
            return true;
        })
        // For find-as-you-type
        .setProp(
            "getRowString",
            (index) => addon.data.prefs?.rows[index].title || "",
        )
        // Render the table.
        .render(-1, () => {
            renderLock.resolve();
        });
    await renderLock.promise;
    ztoolkit.log("Preference table rendered!");
}

function bindPrefEvents() {
    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-mono`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("mono", (e.target as XUL.Checkbox).checked);
    //     });
    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-dual`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("dual", (e.target as XUL.Checkbox).checked);
    //     });

    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-mono-cut`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("mono_cut", (e.target as XUL.Checkbox).checked);
    //     });

    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-dual-cut`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("dual-cut", (e.target as XUL.Checkbox).checked);
    //     });

    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-compare`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("compare", (e.target as XUL.Checkbox).checked);
    //     });

    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-rename`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("rename", (e.target as XUL.Checkbox).checked);
    //     });

    // // ###### open #####
    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-mono-open`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("mono-open", (e.target as XUL.Checkbox).checked);
    //     });
    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-dual-open`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("dual-open", (e.target as XUL.Checkbox).checked);
    //     });
    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-mono-cut-open`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("mono-cut-open", (e.target as XUL.Checkbox).checked);
    //     });
    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-dual-cut-open`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("dual-cut-open", (e.target as XUL.Checkbox).checked);
    //     });
    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-compare-open`,
    //     )
    //     ?.addEventListener("command", (e) => {
    //         setPref("compare-open", (e.target as XUL.Checkbox).checked);
    //     });
    // // ########################################################
    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-serverip`,
    //     )
    //     ?.addEventListener("change", (e) => {
    //         setPref("serverip", (e.target as HTMLInputElement).value);
    //     });

    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-engine`,
    //     )
    //     ?.addEventListener("change", (e) => {
    //         setPref("engine", (e.target as HTMLInputElement).value);
    //     });

    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-threadNum`,
    //     )
    //     ?.addEventListener("change", (e) => {
    //         setPref("threadNum", (e.target as HTMLInputElement).value);
    //     });

    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-outputPath`,
    //     )
    //     ?.addEventListener("change", (e) => {
    //         setPref("outputPath", (e.target as HTMLInputElement).value);
    //     });

    // addon.data
    //     .prefs!.window.document.querySelector(
    //         `#zotero-prefpane-${config.addonRef}-configPath`,
    //     )
    //     ?.addEventListener("change", (e) => {
    //         setPref("configPath", (e.target as HTMLInputElement).value);
    //     });

    // // engine
    // addon.data.prefs?.window.document
    //     .querySelector(`#zotero-prefpane-${config.addonRef}-engineselect`)
    //     ?.addEventListener("change", (e) => {
    //         setPref("engineselect", (e.target as HTMLSelectElement).value);
    //         setPref("engine", (e.target as HTMLSelectElement).value);
    //     });

    // addon.data.prefs?.window.document
    //     .querySelector(`#zotero-prefpane-${config.addonRef}-engine`)
    //     ?.addEventListener("change", (e) => {
    //         setPref("engine", (e.target as HTMLInputElement).value);
    //     });

    // // service
    // addon.data.prefs?.window.document
    //     .querySelector(`#zotero-prefpane-${config.addonRef}-serviceselect`)
    //     ?.addEventListener("change", (e) => {
    //         setPref("serviceselect", (e.target as HTMLSelectElement).value);
    //         setPref("service", (e.target as HTMLSelectElement).value);
    //     });

    // addon.data.prefs?.window.document
    //     .querySelector(`#zotero-prefpane-${config.addonRef}-service`)
    //     ?.addEventListener("change", (e) => {
    //         setPref("service", (e.target as HTMLInputElement).value);
    //     });

    const { window } = addon.data.prefs ?? {};
    if (!window) return;

    // 处理复选框事件
    CHECKBOX_CONFIGS.forEach(({ selectorSuffix, prefKey }) => {
        const element = window.document.querySelector(
            `#zotero-prefpane-${config.addonRef}-${selectorSuffix}`,
        ) as XUL.Checkbox | null;
        element?.addEventListener("command", (e) => {
            setPref(prefKey, (e.target as XUL.Checkbox).checked);
        });
    });

    // 处理输入框事件
    INPUT_CONFIGS.forEach(({ selectorSuffix, prefKey }) => {
        const element = window.document.querySelector(
            `#zotero-prefpane-${config.addonRef}-${selectorSuffix}`,
        ) as HTMLInputElement | null;
        element?.addEventListener("change", (e) => {
            setPref(prefKey, (e.target as HTMLInputElement).value);
        });
    });

    // 处理下拉框事件
    SELECT_CONFIGS.forEach(({ selectorSuffix, prefKey }) => {
        const element = window.document.querySelector(
            `#zotero-prefpane-${config.addonRef}-${selectorSuffix}`,
        ) as HTMLSelectElement | null;
        element?.addEventListener("change", (e) => {
            const value = (e.target as HTMLSelectElement).value;
            setPref(prefKey, value);
            // 特殊处理服务选择
            if (prefKey == PREF_KEYS.SERVICE_SELECT) {
                setPref(PREF_KEYS.SERVICE, value);
            }
            if (prefKey == PREF_KEYS.ENGINE_SELECT) {
                setPref(PREF_KEYS.ENGINE, value);
            }
        });
    });
}
