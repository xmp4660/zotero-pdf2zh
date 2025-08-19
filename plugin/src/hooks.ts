// lifecycle hooks
import { PDF2zhBasicFactory, PDF2zhUIFactory } from "./modules/pdf2zh";
import { PDF2zhHelperFactory } from "./modules/pdf2zhHelper";
import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPrefsScripts, initTableUI } from "./modules/preferenceScript";

async function onStartup() {
    await Promise.all([
        Zotero.initializationPromise,
        Zotero.unlockPromise,
        Zotero.uiReadyPromise,
    ]);
    initLocale(); // 初始化多语言
    PDF2zhBasicFactory.registerPrefs(); // 注册偏好设置
    await Promise.all(
        Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
    );
}

async function onMainWindowLoad(win: Window): Promise<void> {
    addon.data.ztoolkit = createZToolkit(); // Create ztoolkit for every window
    // 注册右键菜单, 显示加载弹窗
    PDF2zhUIFactory.registerRightClickMenuItem();
    await Zotero.Promise.delay(1000);
    const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
        closeOnClick: true,
        closeTime: -1,
    })
        .createLine({
            text: `[100%] ${getString("startup-finish")}`,
            type: "default",
            progress: 100,
        })
        .show();
    popupWin.startCloseTimer(500);

    // 渲染偏好设置的LLM API表格, 避免第一次打开Preference页面时LLM Config条目未完全加载
    // TOCHECK: 目前可以有效解决问题, 但是关闭Preference后这个初始化的内容不会被删除吗??
    initTableUI();
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
    return;
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
            PDF2zhHelperFactory.processWorker("translate");
            break;
        case "cropPDF":
            PDF2zhHelperFactory.processWorker("crop");
            break;
        case "crop-comparePDF":
            PDF2zhHelperFactory.processWorker("crop-compare");
            break;
        case "comparePDF":
            PDF2zhHelperFactory.processWorker("compare");
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
