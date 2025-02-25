import { getLocaleID, getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import axios from "axios";
interface TranslationResponse {
    status: string;
    translatedPath1: string;
    translatedPath2: string;
    message: string;
}

function example(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
) {
    const original = descriptor.value;
    descriptor.value = function (...args: any) {
        try {
            ztoolkit.log(
                `Calling example ${target.name}.${String(propertyKey)}`,
            );
            return original.apply(this, args);
        } catch (e) {
            ztoolkit.log(
                `Error in example ${target.name}.${String(propertyKey)}`,
                e,
            );
            throw e;
        }
    };
    return descriptor;
}

export class BasicExampleFactory {
    @example
    static registerNotifier() {
        const callback = {
            notify: async (
                event: string,
                type: string,
                ids: number[] | string[],
                extraData: { [key: string]: any },
            ) => {
                if (!addon?.data.alive) {
                    this.unregisterNotifier(notifierID);
                    return;
                }
                addon.hooks.onNotify(event, type, ids, extraData);
            },
        };
        const notifierID = Zotero.Notifier.registerObserver(callback, [
            "tab",
            "item",
            "file",
        ]);

        Zotero.Plugins.addObserver({
            shutdown: ({ id }) => {
                if (id === addon.data.config.addonID)
                    this.unregisterNotifier(notifierID);
            },
        });
    }

    @example
    static exampleNotifierCallback() {
        new ztoolkit.ProgressWindow(addon.data.config.addonName)
            .createLine({
                text: "Open Tab Detected!",
                type: "success",
                progress: 100,
            })
            .show();
    }

    @example
    private static unregisterNotifier(notifierID: string) {
        Zotero.Notifier.unregisterObserver(notifierID);
    }

    @example
    static registerPrefs() {
        Zotero.PreferencePanes.register({
            pluginID: addon.data.config.addonID,
            src: rootURI + "content/preferences.xhtml",
            label: getString("prefs-title"),
            image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`,
        });
    }
}

export class UIExampleFactory {
    @example
    static registerRightClickMenuItem() {
        const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.svg`;
        ztoolkit.Menu.register("item", {
            tag: "menuitem",
            id: "zotero-itemmenu-translate-pdf",
            label: "PDF2zh: Translate PDF",
            commandListener: (ev) => addon.hooks.onDialogEvents("translatePDF"),
            icon: menuIcon,
        });
        ztoolkit.Menu.register("item", {
            tag: "menuitem",
            id: "zotero-itemmenu-cut-pdf",
            label: "PDF2zh: Cut PDF",
            commandListener: (ev) => addon.hooks.onDialogEvents("cutPDF"),
            icon: menuIcon,
        });
        ztoolkit.Menu.register("item", {
            tag: "menuitem",
            id: "zotero-itemmenu-compre-pdf",
            label: "PDF2zh: 中英双栏对照",
            commandListener: (ev) => addon.hooks.onDialogEvents("comparePDF"),
            icon: menuIcon,
        });
    }
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// 安全的 exists 检查函数
async function safeExists(path: string) {
    try {
        return await IOUtils.exists(path);
    } catch (error) {
        ztoolkit.log(`检查路径 ${path} 时出错:`, error);
        return false;
    }
}

export class HelperExampleFactory {
    static async fetchPDF(
        fileName: string,
        serverUrl: string,
        item: Zotero.Item,
        title: string = "",
        rename: string = "false",
        open: string = "false",
    ) {
        const response = await axios.get(
            serverUrl + "/translatedFile/" + fileName,
            {
                responseType: "arraybuffer",
            },
        );
        const uint8Array = new Uint8Array(response.data);
        const tempDir = PathUtils.join(PathUtils.tempDir, fileName);
        IOUtils.write(tempDir, uint8Array);
        await HelperExampleFactory.addAttachmentToItem(
            item,
            tempDir,
            title,
            rename,
            open,
        );
        IOUtils.remove(tempDir);
    }

    @example
    static async translatePDF() {
        let serverUrl = getPref("serverip")?.toString();
        ztoolkit.log("server url:", serverUrl);
        if (!serverUrl) {
            ztoolkit.getGlobal("alert")("请在首选项中配置 Python 服务器地址。");
            return null;
        }
        if (serverUrl.endsWith("/")) {
            serverUrl = serverUrl.slice(0, -1);
        }
        if (serverUrl.endsWith("/translate")) {
            serverUrl = serverUrl.slice(0, -10);
        }

        let threadNum = getPref("threadNum")?.toString();
        if (!threadNum) {
            threadNum = "";
        }
        let engine = getPref("engine")?.toString();
        if (!engine) {
            engine = "";
        }

        const mono = getPref("mono")?.toString();
        const dual = getPref("dual")?.toString();
        const mono_cut = getPref("mono-cut")?.toString();
        const dual_cut = getPref("dual-cut")?.toString();
        const compare = getPref("compare")?.toString();
        const rename = getPref("rename")?.toString();
        const mono_open = getPref("mono-open")?.toString();
        const dual_open = getPref("dual-open")?.toString();
        const mono_cut_open = getPref("mono-cut-open")?.toString();
        const dual_cut_open = getPref("dual-cut-open")?.toString();
        const compare_open = getPref("compare-open")?.toString();

        let outputPath = getPref("outputPath")?.toString();
        if (!outputPath) {
            outputPath = "";
        }
        let configPath = getPref("configPath")?.toString();
        if (!configPath) {
            configPath = "";
        }
        try {
            const pane = ztoolkit.getGlobal("ZoteroPane");
            const selectedItems = pane.getSelectedItems();
            if (selectedItems.length === 0) {
                ztoolkit.getGlobal("alert")("请先选择一个条目或附件。");
                return;
            }
            for (const item of selectedItems) {
                let attachItem;
                if (item.isAttachment()) {
                    attachItem = item;
                } else if (item.isRegularItem()) {
                    const bestItem = await item.getBestAttachment();
                    attachItem = bestItem;
                }
                if (!attachItem) {
                    continue;
                }
                const filepath = attachItem.getFilePath();
                if (!filepath || !filepath.endsWith(".pdf")) {
                    ztoolkit.getGlobal("alert")("请选择一个 PDF 附件。");
                    return;
                }
                if (!filepath || (await IOUtils.exists(filepath))) {
                    const contentRaw = await IOUtils.read(filepath);
                    const blob = new Blob([contentRaw], {
                        type: "application/pdf",
                    });
                    const base64Blob = await blobToBase64(blob);
                    const data = {
                        filePath: filepath,
                        fileContent: base64Blob,
                        threadNum: threadNum,
                        engine: engine,
                        outputPath: outputPath,
                        configPath: configPath,
                        mono: mono,
                        dual: dual,
                        mono_cut: mono_cut,
                        dual_cut: dual_cut,
                        compare: compare,
                    };
                    const response = await fetch(serverUrl + "/translate", {
                        // 发送翻译请求
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(data),
                    });
                    if (!response.ok) {
                        throw new Error(`服务器响应失败: ${response.ok}`);
                    }
                    const jsonString = await response.text();
                    const result: TranslationResponse = JSON.parse(jsonString);
                    // 以下是新脚本的处理方式
                    const fileName = PathUtils.filename(filepath);
                    const fileName1 = fileName.replace(".pdf", "-mono.pdf");
                    const fileName2 = fileName.replace(".pdf", "-dual.pdf");
                    const fileName3 = fileName.replace(".pdf", "-mono-cut.pdf");
                    const fileName4 = fileName.replace(".pdf", "-dual-cut.pdf");
                    const fileName5 = fileName.replace(
                        ".pdf",
                        "-dual-compare.pdf",
                    );
                    if (result.status === "success") {
                        if (mono == "true") {
                            await HelperExampleFactory.fetchPDF(
                                fileName1,
                                serverUrl,
                                item,
                                "mono",
                                rename,
                                mono_open,
                            );
                        }
                        if (dual === "true") {
                            await HelperExampleFactory.fetchPDF(
                                fileName2,
                                serverUrl,
                                item,
                                "dual",
                                rename,
                                dual_open,
                            );
                        }
                        if (mono_cut === "true") {
                            await HelperExampleFactory.fetchPDF(
                                fileName3,
                                serverUrl,
                                item,
                                "mono-cut",
                                rename,
                                mono_cut_open,
                            );
                        }
                        if (dual_cut === "true") {
                            HelperExampleFactory.fetchPDF(
                                fileName4,
                                serverUrl,
                                item,
                                "dual-cut",
                                rename,
                                dual_cut_open,
                            );
                        }
                        if (compare === "true") {
                            await HelperExampleFactory.fetchPDF(
                                fileName5,
                                serverUrl,
                                item,
                                "dual-compare",
                                rename,
                                compare_open,
                            );
                        }
                    }
                }
            }
        } catch (error) {
            ztoolkit.getGlobal("alert")(
                "zotero-pdf2zh(remote) 发生错误: \n" + error,
            );
            return null;
        }
    }

    @example
    static async cutPDF() {
        let serverUrl = getPref("serverip")?.toString();
        if (!serverUrl) {
            ztoolkit.getGlobal("alert")("请在首选项中配置 Python 服务器地址。");
            return null;
        }
        if (serverUrl.endsWith("/")) {
            serverUrl = serverUrl.slice(0, -1);
        }
        if (serverUrl.endsWith("/translate")) {
            serverUrl = serverUrl.slice(0, -10);
        }
        ztoolkit.log("server url:", serverUrl);

        let threadNum = getPref("threadNum")?.toString();
        if (!threadNum) {
            threadNum = "";
        }
        let engine = getPref("engine")?.toString();
        if (!engine) {
            engine = "";
        }
        let outputPath = getPref("outputPath")?.toString();
        let configPath = getPref("configPath")?.toString();
        if (!outputPath) {
            outputPath = "";
        }
        if (!configPath) {
            configPath = "";
        }
        const rename = getPref("rename")?.toString();
        const mono_open = getPref("mono-open")?.toString();
        const dual_open = getPref("dual-open")?.toString();
        const mono_cut_open = getPref("mono-cut-open")?.toString();
        const dual_cut_open = getPref("dual-cut-open")?.toString();
        const compare_open = getPref("compare-open")?.toString();
        try {
            const pane = ztoolkit.getGlobal("ZoteroPane");
            const selectedItems = pane.getSelectedItems();
            if (selectedItems.length === 0) {
                ztoolkit.getGlobal("alert")("请先选择一个条目或附件。");
                return;
            }

            for (const item of selectedItems) {
                let attachItem;
                if (item.isAttachment()) {
                    attachItem = item;
                } else if (item.isRegularItem()) {
                    const bestItem = await item.getBestAttachment();
                    attachItem = bestItem;
                }
                if (!attachItem) {
                    continue;
                }
                const filepath = attachItem.getFilePath();
                if (!filepath || !filepath.endsWith(".pdf")) {
                    ztoolkit.getGlobal("alert")("请选择一个 PDF 附件。");
                    return;
                }
                if (!filepath || (await IOUtils.exists(filepath))) {
                    const contentRaw = await IOUtils.read(filepath);
                    const blob = new Blob([contentRaw], {
                        type: "application/pdf",
                    });
                    const base64Blob = await blobToBase64(blob);
                    const data = {
                        filePath: filepath,
                        fileContent: base64Blob,
                        threadNum: threadNum,
                        engine: engine,
                        outputPath: outputPath,
                        configPath: configPath,
                    };
                    const response = await fetch(serverUrl + "/cut", {
                        // 发送翻译请求
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(data),
                    });
                    if (!response.ok) {
                        throw new Error(`服务器响应失败: ${response.ok}`);
                    }
                    const jsonString = await response.text();
                    const result: TranslationResponse = JSON.parse(jsonString);
                    const fileName = PathUtils.filename(filepath);
                    const fileName_cut = fileName.replace(".pdf", "-cut.pdf");
                    let title = "";
                    let open = "";
                    if (fileName_cut.indexOf("-mono") != -1) {
                        title = "mono-cut";
                        if (mono_cut_open == "true") {
                            open = "true";
                        }
                    }
                    if (fileName_cut.indexOf("-dual") != -1) {
                        title = "dual-cut";
                        if (dual_cut_open == "true") {
                            open = "true";
                        }
                    }
                    if (result.status === "success") {
                        await Promise.all([
                            HelperExampleFactory.fetchPDF(
                                fileName_cut,
                                serverUrl,
                                item,
                                title,
                                rename,
                                open,
                            ),
                        ]);
                    }
                }
            }
        } catch (error) {
            ztoolkit.getGlobal("alert")(
                "zotero-pdf2zh(cut) 发生错误: \n" + error,
            );
            return null;
        }
    }
    @example
    static async comparePDF() {
        let serverUrl = getPref("serverip")?.toString();
        ztoolkit.log("server url:", serverUrl);
        if (!serverUrl) {
            ztoolkit.getGlobal("alert")("请在首选项中配置 Python 服务器地址。");
            return null;
        }
        if (serverUrl.endsWith("/")) {
            serverUrl = serverUrl.slice(0, -1);
        }
        if (serverUrl.endsWith("/translate")) {
            serverUrl = serverUrl.slice(0, -10);
        }

        let threadNum = getPref("threadNum")?.toString();
        if (!threadNum) {
            threadNum = "";
        }
        let engine = getPref("engine")?.toString();
        if (!engine) {
            engine = "";
        }
        let outputPath = getPref("outputPath")?.toString();
        let configPath = getPref("configPath")?.toString();
        if (!outputPath) {
            outputPath = "";
        }
        if (!configPath) {
            configPath = "";
        }
        const rename = getPref("rename")?.toString();
        const mono_open = getPref("mono-open")?.toString();
        const dual_open = getPref("dual-open")?.toString();
        const mono_cut_open = getPref("mono-cut-open")?.toString();
        const dual_cut_open = getPref("dual-cut-open")?.toString();
        const compare_open = getPref("compare-open")?.toString();
        try {
            const pane = ztoolkit.getGlobal("ZoteroPane");
            const selectedItems = pane.getSelectedItems();
            if (selectedItems.length === 0) {
                ztoolkit.getGlobal("alert")("请先选择一个条目或附件。");
                return;
            }

            for (const item of selectedItems) {
                let attachItem;
                if (item.isAttachment()) {
                    attachItem = item;
                } else if (item.isRegularItem()) {
                    const bestItem = await item.getBestAttachment();
                    attachItem = bestItem;
                }
                if (!attachItem) {
                    continue;
                }
                const filepath = attachItem.getFilePath();
                if (!filepath || !filepath.endsWith(".pdf")) {
                    ztoolkit.getGlobal("alert")("请选择一个 PDF 附件。");
                    return;
                }
                if (!filepath || (await IOUtils.exists(filepath))) {
                    const contentRaw = await IOUtils.read(filepath);
                    const blob = new Blob([contentRaw], {
                        type: "application/pdf",
                    });
                    const base64Blob = await blobToBase64(blob);
                    const data = {
                        filePath: filepath,
                        fileContent: base64Blob,
                        threadNum: threadNum,
                        engine: engine,
                        outputPath: outputPath,
                        configPath: configPath,
                    };
                    const response = await fetch(serverUrl + "/cut-compare", {
                        // 发送翻译请求
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(data),
                    });
                    if (!response.ok) {
                        throw new Error(`服务器响应失败: ${response.ok}`);
                    }
                    const jsonString = await response.text();
                    const result: TranslationResponse = JSON.parse(jsonString);
                    const fileName = PathUtils.filename(filepath);
                    const fileName_cut = fileName.replace(
                        ".pdf",
                        "-compare.pdf",
                    );
                    let open = "";
                    if (compare_open == "true") {
                        open = "true";
                    }
                    if (result.status === "success") {
                        await Promise.all([
                            HelperExampleFactory.fetchPDF(
                                fileName_cut,
                                serverUrl,
                                item,
                                "dual-compare",
                                rename,
                                open,
                            ),
                        ]);
                    }
                }
            }
        } catch (error) {
            ztoolkit.getGlobal("alert")(
                "zotero-pdf2zh(中英对照) 发生错误: \n" + error,
            );
            return null;
        }
    }
    static async addAttachmentToItem(
        item: Zotero.Item,
        translatedPath: string,
        title: string = "",
        rename: string = "",
        open: string = "",
    ): Promise<void> {
        ztoolkit.log("rename:", rename);
        ztoolkit.log("title:", title);
        const itemID = item.id;
        const libraryID = item.libraryID;
        const collectionID = item.getCollections()[0];
        if (item.isAttachment()) {
            const parentItemID = item.parentItemID;
            const newItem = await Promise.all([
                Zotero.Attachments.importFromFile({
                    file: translatedPath,
                    parentItemID:
                        parentItemID != null && parentItemID !== false
                            ? parentItemID
                            : undefined,
                    libraryID: libraryID,
                    collections:
                        (parentItemID == null || parentItemID == false) &&
                        collectionID != null
                            ? [collectionID]
                            : undefined,
                    title:
                        title != "" &&
                        parentItemID != null &&
                        parentItemID != false &&
                        rename == "true"
                            ? title
                            : PathUtils.filename(translatedPath),
                }),
            ]);
            ztoolkit.log(`已将翻译后的 PDF 附件添加到库 ${libraryID} 中。`);
            if (open == "true" && newItem.length > 0 && newItem[0].id) {
                Zotero.Reader.open(newItem[0].id);
            }
        } else {
            const newItem = await Promise.all([
                Zotero.Attachments.importFromFile({
                    file: translatedPath,
                    parentItemID: itemID,
                    title:
                        title != "" && itemID != null
                            ? title
                            : PathUtils.filename(translatedPath),
                }),
            ]);
            ztoolkit.log(`已将翻译后的 PDF 附件添加到项目 ${itemID} 中。`);
            if (open == "true" && newItem.length > 0 && newItem[0].id) {
                Zotero.Reader.open(newItem[0].id);
            }
        }
    }
}
