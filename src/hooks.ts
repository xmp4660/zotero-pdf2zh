// lifecycle hooks
import {
    BasicExampleFactory,
    HelperExampleFactory,
    UIExampleFactory,
} from "./modules/examples";
import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPrefsScripts } from "./modules/preferenceScript";

async function onStartup() {
    await Promise.all([
        Zotero.initializationPromise,
        Zotero.unlockPromise,
        Zotero.uiReadyPromise,
    ]);

    initLocale();

    BasicExampleFactory.registerPrefs();

    BasicExampleFactory.registerNotifier();

    await Promise.all(
        Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
    );
}

async function onMainWindowLoad(win: Window): Promise<void> {
    // Create ztoolkit for every window
    addon.data.ztoolkit = createZToolkit();

    // @ts-ignore This is a moz feature
    win.MozXULElement.insertFTLIfNeeded(
        `${addon.data.config.addonRef}-mainWindow.ftl`,
    );

    const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
        closeOnClick: true,
        closeTime: -1,
    })
        .createLine({
            text: getString("startup-begin"),
            type: "default",
            progress: 0,
        })
        .show();

    await Zotero.Promise.delay(1000);
    popupWin.changeLine({
        progress: 30,
        text: `[30%] ${getString("startup-begin")}`,
    });

    UIExampleFactory.registerRightClickMenuItem();

    await Zotero.Promise.delay(1000);

    popupWin.changeLine({
        progress: 100,
        text: `[100%] ${getString("startup-finish")}`,
    });
    popupWin.startCloseTimer(5000);

    // 渲染偏好设置界面
    updatePrefsUI();
}

async function updatePrefsUI() {
    const renderLock = ztoolkit.getGlobal("Zotero").Promise.defer();
    if (addon.data.prefs?.window == undefined) return;
    const tableHelper = new ztoolkit.VirtualizedTable(addon.data.prefs?.window)
        .setContainerId(`${addon.data.config.addonRef}-table-container`)
        .setProp({
            id: `${addon.data.config.addonRef}-prefs-table`,
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
        .setProp("onSelectionChange", (selection) => {
            new ztoolkit.ProgressWindow(addon.data.config.addonName)
                .createLine({
                    text: `Selected line: ${addon.data.prefs?.rows
                        .filter((v, i) => selection.isSelected(i))
                        .map((row) => row.title)
                        .join(",")}`,
                    progress: 100,
                })
                .show();
        })
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
        .setProp(
            "getRowString",
            (index) => addon.data.prefs?.rows[index].title || "",
        )
        .render(-1, () => {
            renderLock.resolve();
        });

    await renderLock.promise;
    ztoolkit.log("Preference table rendered!");
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
    switch (type) {
        case "load":
            registerPrefsScripts(data.window);
            break;
        default:
            return;
    }
}

async function onMainWindowUnload(win: Window): Promise<void> {
    ztoolkit.unregisterAll();
    addon.data.dialog?.window?.close();
}

function onShutdown(): void {
    ztoolkit.unregisterAll();
    addon.data.dialog?.window?.close();
    // Remove addon object
    addon.data.alive = false;
    // @ts-ignore - Plugin instance is not typed
    delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
    event: string,
    type: string,
    ids: Array<string | number>,
    extraData: { [key: string]: any },
) {
    // You can add your code to the corresponding notify type
    //   ztoolkit.log("notify", event, type, ids, extraData);
    //   if (
    //     event == "select" &&
    //     type == "tab" &&
    //     extraData[ids[0]].type == "reader"
    //   ) {
    //     BasicExampleFactory.exampleNotifierCallback();
    //   } else {
    return;
    //   }
}

function onShortcuts(type: string) {
    switch (type) {
        default:
            break;
    }
}

function onDialogEvents(type: string) {
    switch (type) {
        case "translatePDF":
            HelperExampleFactory.translatePDF();
            break;
        default:
            break;
    }
}

export default {
    onStartup,
    onShutdown,
    onMainWindowLoad,
    onMainWindowUnload,
    onNotify,
    onPrefsEvent,
    onShortcuts,
    onDialogEvents,
};
